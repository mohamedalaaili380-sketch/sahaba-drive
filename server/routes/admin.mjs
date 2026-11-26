import crypto from 'node:crypto'
import {
  now, newId, fail, requireSuperAdmin, sendJson, hashPassword, notify, deleteBlob,
} from '../util.mjs'
import { all, get, run } from '../db.mjs'
import { emit } from '../events.mjs'

const placeholders = (n) => new Array(n).fill('?').join(',')

function adminUser(row) {
  const used = get(`SELECT COALESCE(SUM(size),0) AS s FROM items WHERE owner_id = ? AND deleted_at IS NULL AND kind = 'file'`, row.id).s
  return {
    id: row.id, name: row.name, email: row.email, color: row.color,
    createdAt: row.created_at, storageLimit: row.storage_limit,
    isAdmin: !!row.is_admin, isSuperAdmin: !!row.is_super_admin, approved: !!row.approved,
    used,
    items: get('SELECT COUNT(*) AS c FROM items WHERE owner_id = ? AND deleted_at IS NULL', row.id).c,
    spaces: get('SELECT COUNT(*) AS c FROM spaces WHERE owner_id = ?', row.id).c,
  }
}

function adminSpace(row) {
  return {
    id: row.id, kind: row.kind, name: row.name, owner_id: row.owner_id,
    owner: get('SELECT name,email,color FROM users WHERE id = ?', row.owner_id) || null,
    members: get('SELECT COUNT(*) AS c FROM space_members WHERE space_id = ?', row.id).c,
    files: get(`SELECT COUNT(*) AS c FROM items WHERE space_id = ? AND deleted_at IS NULL AND kind = 'file'`, row.id).c,
    size: get(`SELECT COALESCE(SUM(size),0) AS s FROM items WHERE space_id = ? AND deleted_at IS NULL AND kind = 'file'`, row.id).s,
    createdAt: row.created_at,
  }
}

function cleanupBlobs(paths) {
  for (const blob of new Set(paths.filter(Boolean))) {
    const stillUsed = get('SELECT 1 FROM versions WHERE blob_path = ? UNION ALL SELECT 1 FROM items WHERE blob_path = ? LIMIT 1', blob, blob)
    if (!stillUsed) deleteBlob(blob)
  }
}

function blobsForSpaces(ids) {
  if (!ids.length) return []
  const where = `space_id IN (${placeholders(ids.length)})`
  return [
    ...all(`SELECT blob_path FROM versions WHERE item_id IN (SELECT id FROM items WHERE ${where})`, ...ids),
    ...all(`SELECT blob_path FROM items WHERE ${where}`, ...ids),
  ].map((r) => r.blob_path)
}

