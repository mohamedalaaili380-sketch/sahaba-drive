import {
  now, newId, newToken, hashPassword, fail, requireUser, sendJson, itemAccess, activity,
} from '../util.mjs'
import { all, get, run } from '../db.mjs'
import { emit } from '../events.mjs'

function publicShare(row) {
  return {
    id: row.id,
    token: row.token,
    url: `/s/${row.token}`,
    permission: row.permission,
    hasPassword: !!row.password_hash,
    expiresAt: row.expires_at,
    maxViews: row.max_views,
    views: row.views,
    maxDownloads: row.max_downloads,
    downloads: row.downloads,
    allowComments: !!row.allow_comments,
    revoked: !!row.revoked,
    createdAt: row.created_at,
  }
}

export const routes = [
  { method: 'GET', pattern: /^\/api\/shares$/, handler({ req, res, url }) {
    const user = requireUser(req)
    const itemId = url.searchParams.get('itemId')
    const rows = itemId
      ? all(`SELECT s.* FROM shares s JOIN items i ON i.id = s.item_id WHERE s.item_id = ? AND i.space_id IN
          (SELECT space_id FROM space_members WHERE user_id = ? UNION SELECT id FROM spaces WHERE owner_id = ?)`, itemId, user.id, user.id)
      : all(`SELECT s.* FROM shares s JOIN items i ON i.id = s.item_id
          WHERE s.created_by = ? OR i.space_id IN (SELECT space_id FROM space_members WHERE user_id = ?)
          ORDER BY s.created_at DESC`, user.id, user.id)
    sendJson(res, 200, { shares: rows.map(publicShare) })
  } },
  { method: 'POST', pattern: /^\/api\/shares$/, async handler({ req, res, body }) {
    const user = requireUser(req)
    const { item } = itemAccess(user.id, String(body.itemId || ''), 'editor')
    const permission = ['view', 'download', 'comment'].includes(body.permission) ? body.permission : 'view'
    const password = String(body.password || '')
    const { hash, salt } = password ? hashPassword(password) : { hash: null, salt: null }
    let expiresAt = null
    if (body.expiresDays && Number(body.expiresDays) > 0) expiresAt = now() + Number(body.expiresDays) * 86400000
    const id = newId()
    const token = newToken().slice(0, 22)
    run(`INSERT INTO shares (id,item_id,created_by,token,permission,password_hash,salt,expires_at,max_views,max_downloads,allow_comments,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, item.id, user.id, token, permission, hash, salt, expiresAt,
      body.maxViews ? Number(body.maxViews) : null, body.maxDownloads ? Number(body.maxDownloads) : null,
      body.allowComments ? 1 : 0, now())
    activity(user.id, item.id, 'share.create', permission)
    const share = publicShare(get('SELECT * FROM shares WHERE id = ?', id))
    emit('space:changed', { spaceId: item.space_id, type: 'share', itemId: item.id })
    sendJson(res, 201, { share })
  } },
  { method: 'PATCH', pattern: /^\/api\/shares\/(?<id>[^/]+)$/, async handler({ req, res, params, body }) {
    const user = requireUser(req)
    const share = get('SELECT * FROM shares WHERE id = ?', params.id) || fail(404, 'الرابط غير موجود')
    const item = get('SELECT * FROM items WHERE id = ?', share.item_id)
    const role = user.id === share.created_by ? 'owner' : null
    if (!role && item) {
      const member = get('SELECT role FROM space_members WHERE space_id = ? AND user_id = ?', item.space_id, user.id)
      role = item.space_id && (get('SELECT owner_id FROM spaces WHERE id = ?', item.space_id)?.owner_id === user.id ? 'owner' : member?.role)
    }
    if (!role || role === 'viewer') fail(403, 'مش مسموح لك تعدّل الرابط')
    if ('revoked' in body) run('UPDATE shares SET revoked = ? WHERE id = ?', body.revoked ? 1 : 0, share.id)
    if ('permission' in body && ['view', 'download', 'comment'].includes(body.permission)) run('UPDATE shares SET permission = ? WHERE id = ?', body.permission, share.id)
    if ('expiresDays' in body) run('UPDATE shares SET expires_at = ? WHERE id = ?',
      Number(body.expiresDays) > 0 ? now() + Number(body.expiresDays) * 86400000 : null, share.id)
    if ('maxViews' in body) run('UPDATE shares SET max_views = ? WHERE id = ?', body.maxViews ? Number(body.maxViews) : null, share.id)
    if ('maxDownloads' in body) run('UPDATE shares SET max_downloads = ? WHERE id = ?', body.maxDownloads ? Number(body.maxDownloads) : null, share.id)
    if ('allowComments' in body) run('UPDATE shares SET allow_comments = ? WHERE id = ?', body.allowComments ? 1 : 0, share.id)
    if ('password' in body) {
      if (body.password) { const { hash, salt } = hashPassword(String(body.password)); run('UPDATE shares SET password_hash = ?, salt = ? WHERE id = ?', hash, salt, share.id) }
      else run('UPDATE shares SET password_hash = NULL, salt = NULL WHERE id = ?', share.id)
    }
    sendJson(res, 200, { share: publicShare(get('SELECT * FROM shares WHERE id = ?', share.id)) })
  } },
  { method: 'DELETE', pattern: /^\/api\/shares\/(?<id>[^/]+)$/, handler({ req, res, params }) {
    const user = requireUser(req)
    const share = get('SELECT * FROM shares WHERE id = ?', params.id) || fail(404, 'الرابط غير موجود')
    if (share.created_by !== user.id) {
      const item = get('SELECT space_id FROM items WHERE id = ?', share.item_id)
      if (!item || get('SELECT owner_id FROM spaces WHERE id = ?', item.space_id)?.owner_id !== user.id) fail(403, 'مش مسموح')
    }
    run('DELETE FROM shares WHERE id = ?', share.id)
    sendJson(res, 200, { ok: true })
  } },
  { method: 'GET', pattern: /^\/api\/shares\/(?<id>[^/]+)\/events$/, handler({ req, res, params }) {
    const user = requireUser(req)
    const share = get('SELECT * FROM shares WHERE id = ?', params.id) || fail(404, 'الرابط غير موجود')
    if (share.created_by !== user.id) fail(403, 'مش مسموح')
    sendJson(res, 200, { events: all('SELECT * FROM share_events WHERE share_id = ? ORDER BY created_at DESC LIMIT 200', share.id) })
  } },
]
