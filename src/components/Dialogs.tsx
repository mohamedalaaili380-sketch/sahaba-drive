import { useEffect, useState } from 'react'
import { Copy, Check, Link2, Lock, CalendarClock, Eye, Download, Trash2, History, RotateCcw, Tag as TagIcon, Users, UserPlus, Search, X, Plus, Crown, Folder } from 'lucide-react'
import { del, formatBytes, formatDate, get, patch, post } from '../api'
import type { Item, Share, Tag, Space, Version } from '../types'
import { Modal, Progress } from './ui'
import { useT } from '../i18n'

export function TextDialog({ title, label, initial = '', placeholder = '', confirm = 'Save', onSave, onClose }: {
  title: string; label: string; initial?: string; placeholder?: string; confirm?: string
  onSave: (value: string) => Promise<void> | void; onClose: () => void
}) {
  const t = useT()
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <Modal title={title} onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>{t('Cancel', 'إلغاء')}</button>
      <button className="btn btn-primary" disabled={busy} onClick={async () => {
        setBusy(true); setError('')
        try { await onSave(value.trim()); onClose() } catch (e: any) { setError(e.message) } finally { setBusy(false) }
      }}>{confirm}</button>
    </>}>
      <label className="block space-y-2"><span className="text-sm font-semibold text-[#b8c4e8]">{label}</span>
        <input autoFocus className="field" value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} />
      </label>
      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
    </Modal>
  )
}

export function MoveDialog({ item, space, onMove, onClose }: {
  item: Item; space: string; onMove: (parentId: string | null) => Promise<void>; onClose: () => void
}) {
  const t = useT()
  const [folders, setFolders] = useState<Item[]>([])
  const [target, setTarget] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { get<{ items: Item[] }>(`/search?kind=folder&space=${space}`).then((d) => setFolders(d.items.filter((f) => f.id !== item.id))) }, [space, item.id])
  return (
    <Modal title={t('Move to folder', 'نقل إلى مجلد')} subtitle={item.name} onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>{t('Cancel', 'إلغاء')}</button>
      <button className="btn btn-primary" disabled={busy} onClick={async () => { setBusy(true); try { await onMove(target); onClose() } finally { setBusy(false) } }}>{t('Move here', 'نقل هنا')}</button>
    </>}>
      <div className="max-h-80 space-y-1 overflow-auto">
        <button onClick={() => setTarget(null)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${target === null ? 'bg-[#6d7cff33] text-white' : 'hover:bg-white/5'}`}>
          <Folder size={18} className="text-[#f0b65c]" /> {t('Space root', 'جذر المساحة')} {target === null && <Check size={16} className="ms-auto text-[#8b9cff]" />}
        </button>
        {folders.map((f) => (
          <button key={f.id} onClick={() => setTarget(f.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${target === f.id ? 'bg-[#6d7cff33] text-white' : 'hover:bg-white/5'}`}>
            <Folder size={18} className="text-[#f0b65c]" /> <span className="truncate">{f.name}</span>{target === f.id && <Check size={16} className="ms-auto text-[#8b9cff]" />}
          </button>
        ))}
      </div>
    </Modal>
  )
}

