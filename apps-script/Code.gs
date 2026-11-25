/**
 * سَحابة — Google Drive blob storage bridge (Apps Script Web App)
 * Deploy: Execute as me | Access: Anyone.
 * Before deploying, add a Script Property named SAHABA_TOKEN with a long random secret
 * (Project Settings → Script Properties) and use the same value in the server env var.
 */
const TOKEN = PropertiesService.getScriptProperties().getProperty('SAHABA_TOKEN') || ''
const ROOT_FOLDER = 'sahaba-drive-storage'

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
}
function ok(data) { return json(Object.assign({ ok: true }, data || {})) }
function bad(message) { return json({ ok: false, error: String(message) }) }
function checkToken(e, body) {
  const token = (e.parameter && e.parameter.token) || (body && body.token)
  if (!TOKEN || token !== TOKEN) throw new Error('unauthorized')
}
function cleanName(name) {
  return String(name || 'blob').split('/').join('_').split('\\').join('_').slice(0, 120)
}
function folderFor(space) {
  const safe = String(space || 'default').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'default'
  const name = ROOT_FOLDER + '-' + safe
  const it = DriveApp.getFoldersByName(name)
  return it.hasNext() ? it.next() : DriveApp.createFolder(name)
}

function doGet(e) {
  try {
    checkToken(e)
    const p = e.parameter || {}
    if (p.action === 'ping') return ok({ service: 'sahaba-drive', version: 2 })
    if (p.action === 'download') {
      if (!p.id) return bad('missing id')
      const file = DriveApp.getFileById(p.id)
      const bytes = file.getBlob().getBytes()
      return ContentService.createTextOutput(Utilities.base64Encode(bytes))
        .setMimeType(ContentService.MimeType.TEXT)
    }
    return bad('unknown action')
  } catch (err) { return bad(err && err.message ? err.message : err) }
}

function doPost(e) {
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || '{}')
    checkToken(e, body)
    if (body.action === 'upload') {
      if (!body.data) return bad('missing data')
      const bytes = Utilities.base64Decode(body.data)
      const blob = Utilities.newBlob(bytes, body.mime || 'application/octet-stream', cleanName(body.name))
      const file = folderFor(body.space).createFile(blob)
      return ok({ id: file.getId(), size: bytes.length })
    }
    if (body.action === 'copy') {
      if (!body.id) return bad('missing id')
      const file = DriveApp.getFileById(body.id).makeCopy(cleanName(body.name))
      return ok({ id: file.getId(), size: file.getSize() })
    }
    if (body.action === 'delete') {
      if (!body.id) return bad('missing id')
      DriveApp.getFileById(body.id).setTrashed(true)
      return ok({})
    }
    return bad('unknown action')
  } catch (err) { return bad(err && err.message ? err.message : err) }
}
