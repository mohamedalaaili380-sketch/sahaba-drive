import { now, newId, hashPassword, verifyPassword, setSession, clearSession, requireUser, sendJson, fail } from '../util.mjs'
import { get, run } from '../db.mjs'
import { DEFAULT_STORAGE_LIMIT } from '../config.mjs'

export const routes = [
  {
    method: 'POST', pattern: /^\/api\/auth\/register$/,
    async handler({ res, body }) {
      const name = String(body.name || '').trim()
      const email = String(body.email || '').trim().toLowerCase()
      const password = String(body.password || '')
      if (!name || name.length < 2) fail(400, 'الاسم قصير جداً')
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, 'البريد الإلكتروني غير صحيح')
      if (password.length < 8) fail(400, 'كلمة المرور لازم تكون 8 حروف على الأقل')
      if (get('SELECT id FROM users WHERE email = ?', email)) fail(409, 'البريد مستخدم بالفعل')
      const { salt, hash } = hashPassword(password)
      const userId = newId()
      const spaceId = newId()
      run('INSERT INTO users (id,name,email,password_hash,salt,created_at,storage_limit) VALUES (?,?,?,?,?,?,?)',
        userId, name, email, hash, salt, now(), DEFAULT_STORAGE_LIMIT)
      run('INSERT INTO spaces (id,kind,name,owner_id,created_at) VALUES (?,?,?,?,?)',
        spaceId, 'personal', 'درايفي', userId, now())
      run('INSERT INTO space_members (space_id,user_id,role) VALUES (?,?,?)', spaceId, userId, 'owner')
      const token = setSession(res, userId)
      sendJson(res, 201, { user: publicUser(get('SELECT * FROM users WHERE id = ?', userId)), token })
    },
  },
  {
    method: 'POST', pattern: /^\/api\/auth\/login$/,
    async handler({ req, res, body }) {
      const email = String(body.email || '').trim().toLowerCase()
      const password = String(body.password || '')
      const user = get('SELECT * FROM users WHERE email = ?', email)
      if (!user || !verifyPassword(password, user.salt, user.password_hash)) fail(401, 'البريد أو كلمة المرور غلط')
      const token = setSession(res, user.id)
      sendJson(res, 200, { user: publicUser(user), token })
    },
  },
  { method: 'POST', pattern: /^\/api\/auth\/logout$/, handler({ req, res }) {
    clearSession(req, res)
    sendJson(res, 200, { ok: true })
  } },
  { method: 'GET', pattern: /^\/api\/auth\/me$/, handler({ req, res }) {
    const user = requireUser(req)
    sendJson(res, 200, { user: publicUser(user), personalSpace: get('SELECT id FROM spaces WHERE owner_id = ? AND kind = ?', user.id, 'personal').id })
  } },
  { method: 'PATCH', pattern: /^\/api\/auth\/me$/, async handler({ req, res, body }) {
    const user = requireUser(req)
    const name = String(body.name || '').trim()
    if (name && name.length >= 2) run('UPDATE users SET name = ? WHERE id = ?', name, user.id)
    if (body.password) {
      const password = String(body.password)
      if (password.length < 8) fail(400, 'كلمة المرور لازم تكون 8 حروف على الأقل')
      const { salt, hash } = hashPassword(password)
      run('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?', hash, salt, user.id)
    }
    sendJson(res, 200, { user: publicUser(get('SELECT * FROM users WHERE id = ?', user.id)) })
  } },
]

export function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, color: user.color, createdAt: user.created_at, storageLimit: user.storage_limit }
}