export const routes = [
  { method: 'GET', pattern: /^\/api\/admin\/overview$/, handler({ req, res }) {
    requireSuperAdmin(req)
    sendJson(res, 200, { overview: {
      users: get('SELECT COUNT(*) AS c FROM users').c,
      pending: get('SELECT COUNT(*) AS c FROM users WHERE approved = 0').c,
      admins: get('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1').c,
      spaces: get('SELECT COUNT(*) AS c FROM spaces').c,
      files: get(`SELECT COUNT(*) AS c FROM items WHERE kind = 'file' AND deleted_at IS NULL`).c,
      bytes: get(`SELECT COALESCE(SUM(size),0) AS s FROM items WHERE kind = 'file' AND deleted_at IS NULL`).s,
    } })
  } },

  { method: 'GET', pattern: /^\/api\/admin\/users$/, handler({ req, res, url }) {
    requireSuperAdmin(req)
    const q = `%${url.searchParams.get('q') || ''}%`
    const rows = all('SELECT * FROM users WHERE name LIKE ? OR email LIKE ? ORDER BY approved ASC, is_admin DESC, created_at ASC', q, q)
    sendJson(res, 200, { users: rows.map(adminUser) })
  } },

  { method: 'PATCH', pattern: /^\/api\/admin\/users\/(?<id>[^/]+)$/, handler({ req, res, params, body }) {
    requireSuperAdmin(req)
    const target = get('SELECT * FROM users WHERE id = ?', params.id) || fail(404, 'المستخدم غير موجود')
    const name = body.name === undefined ? target.name : String(body.name).trim()
    if (!name || name.length < 2) fail(400, 'الاسم قصير جداً')
    let limit = target.storage_limit
    if (body.storageLimit !== undefined) {
      limit = Math.floor(Number(body.storageLimit))
      if (!Number.isFinite(limit) || limit < 1024 * 1024 || limit > 100 * 1024 ** 4) fail(400, 'الحد لازم بين 1 م.ب و 100 ت.ب')
    }
    run('UPDATE users SET name = ?, storage_limit = ? WHERE id = ?', name, limit, target.id)
    sendJson(res, 200, { user: adminUser(get('SELECT * FROM users WHERE id = ?', target.id)) })
  } },

  { method: 'POST', pattern: /^\/api\/admin\/users\/(?<id>[^/]+)\/approve$/, handler({ req, res, params }) {
    requireSuperAdmin(req)
    const target = get('SELECT * FROM users WHERE id = ?', params.id) || fail(404, 'المستخدم غير موجود')
    if (!target.approved) {
      run('UPDATE users SET approved = 1 WHERE id = ?', target.id)
      notify(target.id, 'account.approved', 'تم تفعيل حسابك — تقدر تدخل دلوقتي', null)
    }
    sendJson(res, 200, { user: adminUser(get('SELECT * FROM users WHERE id = ?', target.id)) })
  } },

  { method: 'POST', pattern: /^\/api\/admin\/users\/(?<id>[^/]+)\/admin$/, handler({ req, res, params, body }) {
    const admin = requireSuperAdmin(req)
    const target = get('SELECT * FROM users WHERE id = ?', params.id) || fail(404, 'المستخدم غير موجود')
    const value = body.isAdmin ? 1 : 0
    if (target.is_super_admin) fail(400, 'صلاحية الأدمن الرئيسي مش قابلة للتغيير')
    if (target.id === admin.id && !value) fail(400, 'ما تقدرش تلغي صلاحية الأدمن لنفسك')
    if (!value && target.is_admin && get('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1').c <= 1) fail(400, 'لازم يبقى أدمن واحد على الأقل')
    run('UPDATE users SET is_admin = ? WHERE id = ?', value, target.id)
    sendJson(res, 200, { user: adminUser(get('SELECT * FROM users WHERE id = ?', target.id)) })
  } },

  { method: 'POST', pattern: /^\/api\/admin\/users\/(?<id>[^/]+)\/reset-password$/, handler({ req, res, params, body }) {
    requireSuperAdmin(req)
    const target = get('SELECT * FROM users WHERE id = ?', params.id) || fail(404, 'المستخدم غير موجود')
    const password = body.password ? String(body.password) : crypto.randomBytes(9).toString('base64url').slice(0, 14) + 'Aa1!'
    if (password.length < 8) fail(400, 'كلمة المرور لازم تكون 8 حروف على الأقل')
    const { salt, hash } = hashPassword(password)
    run('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?', hash, salt, target.id)
    run('DELETE FROM sessions WHERE user_id = ?', target.id)
    notify(target.id, 'password.reset', 'غيّر المدير كلمة المرور الخاصة بك', null)
    sendJson(res, 200, { password })
  } },

  { method: 'DELETE', pattern: /^\/api\/admin\/users\/(?<id>[^/]+)$/, handler({ req, res, params }) {
    const admin = requireSuperAdmin(req)
    const target = get('SELECT * FROM users WHERE id = ?', params.id) || fail(404, 'المستخدم غير موجود')
    if (target.id === admin.id) fail(400, 'ما تقدرش تحذف حسابك')
    if (target.is_super_admin) fail(400, 'ما تقدرش تحذف الأدمن الرئيسي')
    if (target.is_admin && get('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1').c <= 1) fail(400, 'لازم يبقى أدمن واحد على الأقل')

    const owned = all('SELECT id FROM spaces WHERE owner_id = ?', target.id).map((r) => r.id)
    const joined = all('SELECT space_id FROM space_members WHERE user_id = ?', target.id).map((r) => r.space_id)
    const blobs = [
      ...blobsForSpaces(owned),
      ...all('SELECT blob_path FROM versions WHERE item_id IN (SELECT id FROM items WHERE owner_id = ?)', target.id).map((r) => r.blob_path),
      ...all('SELECT blob_path FROM items WHERE owner_id = ?', target.id).map((r) => r.blob_path),
    ]

    run('UPDATE versions SET author_id = NULL WHERE author_id = ?', target.id)
    run('UPDATE shares SET created_by = ? WHERE created_by = ?', admin.id, target.id)
    run('UPDATE items SET owner_id = ? WHERE owner_id = ?', admin.id, target.id)
    run('DELETE FROM spaces WHERE owner_id = ?', target.id)
    run('DELETE FROM space_members WHERE user_id = ?', target.id)
    run('DELETE FROM users WHERE id = ?', target.id)
    cleanupBlobs(blobs)
    for (const id of new Set([...owned, ...joined])) emit('space:changed', { spaceId: id, type: 'members' })
    sendJson(res, 200, { ok: true })
  } },

  { method: 'GET', pattern: /^\/api\/admin\/spaces$/, handler({ req, res }) {
    requireSuperAdmin(req)
    const spaces = all('SELECT * FROM spaces ORDER BY kind, created_at DESC').map(adminSpace)
    sendJson(res, 200, { spaces })
  } },

  { method: 'DELETE', pattern: /^\/api\/admin\/spaces\/(?<id>[^/]+)$/, handler({ req, res, params }) {
    requireSuperAdmin(req)
    const space = get('SELECT * FROM spaces WHERE id = ?', params.id) || fail(404, 'المساحة غير موجودة')
    const members = all('SELECT user_id FROM space_members WHERE space_id = ?', space.id).map((r) => r.user_id)
    const blobs = blobsForSpaces([space.id])
    run('DELETE FROM spaces WHERE id = ?', space.id)
    if (space.kind === 'personal') {
      run('INSERT INTO spaces (id,kind,name,owner_id,created_at) VALUES (?,?,?,?,?)', newId(), 'personal', space.name, space.owner_id, now())
    }
    cleanupBlobs(blobs)
    for (const id of members) notify(id, 'space.remove', `تم حذف المساحة «${space.name}»`, null)
    emit('space:changed', { spaceId: space.id, type: 'deleted' })
    sendJson(res, 200, { ok: true })
  } },
]
