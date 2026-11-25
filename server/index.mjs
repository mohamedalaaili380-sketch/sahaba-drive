import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { HOST, PORT, PRODUCTION, ROOT } from './config.mjs'
import { HttpError, readJson, sendError, sendJson } from './util.mjs'
import { setupWebsocket } from './routes/collab.mjs'

import * as auth from './routes/auth.mjs'
import * as items from './routes/items.mjs'
import * as collab from './routes/collab.mjs'
import * as teams from './routes/teams.mjs'
import * as shares from './routes/shares.mjs'
import * as publicRoutes from './routes/public.mjs'

const routes = [
  ...auth.routes, ...items.routes, ...collab.routes,
  ...teams.routes, ...shares.routes, ...publicRoutes.routes,
]

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2',
}

function serveStatic(req, res, pathname) {
  const dist = path.join(ROOT, 'dist')
  if (!fs.existsSync(dist)) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end('<h1 dir="rtl">الواجهة لسه مت-build&#64;ها — شغّل <code>npm run dev</code> أو <code>npm run build</code></h1>')
    return
  }
  let filePath = path.resolve(dist, '.' + pathname)
  if (!filePath.startsWith(dist)) { res.writeHead(403); res.end(); return }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) filePath = path.join(dist, 'index.html')
  const ext = path.extname(filePath)
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
  })
  fs.createReadStream(filePath).pipe(res)
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    const pathname = decodeURIComponent(url.pathname)

    if (!pathname.startsWith('/api/')) {
      if (!PRODUCTION) {
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('سَحابة API — افتح الواجهة على http://localhost:5173')
      } else serveStatic(req, res, pathname)
      return
    }

    for (const route of routes) {
      if (route.method !== req.method) continue
      const match = route.pattern.exec(pathname)
      if (!match) continue
      const contentType = String(req.headers['content-type'] || '')
      const body = !route.rawBody && contentType.includes('application/json') ? await readJson(req) : {}
      await route.handler({ req, res, url, params: match.groups || {}, body })
      return
    }
    throw new HttpError(404, 'الـ endpoint غير موجود')
  } catch (error) {
    if (!res.headersSent) sendError(res, error)
    else res.end()
  }
})

setupWebsocket(server)

server.listen(PORT, HOST, () => {
  console.log(`☁️  سَحابة API جاهز على http://${HOST}:${PORT}`)
})
