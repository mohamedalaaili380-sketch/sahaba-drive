import { useEffect, useState } from 'react'
import { Copy, Check, Link2, Lock, CalendarClock, Eye, Download, Trash2, History, RotateCcw, Tag as TagIcon, Users, UserPlus, Search, X, Plus, Crown, Folder } from 'lucide-react'
import { del, formatBytes, formatDate, get, patch, post } from '../api'
import type { Item, Share, Tag, Space, Version } from '../types'
import { Modal, Progress } from './ui'

export function TextDialog({ title, label, initial = '', placeholder = '', confirm = 'حفظ', onSave, onClose }: {
  title: string; label: string; initial?: string; placeholder?: string; confirm?: string
  onSave: (value: string) => Promise<void> | void; onClose: () => void
}) {
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <Modal title={title} onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
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
  const [folders, setFolders] = useState<Item[]>([])
  const [target, setTarget] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { get<{ items: Item[] }>(`/search?kind=folder&space=${space}`).then((d) => setFolders(d.items.filter((f) => f.id !== item.id))) }, [space, item.id])
  return (
    <Modal title="نقل إلى مجلد" subtitle={item.name} onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
      <button className="btn btn-primary" disabled={busy} onClick={async () => { setBusy(true); try { await onMove(target); onClose() } finally { setBusy(false) } }}>نقل هنا</button>
    </>}>
      <div className="max-h-80 space-y-1 overflow-auto">
        <button onClick={() => setTarget(null)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${target === null ? 'bg-[#6d7cff33] text-white' : 'hover:bg-white/5'}`}>
          <Folder size={18} className="text-[#f0b65c]" /> جذر المساحة {target === null && <Check size={16} className="mr-auto text-[#8b9cff]" />}
        </button>
        {folders.map((f) => (
          <button key={f.id} onClick={() => setTarget(f.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${target === f.id ? 'bg-[#6d7cff33] text-white' : 'hover:bg-white/5'}`}>
            <Folder size={18} className="text-[#f0b65c]" /> <span className="truncate">{f.name}</span>{target === f.id && <Check size={16} className="mr-auto text-[#8b9cff]" />}
          </button>
        ))}
      </div>
    </Modal>
  )
}

