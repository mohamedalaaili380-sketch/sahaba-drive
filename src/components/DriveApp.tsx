import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Cloud, Menu, Search, SlidersHorizontal, Bell, Users, Upload, FolderPlus, LayoutGrid, List,
  ChevronLeft, ChevronRight, Home, Star, Trash2, Share2, HardDrive, LogOut, Tag as TagIcon,
  History, MessageSquare, Pencil, Copy, Move, Download, X, Plus,
  Folder, Info, Clock, ArrowUpDown, RefreshCw, FilePlus2, ShieldCheck,
} from 'lucide-react'
import { contentUrl, del, formatBytes, formatDate, get, patch, post, uploadFile } from '../api'
import type { AppNotification, Item, Space, Tag, User } from '../types'
import { Empty, ItemIcon, SkeletonGrid, ToastStack } from './ui'
import {
  BulkMoveDialog, BulkTagsDialog, MoveDialog, SearchDialog, ShareDialog, StorageBar, TagsDialog,
  TeamsDialog, TextDialog, VersionsDialog,
} from './Dialogs'
import type { SearchFilters } from './Dialogs'
import { CommentsPanel, Editor, Preview, useItemComments } from './Viewers'
import { LangToggle, useLang, useT } from '../i18n'
import AdminPanel from './AdminPanel'

type View = 'drive' | 'starred' | 'trash' | 'shared' | 'search' | 'tag'
type Dialog =
  | { type: 'folder' | 'bulkTags' | 'bulkMove' }
  | { type: 'rename' | 'move' | 'share' | 'versions' | 'tags'; item: Item }
  | null

type Toast = { id: number; text: string; kind: 'ok' | 'err' | 'info' }

