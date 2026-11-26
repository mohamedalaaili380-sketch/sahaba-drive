import { useEffect, useState } from 'react'
import { Cloud, Lock, Eye, Download, MessageSquare, Send, CalendarClock, AlertCircle, Folder, File, ChevronRight, ChevronLeft, Loader2 } from 'lucide-react'
import { ApiError, formatBytes, formatDate, get, post } from '../api'
import type { Comment, PublicShare as ShareInfo } from '../types'
import { Modal } from './ui'
import { LangToggle, useLang, useT } from '../i18n'
import { ThemeToggle } from '../theme'

type PublicItem = { id: string; parent_id: string | null; kind: string; name: string; mime: string; size: number; updated_at: number }

export default function PublicShare({ token }: { token: string }) {
  const t = useT()
  const { dir } = useLang()
  const Back = dir === 'rtl' ? ChevronRight : ChevronLeft
  const [share, setShare] = useState<ShareInfo | null>(null)
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [folderItems, setFolderItems] = useState<PublicItem[] | null>(null)
  const [parent, setParent] = useState<string | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [text, setText] = useState('')
  const [name, setName] = useState('')
  const [showComments, setShowComments] = useState(false)

  const grant = sessionStorage.getItem(`grant:${token}`) || ''
  const apiPath = (suffix = '') => `/public/${encodeURIComponent(token)}${suffix}${suffix.includes('?') ? '&' : '?'}grant=${encodeURIComponent(grant)}`

  async function load(targetParent: string | null = parent) {
    setBusy(true); setError('')
    try {
      const data = await get<{ share: ShareInfo }>(apiPath())
      setShare(data.share)
      if (data.share.item.kind === 'folder') {
        const list = await get<{ items: PublicItem[] }>(apiPath(`/list?parent=${targetParent || ''}`))
        setFolderItems(list.items); setParent(targetParent)
      }
      if (data.share.allowComments) {
        const c = await get<{ comments: Comment[] }>(apiPath('/comments')).catch(() => ({ comments: [] }))
        setComments(c.comments)
      }
    } catch (e: any) {
      if (e instanceof ApiError && e.code === 'PASSWORD_REQUIRED') setError('PASSWORD_REQUIRED')
      else setError(e.message)
    } finally { setBusy(false) }
  }

  useEffect(() => { load() }, [token])

  async function unlock(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const data = await post<{ grant: string }>(`/public/${encodeURIComponent(token)}/unlock`, { password })
      sessionStorage.setItem(`grant:${token}`, data.grant || '')
      setPassword(''); load()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  if (error === 'PASSWORD_REQUIRED') return (
    <div className="sahaba-public grid min-h-full place-items-center bg-[#03252c] p-5">
      <form onSubmit={unlock} className="w-full max-w-md space-y-5 rounded-3xl border border-white/10 bg-[#07343b] p-8 text-center shadow-2xl enter">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-amber-500/15 text-amber-300"><Lock size={28} /></div>
        <h2 className="text-2xl font-bold">{t('Protected link', 'رابط محمي')}</h2>
        <p className="text-sm text-[#86b8b5]">{t('Enter the password sent to you by the file owner.', 'ادخل كلمة المرور اللي بعتها لك صاحب الملف.')}</p>
        <input autoFocus className="field text-center" dir="ltr" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
        {busy && <Loader2 className="spin mx-auto" />}
        <button className="btn btn-primary w-full py-3" disabled={busy}>{t('Unlock', 'فتح الرابط')}</button>
      </form>
      <div className="mt-4"><LangToggle floating /></div>
    </div>
  )

  if (error) return (
    <div className="sahaba-public grid min-h-full place-items-center bg-[#03252c] p-5">
      <div className="max-w-md space-y-4 rounded-3xl border border-rose-500/20 bg-[#2c1c25] p-8 text-center">
        <AlertCircle size={44} className="mx-auto text-rose-400" />
        <h2 className="text-xl font-bold">{t('Link unavailable', 'الرابط غير متاح')}</h2><p className="text-sm text-[#bfe9e6]">{error}</p>
      </div>
      <div className="mt-4"><LangToggle floating /></div>
    </div>
  )

  if (!share) return <div className="sahaba-public grid min-h-full place-items-center"><Loader2 className="spin text-[#5eead4]" size={32} /></div>

  const canDownload = share.permission !== 'view'
  const contentUrlFor = (child?: string, download = false, inline = false) =>
    `/api/public/${encodeURIComponent(token)}/content?grant=${encodeURIComponent(grant)}${child ? `&child=${encodeURIComponent(child)}` : ''}${download ? '&download=1' : ''}${inline ? '&inline=1' : ''}`
  const type = share.item.mime.split('/')[0]

  return (
    <div className="sahaba-public min-h-full overflow-auto bg-[#03252c]">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-[#062f36]/90 px-5 py-3 backdrop-blur">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#0f766e] via-[#0e7490] to-[#22d3ee]"><Cloud size={19} /></div>
        <span className="gradient-text text-lg font-extrabold tracking-tight">Sahaba</span>
        <div className="ms-auto flex gap-2">
          {share.allowComments && <button className="btn btn-ghost px-3 py-1.5" onClick={() => setShowComments(true)}><MessageSquare size={15} /> {t('Comments ({n})', 'تعليقات ({n})', { n: comments.length })}</button>}
          {canDownload && <a className="btn btn-primary px-3 py-1.5" href={contentUrlFor(undefined, true)}><Download size={15} /> {t('Download', 'تنزيل')}</a>}
          <ThemeToggle />
          <LangToggle />
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 p-5">
        <div className="rounded-2xl border border-white/10 bg-[#07343b] p-5">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#14b8a622] text-[#8be9e2]">{share.item.kind === 'folder' ? <Folder size={24} /> : <File size={24} />}</div>
            <div className="min-w-0 flex-1"><h1 className="truncate text-xl font-bold">{share.item.name}</h1>
              <p className="mt-1 text-xs text-[#86b8b5]">{formatBytes(share.item.size)} • {t('Last modified {date}', 'آخر تعديل {date}', { date: formatDate(share.item.updatedAt) })}
                {share.owner && ` • ${t('from {name}', 'من {name}', { name: share.owner.name })}`}</p></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 border-t border-white/10 pt-4 text-xs text-[#86b8b5]">
            <span className="flex items-center gap-1"><Eye size={13} /> {t('{n} views', '{n} مشاهدة', { n: share.views })}{share.maxViews ? ` / ${share.maxViews}` : ''}</span>
            <span className="flex items-center gap-1"><Download size={13} /> {t('{n} downloads', '{n} تنزيل', { n: share.downloads })}{share.maxDownloads ? ` / ${share.maxDownloads}` : ''}</span>
            {share.expiresAt && <span className="flex items-center gap-1"><CalendarClock size={13} /> {t('Expires {date}', 'ينتهي {date}', { date: formatDate(share.expiresAt) })}</span>}
          </div>
        </div>

        {parent && <button className="btn btn-ghost text-xs" onClick={() => load(null)}><Back size={14} /> {t('Other folders', 'مجلدات أخرى')}</button>}

        {share.item.kind === 'folder' && folderItems && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {folderItems.map((f) => (
              <button key={f.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-start transition hover:border-[#14b8a666]"
                onClick={() => f.kind === 'folder' ? load(f.id) : window.open(contentUrlFor(f.id, false, true))}>
                {f.kind === 'folder' ? <Folder className="text-[#f0b65c]" /> : <File className="text-[#5eead4]" />}
                <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
                <span className="text-[10px] text-[#78aaa8]">{formatBytes(f.size)}</span>
              </button>
            ))}
            {folderItems.length === 0 && <p className="text-sm text-[#78aaa8]">{t('This folder is empty.', 'المجلد فاضي.')}</p>}
          </div>
        )}

        {share.item.kind === 'file' && (
          <div className="grid min-h-[420px] place-items-center overflow-hidden rounded-2xl border border-white/10 bg-[#04242b] p-4">
            {type === 'image' && <img src={contentUrlFor(undefined, false, true)} className="max-h-[60vh] max-w-full rounded-lg" alt={share.item.name} />}
            {type === 'video' && <video src={contentUrlFor(undefined, false, true)} controls className="max-h-[60vh] max-w-full" />}
            {type === 'audio' && <audio src={contentUrlFor(undefined, false, true)} controls className="w-full max-w-xl" />}
            {share.item.mime === 'application/pdf' && <iframe src={contentUrlFor(undefined, false, true)} className="h-[60vh] w-full rounded bg-white" title={share.item.name} />}
            {!['image', 'video', 'audio'].includes(type) && share.item.mime !== 'application/pdf' && (
              <div className="text-center text-[#86b8b5]"><File size={48} className="mx-auto mb-4 opacity-60" /><p>{t('No preview for this file type.', 'مفيش معاينة لهذا النوع.')}</p>
                {canDownload && <a className="btn btn-primary mt-4" href={contentUrlFor(undefined, true)}><Download size={16} /> {t('Download file', 'تنزيل الملف')}</a>}</div>
            )}
          </div>
        )}
      </main>

      {showComments && <Modal title={t('Comments', 'التعليقات')} onClose={() => setShowComments(false)}>
        <div className="max-h-80 space-y-2 overflow-auto">
          {comments.map((c) => <div key={c.id} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
            <b className="text-[#8be9e2]">{c.author_name}</b> <span className="text-[10px] text-[#6f9d9b]">{formatDate(c.created_at)}</span><p className="mt-1">{c.body}</p>
          </div>)}
        </div>
        <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
          <input className="field py-2 text-xs" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Your name (optional)', 'اسمك (اختياري)')} />
          <div className="flex gap-2"><input className="field py-2 text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Write a comment…', 'اكتب تعليق...')} />
            <button className="btn btn-primary px-3" disabled={!text.trim()} onClick={async () => {
              try {
                await post(`/public/${encodeURIComponent(token)}/comments?grant=${encodeURIComponent(grant)}`, { body: text, name })
                setText(''); load()
              } catch (e: any) { alert(e.message) }
            }}><Send size={15} /></button></div>
        </div>
      </Modal>}
    </div>
  )
}
