import { WebSocketServer } from 'ws'
import {
  now, newId, fail, requireUser, sendJson, itemAccess, serializeItem, activity,
} from '../util.mjs'
import { all, get, run } from '../db.mjs'
import { bus, emit } from '../events.mjs'

/* ---------- realtime ---------- */

const sockets = new Map() // userId -> Set<ws>
const rooms = new Map() // itemId -> Map<ws, {id,name}>

function safeSend(ws, event, payload) {
  if (ws.readyState === 1) ws.send(JSON.stringify({ event, payload }))
}

export function notifyUser(userId, event, payload) {
  for (const ws of sockets.get(userId) || []) safeSend(ws, event, payload)
}

export function notifySpace(spaceId, event, payload) {
  const users = all(`SELECT user_id FROM space_members WHERE space_id = ?`, spaceId).map((r) => r.user_id)
  const owner = get('SELECT owner_id FROM spaces WHERE id = ?', spaceId)?.owner_id
  if (owner) users.push(owner)
  for (const userId of new Set(users)) notifyUser(userId, event, payload)
}

export function broadcastItem(itemId, event, payload) {
  for (const ws of rooms.get(itemId)?.keys() || []) safeSend(ws, event, payload)
}

function presence(itemId) {
  const users = [...new Map([...(rooms.get(itemId)?.values() || [])].map((u) => [u.id, u])).values()]
  broadcastItem(itemId, 'presence', { itemId, users })
}

bus.on('notification', ({ userId, ...payload }) => notifyUser(userId, 'notification', payload))
bus.on('activity', ({ userId, ...payload }) => notifyUser(userId, 'activity', payload))

export function setupWebsocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' })
  wss.on('connection', (ws, request) => {
    const url = new URL(request.url, 'http://localhost')
    const token = url.searchParams.get('token') || ''
    const session = get('SELECT * FROM sessions WHERE token = ?', token)
    const user = session && session.expires_at > now() ? get('SELECT * FROM users WHERE id = ?', session.user_id) : null
    if (!user) { ws.close(4001, 'unauthorized'); return }
    ws.userId = user.id
    ws.user = { id: user.id, name: user.name, color: user.color }
    ws.items = new Set()
    if (!sockets.has(user.id)) sockets.set(user.id, new Set())
    sockets.get(user.id).add(ws)
    safeSend(ws, 'hello', { user: ws.user })

    ws.on('message', (raw) => {
      let msg
      try { msg = JSON.parse(raw.toString()) } catch { return }
      if (msg.event === 'join' && msg.itemId) {
        const item = get('SELECT id,space_id FROM items WHERE id = ? AND deleted_at IS NULL', msg.itemId)
        const role = item && get('SELECT role FROM space_members WHERE space_id = ? AND user_id = ?', item.space_id, user.id)
        if (!item || (!role && item.space_id && get('SELECT owner_id FROM spaces WHERE id = ?', item.space_id)?.owner_id !== user.id)) return
        if (!rooms.has(msg.itemId)) rooms.set(msg.itemId, new Map())
        rooms.get(msg.itemId).set(ws, ws.user)
        ws.items.add(msg.itemId)
        presence(msg.itemId)
      }
      if (msg.event === 'leave' && msg.itemId) leave(ws, msg.itemId)
    })

    ws.on('close', () => {
      sockets.get(user.id)?.delete(ws)
      for (const itemId of ws.items) leave(ws, itemId)
    })
  })
  return wss
}

function leave(ws, itemId) {
  rooms.get(itemId)?.delete(ws)
  ws.items.delete(itemId)
  presence(itemId)
}

/* ---------- routes ---------- */