export function BulkMoveDialog({ count, space, excludeIds = [], onMove, onClose }: {
  count: number; space: string; excludeIds?: string[]
  onMove: (parentId: string | null) => Promise<void>; onClose: () => void
}) {
  const t = useT()
  const [folders, setFolders] = useState<Item[]>([])
  const [target, setTarget] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    get<{ items: Item[] }>(`/search?kind=folder&space=${encodeURIComponent(space)}`)
      .then((d) => setFolders(d.items.filter((f) => !excludeIds.includes(f.id))))
      .catch((e: any) => setError(e.message))
  }, [space, excludeIds.join(',')])
  return (
    <Modal title={t('Bulk move', 'نقل جماعي')} subtitle={t('{n} items selected', '{n} عنصر محدد', { n: count })} onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>{t('Cancel', 'إلغاء')}</button>
      <button className="btn btn-primary" disabled={busy} onClick={async () => {
        setBusy(true); setError('')
        try { await onMove(target); onClose() } catch (e: any) { setError(e.message) } finally { setBusy(false) }
      }}>{t('Move here', 'نقل هنا')}</button>
    </>}>
      <div className="max-h-80 space-y-1 overflow-auto">
        <button onClick={() => setTarget(null)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${target === null ? 'bg-[#6d7cff33] text-white' : 'hover:bg-white/5'}`}>
          <Folder size={18} className="text-[#f0b65c]" /> {t('Space root', 'جذر المساحة')} {target === null && <Check size={16} className="ms-auto text-[#8b9cff]" />}
        </button>
        {folders.map((f) => (
          <button key={f.id} onClick={() => setTarget(f.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${target === f.id ? 'bg-[#6d7cff33] text-white' : 'hover:bg-white/5'}`}>
            <Folder size={18} className="text-[#f0b65c]" /> <span className="truncate">{f.name}</span>{target === f.id && <Check size={16} className="ms-auto text-[#8b9cff]" />}
          </button>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
    </Modal>
  )
}

