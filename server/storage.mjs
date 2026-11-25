import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import {
  BLOBS_DIR, DRIVE_TOKEN, DRIVE_WEBAPP_URL, MAX_UPLOAD_BYTES, STORAGE_MODE,
} from './config.mjs'

const fail = (status, message) => {
  throw Object.assign(new Error(message), { status })
}

function blobPath(id) { return path.join(BLOBS_DIR, id) }

function driveUrl(action, id) {
  const url = new URL(DRIVE_WEBAPP_URL)
  url.searchParams.set('token', DRIVE_TOKEN)
  url.searchParams.set('action', action)
  if (id) url.searchParams.set('id', id)
  return url.toString()
}

async function drivePost(body) {
  const response = await fetch(DRIVE_WEBAPP_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, token: DRIVE_TOKEN }),
    signal: AbortSignal.timeout(180000),
  })
  const text = await response.text()
  let data
  try { data = JSON.parse(text) } catch { fail(502, 'استجابة غير صالحة من Google Drive') }
  if (!response.ok || !data?.ok) fail(502, data?.error || 'فشل التواصل مع Google Drive')
  return data
}

async function readLimited(req, maxBytes) {
  let received = 0
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      received += chunk.length
      if (received > maxBytes) cb(fail(413, 'الملف أكبر من الحد المسموح'))
      else cb(null, chunk)
    },
  })
  const chunks = []
  for await (const chunk of req.pipe(counter)) chunks.push(chunk)
  return Buffer.concat(chunks)
}

function sendBlob(res, bytes, filename, mime, disposition) {
  res.writeHead(200, {
    'content-type': mime || 'application/octet-stream',
    'content-length': bytes.length,
    'content-disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(filename || 'file')}`,
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(bytes)
}

export async function saveBlobStream(req, blobId, maxBytes = MAX_UPLOAD_BYTES, name) {
  if (STORAGE_MODE === 'drive') {
    const bytes = await readLimited(req, maxBytes)
    const data = await drivePost({
      action: 'upload',
      data: bytes.toString('base64'),
      name: name || blobId,
      mime: 'application/octet-stream',
      space: 'sahaba',
    })
    return { id: data.id, size: data.size ?? bytes.length }
  }
  let received = 0
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      received += chunk.length
      if (received > maxBytes) cb(fail(413, 'الملف أكبر من الحد المسموح'))
      else cb(null, chunk)
    },
  })
  const finalPath = blobPath(blobId)
  const tempPath = `${finalPath}.${crypto.randomBytes(4).toString('hex')}.tmp`
  try {
    await pipeline(req, counter, fs.createWriteStream(tempPath))
    fs.renameSync(tempPath, finalPath)
  } catch (err) {
    fs.rmSync(tempPath, { force: true })
    throw err
  }
  return { id: blobId, size: received }
}

export async function saveBlobBuffer(buffer, blobId, name) {
  if (STORAGE_MODE === 'drive') {
    const data = await drivePost({
      action: 'upload',
      data: buffer.toString('base64'),
      name: name || blobId,
      mime: 'text/plain',
      space: 'sahaba',
    })
    return { id: data.id, size: data.size ?? buffer.length }
  }
  fs.writeFileSync(blobPath(blobId), buffer)
  return { id: blobId, size: buffer.length }
}

export function deleteBlob(blobId) {
  if (!blobId) return
  if (STORAGE_MODE === 'drive') {
    drivePost({ action: 'delete', id: blobId }).catch(() => {})
    return
  }
  fs.rmSync(blobPath(blobId), { force: true })
}

export async function copyBlob(blobId, name) {
  if (!blobId) return null
  if (STORAGE_MODE === 'drive') {
    const data = await drivePost({ action: 'copy', id: blobId, name: name || 'blob' })
    return { id: data.id, size: data.size ?? 0 }
  }
  const target = crypto.randomUUID()
  fs.copyFileSync(blobPath(blobId), blobPath(target))
  const size = fs.statSync(blobPath(target)).size
  return { id: target, size }
}

export async function streamBlob(res, blobId, filename, mime, disposition = 'attachment', size) {
  if (!blobId) fail(404, 'الملف غير موجود')
  if (STORAGE_MODE === 'drive') {
    const response = await fetch(driveUrl('download', blobId), {
      signal: AbortSignal.timeout(180000),
    })
    const text = await response.text()
    if (!response.ok) fail(502, 'فشل تنزيل الملف من Google Drive')
    if (text.trimStart().startsWith('{')) {
      let data
      try { data = JSON.parse(text) } catch { /* treated as content below */ }
      if (data && data.ok === false) fail(404, data.error || 'الملف غير موجود على Google Drive')
    }
    const bytes = Buffer.from(text.trim(), 'base64')
    sendBlob(res, bytes, filename, mime, disposition)
    return bytes.length
  }
  const filePath = blobPath(blobId)
  if (!fs.existsSync(filePath)) fail(404, 'الملف غير موجود على القرص')
  const stat = fs.statSync(filePath)
  res.writeHead(200, {
    'content-type': mime || 'application/octet-stream',
    'content-length': stat.size,
    'content-disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(filename || 'file')}`,
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  })
  fs.createReadStream(filePath).pipe(res)
  return stat.size
}
