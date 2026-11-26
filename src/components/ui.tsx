import { useId } from 'react'
import { X, FileText, FileImage, FileVideo, FileAudio, FileArchive, FileCode, FileSpreadsheet, File, Folder, FolderOpen, Loader2 } from 'lucide-react'
import { fileExt } from '../api'

export function Modal({ title, subtitle, onClose, children, wide = false, footer }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean; footer?: React.ReactNode
}) {
  const titleId = useId()
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-header sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-[#131b32]/95 px-6 py-4 backdrop-blur">
          <div className="min-w-0"><h3 id={titleId} className="text-lg font-bold">{title}</h3>{subtitle && <p className="mt-1 text-xs text-[#aab6d8]">{subtitle}</p>}</div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-[#aab6d8] transition hover:bg-white/10 hover:text-white"><X size={19} /></button>
        </div>
        <div className="modal-body px-6 py-5">{children}</div>
        {footer && <div className="modal-footer sticky bottom-0 flex justify-end gap-2 border-t border-white/10 bg-[#0e1529]/95 px-6 py-4 backdrop-blur">{footer}</div>}
      </div>
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return <div className="sahaba-skeleton-wrap flex flex-col items-center gap-3 py-16 text-[#5f6b8a]"><Loader2 className="spin" size={28} />{label && <span className="text-sm">{label}</span>}</div>
}

export function SkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="sahaba-skeleton-grid" role="status" aria-label="Loading files">
      {Array.from({ length: count }, (_, i) => <div key={i} className="sahaba-skeleton-card" />)}
    </div>
  )
}

export function Empty({ icon: Icon, title, hint, action }: { icon: any; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="sahaba-empty flex flex-col items-center justify-center gap-3 text-center">
      <div className="sahaba-empty-icon"><Icon size={30} /></div>
      <h3 className="text-lg font-bold">{title}</h3>
      {hint && <p className="max-w-sm text-sm leading-6">{hint}</p>}
      {action}
    </div>
  )
}

const colors: Record<string, string> = {
  image: '#f472b6', video: '#f87171', audio: '#fbbf24', archive: '#a78bfa',
  code: '#34d399', sheet: '#4ade80', pdf: '#fb7185', text: '#60a5fa', doc: '#818cf8',
}

export function ItemIcon({ item, size = 34, open = false }: { item: { kind: string; name: string; mime: string }; size?: number; open?: boolean }) {
  if (item.kind === 'folder') {
    const Icon = open ? FolderOpen : Folder
    return <Icon size={size} className="text-[#f0b65c]" strokeWidth={1.6} />
  }
  const ext = fileExt(item.name)
  const mime = item.mime || ''
  let type = 'text'
  if (mime.startsWith('image/')) type = 'image'
  else if (mime.startsWith('video/')) type = 'video'
  else if (mime.startsWith('audio/')) type = 'audio'
  else if (/zip|rar|7z|tar|gz/.test(ext)) type = 'archive'
  else if (/js|ts|tsx|json|html|css|py|sh|sql/.test(ext)) type = 'code'
  else if (/xls|csv|numbers/.test(ext)) type = 'sheet'
  else if (ext === 'pdf') type = 'pdf'
  else if (/doc|docx|rtf|pages/.test(ext)) type = 'doc'
  const Icon = type === 'image' ? FileImage : type === 'video' ? FileVideo : type === 'audio' ? FileAudio
    : type === 'archive' ? FileArchive : type === 'code' ? FileCode : type === 'sheet' ? FileSpreadsheet
      : type === 'pdf' || type === 'doc' ? FileText : File
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <Icon size={size} style={{ color: colors[type] }} strokeWidth={1.5} />
      {ext && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded bg-[#0d1324] px-0.5 text-[7px] font-bold" style={{ color: colors[type] }}>{ext.slice(0, 4)}</span>}
    </div>
  )
}

export function ToastStack({ toasts, dismiss }: { toasts: { id: number; text: string; kind: 'ok' | 'err' | 'info' }[]; dismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed bottom-5 left-5 z-[80] flex w-[min(360px,90vw)] flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`pointer-events-auto enter rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur ${
          t.kind === 'err' ? 'border-rose-500/40 bg-rose-950/90 text-rose-200' : t.kind === 'ok' ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-200' : 'border-indigo-400/40 bg-indigo-950/90 text-indigo-100'}`}>
          <div className="flex items-center justify-between gap-3"><span>{t.text}</span>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="opacity-60 hover:opacity-100"><X size={15} /></button></div>
        </div>
      ))}
    </div>
  )
}

export function Progress({ value, label }: { value: number; label?: string }) {
  return <div className="sahaba-progress-track h-1.5 w-full overflow-hidden rounded-full" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(100, Math.round(value)))}>
    <div className="sahaba-progress-fill h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
  </div>
}
