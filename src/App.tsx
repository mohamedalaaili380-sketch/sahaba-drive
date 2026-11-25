import { useEffect, useState } from 'react'
import { Cloud, Loader2 } from 'lucide-react'
import { get, post } from './api'
import type { User } from './types'
import Auth from './components/Auth'
import DriveApp from './components/DriveApp'
import PublicShare from './components/PublicShare'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(true)
  const shareMatch = location.pathname.match(/^\/s\/([^/]+)\/?$/)

  useEffect(() => {
    if (shareMatch) { setChecking(false); return }
    if (!localStorage.getItem('sahaba_token')) { setChecking(false); return }
    get<{ user: User }>('/auth/me').then((d) => setUser(d.user)).catch(() => {
      localStorage.removeItem('sahaba_token')
      setUser(null)
    }).finally(() => setChecking(false))
  }, [])

  if (shareMatch) return <PublicShare token={decodeURIComponent(shareMatch[1])} />

  if (checking) return (
    <div className="grid h-full place-items-center bg-[#080c18] text-[#9aa9ff]">
      <div className="flex flex-col items-center gap-4"><Cloud size={42} className="animate-pulse" /><Loader2 className="spin" size={17} /></div>
    </div>
  )

  if (!user) return <Auth onAuth={setUser} />

  return <DriveApp user={user} onLogout={() => post('/auth/logout').finally(() => { localStorage.removeItem('sahaba_token'); setUser(null) })} />
}
