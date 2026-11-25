import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Cloud, Menu, Search, SlidersHorizontal, Bell, Users, Upload, FolderPlus, LayoutGrid, List,
  ChevronLeft, Home, Star, Trash2, Share2, HardDrive, LogOut, Tag as TagIcon,
  History, MessageSquare, Pencil, Copy, Move, Download, X, Plus,
  Folder, Info, Clock, ArrowUpDown, RefreshCw, FilePlus2,
} from 'lucide-react'
import { del, formatBytes, formatDate, get, patch, post, uploadFile } from '../api'
import type { AppNotification, Item, Space, Tag, User } from '../types'
import { Empty, ItemIcon, Spinner, ToastStack } from './ui'
import {
  MoveDialog, SearchDialog, ShareDialog, StorageBar, TagsDialog, TeamsDialog, TextDialog, VersionsDialog,
} from './Dialogs'
import type { SearchFilters } from './Dialogs'
import { CommentsPanel, Editor, Preview, useItemComments } from './Viewers'

type View = 'drive' | 'starred' | 'trash' | 'shared' | 'search' | 'tag'
type Dialog =
  | { type: 'folder' }
  | { type: 'rename' | 'move' | 'share' | 'versions' | 'tags'; item: Item }
  | null

type Toast = { id: number; text: string; kind: 'ok' | 'err' | 'info' }

