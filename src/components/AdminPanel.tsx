import { useCallback, useEffect, useState } from 'react'
import {
  Copy, HardDrive, KeyRound, Search, ShieldCheck, ShieldOff, Trash2, Users,
  Folder, FolderOpen, RefreshCw, Check, AlertTriangle,
} from 'lucide-react'
import { del, formatBytes, formatDate, get, patch, post } from '../api'
import type { AdminSpace, AdminUser, User } from '../types'
import { Modal, Progress } from './ui'
import { useT } from '../i18n'

type Overview = { users: number; pending: number; admins: number; spaces: number; files: number; bytes: number }

export default function AdminPanel({ currentUser, onClose, notify, onUsersChanged }: {
  currentUser: User
  onClose: () => void
  notify: (text: string, kind?: 'ok' | 'err' | 'info') => void
  onUsersChanged: () => void
}) {
  const t = useT()
  const [tab, setTab] = useState<'users' | 'spaces'>('users')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [spaces, setSpaces] = useState<AdminSpace[]>([])
  const [overview, setOverview] = useState<Overview | null>(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [quotaId, setQuotaId] = useState('')
  const [quotaMB, setQuotaMB] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordId, setNewPasswordId] = useState('')
  const [confirmDelete, setConfirmDelete] = useState('')

  const load = useCallback(async () => {
    try {
      const [u, s, o] = await Promise.all([
        get<{ users: AdminUser[] }>('/admin/users'),
        get<{ spaces: AdminSpace[] }>('/admin/spaces'),
        get<{ overview: Overview }>('/admin/overview'),
      ])
      setUsers(u.users); setSpaces(s.spaces); setOverview(o.overview)
    } catch (e: any) { setError(e.message) }
  }, [])

  useEffect(() => { load() }, [load])

  async function run(action: () => Promise<void>, message: string) {
    setBusy(true); setError('')
    try { await action(); await load(); onUsersChanged(); notify(message, 'ok') }
    catch (e: any) { setError(e.message); notify(e.message, 'err') }
    finally { setBusy(false) }
  }

  const filtered = users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(query.toLowerCase()))
  const number = (n: number) => new Intl.NumberFormat('en-US').format(n)
  const spaceLabel = (s: AdminSpace) => s.kind === 'personal' ? 'My Drive' : s.name

  return (
    <Modal wide title={t('Admin console')}
      subtitle={overview
        ? `${t('{users} users · {spaces} spaces · {files} files · {bytes} used', {
          users: number(overview.users), spaces: number(overview.spaces), files: number(overview.files), bytes: formatBytes(overview.bytes),
        })}${overview.pending ? ` · ${t('{n} awaiting approval', { n: number(overview.pending) })}` : ''}`
        : t('Manage users, quotas and spaces')}
      onClose={onClose}>

      <div className="mb-4 flex gap-2 border-b border-white/10 pb-3">
        <button onClick={() => setTab('users')} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${tab === 'users' ? 'bg-[#14b8a633] text-white' : 'text-[#86b8b5] hover:bg-white/5'}`}>
          <Users size={16} /> {t('Users')} <span className="rounded-full bg-white/10 px-1.5 text-[10px]">{users.length}</span>
        </button>
        <button onClick={() => setTab('spaces')} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${tab === 'spaces' ? 'bg-[#14b8a633] text-white' : 'text-[#86b8b5] hover:bg-white/5'}`}>
          <Folder size={16} /> {t('Spaces')} <span className="rounded-full bg-white/10 px-1.5 text-[10px]">{spaces.length}</span>
        </button>
        <button disabled={busy} onClick={load} className="ms-auto rounded-xl p-2 text-[#86b8b5] hover:bg-white/10 disabled:opacity-40" title={t('Refresh')}><RefreshCw size={16} className={busy ? 'spin' : ''} /></button>
      </div>

      {error && <div className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</div>}

      {tab === 'users' ? <>
        <label className="relative mb-3 block">
          <Search className="absolute start-3 top-2.5 text-[#6f9d9b]" size={16} />
          <input className="field ps-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search users…')} />
        </label>
        <div className="scroll-thin max-h-[52vh] space-y-2 overflow-auto">
          {filtered.map((u) => (
            <div key={u.id} className="rounded-2xl border border-white/10 bg-white/[.035] p-3">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold" style={{ background: `${u.color}33`, color: u.color }}>{u.name[0]}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-bold">{u.name}</p>
                    {u.isSuperAdmin && <span className="flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-200"><ShieldCheck size={10} /> {t('Main admin')}</span>}
                    {u.isAdmin && !u.isSuperAdmin && <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-300"><ShieldCheck size={10} /> {t('Admin')}</span>}
                    {!u.approved && <span className="flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] text-sky-300"><Check size={10} /> {t('Pending')}</span>}
                    {u.id === currentUser.id && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-[#86b8b5]">{t('You')}</span>}
                  </div>
                  <p className="truncate text-[11px] text-[#78aaa8]" dir="ltr">{u.email}</p>
                  <p className="mt-1 text-[10px] text-[#6f9d9b]">{t('Joined {date}', { date: formatDate(u.createdAt) })} · {t('{n} files', { n: number(u.items) })} · {t('{n} spaces', { n: number(u.spaces) })}</p>
                </div>
                <div className="hidden w-32 sm:block">
                  <p className="mb-1 text-[10px] text-[#86b8b5]">{formatBytes(u.used)} / {formatBytes(u.storageLimit)}</p>
                  <Progress value={Math.min(100, Math.round((u.used / u.storageLimit) * 100))} />
                </div>
              </div>

              {quotaId === u.id && <div className="mt-3 flex gap-2 border-t border-white/10 pt-3">
                <input className="field py-1.5 text-xs" type="number" min="1" dir="ltr" value={quotaMB} onChange={(e) => setQuotaMB(e.target.value)} placeholder={t('Quota in MB')} />
                <button className="btn btn-primary px-3 py-1.5 !text-xs" disabled={busy} onClick={() => {
                  const mb = Number(quotaMB)
                  if (!Number.isFinite(mb) || mb < 1) return notify(t('Enter a valid quota'), 'err')
                  run(async () => { await patch(`/admin/users/${u.id}`, { storageLimit: Math.floor(mb * 1024 * 1024) }) }, t('Quota updated'))
                  setQuotaId('')
                }}><Check size={14} /> {t('Save')}</button>
              </div>}

              {newPassword && newPasswordId === u.id && <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs">
                <p className="mb-1 text-emerald-300">{t('New password (shown once)')}</p>
                <div className="flex items-center gap-2"><code className="flex-1 select-all break-all" dir="ltr">{newPassword}</code>
                  <button className="text-emerald-300 hover:text-white" title={t('Copy')} onClick={() => { navigator.clipboard?.writeText(newPassword); setNewPassword(''); setNewPasswordId('') }}><Copy size={14} /></button>
                </div>
              </div>}

              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-3 text-[11px]">
                {!u.approved && <button className="btn btn-primary px-2 py-1 !text-[11px]" disabled={busy} onClick={() => run(async () => {
                  await post(`/admin/users/${u.id}/approve`, {})
                }, t('User approved'))}>
                  <Check size={13} /> {t('Approve access')}
                </button>}
                {!u.isSuperAdmin && <button className="btn btn-ghost px-2 py-1 !text-[11px]" disabled={busy} onClick={() => run(async () => {
                  await post(`/admin/users/${u.id}/admin`, { isAdmin: !u.isAdmin })
                }, u.isAdmin ? t('Admin access revoked') : t('User promoted to admin'))}>
                  {u.isAdmin ? <ShieldOff size={13} /> : <ShieldCheck size={13} />}
                  {u.isAdmin ? t('Revoke admin') : t('Make admin')}
                </button>}
                <button className="btn btn-ghost px-2 py-1 !text-[11px]" disabled={busy} onClick={() => { setQuotaId(quotaId === u.id ? '' : u.id); setQuotaMB(String(Math.round(u.storageLimit / 1024 / 1024))) }}>
                  <HardDrive size={13} /> {t('Quota')}
                </button>
                <button className="btn btn-ghost px-2 py-1 !text-[11px]" disabled={busy} onClick={() => run(async () => {
                  const data = await post<{ password: string }>(`/admin/users/${u.id}/reset-password`, {})
                  setNewPassword(data.password); setNewPasswordId(u.id)
                }, t('Password reset'))}>
                  <KeyRound size={13} /> {t('Reset password')}
                </button>
                {!u.isSuperAdmin && (confirmDelete === u.id
                  ? <button className="btn btn-danger px-2 py-1 !text-[11px]" disabled={busy} onClick={() => { run(async () => { await del(`/admin/users/${u.id}`) }, t('User deleted')); setConfirmDelete('') }}>
                    <AlertTriangle size={13} /> {t('Confirm delete')}
                  </button>
                  : <button className="btn btn-ghost px-2 py-1 !text-[11px] text-rose-300" disabled={busy || u.id === currentUser.id} onClick={() => setConfirmDelete(u.id)}>
                    <Trash2 size={13} /> {t('Delete')}
                  </button>)}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <p className="py-10 text-center text-sm text-[#78aaa8]">{t('No users found.')}</p>}
        </div>
      </> : <>
        <div className="scroll-thin max-h-[56vh] space-y-2 overflow-auto">
          {spaces.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.035] p-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#14b8a622] text-[#8be9e2]">
                {s.kind === 'personal' ? <Folder size={18} /> : <FolderOpen size={18} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><p className="truncate text-sm font-bold">{spaceLabel(s)}</p>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-[#86b8b5]">{s.kind === 'personal' ? t('Personal') : t('Department')}</span></div>
                <p className="truncate text-[11px] text-[#78aaa8]">{s.owner?.name || '—'} · {t('{n} members', { n: number(s.members) })} · {t('{n} files', { n: number(s.files) })} · {formatBytes(s.size)}</p>
              </div>
              {confirmDelete === s.id
                ? <button className="btn btn-danger px-2 py-1 !text-[11px]" disabled={busy} onClick={() => { run(async () => { await del(`/admin/spaces/${s.id}`) }, t('Space deleted')); setConfirmDelete('') }}>
                  <AlertTriangle size={13} /> {t('Confirm')}
                </button>
                : <button className="btn btn-ghost px-2 py-1 !text-[11px] text-rose-300" disabled={busy} onClick={() => setConfirmDelete(s.id)}><Trash2 size={13} /> {t('Delete')}</button>}
            </div>
          ))}
          {spaces.length === 0 && <p className="py-10 text-center text-sm text-[#78aaa8]">{t('No spaces found.')}</p>}
        </div>
      </>}
    </Modal>
  )
}