export const routes = [
  { method: 'GET', pattern: /^\/api\/items\/(?<id>[^/]+)\/comments$/, handler({ req, res, params }) {
    const user = requireUser(req)
    itemAccess(user.id, params.id)
    const comments = all(`SELECT c.*, COALESCE(u.name, c.author_name) AS author_name, u.color AS author_color FROM comments c
      LEFT JOIN users u ON u.id = c.user_id WHERE c.item_id = ? ORDER BY c.created_at`, params.id)
    sendJson(res, 200, { comments })
  } },
  { method: 'POST', pattern: /^\/api\/items\/(?<id>[^/]+)\/comments$/, async handler({ req, res, params, body }) {
    const user = requireUser(req)
    const { item } = itemAccess(user.id, params.id)
    const text = String(body.body || '').trim()
    if (!text) fail(400, 'اكتب تعليق أولاً')
    const id = newId()
    const parentId = body.parentId || null
    run('INSERT INTO comments (id,item_id,user_id,author_name,parent_id,body,created_at) VALUES (?,?,?,?,?,?,?)', id, item.id, user.id, user.name, parentId, text, now())
    const comment = get(`SELECT c.*, COALESCE(u.name, c.author_name) AS author_name, u.color AS author_color FROM comments c
      LEFT JOIN users u ON u.id = c.user_id WHERE c.id = ?`, id)
    activity(user.id, item.id, 'comment', text.slice(0, 80))
    broadcastItem(item.id, 'comment:new', { itemId: item.id, comment })
    emit('space:changed', { spaceId: item.space_id, type: 'comment', id: item.id })
    notifySpace(item.space_id, 'comment:new', { itemId: item.id, comment })
    sendJson(res, 201, { comment })
  } },
  { method: 'DELETE', pattern: /^\/api\/comments\/(?<id>[^/]+)$/, handler({ req, res, params }) {
    const user = requireUser(req)
    const comment = get('SELECT * FROM comments WHERE id = ?', params.id) || fail(404, 'التعليق غير موجود')
    if (comment.user_id !== user.id && get('SELECT owner_id FROM spaces WHERE id = ?', get('SELECT space_id FROM items WHERE id = ?', comment.item_id).space_id)?.owner_id !== user.id) fail(403, 'مش مسموح')
    run('DELETE FROM comments WHERE id = ?', comment.id)
    broadcastItem(comment.item_id, 'comment:deleted', { itemId: comment.item_id, id: comment.id })
    sendJson(res, 200, { ok: true })
  } },
  { method: 'GET', pattern: /^\/api\/tags$/, handler({ req, res }) {
    const user = requireUser(req)
    sendJson(res, 200, { tags: all('SELECT * FROM tags WHERE user_id = ? ORDER BY name', user.id) })
  } },
  { method: 'POST', pattern: /^\/api\/tags$/, handler({ req, res, body }) {
    const user = requireUser(req)
    const name = String(body.name || '').trim()
    if (!name) fail(400, 'اسم الوسم مطلوب')
    if (get('SELECT id FROM tags WHERE user_id = ? AND name = ?', user.id, name)) fail(409, 'الوسم موجود')
    const id = newId()
    run('INSERT INTO tags (id,user_id,name,color) VALUES (?,?,?,?)', id, user.id, name, String(body.color || '#6d7cff'))
    sendJson(res, 201, { tag: get('SELECT * FROM tags WHERE id = ?', id) })
  } },
  { method: 'PATCH', pattern: /^\/api\/tags\/(?<id>[^/]+)$/, handler({ req, res, params, body }) {
    const user = requireUser(req)
    const tag = get('SELECT * FROM tags WHERE id = ? AND user_id = ?', params.id, user.id) || fail(404, 'الوسم غير موجود')
    run('UPDATE tags SET name = ?, color = ? WHERE id = ?', String(body.name || tag.name), String(body.color || tag.color), tag.id)
    sendJson(res, 200, { tag: get('SELECT * FROM tags WHERE id = ?', tag.id) })
  } },
  { method: 'DELETE', pattern: /^\/api\/tags\/(?<id>[^/]+)$/, handler({ req, res, params }) {
    const user = requireUser(req)
    run('DELETE FROM tags WHERE id = ? AND user_id = ?', params.id, user.id)
    sendJson(res, 200, { ok: true })
  } },
  { method: 'GET', pattern: /^\/api\/activity$/, handler({ req, res, url }) {
    const user = requireUser(req)
    const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200)
    const rows = all(`SELECT a.*, u.name AS user_name FROM activity a JOIN users u ON u.id = a.user_id
      WHERE a.user_id = ? OR a.item_id IN (SELECT i.id FROM items i JOIN space_members m ON m.space_id = i.space_id WHERE m.user_id = ?)
      ORDER BY a.created_at DESC LIMIT ?`, user.id, user.id, limit)
    sendJson(res, 200, { activity: rows })
  } },
  { method: 'GET', pattern: /^\/api\/notifications$/, handler({ req, res }) {
    const user = requireUser(req)
    sendJson(res, 200, { notifications: all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', user.id) })
  } },
  { method: 'PATCH', pattern: /^\/api\/notifications\/read$/, handler({ req, res, body }) {
    const user = requireUser(req)
    if (body.id) run('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?', body.id, user.id)
    else run('UPDATE notifications SET read = 1 WHERE user_id = ?', user.id)
    sendJson(res, 200, { ok: true })
  } },
  { method: 'GET', pattern: /^\/api\/users$/, handler({ req, res, url }) {
    const user = requireUser(req)
    const q = `%${url.searchParams.get('q') || ''}%`
    const users = all(`SELECT id,name,email,color FROM users WHERE id != ? AND (name LIKE ? OR email LIKE ?) LIMIT 20`, user.id, q, q)
    sendJson(res, 200, { users })
  } },
  { method: 'GET', pattern: /^\/api\/search$/, handler({ req, res, url }) {
    const user = requireUser(req)
    const p = url.searchParams
    const conditions = ['i.deleted_at IS NULL', '(s.owner_id = ? OR m.user_id = ?)']
    const params = [user.id, user.id]
    const q = (p.get('q') || '').trim()
    if (q) { conditions.push('(i.name LIKE ? OR i.description LIKE ?)'); params.push(`%${q}%`, `%${q}%`) }
    const kind = p.get('kind')
    if (kind === 'file' || kind === 'folder') { conditions.push('i.kind = ?'); params.push(kind) }
    const mime = p.get('mime')
    if (mime) { conditions.push("i.mime LIKE ?"); params.push(`${mime}%`) }
    const tag = p.get('tag')
    if (tag) { conditions.push('EXISTS (SELECT 1 FROM item_tags it WHERE it.item_id = i.id AND it.tag_id = ?)'); params.push(tag) }
    const space = p.get('space')
    if (space) { conditions.push('i.space_id = ?'); params.push(space) }
    if (p.get('starred') === '1') conditions.push('i.starred = 1')
    if (p.get('from')) { conditions.push('i.updated_at >= ?'); params.push(Date.parse(p.get('from'))) }
    if (p.get('to')) { conditions.push('i.updated_at <= ?'); params.push(Date.parse(p.get('to')) + 86400000) }
    if (p.get('min')) { conditions.push('i.size >= ?'); params.push(Number(p.get('min')) * 1024 * 1024) }
    if (p.get('max')) { conditions.push('i.size <= ?'); params.push(Number(p.get('max')) * 1024 * 1024) }
    const sort = p.get('sort') || 'updated'
    const order = sort === 'name' ? 'i.name COLLATE NOCASE' : sort === 'size' ? 'i.size DESC' : 'i.updated_at DESC'
    const items = all(`SELECT DISTINCT i.* FROM items i
      JOIN spaces s ON s.id = i.space_id LEFT JOIN space_members m ON m.space_id = s.id AND m.user_id = ?
      WHERE ${conditions.join(' AND ')} ORDER BY ${order} LIMIT 300`, user.id, ...params)
    sendJson(res, 200, { items: items.map(serializeItem) })
  } },
]
