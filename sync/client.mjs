#!/usr/bin/env node
/**
 * عميل مزامنة سطح المكتب لـ سَحابة.
 * يراقب مجلداً محلياً ويرفع أي ملف جديد أو معدّل إلى المساحة المحددة.
 *
 * مثال:
 *   node sync/client.mjs --dir ./my-drive --email me@example.com --password secret --interval 15
 *
 * المتغيرات البديلة: SAHABA_URL, SAHABA_DIR, SAHABA_EMAIL, SAHABA_PASSWORD, SAHABA_SPACE
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const args = process.argv.slice(2)
function arg(name, fallback = '') {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const BASE = arg('url', process.env.SAHABA_URL || 'http://127.0.0.1:4000')
const DIR = path.resolve(arg('dir', process.env.SAHABA_DIR || './my-drive'))
const EMAIL = arg('email', process.env.SAHABA_EMAIL || '')
const PASSWORD = arg('password', process.env.SAHABA_PASSWORD || '')
const INTERVAL = Number(arg('interval', process.env.SAHABA_INTERVAL || 15)) * 1000
const STATE_PATH = path.join(DIR, '.sahaba-sync.json')
let cookie = ''
let spaceId = arg('space', process.env.SAHABA_SPACE || '')

if (!EMAIL || !PASSWORD) {
  console.error('لازم --email و --password (أو SAHABA_EMAIL / SAHABA_PASSWORD)')
  process.exit(1)
}
fs.mkdirSync(DIR, { recursive: true })

async function request(url, options = {}) {
  const res = await fetch(`${BASE}${url}`, {
    ...options,
    headers: { ...(cookie ? { cookie } : {}), ...options.headers },
  })
  const setCookie = res.headers.get('set-cookie')
  if (setCookie) cookie = setCookie.split(';')[0]
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${url}: ${res.status} ${await res.text()}`)
  return res
}

async function login() {
  await request('/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  if (!spaceId) {
    const data = await (await request('/api/spaces')).json()
    spaceId = data.spaces.find((s) => s.kind === 'personal').id
  }
  console.log(`✓ متصل — المساحة: ${spaceId}`)
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) } catch { return {} }
}
function saveState(state) { fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2)) }

function fingerprint(file) {
  const stat = fs.statSync(file)
  return `${stat.size}:${Math.floor(stat.mtimeMs)}`
}

const folderCache = new Map([['', null]])
async function resolveParent(rel) {
  let parent = null
  let key = ''
  for (const part of path.dirname(rel).split(path.sep).filter((p) => p && p !== '.')) {
    key = key ? `${key}/${part}` : part
    if (folderCache.has(key)) { parent = folderCache.get(key); continue }
    const list = await (await request(`/api/items?space=${encodeURIComponent(spaceId)}&parent=${parent || ''}`)).json()
    let folder = list.items.find((i) => i.kind === 'folder' && i.name === part)
    if (!folder) {
      const data = await (await request('/api/items', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ spaceId, parentId: parent, name: part }),
      })).json()
      folder = data.item
    }
    folderCache.set(key, folder.id)
    parent = folder.id
  }
  return parent
}

async function walk(dir, relative = '') {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const rel = path.join(relative, entry.name)
    const full = path.join(dir, rel)
    if (entry.isDirectory()) out.push(...await walk(full, rel))
    else if (entry.isFile()) out.push(rel)
  }
  return out
}

async function sync() {
  const state = loadState()
  const files = await walk(DIR)
  let uploaded = 0
  for (const rel of files) {
    const full = path.join(DIR, rel)
    const fp = fingerprint(full)
    if (state[rel] === fp) continue
    const buffer = fs.readFileSync(full)
    const name = path.basename(rel)
    const parent = await resolveParent(rel)
    const res = await fetch(`${BASE}/api/upload?space=${encodeURIComponent(spaceId)}&parent=${encodeURIComponent(parent || '')}&name=${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/octet-stream' },
      body: buffer,
    })
    if (!res.ok) { console.error(`✗ ${rel}: ${res.status} ${await res.text()}`); continue }
    state[rel] = fp; uploaded++
  }
  saveState(state)
  console.log(`[${new Date().toLocaleTimeString('ar-EG')}] فحص ${files.length} ملف — رُفع ${uploaded}`)
}

await login()
await sync()
setInterval(() => sync().catch((e) => console.error('فشل المزامنة:', e.message)), INTERVAL)
console.log(`العميل شغال — المجلد: ${DIR} — كل ${INTERVAL / 1000} ثانية. اضغط Ctrl+C للإيقاف.`)
