import crypto from 'node:crypto'
import { all, get, run } from './db.mjs'
import { emit } from './events.mjs'

export { saveBlobStream, saveBlobBuffer, deleteBlob, copyBlob, streamBlob } from './storage.mjs'

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export const fail = (status, message) => { throw new HttpError(status, message) }
export const now = () => Date.now()
export const newId = () => crypto.randomUUID()
export const newToken = () => crypto.randomBytes(32).toString('base64url')

export function sendJson(res, status, data) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

export function sendError(res, error) {
  const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 500
  const message = status === 500 ? 'حصل خطأ في السيرفر' : error.message
  if (status === 500) console.error(error)
  sendJson(res, status, { error: message, ...(error.code ? { code: error.code } : {}) })
}

export async function readJson(req, limit = 2 * 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) fail(413, 'الطلب كبير جداً')
    chunks.push(chunk)
  }
  if (!size) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    fail(400, 'بيانات الطلب غير صحيحة')
  }
}

export function parseCookies(req) {
  const out = {}
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') }
}

export function verifyPassword(password, salt, expected) {
  const actual = crypto.scryptSync(password, salt, 64)
  const target = Buffer.from(expected, 'hex')
  return actual.length === target.length && crypto.timingSafeEqual(actual, target)
}

export function authUser(req) {
  const token = parseCookies(req).cb_session || ''
  if (!token) return null
  const session = get('SELECT * FROM sessions WHERE token = ?', token)
  if (!session || session.expires_at < now()) return null
  return get('SELECT * FROM users WHERE id = ?', session.user_id) || null
}

export function requireUser(req) {
  const user = authUser(req)
  if (!user) fail(401, 'سجّل الدخول أولاً')
  if (!user.approved) fail(403, 'حسابك في انتظار موافقة الأدمن')
  return user
}

export const userIsAdmin = (user) => !!user?.is_admin
export const userIsSuperAdmin = (user) => !!user?.is_super_admin

export function requireAdmin(req) {
  const user = requireUser(req)
  if (!userIsAdmin(user)) fail(403, 'هذه العملية للمدير فقط')
  return user
}

export function requireSuperAdmin(req) {
  const user = requireUser(req)
  if (!userIsSuperAdmin(user)) fail(403, 'هذه العملية للأدمن الرئيسي فقط')
  return user
}

export function setSession(res, userId) {
  const token = newToken()
  run('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)',
    token, userId, now(), now() + 30 * 24 * 3600 * 1000)
  res.setHeader('set-cookie', `cb_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}`)
  return token
}

export function clearSession(req, res) {
  const token = parseCookies(req).cb_session
  if (token) run('DELETE FROM sessions WHERE token = ?', token)
  res.setHeader('set-cookie', 'cb_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0')
}

const level = { viewer: 1, editor: 2, owner: 3 }

export function spaceRole(userId, spaceId) {
  const space = get('SELECT * FROM spaces WHERE id = ?', spaceId)
  if (!space) return null
  const user = get('SELECT is_admin FROM users WHERE id = ?', userId)
  if (userIsAdmin(user) || space.owner_id === userId) return 'owner'
  const member = get('SELECT role FROM space_members WHERE space_id = ? AND user_id = ?', spaceId, userId)
  return member?.role || null
}

export function assertAccess(userId, spaceId, min = 'viewer') {
  const role = spaceRole(userId, spaceId)
  if (!role || level[role] < level[min]) fail(403, 'ما عندكش صلاحية كافية هنا')
  return role
}

// A stale/empty space id (e.g. after a space was deleted) should fall back to
// the user's own drive instead of failing with a confusing permission error.
export function resolveWriteSpace(userId, requestedId) {
  const requested = String(requestedId || '')
  if (requested && get('SELECT id FROM spaces WHERE id = ?', requested)) return requested
  const personal = get('SELECT id FROM spaces WHERE owner_id = ? AND kind = ?', userId, 'personal')
  if (personal) return personal.id
  const owned = get('SELECT id FROM spaces WHERE owner_id = ? ORDER BY created_at LIMIT 1', userId)
  return owned?.id || requested
}

export function getItem(itemId, { includeDeleted = false } = {}) {
  return get(`SELECT * FROM items WHERE id = ? ${includeDeleted ? '' : 'AND deleted_at IS NULL'}`, itemId) || fail(404, 'الملف غير موجود')
}

export function itemAccess(userId, itemId, min = 'viewer', opts = {}) {
  const item = getItem(itemId, opts)
  const role = assertAccess(userId, item.space_id, min)
  return { item, role }
}

export function checkQuota(userId, extraBytes) {
  const used = get(`SELECT COALESCE(SUM(size),0) AS s FROM items WHERE owner_id = ? AND deleted_at IS NULL AND kind = 'file'`, userId).s
  const user = get('SELECT storage_limit FROM users WHERE id = ?', userId)
  if (used + extraBytes > user.storage_limit) fail(413, 'المساحة المتاحة غير كافية')
}

export function usedBytes(userId) {
  return get(`SELECT COALESCE(SUM(size),0) AS s FROM items WHERE owner_id = ? AND deleted_at IS NULL AND kind = 'file'`, userId).s
}

export function activity(userId, itemId, action, detail = '') {
  const id = newId()
  run('INSERT INTO activity (id, user_id, item_id, action, detail, created_at) VALUES (?,?,?,?,?,?)',
    id, userId, itemId, action, detail, now())
  emit('activity', { userId, id, itemId, action, detail })
}

export function notify(userId, type, message, itemId = null) {
  const id = newId()
  run('INSERT INTO notifications (id, user_id, type, message, item_id, created_at) VALUES (?,?,?,?,?,?)',
    id, userId, type, message, itemId, now())
  emit('notification', { userId, id, type, message, itemId })
  return id
}

export function descendants(itemId) {
  return all(`WITH RECURSIVE tree(id) AS (
    SELECT id FROM items WHERE id = ?
    UNION ALL
    SELECT i.id FROM items i JOIN tree t ON i.parent_id = t.id
  ) SELECT id FROM tree`, itemId).map((r) => r.id)
}

export function getParentChain(item) {
  const trail = []
  let current = item
  const seen = new Set()
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    trail.unshift({ id: current.id, name: current.name })
    current = current.parent_id ? get('SELECT id,name,parent_id FROM items WHERE id = ?', current.parent_id) : null
  }
  return trail
}

export function tagsForItem(itemId) {
  return all(`SELECT t.* FROM tags t JOIN item_tags it ON it.tag_id = t.id WHERE it.item_id = ?`, itemId)
}

export function serializeItem(item) {
  const { blob_path, ...safe } = item
  return {
    ...safe,
    starred: !!item.starred,
    tags: tagsForItem(item.id),
    comments_count: get('SELECT COUNT(*) AS c FROM comments WHERE item_id = ?', item.id).c,
  }
}
