import {
  now, newId, newToken, fail, sendJson, verifyPassword, descendants, streamBlob, readJson,
} from '../util.mjs'
import { all, get, run } from '../db.mjs'

function loadShare(token, grant = null, { skipPassword = false } = {}) {
  const share = get('SELECT * FROM shares WHERE token = ?', token) || fail(404, 'الرابط غير موجود')
  if (share.revoked) fail(410, 'تم إلغاء الرابط')
  if (share.expires_at && share.expires_at < now()) fail(410, 'انتهت صلاحية الرابط')
  if (share.password_hash && !skipPassword) {
    const valid = grant && get('SELECT token FROM share_grants WHERE token = ? AND share_id = ? AND expires_at > ?', grant, share.id, now())
    if (!valid) {
      const error = new Error('الرابط محمي بكلمة مرور')
      error.status = 401
      error.code = 'PASSWORD_REQUIRED'
      throw error
    }
  }
  const item = get('SELECT * FROM items WHERE id = ? AND deleted_at IS NULL', share.item_id) || fail(410, 'الملف لم يعد متاحاً')
  return { share, item }
}

function track(shareId, type, req) {
  run('INSERT INTO share_events (id,share_id,type,ip,ua,created_at) VALUES (?,?,?,?,?,?)',
    newId(), shareId, type, String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''), String(req.headers['user-agent'] || '').slice(0, 300), now())
  if (type === 'view') run('UPDATE shares SET views = views + 1 WHERE id = ?', shareId)
  if (type === 'download') run('UPDATE shares SET downloads = downloads + 1 WHERE id = ?', shareId)
}

function envelope(share, item) {
  const u = get('SELECT name,color FROM users WHERE id = ?', share.created_by)
  return {
    token: share.token,
    permission: share.permission,
    passwordRequired: !!share.password_hash,
    expiresAt: share.expires_at,
    allowComments: !!share.allow_comments && share.permission === 'comment',
    maxViews: share.max_views,
    views: share.views,
    maxDownloads: share.max_downloads,
    downloads: share.downloads,
    item: { id: item.id, name: item.name, kind: item.kind, mime: item.mime, size: item.size, updatedAt: item.updated_at },
    owner: u ? { name: u.name, color: u.color } : null,
  }
}

export const routes = [
  { method: 'GET', pattern: /^\/api\/public\/(?<token>[^/]+)$/, handler({ req, res, params, url }) {
    const grant = url.searchParams.get('grant')
    const { share, item } = loadShare(params.token, grant)
    sendJson(res, 200, { share: envelope(share, item) })
  } },
  { method: 'POST', pattern: /^\/api\/public\/(?<token>[^/]+)\/unlock$/, async handler({ req, res, params, body }) {
    const share = get('SELECT * FROM shares WHERE token = ?', params.token) || fail(404, 'الرابط غير موجود')
    if (share.revoked) fail(410, 'تم إلغاء الرابط')
    if (share.expires_at && share.expires_at < now()) fail(410, 'انتهت صلاحية الرابط')
    if (!share.password_hash) { sendJson(res, 200, { ok: true, grant: null }); return }
    if (!verifyPassword(String(body.password || ''), share.salt, share.password_hash)) {
      const error = new Error('كلمة المرور غلط'); error.status = 403; throw error
    }
    const grant = newToken()
    run('INSERT INTO share_grants (token,share_id,expires_at) VALUES (?,?,?)', grant, share.id, now() + 12 * 3600 * 1000)
    sendJson(res, 200, { ok: true, grant })
  } },
  { method: 'GET', pattern: /^\/api\/public\/(?<token>[^/]+)\/list$/, handler({ req, res, params, url }) {
    const { share, item } = loadShare(params.token, url.searchParams.get('grant'))
    if (item.kind !== 'folder') fail(400, 'الرابط لملف مش مجلد')
    if (share.max_views && share.views >= share.max_views) fail(410, 'تم الوصول للحد الأقصى للمشاهدات')
    const parent = url.searchParams.get('parent') || item.id
    if (parent !== item.id && !descendants(item.id).includes(parent)) fail(403, 'مجلد خارج النطاق')
    const items = all('SELECT id,parent_id,kind,name,mime,size,updated_at FROM items WHERE parent_id = ? AND deleted_at IS NULL ORDER BY kind DESC,name', parent)
    sendJson(res, 200, { items })
  } },
  { method: 'GET', pattern: /^\/api\/public\/(?<token>[^/]+)\/content$/, async handler({ req, res, params, url }) {
    const { share, item } = loadShare(params.token, url.searchParams.get('grant'))
    let target = item
    const child = url.searchParams.get('child')
    if (child) {
      if (item.kind !== 'folder' || !descendants(item.id).includes(child)) fail(403, 'الملف خارج نطاق الرابط')
      target = get('SELECT * FROM items WHERE id = ? AND deleted_at IS NULL', child) || fail(404, 'الملف غير موجود')
      if (target.kind !== 'file') fail(400, 'اختر ملفاً')
    }
    if (target.kind !== 'file') fail(400, 'الرابط لمجلد — استخدم /list')
    if (share.max_views && share.views >= share.max_views) fail(410, 'تم الوصول للحد الأقصى للمشاهدات')
    const download = share.permission !== 'view' && url.searchParams.get('download') === '1'
    if (download && share.max_downloads && share.downloads >= share.max_downloads) fail(410, 'تم الوصول للحد الأقصى للتنزيلات')
    track(share.id, download ? 'download' : 'view', req)
    const mime = url.searchParams.get('inline') === '1' ? target.mime : 'application/octet-stream'
    await streamBlob(res, target.blob_path, target.name, mime, download ? 'attachment' : 'inline')
  } },
  { method: 'GET', pattern: /^\/api\/public\/(?<token>[^/]+)\/comments$/, handler({ req, res, params, url }) {
    const { share, item } = loadShare(params.token, url.searchParams.get('grant'))
    if (!share.allow_comments || share.permission !== 'comment') fail(403, 'التعليقات مغلقة في الرابط')
    const comments = all(`SELECT c.*, COALESCE(u.name, c.author_name) AS author_name, u.color AS author_color FROM comments c
      LEFT JOIN users u ON u.id = c.user_id WHERE c.item_id = ? ORDER BY c.created_at`, item.id)
    sendJson(res, 200, { comments })
  } },
  { method: 'POST', pattern: /^\/api\/public\/(?<token>[^/]+)\/comments$/, rawBody: true, async handler({ req, res, params, url }) {
    const grant = url.searchParams.get('grant')
    const { share, item } = loadShare(params.token, grant)
    if (!share.allow_comments || share.permission !== 'comment') fail(403, 'التعليقات مغلقة في الرابط')
    const body = await readJson(req)
    const text = String(body.body || '').trim()
    if (!text) fail(400, 'اكتب تعليق أولاً')
    const id = newId()
    run('INSERT INTO comments (id,item_id,user_id,author_name,body,created_at) VALUES (?,?,?,?,?,?)',
      id, item.id, null, String(body.name || 'ضيف').slice(0, 60), text, now())
    sendJson(res, 201, { comment: get(`SELECT c.*, c.author_name FROM comments c WHERE c.id = ?`, id) })
  } },
]
