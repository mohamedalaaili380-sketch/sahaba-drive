import {
  now, newId, fail, requireUser, sendJson, assertAccess, spaceRole, activity, deleteBlob,
} from '../util.mjs'
import { all, get, run } from '../db.mjs'
import { notify } from '../util.mjs'
import { notifySpace } from './collab.mjs'

export const routes = [
  { method: 'GET', pattern: /^\/api\/teams$/, handler({ req, res }) {
    const user = requireUser(req)
    const teams = all(`SELECT s.*, m.role,
      (SELECT COUNT(*) FROM space_members WHERE space_id = s.id) AS members,
      (SELECT COUNT(*) FROM items WHERE space_id = s.id AND deleted_at IS NULL) AS files
      FROM spaces s JOIN space_members m ON m.space_id = s.id
      WHERE s.kind = 'team' AND m.user_id = ? ORDER BY s.created_at DESC`, user.id)
    sendJson(res, 200, { teams })
  } },
  { method: 'POST', pattern: /^\/api\/teams$/, handler({ req, res, body }) {
    const user = requireUser(req)
    const name = String(body.name || '').trim()
    if (!name) fail(400, 'اسم الفريق مطلوب')
    const id = newId()
    run('INSERT INTO spaces (id,kind,name,owner_id,created_at) VALUES (?,?,?,?,?)', id, 'team', name, user.id, now())
    run('INSERT INTO space_members (space_id,user_id,role) VALUES (?,?,?)', id, user.id, 'owner')
    activity(user.id, null, 'team.create', name)
    sendJson(res, 201, { team: { id, name, role: 'owner', members: 1, files: 0 } })
  } },
  { method: 'GET', pattern: /^\/api\/teams\/(?<id>[^/]+)$/, handler({ req, res, params }) {
    const user = requireUser(req)
    const role = assertAccess(user.id, params.id)
    const space = get('SELECT * FROM spaces WHERE id = ?', params.id)
    const members = all(`SELECT u.id,u.name,u.email,u.color,m.role FROM space_members m
      JOIN users u ON u.id = m.user_id WHERE m.space_id = ? ORDER BY m.role, u.name`, space.id)
    sendJson(res, 200, { team: { ...space, role, members } })
  } },
  { method: 'PATCH', pattern: /^\/api\/teams\/(?<id>[^/]+)$/, handler({ req, res, params, body }) {
    const user = requireUser(req)
    assertAccess(user.id, params.id, 'owner')
    const name = String(body.name || '').trim()
    if (!name) fail(400, 'اسم الفريق مطلوب')
    run('UPDATE spaces SET name = ? WHERE id = ?', name, params.id)
    notifySpace(params.id, 'team:updated', { id: params.id, name })
    sendJson(res, 200, { ok: true })
  } },
  { method: 'POST', pattern: /^\/api\/teams\/(?<id>[^/]+)\/members$/, handler({ req, res, params, body }) {
    const user = requireUser(req)
    assertAccess(user.id, params.id, 'owner')
    const email = String(body.email || '').trim().toLowerCase()
    const role = ['editor', 'viewer'].includes(body.role) ? body.role : 'editor'
    const target = get('SELECT * FROM users WHERE email = ?', email) || fail(404, 'مفيش مستخدم بالبريد ده')
    if (target.id === user.id) fail(400, 'أنت مالك الفريق بالفعل')
    run(`INSERT INTO space_members (space_id,user_id,role) VALUES (?,?,?)
      ON CONFLICT(space_id,user_id) DO UPDATE SET role = excluded.role`, params.id, target.id, role)
    const space = get('SELECT name FROM spaces WHERE id = ?', params.id)
    notify(target.id, 'team.invite', `تمت إضافتك لفريق «${space.name}» بدور ${role === 'editor' ? 'محرر' : 'قارئ'}`, null)
    notifySpace(params.id, 'team:members', { id: params.id })
    sendJson(res, 200, { ok: true })
  } },
  { method: 'PATCH', pattern: /^\/api\/teams\/(?<id>[^/]+)\/members\/(?<userId>[^/]+)$/, handler({ req, res, params, body }) {
    const user = requireUser(req)
    assertAccess(user.id, params.id, 'owner')
    if (params.userId === user.id) fail(400, 'دور المالك مش متغير')
    const role = ['editor', 'viewer'].includes(body.role) ? body.role : fail(400, 'دور غير صحيح')
    run('UPDATE space_members SET role = ? WHERE space_id = ? AND user_id = ?', role, params.id, params.userId)
    notifySpace(params.id, 'team:members', { id: params.id })
    sendJson(res, 200, { ok: true })
  } },
  { method: 'DELETE', pattern: /^\/api\/teams\/(?<id>[^/]+)\/members\/(?<userId>[^/]+)$/, handler({ req, res, params }) {
    const user = requireUser(req)
    assertAccess(user.id, params.id, 'owner')
    if (params.userId === user.id) fail(400, 'المالك مش ممكن يتشال')
    run('DELETE FROM space_members WHERE space_id = ? AND user_id = ?', params.id, params.userId)
    notify(params.userId, 'team.remove', 'تمت إزالتك من الفريق', null)
    notifySpace(params.id, 'team:members', { id: params.id })
    sendJson(res, 200, { ok: true })
  } },
  { method: 'POST', pattern: /^\/api\/teams\/(?<id>[^/]+)\/leave$/, handler({ req, res, params }) {
    const user = requireUser(req)
    const space = get('SELECT * FROM spaces WHERE id = ?', params.id) || fail(404, 'الفريق غير موجود')
    if (space.owner_id === user.id) fail(400, 'المالك مش ممكن يسيب الفريق — احذفه أو سلّم الملكية')
    run('DELETE FROM space_members WHERE space_id = ? AND user_id = ?', params.id, user.id)
    sendJson(res, 200, { ok: true })
  } },
  { method: 'DELETE', pattern: /^\/api\/teams\/(?<id>[^/]+)$/, handler({ req, res, params }) {
    const user = requireUser(req)
    assertAccess(user.id, params.id, 'owner')
    const members = all('SELECT user_id FROM space_members WHERE space_id = ?', params.id).map((r) => r.user_id)
    const blobs = all('SELECT blob_path FROM versions WHERE item_id IN (SELECT id FROM items WHERE space_id = ?)', params.id)
    run('DELETE FROM spaces WHERE id = ?', params.id)
    for (const b of blobs) {
      if (!get('SELECT 1 FROM versions WHERE blob_path = ? LIMIT 1', b.blob_path)) deleteBlob(b.blob_path)
    }
    for (const id of members.filter((id) => id !== user.id)) notify(id, 'team.remove', 'تم حذف الفريق', null)
    sendJson(res, 200, { ok: true })
  } },
  { method: 'GET', pattern: /^\/api\/shared$/, handler({ req, res }) {
    const user = requireUser(req)
    const items = all(`SELECT i.*, s.name AS space_name FROM items i
      JOIN spaces s ON s.id = i.space_id JOIN space_members m ON m.space_id = s.id
      WHERE m.user_id = ? AND s.owner_id != ? AND i.deleted_at IS NULL
      ORDER BY i.updated_at DESC`, user.id, user.id)
    sendJson(res, 200, { items })
  } },
]