export function ShareDialog({ item, onClose, notify }: { item: Item; onClose: () => void; notify: (text: string, kind?: 'ok' | 'err') => void }) {
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
      notify('تم إنشاء رابط المشاركة', 'ok')
      setPassword(''); load()
      copy(share.token)
    } catch (e: any) { notify(e.message, 'err') } finally { setBusy(false) }
  }
  function copy(token: string) {
    navigator.clipboard?.writeText(`${location.origin}/s/${token}`).then(() => {
      setCopied(token); setTimeout(() => setCopied(''), 1800)
    }).catch(() => notify('مش ممكن نسخ الرابط', 'err'))
  }
  async function update(id: string, body: any) {
    try { await patch(`/shares/${id}`, body); load() } catch (e: any) { notify(e.message, 'err') }
  }
  return (
    <Modal title="مشاركة" subtitle={item.name} wide onClose={onClose}>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <h4 className="text-sm font-bold text-[#aab6df]">إنشاء رابط جديد</h4>
          <label className="block space-y-2"><span className="text-xs text-[#8f9bc2]">الصلاحية</span>
            <select className="field" value={permission} onChange={(e) => setPermission(e.target.value as any)}>
              <option value="view">معاينة فقط</option><option value="download">معاينة وتنزيل</option><option value="comment">معاينة وتنزيل وتعليق</option>
            </select></label>
          <label className="block space-y-2"><span className="text-xs text-[#8f9bc2]">كلمة سر للرابط (اختياري)</span>
            <input className="field" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="اتركها فاضية من غير حماية" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-2"><span className="text-xs text-[#8f9bc2]">مدة الصلاحية</span>
              <select className="field" value={days} onChange={(e) => setDays(e.target.value)}>
                <option value="0">بدون انتهاء</option><option value="1">يوم</option><option value="7">أسبوع</option><option value="30">شهر</option><option value="365">سنة</option>
              </select></label>
            <label className="block space-y-2"><span className="text-xs text-[#8f9bc2]">أقصى مشاهدات</span>
              <input className="field" dir="ltr" type="number" min="0" value={maxViews} onChange={(e) => setMaxViews(e.target.value)} placeholder="غير محدود" /></label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-2"><span className="text-xs text-[#8f9bc2]">أقصى تنزيلات</span>
              <input className="field" dir="ltr" type="number" min="0" value={maxDownloads} onChange={(e) => setMaxDownloads(e.target.value)} placeholder="غير محدود" /></label>
            <label className="flex items-end gap-2 pb-2 text-xs text-[#b8c4e8]">
              <input type="checkbox" checked={allowComments} onChange={(e) => setAllowComments(e.target.checked)} className="accent-[#6d7cff]" /> السماح بالتعليقات</label>
          </div>
          <button className="btn btn-primary w-full" disabled={busy} onClick={create}><Link2 size={17} /> إنشاء الرابط</button>
        </div>
        <div className="space-y-3">
          <h4 className="text-sm font-bold text-[#aab6df]">الروابط الحالية ({shares.length})</h4>
          {shares.length === 0 && <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-[#7784ad]">مفيش روابط yet — اعمل أول رابط.</p>}
          {shares.map((s) => (
            <div key={s.id} className={`rounded-xl border p-3 ${s.revoked ? 'border-white/5 bg-white/[.02] opacity-50' : 'border-white/10 bg-white/5'}`}>
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded-md bg-[#6d7cff22] px-2 py-1 text-[#aab6ff]">{s.permission === 'view' ? 'معاينة' : s.permission === 'download' ? 'تنزيل' : 'تعليق'}</span>
                {s.hasPassword && <span className="flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-1 text-amber-300"><Lock size={11} /> محمي</span>}
                {s.expiresAt && <span className="flex items-center gap-1 text-[#8f9bc2]"><CalendarClock size={11} /> {formatDate(s.expiresAt)}</span>}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <input readOnly dir="ltr" value={`${location.origin}/s/${s.token}`} className="field flex-1 py-1.5 text-[11px]" onFocus={(e) => e.target.select()} />
                <button className="btn btn-ghost px-2 py-1.5" title="نسخ" onClick={() => copy(s.token)}>{copied === s.token ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}</button>
              </div>
              <div className="mt-2 flex items-center gap-4 text-[11px] text-[#8894bd]">
                <span className="flex items-center gap-1"><Eye size={12} /> {s.views}{s.maxViews ? `/${s.maxViews}` : ''}</span>
                <span className="flex items-center gap-1"><Download size={12} /> {s.downloads}{s.maxDownloads ? `/${s.maxDownloads}` : ''}</span>
                <button className="mr-auto text-rose-300 hover:underline" onClick={() => update(s.id, { revoked: !s.revoked })}>{s.revoked ? 'تفعيل' : 'إلغاء الرابط'}</button>
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
  const [versions, setVersions] = useState<Version[]>([])
  const load = () => get<{ versions: Version[] }>(`/items/${item.id}/versions`).then((d) => setVersions(d.versions))
  useEffect(() => { load() }, [item.id])
  return (
    <Modal title="سجل الإصدارات" subtitle={`${item.name} — ${versions.length} إصدار`} onClose={onClose}>
      <div className="space-y-2">
        {versions.map((v) => (
          <div key={v.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#6d7cff22] text-xs font-bold text-[#aab6ff]">v{v.number}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{v.note || 'بدون ملاحظة'}</p>
              <p className="text-[11px] text-[#8591ba]">{formatDate(v.created_at)} • {formatBytes(v.size)}{v.author ? ` • ${v.author}` : ''}</p>
            </div>
            <a className="btn btn-ghost px-2 py-1.5" title="تنزيل الإصدار" href={`/api/items/${item.id}/content?version=${v.number}`}><Download size={15} /></a>
            {versions.length > 1 && v.number !== item.version && <>
              <button className="btn btn-ghost px-2 py-1.5" title="استعادة" onClick={async () => {
                try { await post(`/items/${item.id}/versions/${v.number}/restore`); notify('تمت الاستعادة كإصدار جديد', 'ok'); load(); onClose() } catch (e: any) { notify(e.message, 'err') }
              }}><RotateCcw size={15} /></button>
              <button className="btn btn-ghost px-2 py-1.5 hover:text-rose-300" title="حذف الإصدار" onClick={async () => {
                try { await del(`/items/${item.id}/versions/${v.number}`); notify('تم حذف الإصدار', 'ok'); load() } catch (e: any) { notify(e.message, 'err') }
              }}><Trash2 size={15} /></button>
            </>}
          </div>
        ))}
      </div>
    </Modal>
  )
}

export function TagsDialog({ item, tags, onChange, onClose }: { item: Item; tags: Tag[]; onChange: () => void; onClose: () => void }) {
  const [newTag, setNewTag] = useState('')
  const [selected, setSelected] = useState<string[]>(item.tags.map((t) => t.id))
  const [busy, setBusy] = useState(false)
  async function toggle(id: string) {
    const next = selected.includes(id) ? selected.filter((t) => t !== id) : [...selected, id]
    setSelected(next); setBusy(true)
    try { await patch(`/items/${item.id}`, { tagIds: next }); onChange() } finally { setBusy(false) }
  }
  return (
    <Modal title="وسوم الملف" subtitle={item.name} onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>تم</button>}>
      <div className="flex flex-wrap gap-2">
        {tags.map((t) => (
          <button key={t.id} disabled={busy} onClick={() => toggle(t.id)}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${selected.includes(t.id) ? 'text-white' : 'border-white/10 bg-white/5 text-[#9ba7cf]'}`}
            style={selected.includes(t.id) ? { borderColor: t.color, background: `${t.color}33` } : {}}>
            <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />{t.name}{selected.includes(t.id) && <Check size={13} />}
          </button>
        ))}
        {tags.length === 0 && <p className="text-sm text-[#7f8bb4]">مفيش وسوم — اعمل وسم جديد.</p>}
      </div>
      <div className="mt-5 flex gap-2 border-t border-white/10 pt-4">
        <input className="field" value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="اسم وسم جديد" />
        <button className="btn btn-ghost" onClick={async () => {
          if (!newTag.trim()) return
          const { tag } = await post<{ tag: Tag }>('/tags', { name: newTag.trim(), color: ['#6d7cff', '#34d399', '#f472b6', '#fbbf24', '#38bdf8'][Math.floor(Math.random() * 5)] })
          setNewTag(''); onChange();
          const created = tag; setSelected((s) => [...s, created.id]); await patch(`/items/${item.id}`, { tagIds: [...selected, created.id] })
        }}><Plus size={16} /> إضافة</button>
      </div>
    </Modal>
  )
}

export function TeamsDialog({ onClose, onChange, notify }: { onClose: () => void; onChange: () => void; notify: (t: string, k?: 'ok' | 'err') => void }) {
  const [teams, setTeams] = useState<Space[]>([])
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('editor')
  const load = () => get<{ teams: Space[] }>('/teams').then((d) => { setTeams(d.teams); if (selected && !d.teams.find((t) => t.id === selected)) setSelected(null) })
  useEffect(() => { load() }, [])
  useEffect(() => { if (selected) get(`/teams/${selected}`).then((d: any) => setDetail(d.team)) }, [selected])
  return (
    <Modal title="الفرق والمساحات المشتركة" wide onClose={onClose}>
      <div className="grid gap-5 md:grid-cols-[220px_1fr]">
        <div className="space-y-2">
          {teams.map((t) => (
            <button key={t.id} onClick={() => setSelected(t.id)} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${selected === t.id ? 'bg-[#6d7cff33]' : 'hover:bg-white/5'}`}>
              <Users size={16} className="text-[#9aa9ff]" /><span className="truncate">{t.name}</span>
              {t.role === 'owner' && <Crown size={13} className="mr-auto text-amber-400" />}
            </button>
          ))}
          {teams.length === 0 && <p className="text-sm text-[#7f8bb4]">لسه مفيش فرق.</p>}
          <div className="flex gap-2 pt-2">
            <input className="field py-2 text-xs" value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم فريق جديد" />
            <button className="btn btn-primary px-3 py-2" onClick={async () => {
              if (!name.trim()) return
              try { const { team } = await post<{ team: Space }>('/teams', { name }); setName(''); await load(); setSelected(team.id); onChange(); notify('تم إنشاء الفريق', 'ok') } catch (e: any) { notify(e.message, 'err') }
            }}><Plus size={16} /></button>
          </div>
        </div>
        <div>
          {!selected ? <div className="grid h-full min-h-48 place-items-center text-center text-sm text-[#7f8bb4]">اختر فريق أو اعمل فريق جديد</div> : detail && <>
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-bold">{detail.name}</h4>
              <span className="text-xs text-[#8d99c2]">{detail.role === 'owner' ? 'أنت المالك' : detail.role === 'editor' ? 'محرر' : 'قارئ'}</span>
            </div>
            <div className="mt-4 space-y-2">
              {detail.members.map((m: any) => (
                <div key={m.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-2.5 text-sm">
                  <div className="grid h-8 w-8 place-items-center rounded-full text-xs font-bold" style={{ background: `${m.color}33`, color: m.color }}>{m.name[0]}</div>
                  <div className="min-w-0 flex-1"><p className="truncate font-semibold">{m.name}</p><p className="truncate text-[11px] text-[#8591ba]" dir="ltr">{m.email}</p></div>
                  {detail.role === 'owner' && m.id !== detail.owner_id && (
                    <select className="rounded-lg border border-white/10 bg-[#0d1324] px-2 py-1 text-xs" value={m.role} onChange={async (e) => {
                      await patch(`/teams/${selected}/members/${m.id}`, { role: e.target.value }); setDetail({ ...detail, members: detail.members.map((x: any) => x.id === m.id ? { ...x, role: e.target.value } : x) })
                    }}><option value="editor">محرر</option><option value="viewer">قارئ</option></select>
                  )}
                  {m.role === 'owner' && <Crown size={14} className="text-amber-400" />}
                  {detail.role === 'owner' && m.id !== detail.owner_id && <button className="text-[#8f9bc2] hover:text-rose-300" onClick={async () => { await del(`/teams/${selected}/members/${m.id}`); setDetail({ ...detail, members: detail.members.filter((x: any) => x.id !== m.id) }) }}><X size={15} /></button>}
                </div>
              ))}
            </div>
            {detail.role === 'owner' && <div className="mt-4 flex gap-2">
              <input className="field py-2 text-xs" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="بريد العضو" />
              <select className="rounded-xl border border-white/10 bg-[#0a1020] px-2 text-xs" value={role} onChange={(e) => setRole(e.target.value)}><option value="editor">محرر</option><option value="viewer">قارئ</option></select>
              <button className="btn btn-primary px-3 py-2" onClick={async () => {
                try { await post(`/teams/${selected}/members`, { email, role }); setEmail(''); setDetail({ ...detail, members: [...detail.members, { id: 'new', name: email.split('@')[0], email, color: '#6d7cff', role }] }); notify('تمت الإضافة', 'ok') } catch (e: any) { notify(e.message, 'err') }
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
  const [f, setF] = useState<SearchFilters>({
    q: initial.q || '', kind: initial.kind || '', mime: '', tag: '', from: '', to: '', min: '', max: '', starred: false, sort: initial.sort || 'updated',
  })
  const set = (k: keyof SearchFilters, v: any) => setF((s) => ({ ...s, [k]: v }))
  return (
    <Modal title="بحث متقدم" subtitle="فلتر ملفاتك بالاسم والنوع والتاريخ والحجم" onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>إلغاء</button><button className="btn btn-primary" onClick={() => { onSearch(f); onClose() }}><Search size={16} /> بحث</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2 space-y-2"><span className="text-xs text-[#8f9bc2]">كلمة البحث</span><input autoFocus className="field" value={f.q} onChange={(e) => set('q', e.target.value)} placeholder="اسم الملف أو الوصف" /></label>
        <label className="space-y-2"><span className="text-xs text-[#8f9bc2]">النوع</span><select className="field" value={f.kind} onChange={(e) => set('kind', e.target.value)}><option value="">الكل</option><option value="file">ملفات</option><option value="folder">مجلدات</option></select></label>
        <label className="space-y-2"><span className="text-xs text-[#8f9bc2]">امتداد الملف</span><select className="field" value={f.mime} onChange={(e) => set('mime', e.target.value)}><option value="">الكل</option><option value="image/">صور</option><option value="video/">فيديو</option><option value="audio/">صوت</option><option value="application/pdf">PDF</option><option value="text/">نصوص</option></select></label>
        <label className="space-y-2"><span className="text-xs text-[#8f9bc2]">الوسم</span><select className="field" value={f.tag} onChange={(e) => set('tag', e.target.value)}><option value="">كل الوسوم</option>{tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label className="space-y-2"><span className="text-xs text-[#8f9bc2]">الترتيب</span><select className="field" value={f.sort} onChange={(e) => set('sort', e.target.value)}><option value="updated">الأحدث</option><option value="name">الاسم</option><option value="size">الحجم</option></select></label>
        <label className="space-y-2"><span className="text-xs text-[#8f9bc2]">من تاريخ</span><input className="field" type="date" value={f.from} onChange={(e) => set('from', e.target.value)} /></label>
        <label className="space-y-2"><span className="text-xs text-[#8f9bc2]">إلى تاريخ</span><input className="field" type="date" value={f.to} onChange={(e) => set('to', e.target.value)} /></label>
        <label className="space-y-2"><span className="text-xs text-[#8f9bc2]">أكبر من (م.ب)</span><input className="field" dir="ltr" type="number" min="0" value={f.min} onChange={(e) => set('min', e.target.value)} /></label>
        <label className="space-y-2"><span className="text-xs text-[#8f9bc2]">أصغر من (م.ب)</span><input className="field" dir="ltr" type="number" min="0" value={f.max} onChange={(e) => set('max', e.target.value)} /></label>
        <label className="flex items-center gap-2 sm:col-span-2 text-sm text-[#b8c4e8]"><input type="checkbox" className="accent-[#6d7cff]" checked={f.starred} onChange={(e) => set('starred', e.target.checked)} /> المفضلة فقط</label>
      </div>
    </Modal>
  )
}

export function StorageBar({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / limit) * 100))
  return <div className="space-y-1.5"><div className="flex justify-between text-[11px] text-[#8f9bc2]"><span>المساحة المستخدمة</span><span>{formatBytes(used)} / {formatBytes(limit)}</span></div><Progress value={pct} /></div>
}

export { History, TagIcon }