export default function DriveApp({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [spaces, setSpaces] = useState<Space[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [spaceId, setSpaceId] = useState('')
  const [folderId, setFolderId] = useState<string | null>(null)
  const [view, setView] = useState<View>('drive')
  const [items, setItems] = useState<Item[]>([])
  const [trail, setTrail] = useState<{ id: string; name: string }[]>([])
  const [filters, setFilters] = useState<SearchFilters | null>(null)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [layout, setLayout] = useState<'grid' | 'list'>('grid')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [preview, setPreview] = useState<Item | null>(null)
  const [editor, setEditor] = useState<Item | null>(null)
  const [detail, setDetail] = useState<Item | null>(null)
  const [showComments, setShowComments] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [uploads, setUploads] = useState<{ name: string; pct: number }[]>([])
  const [dragging, setDragging] = useState(false)
  const [ctx, setCtx] = useState<{ x: number; y: number; item: Item } | null>(null)
  const [sidebar, setSidebar] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [teamsOpen, setTeamsOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [used, setUsed] = useState(0)
  const [query, setQuery] = useState('')
  const [online, setOnline] = useState<{ id: string; name: string }[]>([])
  const ws = useRef<WebSocket | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const toastId = useRef(0)
  const { comments, refresh: refreshComments } = useItemComments(detail?.id || null)

  const notify = useCallback((text: string, kind: 'ok' | 'err' | 'info' = 'ok') => {
    const id = ++toastId.current
    setToasts((t) => [...t, { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200)
  }, [])

  const loadShell = useCallback(async () => {
    try {
      const [s, t, n] = await Promise.all([
        get<{ spaces: Space[] }>('/spaces'), get<{ tags: Tag[] }>('/tags'), get<{ notifications: AppNotification[] }>('/notifications'),
      ])
      setSpaces(s.spaces); setTags(t.tags); setNotifications(n.notifications)
      setSpaceId((current) => current || s.spaces.find((x) => x.kind === 'personal')?.id || s.spaces[0]?.id || '')
    } catch (e: any) { notify(e.message, 'err') }
  }, [notify])

  const loadItems = useCallback(async () => {
    if (!spaceId && view !== 'shared') return
    setLoading(true)
    try {
      let path = ''
      if (view === 'drive') path = `/items?space=${spaceId}&parent=${folderId || ''}`
      else if (view === 'starred') path = `/search?starred=1&space=${spaceId}`
      else if (view === 'trash') path = `/trash?space=${spaceId}`
      else if (view === 'shared') path = '/shared'
      else if (view === 'tag') path = `/search?tag=${tagFilter || ''}`
      else if (view === 'search' && filters) {
        const p = new URLSearchParams()
        Object.entries(filters).forEach(([k, v]) => { if (v !== '' && v !== false && v != null) p.set(k, String(v)) })
        path = `/search?${p}`
      }
      const data = await get<{ items: Item[] }>(path)
      setItems(data.items)
      setSelected([]); setDetail(null)
      if (view === 'drive' && folderId) {
        const b = await get<{ trail: { id: string; name: string }[] }>(`/items/${folderId}/breadcrumb`)
        setTrail(b.trail)
      } else setTrail([])
    } catch (e: any) { notify(e.message, 'err') } finally { setLoading(false) }
  }, [spaceId, folderId, view, filters, tagFilter, notify])

  const loadUsed = useCallback(async () => {
    try {
      const d = await get<{ items: Item[] }>('/search')
      setUsed(d.items.filter((i) => i.kind === 'file').reduce((sum, i) => sum + i.size, 0))
    } catch { /* ignore */ }
  }, [])

  const refresh = useCallback(() => { loadShell(); loadItems(); loadUsed() }, [loadShell, loadItems, loadUsed])

  useEffect(() => { loadShell(); loadUsed() }, [loadShell, loadUsed])
  useEffect(() => { if (spaceId || view === 'shared') loadItems() }, [spaceId, folderId, view, filters, tagFilter, loadItems])

  // realtime
  useEffect(() => {
    const token = localStorage.getItem('sahaba_token')
    if (!token) return
    let socket: WebSocket
    try { socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?token=${encodeURIComponent(token)}`) } catch { return }
    ws.current = socket
    socket.onmessage = (event) => {
      try {
        const { event: name, payload } = JSON.parse(event.data)
        if (name === 'space:changed' || name === 'team:members' || name === 'team:updated') { loadItems(); loadShell(); loadUsed() }
        if (name === 'notification') {
          notify(payload.message, 'info')
          get<{ notifications: AppNotification[] }>('/notifications').then((d) => setNotifications(d.notifications))
        }
        if (name === 'comment:new') { refreshComments(); loadItems() }
        if (name === 'presence') setOnline(payload.users || [])
        if (name === 'doc:changed' && editor?.id === payload.itemId && payload.author !== user.id) notify('تم تعديل الملف من مستخدم آخر', 'info')
      } catch { /* ignore */ }
    }
    return () => { socket.close(); ws.current = null }
  }, [user.id, loadItems, loadShell, loadUsed, refreshComments, notify, editor?.id])

  useEffect(() => {
    if (ws.current?.readyState === WebSocket.OPEN && detail) ws.current.send(JSON.stringify({ event: 'join', itemId: detail.id }))
  }, [detail?.id])

  useEffect(() => {
    const close = () => { setCtx(null); setNotifOpen(false) }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  function navigate(next: View, opts: { space?: string; tag?: string } = {}) {
    setView(next); setFolderId(null); setFilters(null); setTagFilter(null)
    if (opts.space) setSpaceId(opts.space)
    if (opts.tag) setTagFilter(opts.tag)
    setSidebar(false)
  }

  function openItem(item: Item) {
    if (item.kind === 'folder') { setView('drive'); setFolderId(item.id) }
    else setPreview(item)
  }

  async function upload(files: FileList | File[]) {
    const list = Array.from(files)
    if (!list.length) return
    const target = { space: spaceId, parent: view === 'drive' ? folderId : null }
    for (const file of list) {
      setUploads((u) => [...u, { name: file.name, pct: 0 }])
      try {
        await uploadFile(file, target.space, target.parent, (pct) => setUploads((u) => u.map((x) => x.name === file.name ? { ...x, pct } : x)))
        notify(`تم رفع ${file.name}`, 'ok')
      } catch (e: any) { notify(`${file.name}: ${e.message}`, 'err') }
      finally { setUploads((u) => u.filter((x) => x.name !== file.name)) }
    }
    refresh()
  }

  function menuAction(action: string, item: Item) {
    setCtx(null)
    if (action === 'open') openItem(item)
    else if (action === 'download') window.location.href = `/api/items/${item.id}/content`
    else if (action === 'rename') setDialog({ type: 'rename', item })
    else if (action === 'share') setDialog({ type: 'share', item })
    else if (action === 'versions') setDialog({ type: 'versions', item })
    else if (action === 'tags') setDialog({ type: 'tags', item })
    else if (action === 'move') setDialog({ type: 'move', item })
    else if (action === 'copy') post(`/items/${item.id}/copy`, { parentId: folderId }).then(() => { refresh(); notify('تم عمل نسخة', 'ok') }).catch((e) => notify(e.message, 'err'))
    else if (action === 'star') patch(`/items/${item.id}`, { starred: !item.starred }).then(refresh)
    else if (action === 'trash') del(`/items/${item.id}`).then(() => { refresh(); notify('نُقل للسلة', 'ok') }).catch((e) => notify(e.message, 'err'))
    else if (action === 'restore') post(`/items/${item.id}/restore`).then(() => { refresh(); notify('تمت الاستعادة', 'ok') }).catch((e) => notify(e.message, 'err'))
    else if (action === 'delete') del(`/items/${item.id}?permanent=1`).then(() => { refresh(); notify('تم الحذف نهائياً', 'ok') }).catch((e) => notify(e.message, 'err'))
  }

  const ctxMenuItems = useMemo(() => {
    if (!ctx) return []
    const i = ctx.item
    const common = [
      ['open', 'فتح', Folder], ['star', i.starred ? 'إزالة من المفضلة' : 'إضافة للمفضلة', Star],
      ['rename', 'إعادة تسمية', Pencil], ['share', 'مشاركة', Share2], ['tags', 'وسوم', TagIcon],
      ['move', 'نقل', Move], ['copy', 'نسخة', Copy],
    ] as const
    if (view === 'trash') return [['restore', 'استعادة', RefreshCw], ['delete', 'حذف نهائي', Trash2]] as const
    return [...common, ...(i.kind === 'file' ? [['versions', 'الإصدارات', History] as const, ['download', 'تنزيل', Download] as const] : []), ['trash', 'نقل للسلة', Trash2]] as const
  }, [ctx, view])

  const title = view === 'drive' ? (trail.at(-1)?.name || spaces.find((s) => s.id === spaceId)?.name || 'درايفك')
    : view === 'starred' ? 'المفضلة' : view === 'trash' ? 'سلة المهملات' : view === 'shared' ? 'المشاركة معك'
      : view === 'tag' ? `وسم: ${tags.find((t) => t.id === tagFilter)?.name || ''}` : 'نتائج البحث'
  const unread = notifications.filter((n) => !n.read).length

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#080c18] text-[#e8ecff]" onClick={() => setCtx(null)}>
      {sidebar && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setSidebar(false)} />}

      <aside className={`fixed inset-y-0 right-0 z-40 flex w-72 flex-col border-l border-white/10 bg-[#0c1224] transition-transform lg:static lg:z-auto lg:translate-x-0 ${sidebar ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-[#6d7cff] to-[#a855f7] shadow-lg shadow-[#6d7cff]/25"><Cloud size={21} /></div>
          <div><h1 className="gradient-text text-xl font-black">سَحابة</h1><p className="text-[10px] text-[#707ca5]">درايفك المحلي</p></div>
          <button className="mr-auto text-[#8f9bc2] lg:hidden" onClick={() => setSidebar(false)}><X size={18} /></button>
        </div>

        <button className="btn btn-primary mx-4 py-3" onClick={() => fileInput.current?.click()}><Upload size={17} /> رفع ملفات</button>
        <button className="btn btn-ghost mx-4 mt-2 py-2.5" onClick={() => setDialog({ type: 'folder' })}><FolderPlus size={17} /> مجلد جديد</button>

        <nav className="scroll-thin mt-5 flex-1 space-y-1 overflow-auto px-3">
          <p className="px-3 pb-1 text-[10px] font-bold tracking-wide text-[#5f6b93]">المساحات</p>
          <NavButton icon={Home} label="درايفك" active={view === 'drive'} onClick={() => navigate('drive')} />
          <NavButton icon={Users} label="الفرق" active={teamsOpen} onClick={() => setTeamsOpen(true)} badge={spaces.filter((s) => s.kind === 'team').length} />
          <NavButton icon={Share2} label="مشاركة معك" active={view === 'shared'} onClick={() => navigate('shared')} />
          <p className="px-3 pb-1 pt-5 text-[10px] font-bold tracking-wide text-[#5f6b93]">التصنيفات</p>
          <NavButton icon={Star} label="المفضلة" active={view === 'starred'} onClick={() => navigate('starred')} />
          <NavButton icon={Clock} label="سلة المهملات" active={view === 'trash'} onClick={() => navigate('trash')} />
          {tags.length > 0 && <p className="px-3 pb-1 pt-5 text-[10px] font-bold tracking-wide text-[#5f6b93]">الوسوم</p>}
          {tags.map((t) => (
            <button key={t.id} onClick={() => navigate('tag', { tag: t.id })} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${view === 'tag' && tagFilter === t.id ? 'bg-[#6d7cff2e] text-white' : 'text-[#9ca8d0] hover:bg-white/5'}`}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} /><span className="truncate">{t.name}</span>
            </button>
          ))}
          <p className="px-3 pb-1 pt-5 text-[10px] font-bold tracking-wide text-[#5f6b93]">مساحات الفرق</p>
          {spaces.filter((s) => s.kind === 'team').map((s) => (
            <button key={s.id} onClick={() => navigate('drive', { space: s.id })} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${view === 'drive' && spaceId === s.id ? 'bg-[#6d7cff2e] text-white' : 'text-[#9ca8d0] hover:bg-white/5'}`}>
              <Users size={16} className="text-[#9aa9ff]" /><span className="truncate">{s.name}</span>
            </button>
          ))}
        </nav>

        <div className="space-y-3 border-t border-white/10 p-4">
          <StorageBar used={used} limit={user.storageLimit} />
          <div className="flex items-center gap-3 rounded-xl bg-white/5 p-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-full text-sm font-bold" style={{ background: `${user.color}33`, color: user.color }}>{user.name[0]}</div>
            <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{user.name}</p><p className="truncate text-[10px] text-[#7884ad]" dir="ltr">{user.email}</p></div>
            <button title="تسجيل الخروج" className="text-[#8f9bc2] hover:text-rose-300" onClick={onLogout}><LogOut size={16} /></button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-[#0a1020]/80 px-4 py-3 backdrop-blur">
          <button className="rounded-lg p-2 text-[#9aa6ce] hover:bg-white/10 lg:hidden" onClick={() => setSidebar(true)}><Menu size={20} /></button>
          <div className="flex max-w-xl flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 focus-within:border-[#6d7cff]">
            <Search size={17} className="text-[#7e8ab2]" />
            <input className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#66739c]" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث في ملفاتك..." onKeyDown={(e) => {
                if (e.key === 'Enter') { setFilters({ q: query, kind: '', mime: '', tag: '', from: '', to: '', min: '', max: '', starred: false, sort: 'updated' }); setView('search') }
              }} />
            <button title="بحث متقدم" className="text-[#8f9bc2] hover:text-[#aab6ff]" onClick={() => setSearchOpen(true)}><SlidersHorizontal size={17} /></button>
          </div>
          <div className="mr-auto flex items-center gap-1">
            <button className="relative rounded-xl p-2.5 text-[#a4b0d6] hover:bg-white/10" title="الإشعارات" onClick={() => setNotifOpen(!notifOpen)}><Bell size={19} />
              {unread > 0 && <span className="absolute -left-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold">{unread}</span>}</button>
            <button className="hidden rounded-xl p-2.5 text-[#a4b0d6] hover:bg-white/10 sm:block" title="الفرق" onClick={() => setTeamsOpen(true)}><Users size={19} /></button>
          </div>

          {notifOpen && <div className="absolute left-4 top-16 z-50 w-[min(360px,90vw)] overflow-hidden rounded-2xl border border-white/10 bg-[#121a30] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-sm font-bold">
              الإشعارات <button className="text-[11px] text-[#9aa9ff]" onClick={() => patch('/notifications/read', {}).then(loadShell)}>تعليم الكل كمقروء</button></div>
            <div className="scroll-thin max-h-80 overflow-auto">
              {notifications.length === 0 && <p className="p-6 text-center text-xs text-[#7b87b0]">مفيش إشعارات.</p>}
              {notifications.map((n) => (
                <button key={n.id} className={`flex w-full gap-3 border-b border-white/5 px-4 py-3 text-right text-xs ${n.read ? 'opacity-60' : 'bg-[#6d7cff12]'}`}
                  onClick={() => { patch('/notifications/read', { id: n.id }).then(loadShell); if (n.item_id) get<{ item: Item }>(`/items/${n.item_id}`).then((d) => setDetail(d.item)).catch(() => {}) }}>
                  <Bell size={14} className="mt-0.5 shrink-0 text-[#9aa9ff]" /><span className="flex-1">{n.message}<span className="mt-1 block text-[10px] text-[#727ea6]">{formatDate(n.created_at)}</span></span>
                </button>
              ))}
            </div>
          </div>}
        </header>

        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-white/5 px-5 py-4">
          {view === 'drive' && <button className="text-[#9aa6ce] hover:text-white" onClick={() => { setFolderId(null); setView('drive') }} title="الجذر"><Home size={17} /></button>}
          {trail.map((t, i) => (
            <span key={t.id} className="flex items-center gap-2 text-sm">
              {i > 0 && <ChevronLeft size={14} className="text-[#56628c]" />}
              <button className={i === trail.length - 1 ? 'font-bold' : 'text-[#9aa6ce] hover:text-white'} onClick={() => { setFolderId(t.id); setView('drive') }}>{t.name}</button>
            </span>
          ))}
          {view !== 'drive' && <h2 className="text-lg font-bold">{title}</h2>}
          <span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-[#8f9bc2]">{items.length} عنصر</span>
          <div className="mr-auto flex items-center gap-2">
            <button className="btn btn-ghost px-3 py-2 !text-xs" onClick={() => fileInput.current?.click()}><Upload size={15} /> رفع</button>
            <button className="btn btn-ghost px-3 py-2 !text-xs" onClick={() => setDialog({ type: 'folder' })}><FolderPlus size={15} /> مجلد</button>
            <div className="flex rounded-xl border border-white/10 bg-white/5 p-0.5">
              <button className={`rounded-lg p-1.5 ${layout === 'grid' ? 'bg-[#6d7cff33] text-white' : 'text-[#7f8bb4]'}`} onClick={() => setLayout('grid')} title="شبكة"><LayoutGrid size={16} /></button>
              <button className={`rounded-lg p-1.5 ${layout === 'list' ? 'bg-[#6d7cff33] text-white' : 'text-[#7f8bb4]'}`} onClick={() => setLayout('list')} title="قائمة"><List size={16} /></button>
            </div>
          </div>
        </div>

        <div className={`scroll-thin relative min-h-0 flex-1 overflow-auto p-5 ${dragging ? 'drop-active' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false) }}
          onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files) }}>

          {dragging && <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-[#080c18]/70 text-xl font-bold text-[#aab6ff]"><Upload size={40} className="mb-3" /> أفلت الملفات للرفع</div>}
          {loading ? <Spinner label="جاري تحميل الملفات..." /> : items.length === 0 ? (
            <Empty icon={view === 'trash' ? Trash2 : view === 'starred' ? Star : Folder} title={view === 'search' ? 'مفيش نتائج مطابقة' : 'مفيش ملفات هنا'}
              hint="اسحب ملفاتك وأفلتها هنا أو اضغط رفع للبدء."
              action={<button className="btn btn-primary mt-2" onClick={() => fileInput.current?.click()}><FilePlus2 size={16} /> رفع ملفات</button>} />
          ) : layout === 'grid' ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {items.map((item) => (
                <button key={item.id} onClick={(e) => {
                  if (e.ctrlKey || e.metaKey || e.shiftKey) setSelected((s) => s.includes(item.id) ? s.filter((x) => x !== item.id) : [...s, item.id])
                  else { setSelected([item.id]); setDetail(item) }
                }} onDoubleClick={() => openItem(item)}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtx({ x: e.clientX, y: e.clientY, item }); setSelected([item.id]) }}
                  className={`card-hover group relative flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[.035] p-4 text-right ${selected.includes(item.id) ? 'selected' : ''}`}>
                  <button className="absolute left-3 top-3 text-amber-400 opacity-0 transition group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); menuAction('star', item) }} title="مفضلة">
                    <Star size={16} fill={item.starred ? 'currentColor' : 'none'} className={item.starred ? 'opacity-100' : ''} /></button>
                  <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/5"><ItemIcon item={item} size={38} /></div>
                  <div className="w-full"><p className="truncate text-sm font-semibold">{item.name}</p>
                    <p className="mt-1 flex items-center gap-2 text-[10px] text-[#7c88b0]">{formatDate(item.updated_at)}{item.kind === 'file' && <><span>•</span>{formatBytes(item.size)}</>}{item.version > 1 && <><span>•</span>v{item.version}</>}</p></div>
                  <div className="flex w-full items-center gap-2 text-[10px] text-[#7884ad]">
                    {item.tags.slice(0, 2).map((t) => <span key={t.id} className="flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: `${t.color}22`, color: t.color }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: t.color }} />{t.name}</span>)}
                    {item.comments_count > 0 && <span className="mr-auto flex items-center gap-1"><MessageSquare size={11} />{item.comments_count}</span>}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <div className="grid grid-cols-[1fr_120px_140px_100px] gap-3 border-b border-white/10 bg-white/5 px-4 py-2.5 text-xs font-bold text-[#9aa6ce] max-md:grid-cols-[1fr_80px_40px]">
                <span>الاسم</span><span className="max-md:hidden">الحجم</span><span>آخر تعديل</span><span>إجراءات</span>
              </div>
              {items.map((item) => (
                <button key={item.id} onClick={() => { setSelected([item.id]); setDetail(item) }} onDoubleClick={() => openItem(item)}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtx({ x: e.clientX, y: e.clientY, item }) }}
                  className={`grid w-full grid-cols-[1fr_120px_140px_100px] items-center gap-3 border-b border-white/5 px-4 py-2.5 text-right text-sm transition hover:bg-white/5 max-md:grid-cols-[1fr_80px_40px] ${selected.includes(item.id) ? 'bg-[#6d7cff1a]' : ''}`}>
                  <span className="flex min-w-0 items-center gap-3"><ItemIcon item={item} size={25} /><span className="truncate">{item.name}</span>{item.starred && <Star size={13} className="text-amber-400" fill="currentColor" />}</span>
                  <span className="text-xs text-[#8793bb] max-md:hidden">{item.kind === 'file' ? formatBytes(item.size) : '—'}</span>
                  <span className="text-xs text-[#8793bb]">{formatDate(item.updated_at)}</span>
                  <span className="flex gap-1 text-[#8793bb]">
                    <span title="مشاركة" onClick={(e) => { e.stopPropagation(); setDialog({ type: 'share', item }) }}><Share2 size={15} className="hover:text-white" /></span>
                    <span title="إصدارات" onClick={(e) => { e.stopPropagation(); setDialog({ type: 'versions', item }) }}><History size={15} className="hover:text-white" /></span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {uploads.length > 0 && <div className="shrink-0 space-y-2 border-t border-white/10 bg-[#0b1120] px-5 py-3">
          {uploads.map((u) => <div key={u.name} className="flex items-center gap-3 text-xs"><Upload size={13} className="text-[#9aa9ff]" /><span className="w-40 truncate">{u.name}</span><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[#6d7cff] transition-all" style={{ width: `${u.pct}%` }} /></div><span className="w-9 text-left text-[#8f9bc2]">{u.pct}%</span></div>)}
        </div>}
      </div>

      {detail && <aside className="hidden w-80 shrink-0 flex-col border-r border-white/10 bg-[#0c1224] xl:flex">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><h3 className="text-sm font-bold">تفاصيل العنصر</h3>
          <button className="text-[#8f9bc2] hover:text-white" onClick={() => { setDetail(null); setShowComments(false) }}><X size={17} /></button></div>
        <div className="scroll-thin flex-1 overflow-auto">
          <div className="flex flex-col items-center gap-3 border-b border-white/10 px-5 py-6">
            <div className="grid h-20 w-20 place-items-center rounded-2xl bg-white/5"><ItemIcon item={detail} size={44} /></div>
            <p className="text-center text-sm font-bold">{detail.name}</p>
            {online.length > 0 && <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {online.length} يشاهدون الآن</span>}
          </div>
          <div className="grid grid-cols-2 gap-2 p-4">
            <DetailStat icon={HardDrive} label="الحجم" value={detail.kind === 'file' ? formatBytes(detail.size) : 'مجلد'} />
            <DetailStat icon={History} label="الإصدار" value={detail.kind === 'file' ? `${detail.version}` : '—'} />
            <DetailStat icon={Clock} label="الإنشاء" value={formatDate(detail.created_at)} />
            <DetailStat icon={ArrowUpDown} label="التعديل" value={formatDate(detail.updated_at)} />
          </div>
          <div className="space-y-2 px-4 pb-4">
            <p className="text-xs font-bold text-[#9aa6ce]">الوسوم</p>
            <div className="flex flex-wrap gap-2">
              {detail.tags.map((t) => <span key={t.id} className="rounded-full px-2.5 py-1 text-[11px]" style={{ background: `${t.color}25`, color: t.color }}>{t.name}</span>)}
              <button className="rounded-full border border-dashed border-white/20 px-2.5 py-1 text-[11px] text-[#8f9bc2] hover:text-white" onClick={() => setDialog({ type: 'tags', item: detail })}><Plus size={11} className="inline" /> وسم</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-white/10 p-4">
            <button className="btn btn-ghost !text-xs" onClick={() => setDialog({ type: 'share', item: detail })}><Share2 size={14} /> مشاركة</button>
            <button className="btn btn-ghost !text-xs" onClick={() => setDialog({ type: 'versions', item: detail })}><History size={14} /> إصدارات</button>
            {detail.kind === 'file' && <button className="btn btn-ghost !text-xs" onClick={() => setPreview(detail)}><Info size={14} /> معاينة</button>}
            <button className="btn btn-ghost !text-xs" onClick={() => setShowComments(!showComments)}><MessageSquare size={14} /> تعليقات ({detail.comments_count})</button>
          </div>
          {showComments && <div className="h-[420px] border-t border-white/10"><CommentsPanel item={detail} comments={comments} online={online} onRefresh={refreshComments} onClose={() => setShowComments(false)} notify={notify} /></div>}
        </div>
      </aside>}

      {ctx && <div className="fixed inset-0 z-50" onClick={() => setCtx(null)}>
        <div className="absolute w-56 overflow-hidden rounded-xl border border-white/10 bg-[#151d35] p-1.5 shadow-2xl enter" style={{ top: Math.min(ctx.y, window.innerHeight - 380), left: Math.min(ctx.x, window.innerWidth - 240) }}
          onClick={(e) => e.stopPropagation()}>
          {ctxMenuItems.map(([action, label, Icon]: any) => (
            <button key={action} onClick={() => menuAction(action, ctx.item)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-right text-sm hover:bg-white/10 ${action === 'delete' ? 'text-rose-300' : ''}`}><Icon size={15} />{label}</button>
          ))}
        </div>
      </div>}

      <input ref={fileInput} type="file" multiple hidden onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = '' }} />
      <ToastStack toasts={toasts} dismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />

      {dialog?.type === 'folder' && <TextDialog title="مجلد جديد" label="اسم المجلد" placeholder="مثلاً: مشاريع 2026" confirm="إنشاء" onClose={() => setDialog(null)}
        onSave={async (name) => { await post('/items', { name, spaceId, parentId: view === 'drive' ? folderId : null }); refresh() }} />}
      {dialog?.type === 'rename' && <TextDialog title="إعادة التسمية" label="الاسم الجديد" initial={dialog.item.name} onClose={() => setDialog(null)}
        onSave={async (name) => { await patch(`/items/${dialog.item.id}`, { name }); refresh() }} />}
      {dialog?.type === 'move' && <MoveDialog item={dialog.item} space={dialog.item.space_id} onClose={() => setDialog(null)}
        onMove={async (parentId) => { await patch(`/items/${dialog.item.id}`, { parentId }); refresh(); notify('تم النقل', 'ok') }} />}
      {dialog?.type === 'share' && <ShareDialog item={dialog.item} onClose={() => setDialog(null)} notify={notify} />}
      {dialog?.type === 'versions' && <VersionsDialog item={dialog.item} onClose={() => setDialog(null)} notify={notify} />}
      {dialog?.type === 'tags' && <TagsDialog item={dialog.item} tags={tags} onClose={() => setDialog(null)} onChange={() => { loadShell(); loadItems() }} />}
      {searchOpen && <SearchDialog tags={tags} initial={filters || { q: query } as any} onClose={() => setSearchOpen(false)}
        onSearch={(f) => { setFilters(f); setQuery(f.q); setView('search') }} />}
      {teamsOpen && <TeamsDialog onClose={() => { setTeamsOpen(false); loadShell() }} onChange={loadShell} notify={notify} />}
      {preview && <Preview item={preview} onClose={() => setPreview(null)} onEdit={() => { setEditor(preview); setPreview(null) }}
        onVersions={() => { setDialog({ type: 'versions', item: preview }); setPreview(null) }}
        onComments={() => { setDetail(preview); setShowComments(true); setPreview(null) }} />}
      {editor && <Editor item={editor} onClose={() => setEditor(null)} onSaved={() => { refresh(); loadShell() }} notify={notify} />}
    </div>
  )
}

function NavButton({ icon: Icon, label, active, onClick, badge }: { icon: any; label: string; active: boolean; onClick: () => void; badge?: number }) {
  return <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? 'bg-[#6d7cff2e] font-semibold text-white' : 'text-[#9ca8d0] hover:bg-white/5 hover:text-white'}`}>
    <Icon size={17} className={active ? 'text-[#aab6ff]' : ''} /><span className="truncate">{label}</span>
    {!!badge && <span className="mr-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px]">{badge}</span>}
  </button>
}

function DetailStat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-white/5 p-3">
    <Icon size={14} className="mb-2 text-[#8f9bc2]" /><p className="text-[10px] text-[#7884ad]">{label}</p><p className="mt-0.5 truncate text-xs font-semibold">{value}</p>
  </div>
}
