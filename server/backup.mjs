import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  BACKUP_ENABLED, BACKUP_INITIAL_DELAY_MS, BACKUP_INTERVAL_MS, BACKUP_RETENTION, BACKUP_SPACE,
  DATA_DIR, DRIVE_WEBAPP_URL, STORAGE_MODE,
} from './config.mjs'
import { all, db, run } from './db.mjs'
import { deleteBlob, saveBlobBuffer } from './storage.mjs'

const useDrive = () => STORAGE_MODE === 'drive' && !!DRIVE_WEBAPP_URL
const localDir = () => path.join(DATA_DIR, 'backups')

let running = false
let lastResult = null
let timer = null

function snapshotPath() {
  return path.join(DATA_DIR, `.backup-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.sqlite`)
}

export async function runBackupOnce() {
  if (running) return lastResult
  running = true
  const temp = snapshotPath()
  try {
    db.exec(`VACUUM INTO '${temp.replace(/'/g, "''")}'`)
    const bytes = fs.readFileSync(temp)
    const name = `sahaba-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`
    const id = crypto.randomUUID()

    let blobId
    if (useDrive()) {
      const saved = await saveBlobBuffer(bytes, id, name, BACKUP_SPACE)
      blobId = saved.id
    } else {
      fs.mkdirSync(localDir(), { recursive: true })
      fs.writeFileSync(path.join(localDir(), name), bytes)
      blobId = name
    }

    run('INSERT INTO backups (id, blob_id, name, size, created_at) VALUES (?, ?, ?, ?, ?)',
      id, blobId, name, bytes.length, Date.now())

    const old = all('SELECT id, blob_id, name FROM backups ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET ?', BACKUP_RETENTION)
    for (const row of old) {
      if (useDrive()) deleteBlob(row.blob_id)
      else fs.rmSync(path.join(localDir(), row.name), { force: true })
      run('DELETE FROM backups WHERE id = ?', row.id)
    }

    lastResult = { ok: true, at: Date.now(), name, size: bytes.length, removed: old.length }
    console.log(`💾  نسخة احتياطية: ${name} (${bytes.length} bytes)`)
  } catch (err) {
    lastResult = { ok: false, at: Date.now(), error: String(err?.message || err) }
    console.error('فشل النسخ الاحتياطي:', err)
  } finally {
    fs.rmSync(temp, { force: true })
    running = false
  }
  return lastResult
}

export function startBackups() {
  if (!BACKUP_ENABLED || timer) return
  const first = Math.min(BACKUP_INITIAL_DELAY_MS, BACKUP_INTERVAL_MS)
  setTimeout(() => {
    runBackupOnce()
    timer = setInterval(runBackupOnce, BACKUP_INTERVAL_MS)
    timer.unref?.()
  }, first).unref?.()
}

export function getLastBackup() {
  return lastResult
}
