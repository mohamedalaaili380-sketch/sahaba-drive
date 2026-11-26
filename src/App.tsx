import { useEffect, useState } from 'react'
import { Cloud, Loader2 } from 'lucide-react'
import { get, post } from './api'
import type { User } from './types'
import Auth from './components/Auth'
import DriveApp from './components/DriveApp'
import PublicShare from './components/PublicShare'
import { ThemeProvider } from './theme'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(true)
  const shareMatch = location.pathname.match(/^\/s\/([^/]+)\/?$/)

  useEffect(() => {
    localStorage.removeItem('sahaba_lang')
    document.documentElement.lang = 'en'
    document.documentElement.dir = 'ltr'
    if (shareMatch) { setChecking(false); return }
    if (!localStorage.getItem('sahaba_token')) { setChecking(false); return }
    get<{ user: User }>('/auth/me').then((d) => setUser(d.user)).catch(() => {
      localStorage.removeItem('sahaba_token')
      setUser(null)
    }).finally(() => setChecking(false))
  }, [])

  const content = shareMatch ? <PublicShare token={decodeURIComponent(shareMatch[1])} />
    : checking ? (
      <div className="grid h-full place-items-center bg-[#03252c] text-[#5eead4]">
        <div className="flex flex-col items-center gap-4"><Cloud size={42} className="animate-pulse" /><Loader2 className="spin" size={17} /></div>
      </div>
    )
      : !user ? <Auth onAuth={setUser} />
        : <DriveApp user={user} onLogout={() => post('/auth/logout').finally(() => { localStorage.removeItem('sahaba_token'); setUser(null) })} />

  return <ThemeProvider>{content}</ThemeProvider>
}
