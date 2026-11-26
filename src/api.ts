import { translate } from './i18n'

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message)
  }
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: { ...(init.body && !(init.body instanceof FormData) ? { 'content-type': 'application/json' } : {}), ...init.headers },
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new ApiError(data.error || translate('Error {status}', { status: res.status }), res.status, data.code)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const get = <T = any>(path: string) => api<T>(path)
export const post = <T = any>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
export const patch = <T = any>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
export const del = <T = any>(path: string) => api<T>(path, { method: 'DELETE' })

export async function uploadFile(file: File, space: string, parent: string | null, onProgress?: (p: number) => void) {
  return new Promise<any>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/upload?space=${encodeURIComponent(space)}&parent=${encodeURIComponent(parent || '')}&name=${encodeURIComponent(file.name)}&mime=${encodeURIComponent(file.type || 'application/octet-stream')}`)
    xhr.withCredentials = true
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100)) }
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300) resolve(data)
        else reject(new Error(data.error || translate('Upload failed')))
      } catch { reject(new Error(translate('Upload failed'))) }
    }
    xhr.onerror = () => reject(new Error(translate('Cannot reach the server')))
    xhr.send(file)
  })
}

export const contentUrl = (id: string, version?: number, inline = false) =>
  `/api/items/${encodeURIComponent(id)}/content${version ? `?version=${version}` : ''}${inline ? `${version ? '&' : '?'}inline=1` : ''}`

export function formatBytes(n: number): string {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), 4)
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`
}

export function formatDate(ts: number): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(ts)
}

export function fileExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(i + 1).toLowerCase() : ''
}
