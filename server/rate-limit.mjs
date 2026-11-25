import {
  AUTH_RATE_MAX, AUTH_RATE_WINDOW_MS, RATE_MAX, RATE_WINDOW_MS,
} from './config.mjs'
import { sendJson } from './util.mjs'

const buckets = new Map()
const AUTH_PATH = /^\/api\/auth\/(login|register)$/

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim()
  return req.socket.remoteAddress || 'unknown'
}

function prune(now) {
  if (buckets.size < 4000) return
  for (const [key, value] of buckets) {
    if (value.reset <= now) buckets.delete(key)
  }
}

function take(key, max, windowMs) {
  const now = Date.now()
  prune(now)
  let bucket = buckets.get(key)
  if (!bucket || bucket.reset <= now) {
    bucket = { count: 0, reset: now + windowMs }
    buckets.set(key, bucket)
  }
  bucket.count += 1
  return {
    allowed: bucket.count <= max,
    remaining: Math.max(0, max - bucket.count),
    reset: bucket.reset,
  }
}

export function applyRateLimit(req, res, pathname) {
  if (!pathname.startsWith('/api/') || pathname === '/api/health') return true

  const auth = AUTH_PATH.test(pathname)
  const max = auth ? AUTH_RATE_MAX : RATE_MAX
  const windowMs = auth ? AUTH_RATE_WINDOW_MS : RATE_WINDOW_MS
  const result = take(`${auth ? 'auth' : 'api'}:${clientIp(req)}`, max, windowMs)

  res.setHeader('x-ratelimit-limit', String(max))
  res.setHeader('x-ratelimit-remaining', String(result.remaining))
  res.setHeader('x-ratelimit-reset', String(Math.ceil(result.reset / 1000)))

  if (!result.allowed) {
    res.setHeader('retry-after', String(Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))))
    sendJson(res, 429, { error: 'طلبات كتير جداً، حاول بعد شوية' })
    return false
  }
  return true
}
