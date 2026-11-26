import crypto from 'node:crypto'
import {
  now, newId, fail, requireUser, sendJson, assertAccess, resolveWriteSpace, spaceRole, itemAccess,
  checkQuota, saveBlobStream, saveBlobBuffer, deleteBlob, copyBlob, streamBlob, getParentChain,
  activity, descendants, serializeItem, tagsForItem,
} from '../util.mjs'
import { all, get, run } from '../db.mjs'
import { MAX_VERSIONS } from '../config.mjs'
import { emit } from '../events.mjs'
import { notifySpace } from './collab.mjs'

function cleanName(name) {
  const value = String(name || '').trim().replace(/[\\/]/g, '-')
  if (!value) fail(400, 'الاسم مطلوب')
  if (value.length > 200) fail(400, 'الاسم طويل جداً')
  return value
}

function uniqueName(spaceId, parentId, name, exceptId = null) {
  const exists = get(`SELECT id FROM items WHERE space_id = ? AND parent_id IS ? AND name = ? AND deleted_at IS NULL AND kind = 'folder' AND id IS NOT ?`,
    spaceId, parentId, name, exceptId)
  if (exists) fail(409, 'فيه مجلد بنفس الاسم هنا')
}

function broadcastChange(spaceId, payload) {
  emit('space:changed', { spaceId, ...payload })
  notifySpace(spaceId, 'space:changed', payload)
}

