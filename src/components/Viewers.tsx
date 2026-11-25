import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Pencil, History, X, MessageSquare, Send, Trash2, FileWarning, Users, Check, Loader2 } from 'lucide-react'
import { contentUrl, formatBytes, formatDate, get, post, del } from '../api'
import type { Comment, Item } from '../types'
import { useT } from '../i18n'

const TEXT_EXT = /\.(txt|md|markdown|json|js|ts|tsx|css|html|xml|yaml|yml|csv|log|sql|py|sh)$/i

export function Preview({ item, onClose, onEdit, onVersions, onComments }: {
  item: Item; onClose: () => void; onEdit: () => void; onVersions: () => void; onComments: () => void
}) {
  const t = useT()
  const type = (item.mime || '').split('/')[0]
  const url = contentUrl(item.id, undefined, true)
  const [text, setText] = useState<string | null>(null)
  const editable = TEXT_EXT.test(item.name) || type === 'text'

  useEffect(() => {
    if (editable) fetch(url).then((r) => r.text()).then(setText).catch(() => setText(''))
  }, [item.id, editable, url])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal wide flex h-[88vh] flex-col !p-0">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-3">
          <div className="min-w-0 flex-1"><h3 className="truncate font-bold">{item.name}</h3><p className="text-[11px] text-[#8591ba]">{formatBytes(item.size)} • {t('v{n}', 'إصدار {n}', { n: item.version })}</p></div>
          {editable && <button className="btn btn-ghost px-2.5 py-1.5" onClick={onEdit}><Pencil size={15} /> {t('Edit', 'تحرير')}</button>}
          <button className="btn btn-ghost px-2.5 py-1.5" onClick={onVersions}><History size={15} /> {t('Versions', 'الإصدارات')}</button>
          <button className="btn btn-ghost px-2.5 py-1.5" onClick={onComments}><MessageSquare size={15} /> {t('Comments', 'تعليقات')}</button>
          <a className="btn btn-ghost px-2.5 py-1.5" href={contentUrl(item.id)}><Download size={15} /></a>
          <button className="rounded-lg p-1.5 text-[#8f9bc2] hover:bg-white/10 hover:text-white" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="grid min-h-0 flex-1 place-items-center overflow-auto bg-[#070b16] p-4">
          {type === 'image' && <img src={url} alt={item.name} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />}
          {type === 'video' && <video src={url} controls className="max-h-full max-w-full rounded-lg" />}
          {type === 'audio' && <div className="w-full max-w-xl text-center"><div className="mb-5 text-5xl">🎵</div><audio src={url} controls className="w-full" /></div>}
          {item.mime === 'application/pdf' && <iframe src={url} title={item.name} className="h-full w-full rounded-lg bg-white" />}
          {editable && (text === null ? <Loader2 className="spin text-[#8b9cff]" /> : (
            <pre dir="auto" className="w-full max-w-4xl whitespace-pre-wrap rounded-xl border border-white/10 bg-[#101731] p-6 text-start font-mono text-[13px] leading-7 text-[#d6defb]">{text}</pre>
          ))}
          {!editable && !['image', 'video', 'audio'].includes(type) && item.mime !== 'application/pdf' && (
            <div className="text-center text-[#8e9ac0]"><FileWarning size={54} className="mx-auto mb-4 opacity-60" /><p>{t('No in-app preview for this file type.', 'مفيش معاينة جوه التطبيق لهذا النوع.')}</p>
              <a className="btn btn-primary mt-5" href={contentUrl(item.id)}><Download size={16} /> {t('Download file', 'تنزيل الملف')}</a></div>
          )}
        </div>
      </div>
    </div>
  )
}

