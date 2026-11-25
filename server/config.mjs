import path from 'node:path'
import fs from 'node:fs'

export const ROOT = path.resolve(import.meta.dirname, '..')
export const DATA_DIR = path.resolve(process.env.SAHABA_DATA_DIR || path.join(ROOT, 'data'))
export const BLOBS_DIR = path.join(DATA_DIR, 'blobs')
export const DB_PATH = path.join(DATA_DIR, 'sahaba.sqlite')
export const PORT = Number(process.env.PORT || 4000)
export const HOST = process.env.HOST || '0.0.0.0'
export const PRODUCTION = process.argv.includes('--production')
export const STORAGE_MODE = String(process.env.SAHABA_STORAGE_MODE || (process.env.SAHABA_DRIVE_WEBAPP_URL ? 'drive' : 'local')).toLowerCase()
export const DRIVE_WEBAPP_URL = process.env.SAHABA_DRIVE_WEBAPP_URL || ''
export const DRIVE_TOKEN = process.env.SAHABA_DRIVE_TOKEN || ''
export const MAX_UPLOAD_BYTES = Number(process.env.SAHABA_MAX_UPLOAD_MB || (STORAGE_MODE === 'drive' ? 20 : 4096)) * 1024 * 1024
export const MAX_VERSIONS = Number(process.env.SAHABA_MAX_VERSIONS || 50)
export const DEFAULT_STORAGE_LIMIT = Number(process.env.SAHABA_STORAGE_LIMIT_MB || 10240) * 1024 * 1024
export const SESSION_DAYS = 30

// نسخ احتياطي لقاعدة البيانات على Drive (أو مجلد محلي خارج وضع Drive)
export const BACKUP_ENABLED = String(process.env.SAHABA_BACKUP_ENABLED || '1') !== '0'
export const BACKUP_INTERVAL_MS = Math.max(1, Number(process.env.SAHABA_BACKUP_INTERVAL_HOURS || 24)) * 3600 * 1000
export const BACKUP_INITIAL_DELAY_MS = Math.max(0, Number(process.env.SAHABA_BACKUP_INITIAL_DELAY_MS || 15000))
export const BACKUP_RETENTION = Math.max(1, Number(process.env.SAHABA_BACKUP_RETENTION || 7))
export const BACKUP_SPACE = String(process.env.SAHABA_BACKUP_SPACE || 'backups').replace(/[^a-zA-Z0-9_-]/g, '_')

// تحديد معدل الطلبات لكل IP
export const RATE_WINDOW_MS = Math.max(1000, Number(process.env.SAHABA_RATE_WINDOW_MS || 60000))
export const RATE_MAX = Math.max(1, Number(process.env.SAHABA_RATE_MAX || 120))
export const AUTH_RATE_WINDOW_MS = Math.max(1000, Number(process.env.SAHABA_AUTH_RATE_WINDOW_MS || 600000))
export const AUTH_RATE_MAX = Math.max(1, Number(process.env.SAHABA_AUTH_RATE_MAX || 10))

if (STORAGE_MODE !== 'drive') fs.mkdirSync(BLOBS_DIR, { recursive: true })