export default function DriveApp({ user, onLogout }: { user: User; onLogout: () => void }) {
  const t = useT()
  const { dir } = useLang()
  const Back = dir === 'rtl' ? ChevronLeft : ChevronRight
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
  const [teamsFocusCreate, setTeamsFocusCreate] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [used, setUsed] = useState(0)
  const [query, setQuery] = useState('')
  const [online, setOnline] = useState<{ id: string; name: string }[]>([])
  const [realtime, setRealtime] = useState<'connecting' | 'live' | 'offline'>('connecting')
  const readOnlySpace = () => {
    const current = spaces.find((s) => s.id === spaceId)
    return !!current && !user.isAdmin && current.role === 'viewer'
  }
  const readOnlyMessage = () => t('You have view-only access to this space. Switch to My Drive to add files.', 'عندك صلاحية مشاهدة بس في المساحة دي. روح لدرايفك عشان تضيف ملفات.')
  const ws = useRef<WebSocket | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const toastId = useRef(0)
  const liveRef = useRef(false)
  const detailRef = useRef<string | null>(null)
  const editorIdRef = useRef<string | null>(null)
  const { comments, refresh: refreshComments } = useItemComments(detail?.id || null)

  const notify = useCallback((text: string, kind: 'ok' | 'err' | 'info' = 'ok') => {
    const id = ++toastId.current
    setToasts((current) => [...current, { id, text, kind }])
    setTimeout(() => setToasts((current) => current.filter((x) => x.id !== id)), 4200)
  }, [])

  const loadShell = useCallback(async () => {
    try {
      const [s, tagsData, n] = await Promise.all([
        get<{ spaces: Space[] }>('/spaces'), get<{ tags: Tag[] }>('/tags'), get<{ notifications: AppNotification[] }>('/notifications'),
      ])
      setSpaces(s.spaces); setTags(tagsData.tags); setNotifications(n.notifications)
      setSpaceId((current) => {
        if (s.spaces.some((space) => space.id === current)) return current
        return s.spaces.find((x) => x.kind === 'personal')?.id || s.spaces[0]?.id || ''
      })
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

  const actionsRef = useRef({ loadItems, loadShell, loadUsed, refreshComments, t })
  useEffect(() => { actionsRef.current = { loadItems, loadShell, loadUsed, refreshComments, t } }, [loadItems, loadShell, loadUsed, refreshComments, t])

  const refresh = useCallback(() => { loadShell(); loadItems(); loadUsed() }, [loadShell, loadItems, loadUsed])

  useEffect(() => { loadShell(); loadUsed() }, [loadShell, loadUsed])
  useEffect(() => { if (spaceId || view === 'shared') loadItems() }, [spaceId, folderId, view, filters, tagFilter, loadItems])

  // Realtime with exponential backoff; HTTP polling keeps the view fresh when WebSocket is unavailable.
  useEffect(() => {
    const token = localStorage.getItem('sahaba_token')
    if (!token) { setRealtime('offline'); return }
    let socket: WebSocket | null = null
    let retryTimer: number | undefined
    let attempts = 0
    let stopped = false

    let connect: () => void = () => {}
    const scheduleReconnect = () => {
      if (stopped) return
      attempts += 1
      const wait = Math.min(15000, 1000 * 2 ** Math.min(attempts, 4)) + Math.floor(Math.random() * 400)
      retryTimer = window.setTimeout(connect, wait)
    }

    connect = () => {
      if (stopped) return
      setRealtime('connecting')
      let current: WebSocket
      try {
        current = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?token=${encodeURIComponent(token)}`)
      } catch { scheduleReconnect(); return }
      socket = current
      ws.current = current

      current.onopen = () => {
        attempts = 0
        liveRef.current = true
        setRealtime('live')
        if (detailRef.current) current.send(JSON.stringify({ event: 'join', itemId: detailRef.current }))
      }
      current.onmessage = (event) => {
        try {
          const { event: name, payload } = JSON.parse(event.data)
          const actions = actionsRef.current
          if (name === 'space:changed' || name === 'team:members' || name === 'team:updated') { actions.loadItems(); actions.loadShell(); actions.loadUsed() }
          if (name === 'notification') {
            notify(payload.message, 'info')
            get<{ notifications: AppNotification[] }>('/notifications').then((d) => setNotifications(d.notifications))
          }
          if (name === 'comment:new') { actions.refreshComments(); actions.loadItems() }
          if (name === 'presence') setOnline(payload.users || [])
          if (name === 'doc:changed' && editorIdRef.current === payload.itemId && payload.author !== user.id) notify(actions.t('This file was edited by another user', 'تم تعديل الملف من مستخدم آخر'), 'info')
        } catch { /* ignore */ }
      }
      current.onerror = () => {
        try {
          if (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING) current.close()
        } catch { /* already closing */ }
      }
      current.onclose = () => {
        if (ws.current === current) ws.current = null
        liveRef.current = false
        setOnline([])
        setRealtime('offline')
        scheduleReconnect()
      }
    }

    connect()
    return () => {
      stopped = true
      if (retryTimer) window.clearTimeout(retryTimer)
      liveRef.current = false
      if (socket && socket.readyState !== WebSocket.CLOSED) socket.close()
      ws.current = null
    }
  }, [user.id, notify])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!liveRef.current) {
        const { loadItems, loadShell, loadUsed } = actionsRef.current
        loadShell(); loadItems(); loadUsed()
      }
    }, 30000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => { detailRef.current = detail?.id || null }, [detail?.id])
  useEffect(() => { editorIdRef.current = editor?.id || null }, [editor?.id])

  useEffect(() => {
    const socket = ws.current
    if (socket?.readyState === WebSocket.OPEN && detailRef.current) socket.send(JSON.stringify({ event: 'join', itemId: detailRef.current }))
  }, [detail?.id])

  useEffect(() => {
    const close = () => { setCtx(null); setNotifOpen(false) }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const typing = el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
      if (typing) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        if (items.length) setSelected(items.map((i) => i.id))
      } else if (e.key === 'Escape') setSelected([])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [items])

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
    if (readOnlySpace()) return notify(readOnlyMessage(), 'err')
    const target = { space: spaceId, parent: view === 'drive' ? folderId : null }
    let redirected = false
    for (const file of list) {
      setUploads((current) => [...current, { name: file.name, pct: 0 }])
      try {
        const result = await uploadFile(file, target.space, target.parent, (pct) => setUploads((current) => current.map((x) => x.name === file.name ? { ...x, pct } : x)))
        notify(t('Uploaded {name}', 'تم رفع {name}', { name: file.name }), 'ok')
        const saved = result?.item
        if (saved?.space_id && (saved.space_id !== target.space || saved.parent_id !== target.parent)) {
          setSpaceId(saved.space_id)
          setView('drive')
          setFolderId(saved.parent_id || null)
          if (!redirected) {
            notify(t('Saved in My Drive so you can see it', 'اتحفظ في درايفك عشان تشوفه'), 'ok')
            redirected = true
          }
        }
      } catch (e: any) { notify(`${file.name}: ${e.message}`, 'err') }
      finally { setUploads((current) => current.filter((x) => x.name !== file.name)) }
    }
    refresh()
  }

  function menuAction(action: string, item: Item) {
    setCtx(null)
    if (['rename', 'share', 'versions', 'tags', 'move', 'copy', 'star', 'trash', 'restore', 'delete'].includes(action) && readOnlySpace()) return notify(readOnlyMessage(), 'err')
    if (action === 'open') openItem(item)
    else if (action === 'download') window.location.href = `/api/items/${item.id}/content`
    else if (action === 'rename') setDialog({ type: 'rename', item })
    else if (action === 'share') setDialog({ type: 'share', item })
    else if (action === 'versions') setDialog({ type: 'versions', item })
    else if (action === 'tags') setDialog({ type: 'tags', item })
    else if (action === 'move') setDialog({ type: 'move', item })
    else if (action === 'copy') post(`/items/${item.id}/copy`, { parentId: folderId }).then(() => { refresh(); notify(t('Copy created', 'تم عمل نسخة'), 'ok') }).catch((e) => notify(e.message, 'err'))
    else if (action === 'star') patch(`/items/${item.id}`, { starred: !item.starred }).then(refresh)
    else if (action === 'trash') del(`/items/${item.id}`).then(() => { refresh(); notify(t('Moved to trash', 'نُقل للسلة'), 'ok') }).catch((e) => notify(e.message, 'err'))
    else if (action === 'restore') post(`/items/${item.id}/restore`).then(() => { refresh(); notify(t('Restored', 'تمت الاستعادة'), 'ok') }).catch((e) => notify(e.message, 'err'))
    else if (action === 'delete') del(`/items/${item.id}?permanent=1`).then(() => { refresh(); notify(t('Permanently deleted', 'تم الحذف نهائياً'), 'ok') }).catch((e) => notify(e.message, 'err'))
  }

  async function runBulk(action: string, extra: Record<string, unknown> = {}, done?: (count: number) => string) {
    if (!selected.length || bulkBusy) return
    if (readOnlySpace()) return notify(readOnlyMessage(), 'err')
    setBulkBusy(true)
    try {
      const result = await post<{ count: number }>('/items/bulk', { action, ids: selected, ...extra })
      setSelected([]); setDetail(null)
      refresh()
      notify(done ? done(result.count) : t('Done', 'تم التنفيذ'), 'ok')
    } catch (e: any) {
      notify(e.message, 'err')
    } finally {
      setBulkBusy(false)
    }
  }

  async function bulkDownload() {
    if (!selectedFiles.length) return notify(t('No files to download', 'مفيش ملفات للتنزيل'), 'info')
    notify(t('Downloading {n} files', 'جاري تنزيل {n} ملف', { n: selectedFiles.length }), 'info')
    for (const [i, item] of selectedFiles.entries()) {
      const a = document.createElement('a')
      a.href = contentUrl(item.id)
      a.download = item.name
      document.body.appendChild(a)
      a.click()
      a.remove()
      if (i < selectedFiles.length - 1) await new Promise((r) => setTimeout(r, 200))
    }
  }

  function requestBulkMove() {
    if (!sameSpace) return notify(t('All selected items must be in the same space', 'كل العناصر المحدد لازم تكون في نفس المساحة'), 'err')
    setDialog({ type: 'bulkMove' })
  }

  const displaySpace = (name: string) => t(name === 'درايفي' ? 'My Drive' : name, name)

  const ctxMenuItems = useMemo(() => {
    if (!ctx) return []
    const i = ctx.item
    const common = [
      ['open', t('Open', 'فتح'), Folder],
      ['star', i.starred ? t('Remove from starred', 'إزالة من المفضلة') : t('Add to starred', 'إضافة للمفضلة'), Star],
      ['rename', t('Rename', 'إعادة تسمية'), Pencil], ['share', t('Share', 'مشاركة'), Share2],
      ['tags', t('Tags', 'وسوم'), TagIcon], ['move', t('Move', 'نقل'), Move], ['copy', t('Copy', 'نسخة'), Copy],
    ] as const
    if (view === 'trash') return [['restore', t('Restore', 'استعادة'), RefreshCw], ['delete', t('Delete permanently', 'حذف نهائي'), Trash2]] as const
    return [...common, ...(i.kind === 'file' ? [['versions', t('Versions', 'الإصدارات'), History] as const, ['download', t('Download', 'تنزيل'), Download] as const] : []), ['trash', t('Move to trash', 'نقل للسلة'), Trash2]] as const
  }, [ctx, view, t])

  const spaceName = spaces.find((s) => s.id === spaceId)?.name || ''
  const title = view === 'drive' ? (trail.at(-1)?.name || displaySpace(spaceName) || t('My Drive', 'درايفك'))
    : view === 'starred' ? t('Starred', 'المفضلة')
      : view === 'trash' ? t('Trash', 'سلة المهملات')
        : view === 'shared' ? t('Shared with me', 'المشاركة معك')
          : view === 'tag' ? t('Tag: {name}', 'وسم: {name}', { name: tags.find((tag) => tag.id === tagFilter)?.name || '' })
            : t('Search results', 'نتائج البحث')
  const unread = notifications.filter((n) => !n.read).length
  const readOnly = readOnlySpace()
  const statusLabel = realtime === 'live' ? t('Live', 'متصل')
    : realtime === 'connecting' ? t('Connecting…', 'جاري الاتصال...')
      : t('Offline · retrying', 'غير متصل · إعادة المحاولة')
  const selectedItems = useMemo(() => items.filter((i) => selected.includes(i.id)), [items, selected])
  const selectedFiles = selectedItems.filter((i) => i.kind === 'file')
  const allSelected = items.length > 0 && selected.length === items.length
  const allStarred = selectedItems.length > 0 && selectedItems.every((i) => i.starred)
  const sameSpace = selectedItems.length > 0 && selectedItems.every((i) => i.space_id === selectedItems[0].space_id)

  return (
    <div className="sahaba-shell flex h-full w-full overflow-hidden bg-[#080c18] text-[#e8ecff]" onClick={() => setCtx(null)}>
      {sidebar && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setSidebar(false)} />}

      <aside className={`sahaba-side fixed inset-y-0 end-0 z-40 flex w-72 flex-col border-s border-white/10 bg-[#0c1224] transition-transform lg:static lg:z-auto lg:translate-x-0 ${sidebar ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="sahaba-sidebar-brand flex items-center gap-3 px-5 py-5">
          <div className="sahaba-brand-mark grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-[#7c6cff] via-[#5b8cff] to-[#35d6d0] shadow-lg shadow-[#6d7cff]/25"><Cloud size={21} /></div>
          <div><h1 className="text-xl font-black tracking-tight text-white">Sahaba</h1><p className="side-sub text-[10px]">{t('Your drive', 'درايفك المحلي')}</p></div>
          <button className="ms-auto text-[#8f9bc2] lg:hidden" onClick={() => setSidebar(false)}><X size={18} /></button>
        </div>

        <nav className="scroll-thin mt-6 flex-1 space-y-1 overflow-auto px-3">
          <p className="sahaba-section-title px-3 pb-1 text-[10px] font-bold">{t('Spaces', 'المساحات')}</p>
          <NavButton icon={Home} label={t('My Drive', 'درايفك')} active={view === 'drive'} onClick={() => navigate('drive')} />
          <NavButton icon={Users} label={t('Departments', 'الإدارات')} active={teamsOpen} onClick={() => setTeamsOpen(true)} badge={spaces.filter((s) => s.kind === 'team').length} />
          <NavButton icon={Share2} label={t('Shared with me', 'مشاركة معك')} active={view === 'shared'} onClick={() => navigate('shared')} />
          <p className="sahaba-section-title px-3 pb-1 pt-5 text-[10px] font-bold">{t('Categories', 'التصنيفات')}</p>
          <NavButton icon={Star} label={t('Starred', 'المفضلة')} active={view === 'starred'} onClick={() => navigate('starred')} />
          <NavButton icon={Clock} label={t('Trash', 'سلة المهملات')} active={view === 'trash'} onClick={() => navigate('trash')} />
          {user.isSuperAdmin && <NavButton icon={ShieldCheck} label={t('Admin console', 'لوحة التحكم')} active={adminOpen} onClick={() => setAdminOpen(true)} />}
          {tags.length > 0 && <p className="sahaba-section-title px-3 pb-1 pt-5 text-[10px] font-bold">{t('Tags', 'الوسوم')}</p>}
          {tags.map((tag) => (
            <button key={tag.id} onClick={() => navigate('tag', { tag: tag.id })} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${view === 'tag' && tagFilter === tag.id ? 'bg-[#6d7cff2e] text-white' : 'text-[#9ca8d0] hover:bg-white/5'}`}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: tag.color }} /><span className="truncate">{tag.name}</span>
            </button>
          ))}
          <div className="flex items-center gap-1 px-3 pb-1 pt-5">
            <p className="sahaba-section-title flex-1 text-[10px] font-bold">{t('Departments', 'الإدارات')}</p>
            <button className="rounded-lg p-1 text-[#8f9bc2] transition hover:bg-white/5 hover:text-white"
              title={t('New department', 'إدارة جديدة')}
              onClick={() => { setTeamsFocusCreate(true); setTeamsOpen(true) }}><Plus size={14} /></button>
          </div>
          {spaces.filter((s) => s.kind === 'team').map((s) => (
            <button key={s.id} onClick={() => navigate('drive', { space: s.id })} className={`sahaba-nav flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${view === 'drive' && spaceId === s.id ? 'active' : ''}`}>
              <Users size={16} className="text-[#9aa9ff]" /><span className="truncate">{displaySpace(s.name)}</span>
            </button>
          ))}
        </nav>

        <div className="space-y-3 border-t border-white/10 p-4">
          <StorageBar used={used} limit={user.storageLimit} />
          <div className="flex items-center gap-3 rounded-xl bg-white/5 p-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-full text-sm font-bold" style={{ background: `${user.color}33`, color: user.color }}>{user.name[0]}</div>
            <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{user.name}{user.isSuperAdmin && <span className="ms-1 text-[10px] text-amber-300">· {t('Admin', 'مدير')}</span>}</p><p className="truncate text-[10px] text-[#7884ad]" dir="ltr">{user.email}</p></div>
            <button title={t('Sign out', 'تسجيل الخروج')} className="text-[#8f9bc2] hover:text-rose-300" onClick={onLogout}><LogOut size={16} /></button>
          </div>
        </div>
      </aside>

      <div className="sahaba-main flex min-w-0 flex-1 flex-col">
        <header className="sahaba-topbar flex shrink-0 items-center gap-2 border-b border-white/10 bg-[#0a1020]/80 px-4 py-3 backdrop-blur">
          <button className="sahaba-iconbtn rounded-lg p-2 lg:hidden" onClick={() => setSidebar(true)}><Menu size={20} /></button>
          <div className="sahaba-search flex max-w-xl flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 focus-within:border-[#7c6cff]">
            <Search size={17} className="text-[#7e8ab2]" />
            <input className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#66739c]" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={t('Search your files…', 'ابحث في ملفاتك...')} onKeyDown={(e) => {
                if (e.key === 'Enter') { setFilters({ q: query, kind: '', mime: '', tag: '', from: '', to: '', min: '', max: '', starred: false, sort: 'updated' }); setView('search') }
              }} />
            <button title={t('Advanced search', 'بحث متقدم')} className="text-[#8f9bc2] hover:text-[#7c6cff]" onClick={() => setSearchOpen(true)}><SlidersHorizontal size={17} /></button>
          </div>
          <div className="ms-auto flex items-center gap-1">
            <span className="sahaba-lang"><LangToggle /></span>
            <button className="sahaba-iconbtn relative rounded-xl p-2.5" title={t('Notifications', 'الإشعارات')} onClick={() => setNotifOpen(!notifOpen)}><Bell size={19} />
              {unread > 0 && <span className="absolute -start-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">{unread}</span>}</button>
            <button className="sahaba-iconbtn hidden rounded-xl p-2.5 sm:block" title={t('Departments', 'الإدارات')} onClick={() => setTeamsOpen(true)}><Users size={19} /></button>
            {user.isSuperAdmin && <button className="sahaba-iconbtn hidden rounded-xl p-2.5 sm:block" title={t('Admin console', 'لوحة التحكم')} onClick={() => setAdminOpen(true)}><ShieldCheck size={19} /></button>}
          </div>

          {notifOpen && <div className="sahaba-popover absolute start-4 top-16 z-50 w-[min(360px,90vw)] overflow-hidden rounded-2xl border border-white/10 bg-[#121a30] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-sm font-bold">
              {t('Notifications', 'الإشعارات')} <button className="text-[11px] text-[#9aa9ff]" onClick={() => patch('/notifications/read', {}).then(loadShell)}>{t('Mark all as read', 'تعليم الكل كمقروء')}</button></div>
            <div className="scroll-thin max-h-80 overflow-auto">
              {notifications.length === 0 && <p className="p-6 text-center text-xs text-[#7b87b0]">{t('No notifications.', 'مفيش إشعارات.')}</p>}
              {notifications.map((n) => (
                <button key={n.id} className={`flex w-full gap-3 border-b border-white/5 px-4 py-3 text-start text-xs ${n.read ? 'opacity-60' : 'bg-[#6d7cff12]'}`}
                  onClick={() => { patch('/notifications/read', { id: n.id }).then(loadShell); if (n.item_id) get<{ item: Item }>(`/items/${n.item_id}`).then((d) => setDetail(d.item)).catch(() => {}) }}>
                  <Bell size={14} className="mt-0.5 shrink-0 text-[#9aa9ff]" /><span className="flex-1">{n.message}<span className="mt-1 block text-[10px] text-[#727ea6]">{formatDate(n.created_at)}</span></span>
                </button>
              ))}
            </div>
          </div>}
        </header>

        <section className="sahaba-hero flex shrink-0 flex-wrap items-end justify-between gap-4 border-b border-[#e8ebf4] px-5 py-5 sm:px-6" aria-labelledby="sahaba-view-title">
          <div className="min-w-0">
            <p className="sahaba-eyebrow">{t('Workspace', 'مساحة العمل')}</p>
            <h2 id="sahaba-view-title" className="sahaba-hero-title">{view === 'drive' ? (trail.at(-1)?.name || displaySpace(spaceName) || t('My Drive', 'درايفك')) : title}</h2>
            <p className="sahaba-hero-sub">{readOnly ? readOnlyMessage() : t('Everything you keep, organized and ready to share.', 'كل ملفاتك منظمة وجاهزة للمشاركة.')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="sahaba-hero-status flex items-center gap-2" title={statusLabel}><i className={`sahaba-live ${realtime === 'live' ? 'on' : ''}`} aria-hidden="true" />{statusLabel}</span>
            <button className="btn btn-ghost px-3 py-2 !text-xs" disabled={readOnly} title={readOnly ? readOnlyMessage() : undefined} onClick={() => setDialog({ type: 'folder' })}><FolderPlus size={15} /> {t('New folder', 'مجلد جديد')}</button>
            <button className="btn btn-primary sahaba-hero-cta" disabled={readOnly} title={readOnly ? readOnlyMessage() : undefined} onClick={() => fileInput.current?.click()}><Upload size={17} /> {t('Upload files', 'رفع ملفات')}</button>
          </div>
        </section>

        <div className="sahaba-toolbar flex shrink-0 flex-wrap items-center gap-3 border-b border-white/5 px-5 py-3">
          {view === 'drive' && <button className="sahaba-muted" onClick={() => { setFolderId(null); setView('drive') }} title={t('Root', 'الجذر')}><Home size={17} /></button>}
          {trail.map((crumb, i) => (
            <span key={crumb.id} className="flex items-center gap-2 text-sm">
              {i > 0 && <Back size={14} className="text-[#56628c]" />}
              <button className={i === trail.length - 1 ? 'active font-bold' : 'sahaba-crumb'} onClick={() => { setFolderId(crumb.id); setView('drive') }}>{crumb.name}</button>
            </span>
          ))}
          <span className="sahaba-pill rounded-full px-2.5 py-1 text-[11px]">{t('{n} items', '{n} عنصر', { n: items.length })}</span>
          {selected.length > 0 && <div className="sahaba-selection flex flex-wrap items-center gap-1 rounded-xl border border-[#6d7cff]/40 bg-[#6d7cff12] px-2 py-1">
            <span className="px-1 text-[11px] font-bold text-[#aab6ff]">{t('{n} selected', '{n} محدد', { n: selected.length })}</span>
            <button disabled={bulkBusy} className="rounded-lg px-2 py-1 text-[11px] text-[#9aa6ce] hover:bg-white/10 disabled:opacity-40"
              onClick={() => setSelected(allSelected ? [] : items.map((i) => i.id))}>{allSelected ? t('Clear all', 'إلغاء الكل') : t('Select all', 'تحديد الكل')}</button>
            <span className="sahaba-selection-divider mx-1 h-4 w-px bg-white/10" />
            {bulkBusy ? <span className="px-2 text-[11px] text-[#9aa9ff]">{t('Working…', 'جاري التنفيذ...')}</span> : view === 'trash' ? <>
              <button className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-[#b8c4e8] hover:bg-white/10" onClick={() => runBulk('restore', {}, (n) => t('{n} items restored', 'تمت استعادة {n} عنصر', { n }))}><RefreshCw size={13} /> {t('Restore', 'استعادة')}</button>
              <button className="sahaba-danger flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-rose-300 hover:bg-white/10" onClick={() => runBulk('delete', {}, (n) => t('{n} items permanently deleted', 'تم حذف {n} عنصر نهائياً', { n }))}><Trash2 size={13} /> {t('Delete permanently', 'حذف نهائي')}</button>
            </> : <>
              <button disabled={!selectedFiles.length} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-[#b8c4e8] hover:bg-white/10 disabled:opacity-40" onClick={bulkDownload}><Download size={13} /> {t('Download', 'تنزيل')}</button>
              <button className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-[#b8c4e8] hover:bg-white/10" onClick={() => runBulk(allStarred ? 'unstar' : 'star', {}, (n) => t('{n} items updated', 'تم تحديث {n} عنصر', { n }))}><Star size={13} fill={allStarred ? 'currentColor' : 'none'} /> {allStarred ? t('Remove star', 'إزالة المفضلة') : t('Star', 'مفضلة')}</button>
              <button className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-[#b8c4e8] hover:bg-white/10" onClick={() => setDialog({ type: 'bulkTags' })}><TagIcon size={13} /> {t('Tags', 'وسوم')}</button>
              <button className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-[#b8c4e8] hover:bg-white/10" onClick={requestBulkMove}><Move size={13} /> {t('Move', 'نقل')}</button>
              <button className="sahaba-danger flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-rose-300 hover:bg-white/10" onClick={() => runBulk('trash', {}, (n) => t('{n} items moved to trash', 'نُقل {n} عنصر للسلة', { n }))}><Trash2 size={13} /> {t('Trash', 'سلة')}</button>
            </>}
            <button className="rounded-lg p-1 text-[#8f9bc2] hover:bg-white/10" title={t('Clear selection', 'إلغاء التحديد')} onClick={() => { setSelected([]); setDetail(null) }}><X size={14} /></button>
          </div>}
          <div className="ms-auto flex items-center gap-2">
            <div className="sahaba-layout flex rounded-xl border border-white/10 bg-white/5 p-0.5">
              <button className={`rounded-lg p-1.5 ${layout === 'grid' ? 'active' : ''}`} onClick={() => setLayout('grid')} title={t('Grid', 'شبكة')}><LayoutGrid size={16} /></button>
              <button className={`rounded-lg p-1.5 ${layout === 'list' ? 'active' : ''}`} onClick={() => setLayout('list')} title={t('List', 'قائمة')}><List size={16} /></button>
            </div>
          </div>
        </div>

        <div className={`sahaba-canvas scroll-thin relative min-h-0 flex-1 overflow-auto p-5 ${dragging ? 'drop-active' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false) }}
          onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files) }}>

          {dragging && <div className="sahaba-drop pointer-events-none absolute inset-0 z-20 grid place-items-center text-xl font-bold"><Upload size={40} className="mb-3" /> {t('Drop files to upload', 'أفلت الملفات للرفع')}</div>}
          {!loading && view === 'drive' && !folderId && items.length > 0 && <div className="sahaba-banner mb-5 flex items-center gap-4 rounded-2xl px-5 py-4 text-white">
            <div className="sahaba-banner-icon grid h-10 w-10 shrink-0 place-items-center rounded-xl"><Upload size={19} /></div>
            <div className="min-w-0"><b className="block text-[13px]">{t('Your files are safely in your drive', 'ملفاتك محفوظة بأمان في درايفك')}</b><span className="mt-1 block text-[11px]">{formatBytes(used)} / {formatBytes(user.storageLimit)} · {t('Synced automatically', 'مزامنة تلقائياً')}</span></div>
            <span className="ms-auto shrink-0 rounded-full bg-white/15 px-3 py-1.5 text-[11px]">{t('All good', 'كل تمام')}</span>
          </div>}
          <div className="sahaba-empty-wrap" aria-busy={loading}>
            {loading ? <SkeletonGrid /> : items.length === 0 ? (
              <Empty
                icon={view === 'trash' ? Trash2 : view === 'starred' ? Star : Folder}
                title={view === 'search' || view === 'tag' ? t('No matching results', 'مفيش نتائج مطابقة') : t('Nothing here yet', 'مفيش ملفات هنا')}
                hint={view === 'trash'
                  ? t('Files you delete will appear here.', 'الملفات اللي تحذفها هتظهر هنا.')
                  : view === 'starred'
                    ? t('Star a file to keep it close at hand.', 'ضيف ملف للمفضلة عشان تلاقيه بسرعة.')
                    : view === 'search' || view === 'tag'
                      ? t('Try a different search or clear your filters.', 'جرّب بحث تاني أو امسح الفلاتر.')
                      : t('Drag your files here or press Upload to get started.', 'اسحب ملفاتك وأفلتها هنا أو اضغط رفع للبدء.')}
                action={view === 'trash' ? null : <button className="btn btn-primary mt-2" onClick={() => fileInput.current?.click()}><FilePlus2 size={16} /> {t('Upload files', 'رفع ملفات')}</button>}
              />
            ) : layout === 'grid' ? (
            <div className="sahaba-grid grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {items.map((item) => (
                <div key={item.id} role="button" tabIndex={0} aria-label={item.name} aria-pressed={selected.includes(item.id)}
                  onClick={(e) => {
                    if (e.ctrlKey || e.metaKey || e.shiftKey) setSelected((s) => s.includes(item.id) ? s.filter((x) => x !== item.id) : [...s, item.id])
                    else { setSelected([item.id]); setDetail(item) }
                  }}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected([item.id]); setDetail(item) }
                  }}
                  onDoubleClick={() => openItem(item)}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtx({ x: e.clientX, y: e.clientY, item }); setSelected([item.id]) }}
                  className={`sahaba-file card-hover group relative flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[.035] p-4 text-start ${selected.includes(item.id) ? 'selected' : ''}`}>
                  <button type="button" aria-label={t('Star', 'مفضلة')} className={`absolute start-3 top-3 text-amber-400 transition ${item.starred ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`} onClick={(e) => { e.stopPropagation(); menuAction('star', item) }} title={t('Star', 'مفضلة')}>
                    <Star size={16} fill={item.starred ? 'currentColor' : 'none'} /></button>
                  <div className="sahaba-thumb grid h-16 w-16 place-items-center"><ItemIcon item={item} size={38} /></div>
                  <div className="w-full"><p className="truncate text-sm font-semibold">{item.name}</p>
                    <p className="sahaba-meta mt-1 flex items-center gap-2 text-[10px] text-[#7c88b0]">{formatDate(item.updated_at)}{item.kind === 'file' && <><span>•</span>{formatBytes(item.size)}</>}{item.version > 1 && <><span>•</span>v{item.version}</>}</p></div>
                  <div className="flex w-full items-center gap-2 text-[10px] text-[#7884ad]">
                    {item.tags.slice(0, 2).map((tag) => <span key={tag.id} className="flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: `${tag.color}22`, color: tag.color }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: tag.color }} />{tag.name}</span>)}
                    {item.comments_count > 0 && <span className="ms-auto flex items-center gap-1"><MessageSquare size={11} />{item.comments_count}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="sahaba-list overflow-hidden rounded-2xl border border-white/10">
              <div className="sahaba-list-head grid grid-cols-[1fr_120px_140px_100px] gap-3 border-b border-white/10 bg-white/5 px-4 py-2.5 text-xs font-bold text-[#9aa6ce] max-md:grid-cols-[1fr_80px_40px]">
                <span>{t('Name', 'الاسم')}</span><span className="max-md:hidden">{t('Size', 'الحجم')}</span><span>{t('Last modified', 'آخر تعديل')}</span><span>{t('Actions', 'إجراءات')}</span>
              </div>
              {items.map((item) => (
                <div key={item.id} role="button" tabIndex={0} aria-label={item.name} aria-pressed={selected.includes(item.id)}
                  onClick={(e) => {
                    if (e.target instanceof HTMLButtonElement) return
                    if (e.ctrlKey || e.metaKey || e.shiftKey) setSelected((s) => s.includes(item.id) ? s.filter((x) => x !== item.id) : [...s, item.id])
                    else { setSelected([item.id]); setDetail(item) }
                  }}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected([item.id]); setDetail(item) }
                  }}
                  onDoubleClick={() => openItem(item)}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtx({ x: e.clientX, y: e.clientY, item }); setSelected([item.id]) }}
                  className={`sahaba-list-row grid w-full grid-cols-[1fr_120px_140px_100px] items-center gap-3 border-b border-white/5 px-4 py-2.5 text-start text-sm transition hover:bg-white/5 max-md:grid-cols-[1fr_80px_40px] ${selected.includes(item.id) ? 'bg-[#6d7cff1a]' : ''}`}>
                  <span className="flex min-w-0 items-center gap-3"><ItemIcon item={item} size={25} /><span className="truncate">{item.name}</span>{item.starred && <Star size={13} className="text-amber-400" fill="currentColor" />}</span>
                  <span className="sahaba-meta text-xs text-[#5f6b8a] max-md:hidden">{item.kind === 'file' ? formatBytes(item.size) : '—'}</span>
                  <span className="sahaba-meta text-xs text-[#5f6b8a]">{formatDate(item.updated_at)}</span>
                  <span className="flex gap-1">
                    <button type="button" title={t('Share', 'مشاركة')} aria-label={t('Share', 'مشاركة')} className="rounded-md p-1 text-[#5f6b8a] transition hover:bg-white/60 hover:text-[#5b4bd6]" onClick={(e) => { e.stopPropagation(); setDialog({ type: 'share', item }) }}><Share2 size={15} /></button>
                    <button type="button" title={t('Versions', 'إصدارات')} aria-label={t('Versions', 'إصدارات')} className="rounded-md p-1 text-[#5f6b8a] transition hover:bg-white/60 hover:text-[#5b4bd6]" onClick={(e) => { e.stopPropagation(); setDialog({ type: 'versions', item }) }}><History size={15} /></button>
                  </span>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>

        {uploads.length > 0 && <div className="sahaba-uploads shrink-0 space-y-2 border-t border-white/10 bg-[#0b1120] px-5 py-3">
          {uploads.map((u) => <div key={u.name} className="flex items-center gap-3 text-xs"><Upload size={13} className="text-[#9aa9ff]" /><span className="w-40 truncate">{u.name}</span><div className="sahaba-upload-track h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full transition-all" style={{ width: `${u.pct}%` }} /></div><span className="w-9 text-end text-[#8f9bc2]">{u.pct}%</span></div>)}
        </div>}
      </div>

      {detail && <aside className="sahaba-detail hidden w-80 shrink-0 flex-col border-s border-white/10 bg-[#0c1224] xl:flex">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><h3 className="text-sm font-bold">{t('Item details', 'تفاصيل العنصر')}</h3>
          <button className="text-[#8f9bc2] hover:text-white" onClick={() => { setDetail(null); setShowComments(false) }}><X size={17} /></button></div>
        <div className="scroll-thin flex-1 overflow-auto">
          <div className="flex flex-col items-center gap-3 border-b border-white/10 px-5 py-6">
            <div className="grid h-20 w-20 place-items-center rounded-2xl bg-white/5"><ItemIcon item={detail} size={44} /></div>
            <p className="text-center text-sm font-bold">{detail.name}</p>
            {online.length > 0 && <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {t('{n} viewing now', '{n} يشاهدون الآن', { n: online.length })}</span>}
          </div>
          <div className="grid grid-cols-2 gap-2 p-4">
            <DetailStat icon={HardDrive} label={t('Size', 'الحجم')} value={detail.kind === 'file' ? formatBytes(detail.size) : t('Folder', 'مجلد')} />
            <DetailStat icon={History} label={t('Version', 'الإصدار')} value={detail.kind === 'file' ? `${detail.version}` : '—'} />
            <DetailStat icon={Clock} label={t('Created', 'الإنشاء')} value={formatDate(detail.created_at)} />
            <DetailStat icon={ArrowUpDown} label={t('Modified', 'التعديل')} value={formatDate(detail.updated_at)} />
          </div>
          <div className="space-y-2 px-4 pb-4">
            <p className="text-xs font-bold text-[#9aa6ce]">{t('Tags', 'الوسوم')}</p>
            <div className="flex flex-wrap gap-2">
              {detail.tags.map((tag) => <span key={tag.id} className="rounded-full px-2.5 py-1 text-[11px]" style={{ background: `${tag.color}25`, color: tag.color }}>{tag.name}</span>)}
              <button className="rounded-full border border-dashed border-white/20 px-2.5 py-1 text-[11px] text-[#8f9bc2] hover:text-white" disabled={readOnly} title={readOnly ? readOnlyMessage() : undefined} onClick={() => setDialog({ type: 'tags', item: detail })}><Plus size={11} className="inline" /> {t('Tag', 'وسم')}</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-white/10 p-4">
            <button className="btn btn-ghost !text-xs" disabled={readOnly} title={readOnly ? readOnlyMessage() : undefined} onClick={() => setDialog({ type: 'share', item: detail })}><Share2 size={14} /> {t('Share', 'مشاركة')}</button>
            <button className="btn btn-ghost !text-xs" disabled={readOnly} title={readOnly ? readOnlyMessage() : undefined} onClick={() => setDialog({ type: 'versions', item: detail })}><History size={14} /> {t('Versions', 'إصدارات')}</button>
            {detail.kind === 'file' && <button className="btn btn-ghost !text-xs" onClick={() => setPreview(detail)}><Info size={14} /> {t('Preview', 'معاينة')}</button>}
            <button className="btn btn-ghost !text-xs" onClick={() => setShowComments(!showComments)}><MessageSquare size={14} /> {t('Comments ({n})', 'تعليقات ({n})', { n: detail.comments_count })}</button>
          </div>
          {showComments && <div className="h-[420px] border-t border-white/10"><CommentsPanel item={detail} comments={comments} online={online} onRefresh={refreshComments} onClose={() => setShowComments(false)} notify={notify} /></div>}
        </div>
      </aside>}

      {ctx && <div className="fixed inset-0 z-50" onClick={() => setCtx(null)}>
        <div className="absolute w-56 overflow-hidden rounded-xl border border-white/10 bg-[#151d35] p-1.5 shadow-2xl enter" style={{ top: Math.min(ctx.y, window.innerHeight - 380), left: Math.min(ctx.x, window.innerWidth - 240) }}
          onClick={(e) => e.stopPropagation()}>
          {ctxMenuItems.map(([action, label, Icon]: any) => (
            <button key={action} onClick={() => menuAction(action, ctx.item)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start text-sm hover:bg-white/10 ${action === 'delete' ? 'text-rose-300' : ''}`}><Icon size={15} />{label}</button>
          ))}
        </div>
      </div>}

      <input ref={fileInput} type="file" multiple hidden onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = '' }} />
      <ToastStack toasts={toasts} dismiss={(id) => setToasts((current) => current.filter((x) => x.id !== id))} />

      {dialog?.type === 'folder' && <TextDialog title={t('New folder', 'مجلد جديد')} label={t('Folder name', 'اسم المجلد')} placeholder={t('e.g. Projects 2026', 'مثلاً: مشاريع 2026')} confirm={t('Create', 'إنشاء')} onClose={() => setDialog(null)}
        onSave={async (name) => { await post('/items', { name, spaceId, parentId: view === 'drive' ? folderId : null }); refresh() }} />}
      {dialog?.type === 'rename' && <TextDialog title={t('Rename', 'إعادة التسمية')} label={t('New name', 'الاسم الجديد')} confirm={t('Save', 'حفظ')} initial={dialog.item.name} onClose={() => setDialog(null)}
        onSave={async (name) => { await patch(`/items/${dialog.item.id}`, { name }); refresh() }} />}
      {dialog?.type === 'move' && <MoveDialog item={dialog.item} space={dialog.item.space_id} onClose={() => setDialog(null)}
        onMove={async (parentId) => { await patch(`/items/${dialog.item.id}`, { parentId }); refresh(); notify(t('Moved', 'تم النقل'), 'ok') }} />}
      {dialog?.type === 'share' && <ShareDialog item={dialog.item} onClose={() => setDialog(null)} notify={notify} />}
      {dialog?.type === 'versions' && <VersionsDialog item={dialog.item} onClose={() => setDialog(null)} notify={notify} />}
      {dialog?.type === 'tags' && <TagsDialog item={dialog.item} tags={tags} onClose={() => setDialog(null)} onChange={() => { loadShell(); loadItems() }} />}
      {dialog?.type === 'bulkTags' && <BulkTagsDialog tags={tags} count={selected.length} onClose={() => setDialog(null)} onChange={loadShell}
        onSave={(tagIds, mode) => runBulk(mode === 'add' ? 'tag' : 'untag', { tagIds }, (n) => t('Tags updated for {n} items', 'تم تعديل الوسوم لـ {n} عنصر', { n }))} />}
      {dialog?.type === 'bulkMove' && <BulkMoveDialog count={selected.length} space={selectedItems[0]?.space_id || spaceId} excludeIds={selected} onClose={() => setDialog(null)}
        onMove={(parentId) => runBulk('move', { parentId }, (n) => t('Moved {n} items', 'تم نقل {n} عنصر', { n }))} />}
      {searchOpen && <SearchDialog tags={tags} initial={filters || { q: query } as any} onClose={() => setSearchOpen(false)}
        onSearch={(f) => { setFilters(f); setQuery(f.q); setView('search') }} />}
      {teamsOpen && <TeamsDialog focusCreate={teamsFocusCreate} onClose={() => { setTeamsOpen(false); setTeamsFocusCreate(false); loadShell() }} onChange={loadShell} notify={notify} />}
      {adminOpen && <AdminPanel currentUser={user} onClose={() => setAdminOpen(false)} notify={notify} onUsersChanged={loadShell} />}
      {preview && <Preview item={preview} onClose={() => setPreview(null)} onEdit={() => { setEditor(preview); setPreview(null) }}
        onVersions={() => { setDialog({ type: 'versions', item: preview }); setPreview(null) }}
        onComments={() => { setDetail(preview); setShowComments(true); setPreview(null) }} />}
      {editor && <Editor item={editor} onClose={() => setEditor(null)} onSaved={() => { refresh(); loadShell() }} notify={notify} />}
    </div>
  )
}

function NavButton({ icon: Icon, label, active, onClick, badge }: { icon: any; label: string; active: boolean; onClick: () => void; badge?: number }) {
  const t = useT()
  return <button onClick={onClick} className={`sahaba-nav flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? 'active' : ''}`}>
    <Icon size={17} className={active ? 'text-[#aab6ff]' : ''} /><span className="truncate">{label}</span>
    {!!badge && <span className="ms-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px]" title={t('Departments', 'الإدارات')}>{badge}</span>}
  </button>
}

function DetailStat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-white/5 p-3">
    <Icon size={14} className="mb-2 text-[#8f9bc2]" /><p className="text-[10px] text-[#7884ad]">{label}</p><p className="mt-0.5 truncate text-xs font-semibold">{value}</p>
  </div>
}