export const routes = [
  {
    method: 'GET', pattern: /^\/api\/spaces$/,
    handler({ req, res }) {
      const user = requireUser(req)
      const spaces = all(`SELECT s.*, m.role,
        (SELECT COUNT(*) FROM items i WHERE i.space_id = s.id AND i.deleted_at IS NULL) AS item_count
        FROM spaces s LEFT JOIN space_members m ON m.space_id = s.id AND m.user_id = ?
        WHERE m.user_id = ? OR s.owner_id = ? ORDER BY s.kind DESC, s.created_at`, user.id, user.id, user.id)
        .map((s) => ({ ...s, role: s.owner_id === user.id ? 'owner' : (s.role || 'viewer') }))
      sendJson(res, 200, { spaces })
    },
  },
  {
    method: 'POST', pattern: /^\/api\/items\/bulk$/,
    handler({ req, res, body }) {
      const user = requireUser(req)
      const action = String(body.action || '')
      const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map((id) => String(id)).filter(Boolean))]
      if (!ids.length) fail(400, 'اختار عنصر على الأقل')
      if (ids.length > 200) fail(400, 'اختار 200 عنصر كحد أقصى')
      const allowed = new Set(['trash', 'restore', 'delete', 'star', 'unstar', 'tag', 'untag', 'move'])
      if (!allowed.has(action)) fail(400, 'إجراء غير معروف')

      const entries = ids.map((id) => {
        const { item } = itemAccess(user.id, id, 'editor', { includeDeleted: true })
        assertAccess(user.id, item.space_id, 'editor')
        return item
      })
      const active = entries.filter((i) => !i.deleted_at)
      const activeIds = new Set(active.map((i) => i.id))
      const t = now()
      let count = 0

      if (action === 'trash') {
        for (const item of active) {
          const tree = descendants(item.id)
          run(`UPDATE items SET deleted_at = ?, updated_at = ? WHERE id IN (${tree.map(() => '?').join(',')})`, t, t, ...tree)
          activity(user.id, item.id, 'item.trash', item.name)
          broadcastChange(item.space_id, { type: 'trashed', ids: tree })
          count += tree.length
        }
      } else if (action === 'restore') {
        for (const item of entries.filter((i) => i.deleted_at)) {
          const tree = descendants(item.id)
          let parentId = item.parent_id
          if (parentId && get('SELECT 1 FROM items WHERE id = ? AND deleted_at IS NOT NULL', parentId)) parentId = null
          run(`UPDATE items SET deleted_at = NULL, updated_at = ? WHERE id IN (${tree.map(() => '?').join(',')})`, t, ...tree)
          run('UPDATE items SET parent_id = ? WHERE id = ?', parentId, item.id)
          activity(user.id, item.id, 'item.restore', item.name)
          broadcastChange(item.space_id, { type: 'restored', ids: tree })
          count += tree.length
        }
      } else if (action === 'delete') {
        for (const item of entries.filter((i) => i.deleted_at)) {
          const tree = descendants(item.id)
          const blobs = all(`SELECT blob_path FROM versions WHERE item_id IN (${tree.map(() => '?').join(',')})`, ...tree)
          run(`DELETE FROM items WHERE id IN (${tree.map(() => '?').join(',')})`, ...tree)
          for (const b of blobs) {
            if (!get('SELECT 1 FROM versions WHERE blob_path = ? LIMIT 1', b.blob_path)) deleteBlob(b.blob_path)
          }
          activity(user.id, item.id, 'item.delete', item.name)
          broadcastChange(item.space_id, { type: 'deleted', ids: tree })
          count += tree.length
        }
      } else if (action === 'star' || action === 'unstar') {
        const value = action === 'star' ? 1 : 0
        for (const item of active) {
          run('UPDATE items SET starred = ?, updated_at = ? WHERE id = ?', value, t, item.id)
          activity(user.id, item.id, action === 'star' ? 'item.star' : 'item.unstar', item.name)
          broadcastChange(item.space_id, { type: 'updated', item: serializeItem(get('SELECT * FROM items WHERE id = ?', item.id)) })
          count++
        }
      } else if (action === 'tag' || action === 'untag') {
        const tagIds = [...new Set((Array.isArray(body.tagIds) ? body.tagIds : []).map((id) => String(id))
          .filter((id) => get('SELECT id FROM tags WHERE id = ? AND user_id = ?', id, user.id)))]
        if (!tagIds.length) fail(400, 'اختار وسم على الأقل')
        for (const item of active) {
          if (action === 'tag') {
            for (const tag of tagIds) run('INSERT OR IGNORE INTO item_tags (item_id,tag_id) VALUES (?,?)', item.id, tag)
          } else {
            run(`DELETE FROM item_tags WHERE item_id = ? AND tag_id IN (${tagIds.map(() => '?').join(',')})`, item.id, ...tagIds)
          }
          broadcastChange(item.space_id, { type: 'updated', item: serializeItem(get('SELECT * FROM items WHERE id = ?', item.id)) })
          count++
        }
      } else if (action === 'move') {
        const target = body.parentId ? String(body.parentId) : null
        const dest = target ? get('SELECT * FROM items WHERE id = ? AND deleted_at IS NULL', target) : null
        if (target && (!dest || dest.kind !== 'folder')) fail(400, 'مجلد الوجهة غير صحيح')
        if (dest) assertAccess(user.id, dest.space_id, 'editor')

        for (const item of active) {
          if (dest && item.space_id !== dest.space_id) fail(400, 'كل العناصر لازم تكون في نفس المساحة')
          if (dest && descendants(item.id).includes(target)) fail(400, 'ما ينقلش المجلد جوه نفسه')
          const space = dest ? dest.space_id : item.space_id
          const taken = new Set(all('SELECT id,name FROM items WHERE parent_id IS ? AND space_id = ? AND deleted_at IS NULL', target, space)
            .filter((row) => !activeIds.has(row.id)).map((row) => row.name))
          if (taken.has(item.name)) fail(409, `فيه عنصر بنفس الاسم في الوجهة: ${item.name}`)
        }
        for (const item of active) {
          run('UPDATE items SET parent_id = ?, updated_at = ? WHERE id = ?', target, t, item.id)
          activity(user.id, item.id, 'item.move', target || 'الجذر')
          broadcastChange(item.space_id, { type: 'updated', item: serializeItem(get('SELECT * FROM items WHERE id = ?', item.id)) })
          count++
        }
      } else {
        fail(400, 'إجراء غير معروف')
      }

      sendJson(res, 200, { ok: true, action, count })
    },
  },
  {
    method: 'GET', pattern: /^\/api\/items$/,
    handler({ req, res, url }) {
      const user = requireUser(req)
      const spaceId = url.searchParams.get('space')
      if (!spaceId) fail(400, 'المساحة مطلوبة')
      assertAccess(user.id, spaceId)
      const parent = url.searchParams.get('parent') || null
      if (parent) {
        const p = get('SELECT * FROM items WHERE id = ? AND deleted_at IS NULL', parent)
        if (!p || p.space_id !== spaceId) fail(400, 'المجلد الأب غير صحيح')
      }
      const rows = all(`SELECT * FROM items WHERE space_id = ? AND parent_id IS ? AND deleted_at IS NULL
        ORDER BY kind DESC, name COLLATE NOCASE`, spaceId, parent)
      sendJson(res, 200, { items: rows.map(serializeItem) })
    },
  },
  {
    method: 'GET', pattern: /^\/api\/items\/(?<id>[^/]+)\/breadcrumb$/,
    handler({ req, res, params }) {
      const user = requireUser(req)
      const { item } = itemAccess(user.id, params.id)
      sendJson(res, 200, { trail: getParentChain(item) })
    },
  },
  {
    method: 'GET', pattern: /^\/api\/items\/(?<id>[^/]+)$/,
    handler({ req, res, params }) {
      const user = requireUser(req)
      const { item, role } = itemAccess(user.id, params.id)
      const info = serializeItem(item)
      sendJson(res, 200, {
        item: {
          ...info,
          comments: all(`SELECT c.*, COALESCE(u.name, c.author_name) AS author_name, u.color AS author_color FROM comments c
            LEFT JOIN users u ON u.id = c.user_id WHERE c.item_id = ? ORDER BY c.created_at`, item.id),
          versions: all('SELECT id,number,size,note,created_at FROM versions WHERE item_id = ? ORDER BY number DESC', item.id),
          shares: all('SELECT id,token,permission,expires_at,views,downloads,max_views,max_downloads,revoked,created_at FROM shares WHERE item_id = ? AND revoked = 0', item.id),
          space: get('SELECT id,name,kind FROM spaces WHERE id = ?', item.space_id),
        },
        role,
      })
    },
  },
  {
    method: 'POST', pattern: /^\/api\/items$/, async handler({ req, res, body }) {
      const user = requireUser(req)
      const requestedSpace = String(body.spaceId || '')
      const spaceId = resolveWriteSpace(user.id, requestedSpace)
      let parentId = body.parentId ? String(body.parentId) : null
      if (parentId && spaceId !== requestedSpace) parentId = null
      assertAccess(user.id, spaceId, 'editor')
      const name = cleanName(body.name)
      if (parentId) {
        const parent = get('SELECT * FROM items WHERE id = ? AND deleted_at IS NULL', parentId)
        if (!parent || parent.space_id !== spaceId || parent.kind !== 'folder') fail(400, 'المجلد الأب غير صحيح')
      }
      uniqueName(spaceId, parentId, name)
      const id = newId()
      run(`INSERT INTO items (id,space_id,owner_id,parent_id,kind,name,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`,
        id, spaceId, user.id, parentId, 'folder', name, now(), now())
      activity(user.id, id, 'folder.create', name)
      const item = serializeItem(get('SELECT * FROM items WHERE id = ?', id))
      broadcastChange(spaceId, { type: 'created', item })
      sendJson(res, 201, { item })
    },
  },
  {
    method: 'POST', pattern: /^\/api\/upload$/, rawBody: true, async handler({ req, res, url }) {
      const user = requireUser(req)
      const requestedSpace = url.searchParams.get('space') || ''
      const spaceId = resolveWriteSpace(user.id, requestedSpace)
      let parentId = url.searchParams.get('parent') || null
      if (parentId && spaceId !== requestedSpace) parentId = null
      assertAccess(user.id, spaceId, 'editor')
      let name = cleanName(url.searchParams.get('name'))
      const mime = url.searchParams.get('mime') || 'application/octet-stream'
      if (parentId) {
        const parent = get('SELECT * FROM items WHERE id = ? AND deleted_at IS NULL', parentId)
        if (!parent || parent.space_id !== spaceId || parent.kind !== 'folder') fail(400, 'المجلد الأب غير صحيح')
      }
      checkQuota(user.id, 0)
      const existing = get(`SELECT * FROM items WHERE space_id = ? AND parent_id IS ? AND name = ? AND deleted_at IS NULL`, spaceId, parentId, name)
      if (existing?.kind === 'folder') fail(409, 'فيه مجلد بنفس الاسم هنا')

      const localId = newId()
      const saved = await saveBlobStream(req, localId, undefined, name)
      const blobId = saved.id
      const size = saved.size
      checkQuota(user.id, existing ? size - existing.size : size)

      let itemId
      if (existing) {
        itemId = existing.id
        const version = existing.version + 1
        run(`INSERT INTO versions (id,item_id,number,size,blob_path,author_id,note,created_at) VALUES (?,?,?,?,?,?,?,?)`,
          newId(), itemId, version, size, blobId, user.id, 'رفع ملف جديد', now())
        run('UPDATE items SET size = ?, mime = ?, version = ?, blob_path = ?, updated_at = ? WHERE id = ?', size, mime, version, blobId, now(), itemId)
        const old = all('SELECT id,blob_path FROM versions WHERE item_id = ? AND number <= ? ORDER BY number DESC', itemId, version - MAX_VERSIONS)
        for (const v of old) {
          run('DELETE FROM versions WHERE id = ?', v.id)
          deleteBlob(v.blob_path)
        }
        activity(user.id, itemId, 'file.version', `إصدار ${version}: ${name}`)
      } else {
        itemId = newId()
        run(`INSERT INTO items (id,space_id,owner_id,parent_id,kind,name,mime,size,blob_path,version,created_at,updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          itemId, spaceId, user.id, parentId, 'file', name, mime, size, blobId, 1, now(), now())
        run(`INSERT INTO versions (id,item_id,number,size,blob_path,author_id,note,created_at) VALUES (?,?,?,?,?,?,?,?)`,
          newId(), itemId, 1, size, blobId, user.id, 'الإصدار الأول', now())
        activity(user.id, itemId, 'file.upload', name)
      }
      const item = serializeItem(get('SELECT * FROM items WHERE id = ?', itemId))
      broadcastChange(spaceId, { type: existing ? 'updated' : 'created', item })
      sendJson(res, existing ? 200 : 201, { item, version: item.version })
    },
  },
  {
    method: 'POST', pattern: /^\/api\/items\/(?<id>[^/]+)\/content$/,
    async handler({ req, res, params, body }) {
      const user = requireUser(req)
      const { item } = itemAccess(user.id, params.id, 'editor')
      if (item.kind !== 'file') fail(400, 'المجلدات مش قابلة للتحرير')
      const text = String(body.content ?? '')
      const buffer = Buffer.from(text, 'utf8')
      checkQuota(user.id, buffer.length - item.size)
      const saved = await saveBlobBuffer(buffer, newId(), item.name)
      const blobId = saved.id
      const version = item.version + 1
      run('INSERT INTO versions (id,item_id,number,size,blob_path,author_id,note,created_at) VALUES (?,?,?,?,?,?,?,?)',
        newId(), item.id, version, buffer.length, blobId, user.id, String(body.note || 'تحرير داخل التطبيق'), now())
      run('UPDATE items SET size = ?, version = ?, blob_path = ?, updated_at = ?, mime = ? WHERE id = ?',
        buffer.length, version, blobId, now(), item.mime || 'text/plain', item.id)
      const old = all('SELECT id,blob_path FROM versions WHERE item_id = ? AND number <= ? ORDER BY number DESC', item.id, version - MAX_VERSIONS)
      for (const v of old) { run('DELETE FROM versions WHERE id = ?', v.id); deleteBlob(v.blob_path) }
      activity(user.id, item.id, 'file.edit', `إصدار ${version}`)
      const updated = serializeItem(get('SELECT * FROM items WHERE id = ?', item.id))
      broadcastChange(item.space_id, { type: 'updated', item: updated, content: text })
      emit('doc:changed', { itemId: item.id, content: text, author: user.id, version })
      sendJson(res, 200, { item: updated, version })
    },
  },
  {
    method: 'GET', pattern: /^\/api\/items\/(?<id>[^/]+)\/content$/,
    async handler({ req, res, params, url }) {
      const user = requireUser(req)
      const { item } = itemAccess(user.id, params.id)
      if (item.kind !== 'file') fail(400, 'المجلدات مفيش محتوى مباشر')
      let blob = item.blob_path
      const version = Number(url.searchParams.get('version') || 0)
      if (version) {
        const v = get('SELECT * FROM versions WHERE item_id = ? AND number = ?', item.id, version)
        if (!v) fail(404, 'الإصدار غير موجود')
        blob = v.blob_path
      }
      const disposition = url.searchParams.get('inline') === '1' ? 'inline' : 'attachment'
      await streamBlob(res, blob, item.name, item.mime, disposition)
    },
  },
  {
    method: 'PATCH', pattern: /^\/api\/items\/(?<id>[^/]+)$/,
    async handler({ req, res, params, body }) {
      const user = requireUser(req)
      const { item } = itemAccess(user.id, params.id, 'editor')
      if ('name' in body) {
        const name = cleanName(body.name)
        uniqueName(item.space_id, item.parent_id, name, item.id)
        run('UPDATE items SET name = ?, updated_at = ? WHERE id = ?', name, now(), item.id)
        activity(user.id, item.id, 'item.rename', `${item.name} ← ${name}`)
      }
      if ('description' in body) run('UPDATE items SET description = ? WHERE id = ?', String(body.description || ''), item.id)
      if ('starred' in body) run('UPDATE items SET starred = ? WHERE id = ?', body.starred ? 1 : 0, item.id)
      if ('parentId' in body && body.parentId !== item.parent_id) {
        const target = body.parentId || null
        assertAccess(user.id, item.space_id, 'editor')
        if (target) {
          const dest = get('SELECT * FROM items WHERE id = ? AND deleted_at IS NULL', target)
          if (!dest || dest.kind !== 'folder' || dest.space_id !== item.space_id) fail(400, 'مجلد الوجهة غير صحيح')
          if (descendants(item.id).includes(target)) fail(400, 'ما ينقلش المجلد جوه نفسه')
          if (get('SELECT id FROM items WHERE parent_id = ? AND name = ? AND deleted_at IS NULL AND id != ?', target, item.name, item.id)) fail(409, 'فيه عنصر بنفس الاسم في الوجهة')
        }
        run('UPDATE items SET parent_id = ?, updated_at = ? WHERE id = ?', target, now(), item.id)
        activity(user.id, item.id, 'item.move', target || 'الجذر')
      }
      if ('tagIds' in body && Array.isArray(body.tagIds)) {
        const ids = body.tagIds.filter((t) => get('SELECT id FROM tags WHERE id = ? AND user_id = ?', t, user.id))
        run('DELETE FROM item_tags WHERE item_id = ?', item.id)
        for (const t of ids) run('INSERT OR IGNORE INTO item_tags (item_id,tag_id) VALUES (?,?)', item.id, t)
      }
      const updated = serializeItem(get('SELECT * FROM items WHERE id = ?', item.id))
      broadcastChange(item.space_id, { type: 'updated', item: updated })
      sendJson(res, 200, { item: updated })
    },
  },
  {
    method: 'POST', pattern: /^\/api\/items\/(?<id>[^/]+)\/restore$/,
    handler({ req, res, params }) {
      const user = requireUser(req)
      const { item } = itemAccess(user.id, params.id, 'editor', { includeDeleted: true })
      if (!item.deleted_at) fail(400, 'العنصر مش في السلة')
      const ids = descendants(item.id)
      let parentId = item.parent_id
      if (parentId && get('SELECT id FROM items WHERE id = ? AND deleted_at IS NOT NULL', parentId)) parentId = null
      for (const id of ids) {
        run('UPDATE items SET deleted_at = NULL WHERE id = ?', id)
      }
      run('UPDATE items SET parent_id = ? WHERE id = ?', parentId, item.id)
      activity(user.id, item.id, 'item.restore', item.name)
      broadcastChange(item.space_id, { type: 'restored', id: item.id })
      sendJson(res, 200, { ok: true })
    },
  },
  {
    method: 'DELETE', pattern: /^\/api\/items\/(?<id>[^/]+)$/,
    handler({ req, res, params, url }) {
      const user = requireUser(req)
      const permanent = url.searchParams.get('permanent') === '1'
      const { item } = itemAccess(user.id, params.id, 'editor', { includeDeleted: true })
      const ids = descendants(item.id)
      if (permanent) {
        if (!item.deleted_at) fail(400, 'امسح العنصر الأول للسلة')
        const blobs = all(`SELECT blob_path FROM versions WHERE item_id IN (${ids.map(() => '?').join(',')})`, ...ids)
        run(`DELETE FROM items WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids)
        // لا نحذف blob إلا لو مفيش نسخة تانية (النسخ/الاستعارة بتشارك نفس الملف)
        for (const b of blobs) {
          if (!get('SELECT 1 FROM versions WHERE blob_path = ? LIMIT 1', b.blob_path)) deleteBlob(b.blob_path)
        }
        activity(user.id, item.id, 'item.delete', item.name)
      } else {
        if (item.deleted_at) fail(400, 'العنصر في السلة بالفعل')
        run(`UPDATE items SET deleted_at = ? WHERE id IN (${ids.map(() => '?').join(',')})`, now(), ...ids)
        activity(user.id, item.id, 'item.trash', item.name)
      }
      broadcastChange(item.space_id, { type: permanent ? 'deleted' : 'trashed', ids })
      sendJson(res, 200, { ok: true, count: ids.length })
    },
  },
  {
    method: 'GET', pattern: /^\/api\/trash$/,
    handler({ req, res, url }) {
      const user = requireUser(req)
      const spaceId = url.searchParams.get('space')
      assertAccess(user.id, spaceId)
      const items = all(`SELECT * FROM items WHERE space_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC`, spaceId).map(serializeItem)
      sendJson(res, 200, { items })
    },
  },
  {
    method: 'POST', pattern: /^\/api\/items\/(?<id>[^/]+)\/copy$/,
    handler({ req, res, params, body }) {
      const user = requireUser(req)
      const { item } = itemAccess(user.id, params.id)
      const target = body.parentId || null
      assertAccess(user.id, item.space_id, 'editor')
      if (target) {
        const dest = get('SELECT * FROM items WHERE id = ? AND deleted_at IS NULL', target)
        if (!dest || dest.kind !== 'folder' || dest.space_id !== item.space_id) fail(400, 'مجلد الوجهة غير صحيح')
      }
      let name = item.name
      if (get('SELECT id FROM items WHERE parent_id IS ? AND name = ? AND deleted_at IS NULL', target, name)) {
        const dot = name.lastIndexOf('.')
        name = dot > 0 ? `${name.slice(0, dot)} (نسخة)${name.slice(dot)}` : `${name} (نسخة)`
      }
      const newItemId = newId()
      run(`INSERT INTO items (id,space_id,owner_id,parent_id,kind,name,mime,size,blob_path,version,description,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        newItemId, item.space_id, user.id, target, item.kind, name, item.mime, item.size, item.blob_path, item.version, item.description, now(), now())
      if (item.kind === 'file') {
        for (const v of all('SELECT * FROM versions WHERE item_id = ?', item.id)) {
          run('INSERT INTO versions (id,item_id,number,size,blob_path,author_id,note,created_at) VALUES (?,?,?,?,?,?,?,?)',
            newId(), newItemId, v.number, v.size, v.blob_path, user.id, `نسخة من ${item.name}`, now())
        }
      } else {
        copyChildren(item.id, newItemId, item.space_id, user.id)
      }
      for (const t of tagsForItem(item.id)) run('INSERT OR IGNORE INTO item_tags (item_id,tag_id) VALUES (?,?)', newItemId, t.id)
      activity(user.id, newItemId, 'item.copy', name)
      const created = serializeItem(get('SELECT * FROM items WHERE id = ?', newItemId))
      broadcastChange(item.space_id, { type: 'created', item: created })
      sendJson(res, 201, { item: created })
    },
  },
  {
    method: 'GET', pattern: /^\/api\/items\/(?<id>[^/]+)\/versions$/,
    handler({ req, res, params }) {
      const user = requireUser(req)
      const { item } = itemAccess(user.id, params.id)
      sendJson(res, 200, {
        versions: all(`SELECT v.id,v.number,v.size,v.note,v.created_at,u.name AS author FROM versions v
          LEFT JOIN users u ON u.id = v.author_id WHERE v.item_id = ? ORDER BY v.number DESC`, item.id),
      })
    },
  },
  {
    method: 'POST', pattern: /^\/api\/items\/(?<id>[^/]+)\/versions\/(?<number>\d+)\/restore$/,
    async handler({ req, res, params }) {
      const user = requireUser(req)
      const { item } = itemAccess(user.id, params.id, 'editor')
      const version = get('SELECT * FROM versions WHERE item_id = ? AND number = ?', item.id, Number(params.number))
      if (!version) fail(404, 'الإصدار غير موجود')
      const saved = await copyBlob(version.blob_path, item.name)
      const blobId = saved.id
      const number = item.version + 1
      run('INSERT INTO versions (id,item_id,number,size,blob_path,author_id,note,created_at) VALUES (?,?,?,?,?,?,?,?)',
        newId(), item.id, number, version.size, blobId, user.id, `استعادة الإصدار ${version.number}`, now())
      run('UPDATE items SET size = ?, version = ?, updated_at = ?, blob_path = ? WHERE id = ?', version.size, number, now(), blobId, item.id)
      activity(user.id, item.id, 'version.restore', `${version.number} ← ${number}`)
      const updated = serializeItem(get('SELECT * FROM items WHERE id = ?', item.id))
      broadcastChange(item.space_id, { type: 'updated', item: updated })
      sendJson(res, 200, { item: updated })
    },
  },
  {
    method: 'DELETE', pattern: /^\/api\/items\/(?<id>[^/]+)\/versions\/(?<number>\d+)$/,
    handler({ req, res, params }) {
      const user = requireUser(req)
      const { item } = itemAccess(user.id, params.id, 'editor')
      if (all('SELECT id FROM versions WHERE item_id = ?', item.id).length <= 1) fail(400, 'مش ممكن تحذف آخر إصدار')
      const version = get('SELECT * FROM versions WHERE item_id = ? AND number = ?', item.id, Number(params.number))
      if (!version) fail(404, 'الإصدار غير موجود')
      run('DELETE FROM versions WHERE id = ?', version.id)
      deleteBlob(version.blob_path)
      if (item.version === version.number) {
        const latest = get('SELECT * FROM versions WHERE item_id = ? ORDER BY number DESC LIMIT 1', item.id)
        run('UPDATE items SET blob_path = ?, size = ?, version = ? WHERE id = ?', latest.blob_path, latest.size, latest.number, item.id)
      }
      sendJson(res, 200, { ok: true })
    },
  },
]

function copyChildren(fromId, toId, spaceId, userId) {
  for (const child of all('SELECT * FROM items WHERE parent_id = ? AND deleted_at IS NULL', fromId)) {
    const id = newId()
    run(`INSERT INTO items (id,space_id,owner_id,parent_id,kind,name,mime,size,blob_path,version,description,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, spaceId, userId, toId, child.kind, child.name, child.mime, child.size, child.blob_path, child.version, child.description, now(), now())
    if (child.kind === 'file') {
      for (const v of all('SELECT * FROM versions WHERE item_id = ?', child.id)) {
        run('INSERT INTO versions (id,item_id,number,size,blob_path,author_id,note,created_at) VALUES (?,?,?,?,?,?,?,?)',
          newId(), id, v.number, v.size, v.blob_path, userId, 'نسخة', now())
      }
    } else copyChildren(child.id, id, spaceId, userId)
  }
}