export function ShareDialog({ item, onClose, notify }: { item: Item; onClose: () => void; notify: (text: string, kind?: 'ok' | 'err') => void }) {
  const t = useT()
  const [shares, setShares] = useState<Share[]>([])
  const [permission, setPermission] = useState<'view' | 'download' | 'comment'>('view')
  const [password, setPassword] = useState('')
  const [days, setDays] = useState('0')
  const [maxViews, setMaxViews] = useState('')
  const [maxDownloads, setMaxDownloads] = useState('')
  const [allowComments, setAllowComments] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState('')
  const load = () => get<{ shares: Share[] }>(`/shares?itemId=${item.id}`).then((d) => setShares(d.shares)).catch(() => {})
  useEffect(() => { load() }, [item.id])

  async function create() {
    setBusy(true)
    try {
      const { share } = await post<{ share: Share }>('/shares', {
        itemId: item.id, permission, password, expiresDays: Number(days), maxViews: Number(maxViews) || null,
        maxDownloads: Number(maxDownloads) || null, allowComments,
      })
      notify(t('Share link created', 'تم إنشاء رابط المشاركة'), 'ok')
      setPassword(''); load()
      copy(share.token)
    } catch (e: any) { notify(e.message, 'err') } finally { setBusy(false) }
  }
  function copy(token: string) {
    navigator.clipboard?.writeText(`${location.origin}/s/${token}`).then(() => {
      setCopied(token); setTimeout(() => setCopied(''), 1800)
    }).catch(() => notify(t('Could not copy the link', 'مش ممكن نسخ الرابط'), 'err'))
  }
  async function update(id: string, body: any) {
    try { await patch(`/shares/${id}`, body); load() } catch (e: any) { notify(e.message, 'err') }
  }
  return (
    <Modal title={t('Share', 'مشاركة')} subtitle={item.name} wide onClose={onClose}>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <h4 className="text-sm font-bold text-[#aab6df]">{t('Create a new link', 'إنشاء رابط جديد')}</h4>
          <label className="block space-y-2"><span className="text-xs text-[#8f9bc2]">{t('Permission', 'الصلاحية')}</span>
            <select className="field" value={permission} onChange={(e) => setPermission(e.target.value as any)}>
              <option value="view">{t('View only', 'معاينة فقط')}</option><option value="download">{t('View and download', 'معاينة وتنزيل')}</option><option value="comment">{t('View, download and comment', 'معاينة وتنزيل وتعليق')}</option>
            </select></label>
          <label className="block space-y-2"><span className="text-xs text-[#8f9bc2]">{t('Link password (optional)', 'كلمة سر للرابط (اختياري)')}</span>
            <input className="field" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('Leave empty for no protection', 'اتركها فاضية من غير حماية')} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-2"><span className="text-xs text-[#8f9bc2]">{t('Expires after', 'مدة الصلاحية')}</span>
              <select className="field" value={days} onChange={(e) => setDays(e.target.value)}>
                <option value="0">{t('Never', 'بدون انتهاء')}</option><option value="1">{t('One day', 'يوم')}</option><option value="7">{t('One week', 'أسبوع')}</option><option value="30">{t('One month', 'شهر')}</option><option value="365">{t('One year', 'سنة')}</option>
              </select></label>
            <label className="block space-y-2"><span className="text-xs text-[#8f9bc2]">{t('Max views', 'أقصى مشاهدات')}</span>
              <input className="field" dir="ltr" type="number" min="0" value={maxViews} onChange={(e) => setMaxViews(e.target.value)} placeholder={t('Unlimited', 'غير محدود')} /></label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-2"><span className="text-xs text-[#8f9bc2]">{t('Max downloads', 'أقصى تنزيلات')}</span>
              <input className="field" dir="ltr" type="number" min="0" value={maxDownloads} onChange={(e) => setMaxDownloads(e.target.value)} placeholder={t('Unlimited', 'غير محدود')} /></label>
            <label className="flex items-end gap-2 pb-2 text-xs text-[#b8c4e8]">
              <input type="checkbox" checked={allowComments} onChange={(e) => setAllowComments(e.target.checked)} className="accent-[#6d7cff]" /> {t('Allow comments', 'السماح بالتعليقات')}</label>
          </div>
          <button className="btn btn-primary w-full" disabled={busy} onClick={create}><Link2 size={17} /> {t('Create link', 'إنشاء الرابط')}</button>
        </div>
        <div className="space-y-3">
          <h4 className="text-sm font-bold text-[#aab6df]">{t('Existing links ({n})', 'الروابط الحالية ({n})', { n: shares.length })}</h4>
          {shares.length === 0 && <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-[#7784ad]">{t('No links yet — create the first one.', 'مفيش روابط yet — اعمل أول رابط.')}</p>}
          {shares.map((s) => (
            <div key={s.id} className={`rounded-xl border p-3 ${s.revoked ? 'border-white/5 bg-white/[.02] opacity-50' : 'border-white/10 bg-white/5'}`}>
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded-md bg-[#6d7cff22] px-2 py-1 text-[#aab6ff]">{s.permission === 'view' ? t('View', 'معاينة') : s.permission === 'download' ? t('Download', 'تنزيل') : t('Comment', 'تعليق')}</span>
                {s.hasPassword && <span className="flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-1 text-amber-300"><Lock size={11} /> {t('Protected', 'محمي')}</span>}
                {s.expiresAt && <span className="flex items-center gap-1 text-[#8f9bc2]"><CalendarClock size={11} /> {formatDate(s.expiresAt)}</span>}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <input readOnly dir="ltr" value={`${location.origin}/s/${s.token}`} className="field flex-1 py-1.5 text-[11px]" onFocus={(e) => e.target.select()} />
                <button className="btn btn-ghost px-2 py-1.5" title={t('Copy', 'نسخ')} onClick={() => copy(s.token)}>{copied === s.token ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}</button>
              </div>
              <div className="mt-2 flex items-center gap-4 text-[11px] text-[#8894bd]">
                <span className="flex items-center gap-1"><Eye size={12} /> {s.views}{s.maxViews ? `/${s.maxViews}` : ''}</span>
                <span className="flex items-center gap-1"><Download size={12} /> {s.downloads}{s.maxDownloads ? `/${s.maxDownloads}` : ''}</span>
                <button className="ms-auto text-rose-300 hover:underline" onClick={() => update(s.id, { revoked: !s.revoked })}>{s.revoked ? t('Enable', 'تفعيل') : t('Revoke link', 'إلغاء الرابط')}</button>
                <button className="text-[#8f9bc2] hover:text-rose-300" onClick={async () => { await del(`/shares/${s.id}`); load() }}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}

export function VersionsDialog({ item, onClose, notify }: { item: Item; onClose: () => void; notify: (t: string, k?: 'ok' | 'err') => void }) {
  const t = useT()
  const [versions, setVersions] = useState<Version[]>([])
  const load = () => get<{ versions: Version[] }>(`/items/${item.id}/versions`).then((d) => setVersions(d.versions))
  useEffect(() => { load() }, [item.id])
  return (
    <Modal title={t('Version history', 'سجل الإصدارات')} subtitle={t('{name} — {n} versions', '{name} — {n} إصدار', { name: item.name, n: versions.length })} onClose={onClose}>
      <div className="space-y-2">
        {versions.map((v) => (
          <div key={v.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#6d7cff22] text-xs font-bold text-[#aab6ff]">v{v.number}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{v.note || t('No note', 'بدون ملاحظة')}</p>
              <p className="text-[11px] text-[#8591ba]">{formatDate(v.created_at)} • {formatBytes(v.size)}{v.author ? ` • ${v.author}` : ''}</p>
            </div>
            <a className="btn btn-ghost px-2 py-1.5" title={t('Download version', 'تنزيل الإصدار')} href={`/api/items/${item.id}/content?version=${v.number}`}><Download size={15} /></a>
            {versions.length > 1 && v.number !== item.version && <>
              <button className="btn btn-ghost px-2 py-1.5" title={t('Restore', 'استعادة')} onClick={async () => {
                try { await post(`/items/${item.id}/versions/${v.number}/restore`); notify(t('Restored as a new version', 'تمت الاستعادة كإصدار جديد'), 'ok'); load(); onClose() } catch (e: any) { notify(e.message, 'err') }
              }}><RotateCcw size={15} /></button>
              <button className="btn btn-ghost px-2 py-1.5 hover:text-rose-300" title={t('Delete version', 'حذف الإصدار')} onClick={async () => {
                try { await del(`/items/${item.id}/versions/${v.number}`); notify(t('Version deleted', 'تم حذف الإصدار'), 'ok'); load() } catch (e: any) { notify(e.message, 'err') }
              }}><Trash2 size={15} /></button>
            </>}
          </div>
        ))}
      </div>
    </Modal>
  )
}

export function TagsDialog({ item, tags, onChange, onClose }: { item: Item; tags: Tag[]; onChange: () => void; onClose: () => void }) {
  const t = useT()
  const [newTag, setNewTag] = useState('')
  const [selected, setSelected] = useState<string[]>(item.tags.map((t) => t.id))
  const [busy, setBusy] = useState(false)
  async function toggle(id: string) {
    const next = selected.includes(id) ? selected.filter((t) => t !== id) : [...selected, id]
    setSelected(next); setBusy(true)
    try { await patch(`/items/${item.id}`, { tagIds: next }); onChange() } finally { setBusy(false) }
  }
  return (
    <Modal title={t('File tags', 'وسوم الملف')} subtitle={item.name} onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>{t('Done', 'تم')}</button>}>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <button key={tag.id} disabled={busy} onClick={() => toggle(tag.id)}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${selected.includes(tag.id) ? 'text-white' : 'border-white/10 bg-white/5 text-[#9ba7cf]'}`}
            style={selected.includes(tag.id) ? { borderColor: tag.color, background: `${tag.color}33` } : {}}>
            <span className="h-2 w-2 rounded-full" style={{ background: tag.color }} />{tag.name}{selected.includes(tag.id) && <Check size={13} />}
          </button>
        ))}
        {tags.length === 0 && <p className="text-sm text-[#7f8bb4]">{t('No tags yet — create one.', 'مفيش وسوم — اعمل وسم جديد.')}</p>}
      </div>
      <div className="mt-5 flex gap-2 border-t border-white/10 pt-4">
        <input className="field" value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder={t('New tag name', 'اسم وسم جديد')} />
        <button className="btn btn-ghost" onClick={async () => {
          if (!newTag.trim()) return
          const { tag } = await post<{ tag: Tag }>('/tags', { name: newTag.trim(), color: ['#6d7cff', '#34d399', '#f472b6', '#fbbf24', '#38bdf8'][Math.floor(Math.random() * 5)] })
          setNewTag(''); onChange();
          const created = tag; setSelected((s) => [...s, created.id]); await patch(`/items/${item.id}`, { tagIds: [...selected, created.id] })
        }}><Plus size={16} /> {t('Add', 'إضافة')}</button>
      </div>
    </Modal>
  )
}

export function BulkTagsDialog({ tags, count, onSave, onChange, onClose }: {
  tags: Tag[]; count: number
  onSave: (tagIds: string[], mode: 'add' | 'remove') => Promise<void>
  onChange: () => void; onClose: () => void
}) {
  const t = useT()
  const [selected, setSelected] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const toggle = (id: string) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id])
  const apply = async (mode: 'add' | 'remove') => {
    if (!selected.length) { setError(t('Select at least one tag', 'اختار وسم على الأقل')); return }
    setBusy(true); setError('')
    try { await onSave(selected, mode); onClose() } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal title={t('Bulk tags', 'وسوم جماعية')} subtitle={t('{n} items selected', '{n} عنصر محدد', { n: count })} onClose={onClose} footer={<>
      <button className="btn btn-ghost" disabled={busy || !selected.length} onClick={() => apply('remove')}>{t('Remove selected', 'إزالة المحدد')}</button>
      <button className="btn btn-primary" disabled={busy || !selected.length} onClick={() => apply('add')}>{t('Add selected', 'إضافة المحدد')}</button>
    </>}>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <button key={tag.id} disabled={busy} onClick={() => toggle(tag.id)}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${selected.includes(tag.id) ? 'text-white' : 'border-white/10 bg-white/5 text-[#9ba7cf]'}`}
            style={selected.includes(tag.id) ? { borderColor: tag.color, background: `${tag.color}33` } : {}}>
            <span className="h-2 w-2 rounded-full" style={{ background: tag.color }} />{tag.name}{selected.includes(tag.id) && <Check size={13} />}
          </button>
        ))}
        {tags.length === 0 && <p className="text-sm text-[#7f8bb4]">{t('No tags yet — create one.', 'مفيش وسوم — اعمل وسم جديد.')}</p>}
      </div>
      <div className="mt-5 flex gap-2 border-t border-white/10 pt-4">
        <input className="field" value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder={t('New tag name', 'اسم وسم جديد')} />
        <button className="btn btn-ghost" disabled={busy || !newTag.trim()} onClick={async () => {
          const { tag } = await post<{ tag: Tag }>('/tags', {
            name: newTag.trim(),
            color: ['#6d7cff', '#34d399', '#f472b6', '#fbbf24', '#38bdf8'][Math.floor(Math.random() * 5)],
          })
          setNewTag(''); onChange(); setSelected((s) => [...s, tag.id])
        }}><Plus size={16} /> {t('Add', 'إضافة')}</button>
      </div>
      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
    </Modal>
  )
}

export function TeamsDialog({ onClose, onChange, notify }: { onClose: () => void; onChange: () => void; notify: (t: string, k?: 'ok' | 'err') => void }) {
  const t = useT()
  const [teams, setTeams] = useState<Space[]>([])
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('editor')
  const load = () => get<{ teams: Space[] }>('/teams').then((d) => { setTeams(d.teams); if (selected && !d.teams.find((team) => team.id === selected)) setSelected(null) })
  useEffect(() => { load() }, [])
  useEffect(() => { if (selected) get(`/teams/${selected}`).then((d: any) => setDetail(d.team)) }, [selected])
  return (
    <Modal title={t('Teams and shared spaces', 'الفرق والمساحات المشتركة')} wide onClose={onClose}>
      <div className="grid gap-5 md:grid-cols-[220px_1fr]">
        <div className="space-y-2">
          {teams.map((team) => (
            <button key={team.id} onClick={() => setSelected(team.id)} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${selected === team.id ? 'bg-[#6d7cff33]' : 'hover:bg-white/5'}`}>
              <Users size={16} className="text-[#9aa9ff]" /><span className="truncate">{team.name}</span>
              {team.role === 'owner' && <Crown size={13} className="ms-auto text-amber-400" />}
            </button>
          ))}
          {teams.length === 0 && <p className="text-sm text-[#7f8bb4]">{t('No teams yet.', 'لسه مفيش فرق.')}</p>}
          <div className="flex gap-2 pt-2">
            <input className="field py-2 text-xs" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('New team name', 'اسم فريق جديد')} />
            <button className="btn btn-primary px-3 py-2" onClick={async () => {
              if (!name.trim()) return
              try { const { team } = await post<{ team: Space }>('/teams', { name }); setName(''); await load(); setSelected(team.id); onChange(); notify(t('Team created', 'تم إنشاء الفريق'), 'ok') } catch (e: any) { notify(e.message, 'err') }
            }}><Plus size={16} /></button>
          </div>
        </div>
        <div>
          {!selected ? <div className="grid h-full min-h-48 place-items-center text-center text-sm text-[#7f8bb4]">{t('Choose a team or create a new one', 'اختر فريق أو اعمل فريق جديد')}</div> : detail && <>
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-bold">{detail.name}</h4>
              <span className="text-xs text-[#8d99c2]">{detail.role === 'owner' ? t('You are the owner', 'أنت المالك') : detail.role === 'editor' ? t('Editor', 'محرر') : t('Viewer', 'قارئ')}</span>
            </div>
            <div className="mt-4 space-y-2">
              {detail.members.map((m: any) => (
                <div key={m.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-2.5 text-sm">
                  <div className="grid h-8 w-8 place-items-center rounded-full text-xs font-bold" style={{ background: `${m.color}33`, color: m.color }}>{m.name[0]}</div>
                  <div className="min-w-0 flex-1"><p className="truncate font-semibold">{m.name}</p><p className="truncate text-[11px] text-[#8591ba]" dir="ltr">{m.email}</p></div>
                  {detail.role === 'owner' && m.id !== detail.owner_id && (
                    <select className="rounded-lg border border-white/10 bg-[#0d1324] px-2 py-1 text-xs" value={m.role} onChange={async (e) => {
                      await patch(`/teams/${selected}/members/${m.id}`, { role: e.target.value }); setDetail({ ...detail, members: detail.members.map((x: any) => x.id === m.id ? { ...x, role: e.target.value } : x) })
                    }}><option value="editor">{t('Editor', 'محرر')}</option><option value="viewer">{t('Viewer', 'قارئ')}</option></select>
                  )}
                  {m.role === 'owner' && <Crown size={14} className="text-amber-400" />}
                  {detail.role === 'owner' && m.id !== detail.owner_id && <button className="text-[#8f9bc2] hover:text-rose-300" onClick={async () => { await del(`/teams/${selected}/members/${m.id}`); setDetail({ ...detail, members: detail.members.filter((x: any) => x.id !== m.id) }) }}><X size={15} /></button>}
                </div>
              ))}
            </div>
            {detail.role === 'owner' && <div className="mt-4 flex gap-2">
              <input className="field py-2 text-xs" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('Member email', 'بريد العضو')} />
              <select className="rounded-xl border border-white/10 bg-[#0a1020] px-2 text-xs" value={role} onChange={(e) => setRole(e.target.value)}><option value="editor">{t('Editor', 'محرر')}</option><option value="viewer">{t('Viewer', 'قارئ')}</option></select>
              <button className="btn btn-primary px-3 py-2" onClick={async () => {
                try { await post(`/teams/${selected}/members`, { email, role }); setEmail(''); setDetail({ ...detail, members: [...detail.members, { id: 'new', name: email.split('@')[0], email, color: '#6d7cff', role }] }); notify(t('Added', 'تمت الإضافة'), 'ok') } catch (e: any) { notify(e.message, 'err') }
              }}><UserPlus size={15} /></button>
            </div>}
          </>}
        </div>
      </div>
    </Modal>
  )
}

export type SearchFilters = { q: string; kind: string; mime: string; tag: string; from: string; to: string; min: string; max: string; starred: boolean; sort: string }

export function SearchDialog({ tags, initial, onSearch, onClose }: { tags: Tag[]; initial: Partial<SearchFilters>; onSearch: (f: SearchFilters) => void; onClose: () => void }) {
  const t = useT()
  const [f, setF] = useState<SearchFilters>({
    q: initial.q || '', kind: initial.kind || '', mime: '', tag: '', from: '', to: '', min: '', max: '', starred: false, sort: initial.sort || 'updated',
  })
  const set = (k: keyof SearchFilters, v: any) => setF((s) => ({ ...s, [k]: v }))
  return (
    <Modal title={t('Advanced search', 'بحث متقدم')} subtitle={t('Filter your files by name, type, date and size', 'فلتر ملفاتك بالاسم والنوع والتاريخ والحجم')} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>{t('Cancel', 'إلغاء')}</button><button className="btn btn-primary" onClick={() => { onSearch(f); onClose() }}><Search size={16} /> {t('Search', 'بحث')}</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2 space-y-2"><span className="text-xs text-[#8f9bc2]">{t('Keywords', 'كلمة البحث')}</span><input autoFocus className="field" value={f.q} onChange={(e) => set('q', e.target.value)} placeholder={t('File name or description', 'اسم الملف أو الوصف')} /></label>
        <label className="space-y-2"><span className="text-xs text-[#8f9bc2]">{t('Type', 'النوع')}</span><select className="field" value={f.kind} onChange={(e) => set('kind', e.target.value)}><option value="">{t('All', 'الكل')}</option><option value="file">{t('Files', 'ملفات')}</option><option value="folder">{t('Folders', 'مجلدات')}</option></select></label>
        <label className="space-y-2"><span className="text-xs text-[#8f9bc2]">{t('File extension', 'امتداد الملف')}</span><select className="field" value={f.mime} onChange={(e) => set('mime', e.target.value)}><option value="">{t('All', 'الكل')}</option><option value="image/">{t('Images', 'صور')}</option><option value="video/">{t('Videos', 'فيديو')}</option><option value="audio/">{t('Audio', 'صوت')}</option><option value="application/pdf">PDF</option><option value="text/">{t('Text', 'نصوص')}</option></select></label>
        <label className="space-y-2"><span className="text-xs text-[#8f9bc2]">{t('Tag', 'الوسم')}</span><select className="field" value={f.tag} onChange={(e) => set('tag', e.target.value)}><option value="">{t('All tags', 'كل الوسوم')}</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label>
        <label className="space-y-2"><span className="text-xs text-[#8f9bc2]">{t('Sort', 'الترتيب')}</span><select className="field" value={f.sort} onChange={(e) => set('sort', e.target.value)}><option value="updated">{t('Newest', 'الأحدث')}</option><option value="name">{t('Name', 'الاسم')}</option><option value="size">{t('Size', 'الحجم')}</option></select></label>
        <label className="space-y-2"><span className="text-xs text-[#8f9bc2]">{t('From date', 'من تاريخ')}</span><input className="field" type="date" value={f.from} onChange={(e) => set('from', e.target.value)} /></label>
        <label className="space-y-2"><span className="text-xs text-[#8f9bc2]">{t('To date', 'إلى تاريخ')}</span><input className="field" type="date" value={f.to} onChange={(e) => set('to', e.target.value)} /></label>
        <label className="space-y-2"><span className="text-xs text-[#8f9bc2]">{t('Larger than (MB)', 'أكبر من (م.ب)')}</span><input className="field" dir="ltr" type="number" min="0" value={f.min} onChange={(e) => set('min', e.target.value)} /></label>
        <label className="space-y-2"><span className="text-xs text-[#8f9bc2]">{t('Smaller than (MB)', 'أصغر من (م.ب)')}</span><input className="field" dir="ltr" type="number" min="0" value={f.max} onChange={(e) => set('max', e.target.value)} /></label>
        <label className="flex items-center gap-2 sm:col-span-2 text-sm text-[#b8c4e8]"><input type="checkbox" className="accent-[#6d7cff]" checked={f.starred} onChange={(e) => set('starred', e.target.checked)} /> {t('Starred only', 'المفضلة فقط')}</label>
      </div>
    </Modal>
  )
}

export function StorageBar({ used, limit }: { used: number; limit: number }) {
  const t = useT()
  const pct = Math.min(100, Math.round((used / limit) * 100))
  return <div className="space-y-1.5"><div className="flex justify-between text-[11px] text-[#8f9bc2]"><span>{t('Storage used', 'المساحة المستخدمة')}</span><span>{formatBytes(used)} / {formatBytes(limit)}</span></div><Progress value={pct} /></div>
}

export { History, TagIcon }
