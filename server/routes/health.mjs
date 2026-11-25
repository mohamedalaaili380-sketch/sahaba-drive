import { DRIVE_TOKEN, DRIVE_WEBAPP_URL, STORAGE_MODE } from '../config.mjs'
import { get } from '../db.mjs'
import { getLastBackup } from '../backup.mjs'
import { sendJson } from '../util.mjs'

let cachedPing = { at: 0, ok: true, latencyMs: null }
const PING_TTL_MS = 30000

async function pingDrive() {
  if (STORAGE_MODE !== 'drive' || !DRIVE_WEBAPP_URL) {
    return { enabled: false, ok: true, latencyMs: null }
  }
  if (Date.now() - cachedPing.at < PING_TTL_MS) return cachedPing
  try {
    const url = new URL(DRIVE_WEBAPP_URL)
    url.searchParams.set('token', DRIVE_TOKEN)
    url.searchParams.set('action', 'ping')
    const started = Date.now()
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
    const data = await response.json()
    cachedPing = { at: Date.now(), ok: response.ok && data?.ok === true, latencyMs: Date.now() - started }
  } catch {
    cachedPing = { at: Date.now(), ok: false, latencyMs: null }
  }
  return cachedPing
}

export const routes = [
  {
    method: 'GET', pattern: /^\/api\/health$/,
    async handler({ res }) {
      let dbOk = true
      try { get('SELECT 1 AS ok') } catch { dbOk = false }
      const drive = await pingDrive()
      const backup = getLastBackup()
      const payload = {
        ok: dbOk && drive.ok,
        service: 'sahaba-drive',
        time: Date.now(),
        storage: STORAGE_MODE,
        db: dbOk,
        drive: { enabled: drive.enabled ?? (STORAGE_MODE === 'drive' && !!DRIVE_WEBAPP_URL), ok: drive.ok, latencyMs: drive.latencyMs },
        backup: backup ? { ok: backup.ok, at: backup.at, size: backup.size, error: backup.error } : null,
      }
      sendJson(res, payload.ok ? 200 : 503, payload)
    },
  },
]
