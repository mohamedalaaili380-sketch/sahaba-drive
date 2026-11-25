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

if (STORAGE_MODE !== 'drive') fs.mkdirSync(BLOBS_DIR, { recursive: true })
