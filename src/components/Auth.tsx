import { useState } from 'react'
import { Cloud, LockKeyhole, Mail, UserRound, ArrowLeft, ArrowRight } from 'lucide-react'
import { post } from '../api'
import type { User } from '../types'
import { LangToggle, useLang, useT } from '../i18n'

export default function Auth({ onAuth }: { onAuth: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const t = useT()
  const { dir } = useLang()
  const Arrow = dir === 'rtl' ? ArrowLeft : ArrowRight

  const stats = [
    ['10 GB', t('starting space', 'مساحة ابتدائية')],
    ['24/7', t('available', 'متاح دايماً')],
    ['1-click', t('sharing', 'مشاركة بضغطة')],
  ]

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setNotice(''); setBusy(true)
    try {
      const data = await post<{ user: User; token?: string; pending?: boolean }>(`/auth/${mode}`, mode === 'register' ? { name, email, password } : { email, password })
      if (!data.token) {
        setNotice(t('Account created. The admin must approve it before you can sign in.', 'تم إنشاء الحساب. لازم الأدمن يوافق قبل ما تقدر تدخل.'))
        setMode('login'); setPassword('')
        return
      }
      localStorage.setItem('sahaba_token', data.token)
      onAuth(data.user)
    } catch (err: any) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <div className="sahaba-auth h-full w-full overflow-auto bg-[#03252c] lg:grid lg:grid-cols-2">
      <div className="sahaba-auth-brand relative hidden flex-col justify-between overflow-hidden p-12 xl:p-14 lg:flex">
        <div className="relative flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-[#0f766e] via-[#0e7490] to-[#22d3ee] shadow-lg shadow-[#14b8a6]/30"><Cloud size={22} /></div>
          <span className="text-2xl font-extrabold tracking-tight text-white">Sahaba</span>
        </div>
        <div className="relative max-w-lg">
          <h1 className="text-5xl font-black leading-[1.07] tracking-tight text-white">
            {t('Your files,', 'ملفاتك،')}<br /><span className="gradient-text">{t('above the noise.', 'بعيداً عن الفوضى.')}</span>
          </h1>
          <p className="mt-5 max-w-md text-base leading-8 text-[#a9b6d8]">
            {t('A calm, fast home for everything you keep. Private by default, shared when you choose.', 'مكان هادئ وسريع لكل اللي بتحتفظ بيه. خاص افتراضياً، وتشاركه لما تختار.')}
          </p>
          <div className="mt-9 grid grid-cols-3 gap-3">
            {stats.map(([value, label], i) => (
              <div key={i} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#9ecac7]">
                <b className="mb-0.5 block text-xl font-extrabold text-[#e6fffb]">{value}</b>{label}
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-[#6f9d9b]">{t('Your files live in your own connected Drive.', 'ملفاتك بتتخزن في Drive الخاص بك.')}</p>
      </div>

      <div className="relative flex items-center justify-center px-6 py-12">
        <div className="absolute top-4 end-4"><LangToggle /></div>
        <form onSubmit={submit} className="sahaba-auth-card enter w-full max-w-[390px] space-y-5 p-9">
          <div className="sahaba-auth-mobile flex items-center gap-3 lg:hidden">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#0f766e] via-[#0e7490] to-[#22d3ee] shadow-lg shadow-[#14b8a6]/25"><Cloud size={20} /></div>
            <div className="min-w-0"><p className="text-lg font-extrabold leading-none tracking-tight text-white">Sahaba</p><p className="mt-1 text-[11px] text-[#a9b6d8]">{t('Your drive', 'درايفك المحلي')}</p></div>
          </div>
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-white">{mode === 'login' ? t('Welcome back', 'أهلاً بعودتك') : t('Create a new account', 'اعمل حساب جديد')}</h2>
            <p className="mt-2 text-sm text-[#86b8b5]">{mode === 'login' ? t('Sign in to reach your drive.', 'سجّل الدخول عشان توصل لدرايفك.') : t('Create your account — the admin will activate it before you can sign in.', 'اعمل حسابك — الأدمن هو اللي هيفعّله قبل ما تقدر تدخل.')}</p>
          </div>

          <div className="sahaba-auth-tabs flex rounded-xl border border-white/10 bg-[#021c22]/50 p-1 text-sm">
            {(['login', 'register'] as const).map((m) => (
              <button type="button" key={m} onClick={() => { setMode(m); setError('') }}
                className={`flex-1 rounded-lg py-2 font-semibold transition ${mode === m ? 'bg-gradient-to-r from-[#0f766e] to-[#22d3ee] text-[#ffffff]' : 'text-[#86b8b5] hover:text-white'}`}>
                {m === 'login' ? t('Sign in', 'تسجيل الدخول') : t('Create account', 'حساب جديد')}
              </button>
            ))}
          </div>

          {mode === 'register' && (
            <label className="block space-y-2">
              <span className="text-xs font-semibold text-[#9ecac7]">{t('Name', 'الاسم')}</span>
              <div className="relative"><UserRound className="absolute start-3 top-3.5 text-[#6f9d9b]" size={17} />
                <input className="field ps-10" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Your name', 'اسمك')} required minLength={2} /></div>
            </label>
          )}
          <label className="block space-y-2">
            <span className="text-xs font-semibold text-[#9ecac7]">{t('Email', 'البريد الإلكتروني')}</span>
            <div className="relative"><Mail className="absolute start-3 top-3.5 text-[#6f9d9b]" size={17} />
              <input className="field ps-10" type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required /></div>
          </label>
          <label className="block space-y-2">
            <span className="text-xs font-semibold text-[#9ecac7]">{t('Password', 'كلمة المرور')}</span>
            <div className="relative"><LockKeyhole className="absolute start-3 top-3.5 text-[#6f9d9b]" size={17} />
              <input className="field ps-10" type="password" dir="ltr" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={8} /></div>
          </label>

          {notice && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{notice}</div>}
          {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}
          <button className="btn btn-primary w-full py-3.5 text-base" disabled={busy}>
            {busy ? <><span className="spin h-4 w-4 rounded-full border-2 border-[#ffffff]/30 border-t-[#ffffff]" /> {t('Please wait…', 'جاري...')}</> : <>{mode === 'login' ? t('Sign in', 'دخول') : t('Create account', 'إنشاء الحساب')} <Arrow size={17} /></>}
          </button>
        </form>
      </div>
    </div>
  )
}
