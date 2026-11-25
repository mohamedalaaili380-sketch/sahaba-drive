import { DRIVE_TOKEN, DRIVE_WEBAPP_URL } from './config.mjs'
import { all, db, run } from './db.mjs'

function fail(message) { throw new Error(message) }

async function remotePost(url, token, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, token }),
    signal: AbortSignal.timeout(180000),
  })
  const text = await response.text()
  let data
  try { data = JSON.parse(text) } catch { fail(`استجابة غير صالحة من ${url}`) }
  if (!response.ok || !data?.ok) fail(data?.error || `فشل التواصل مع ${url}`)
  return data
}

async function remoteDownload(url, token, id) {
  const target = new URL(url)
  target.searchParams.set('token', token)
  target.searchParams.set('action', 'download')
  target.searchParams.set('id', id)
  const response = await fetch(target.toString(), { signal: AbortSignal.timeout(180000) })
  const text = await response.text()
  if (!response.ok) fail(`تعذّر تنزيل ${id} من Drive القديم`)
  if (text.trimStart().startsWith('{')) {
    let data
    try { data = JSON.parse(text) } catch { /* binary content as base64 */ }
    if (data && data.ok === false) fail(data.error || `تعذّر تنزيل ${id}`)
  }
  return Buffer.from(text.trim(), 'base64')
}

export async function migrateBlobs({ fromUrl, fromToken }) {
  if (!fromUrl || !fromToken) fail('مطلوب عنوان وتوكن الـ Web App القديم')
  if (!DRIVE_WEBAPP_URL || !DRIVE_TOKEN) fail('مطلوب عنوان وتوكن الـ Web App الجديد')

  const rows = all(`SELECT blob_path FROM versions
    UNION SELECT blob_path FROM items WHERE blob_path IS NOT NULL`)
  const ids = [...new Set(rows.map(r => r.blob_path).filter(Boolean))]
  const map = new Map()

  for (const oldId of ids) {
    const bytes = await remoteDownload(fromUrl, fromToken, oldId)
    const uploaded = await remotePost(DRIVE_WEBAPP_URL, DRIVE_TOKEN, {
      action: 'upload',
      data: bytes.toString('base64'),
      name: oldId,
      mime: 'application/octet-stream',
      space: 'sahaba',
    })
    map.set(oldId, uploaded.id)
    console.log(`  نُقل ${oldId} → ${uploaded.id} (${bytes.length} bytes)`)
  }

  db.exec('BEGIN IMMEDIATE')
  try {
    for (const [oldId, newId] of map) {
      run('UPDATE items SET blob_path = ? WHERE blob_path = ?', newId, oldId)
      run('UPDATE versions SET blob_path = ? WHERE blob_path = ?', newId, oldId)
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  return { count: map.size }
}