export function Editor({ item, onClose, onSaved, notify }: { item: Item; onClose: () => void; onSaved: () => void; notify: (t: string, k?: 'ok' | 'err' | 'info') => void }) {
  const t = useT()
  const [content, setContent] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(true)
  const [version, setVersion] = useState(item.version)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    fetch(contentUrl(item.id)).then((r) => r.text()).then((text) => { setContent(text); setLoaded(true) }).catch(() => { setLoaded(true) })
  }, [item.id])

  async function save(manual = false) {
    if (!loaded || saved) { if (manual) notify(t('Nothing to save', 'مفيش تغييرات لحفظها'), 'info'); return }
    setSaving(true)
    try {
      const data = await post<{ version: number }>(`/items/${item.id}/content`, { content })
      setVersion(data.version); setSaved(true); onSaved()
      if (manual) notify(t('Saved — version {n}', 'تم الحفظ — الإصدار {n}', { n: data.version }), 'ok')
    } catch (e: any) { notify(e.message, 'err') } finally { setSaving(false) }
  }

  function change(value: string) {
    setContent(value); setSaved(false)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => save(), 1800)
  }

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal wide flex h-[88vh] flex-col !p-0">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-3">
          <Pencil size={18} className="text-[#9aa9ff]" />
          <div className="min-w-0 flex-1"><h3 className="truncate font-bold">{item.name}</h3>
            <p className="text-[11px] text-[#8591ba]">{t('v{n}', 'الإصدار {n}', { n: version })} • {saved ? t('All changes saved', 'كل التغييرات محفوظة') : t('Unsaved changes', 'فيه تغييرات غير محفوظة')}</p></div>
          <span className={`flex items-center gap-1 text-xs ${saving ? 'text-[#9aa9ff]' : saved ? 'text-emerald-400' : 'text-amber-400'}`}>
            {saving ? <Loader2 size={14} className="spin" /> : saved ? <Check size={14} /> : <span className="h-2 w-2 rounded-full bg-amber-400" />}
            {saving ? t('Saving', 'جاري الحفظ') : saved ? t('Saved', 'محفوظ') : t('Waiting to save', 'بانتظار الحفظ')}
          </span>
          <button className="btn btn-primary px-3 py-1.5" disabled={saving || saved} onClick={() => save(true)}>{t('Save', 'حفظ')}</button>
          <button className="rounded-lg p-1.5 text-[#8f9bc2] hover:bg-white/10 hover:text-white" onClick={async () => { if (!saved) await save(); onClose() }}><X size={20} /></button>
        </div>
        <textarea dir="auto" autoFocus className="min-h-0 flex-1 w-full bg-[#0a1020] p-6 text-start font-mono text-[13px] leading-7 text-[#dce3ff] outline-none"
          placeholder={t('Start typing here…', 'ابدأ الكتابة هنا...')} value={content} onChange={(e) => change(e.target.value)}
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(true) } }} />
        <div className="border-t border-white/10 px-5 py-2 text-[11px] text-[#6f7ba3]">
          {t('Auto-saves 2 seconds after the last edit • every save creates a new version • Ctrl+S to save now', 'الحفظ التلقائي بعد ثانيتين من آخر تعديل • كل حفظ ينشئ إصدار جديد في سجل الإصدارات • Ctrl+S للحفظ الفوري')}
        </div>
      </div>
    </div>
  )
}

export function CommentsPanel({ item, comments, online, onRefresh, onClose, notify }: {
  item: Item; comments: Comment[]; online: { id: string; name: string }[]; onRefresh: () => void; onClose: () => void; notify: (t: string, k?: 'ok' | 'err') => void
}) {
  const t = useT()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
        <MessageSquare size={17} className="text-[#9aa9ff]" /><h3 className="flex-1 font-bold">{t('Comments', 'التعليقات')}</h3>
        {online.length > 0 && <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] text-emerald-300"><Users size={11} /> {t('{n} online', '{n} متصل', { n: online.length })}</span>}
        <button onClick={onClose} className="text-[#8f9bc2] hover:text-white"><X size={17} /></button>
      </div>
      <div className="scroll-thin flex-1 space-y-3 overflow-auto p-4">
        {comments.length === 0 && <p className="py-10 text-center text-sm text-[#737faa]">{t('Be the first to comment on this file.', 'كن أول من يعلّق على الملف.')}</p>}
        {comments.map((c) => (
          <div key={c.id} className="group rounded-xl border border-white/10 bg-white/[.04] p-3">
            <div className="flex items-center gap-2">
              <div className="grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold" style={{ background: `${c.author_color || '#6d7cff'}33`, color: c.author_color || '#9aa9ff' }}>{c.author_name[0]}</div>
              <span className="text-xs font-bold">{c.author_name}</span>
              <span className="text-[10px] text-[#727ea6]">{formatDate(c.created_at)}</span>
              <button className="ms-auto text-[#727ea6] opacity-0 transition group-hover:opacity-100 hover:text-rose-300" onClick={async () => {
                try { await del(`/comments/${c.id}`); onRefresh(); notify(t('Comment deleted', 'تم حذف التعليق'), 'ok') } catch (e: any) { notify(e.message, 'err') }
              }}><Trash2 size={13} /></button>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#cfd8f5]">{c.body}</p>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 p-4">
        <div className="flex gap-2">
          <input className="field py-2 text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Write a comment…', 'اكتب تعليق...')} />
          <button className="btn btn-primary px-3 py-2" disabled={busy || !text.trim()} onClick={async () => {
            setBusy(true)
            try { await post(`/items/${item.id}/comments`, { body: text }); setText(''); onRefresh(); notify(t('Comment added', 'تمت إضافة التعليق'), 'ok') } catch (e: any) { notify(e.message, 'err') } finally { setBusy(false) }
          }}><Send size={15} /></button>
        </div>
      </div>
    </div>
  )
}

export function useItemComments(itemId: string | null) {
  const [comments, setComments] = useState<Comment[]>([])
  const load = useMemo(() => async () => {
    if (!itemId) return
    try { setComments((await get<{ comments: Comment[] }>(`/items/${itemId}/comments`)).comments) } catch { /* ignore */ }
  }, [itemId])
  useEffect(() => { load() }, [load])
  return { comments, refresh: load, setComments }
}
