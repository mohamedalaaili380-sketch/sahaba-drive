import { useState } from 'react'
import { Cloud, LockKeyhole, Mail, UserRound, ArrowLeft, ArrowRight, Sparkles, ShieldCheck, Users, History } from 'lucide-react'
import { post } from '../api'
import type { User } from '../types'
import { LangToggle, useLang, useT } from '../i18n'

export default function Auth({ onAuth }: { onAuth: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const t = useT()
  const { dir } = useLang()
  const Arrow = dir === 'rtl' ? ArrowLeft : ArrowRight

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      const data = await post<{ user: User; token: string }>(`/auth/${mode}`, mode === 'register' ? { name, email, password } : { email, password })
      localStorage.setItem('sahaba_token', data.token)
      onAuth(data.user)
    } catch (err: any) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <div className="h-full w-full overflow-auto grid lg:grid-cols-2 bg-[#080c18]">
      <div className="hidden lg:flex flex-col justify-between p-14 relative overflow-hidden bg-gradient-to-br from-[#121a34] via-[#0d1324] to-[#0a0f1e]">
        <div className="absolute -top-40 -end-40 h-[520px] w-[520px] rounded-full bg-[#6d7cff]/20 blur-[110px]" />
        <div className="absolute -bottom-40 -start-40 h-[460px] w-[460px] rounded-full bg-[#a855f7]/15 blur-[110px]" />
        <div className="relative flex items-center gap-3 text-2xl font-extrabold">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-[#6d7cff] to-[#a855f7] shadow-lg shadow-[#6d7cff]/30"><Cloud /></div>
          <span className="gradient-text">سَحابة</span>
        </div>
        <div className="relative max-w-lg space-y-7">
          <h1 className="text-5xl font-black leading-[1.3]">{t('All your files.', 'كل ملفاتك.')}<br /><span className="gradient-text">{t('In one place.', 'في مكان واحد.')}</span></h1>
          <p className="text-lg leading-9 text-[#9aa6cc]">{t('Your private space to store, share and collaborate on files — with full version history, teams and protected links.', 'مساحتك الخاصة لتخزين الملفات ومشاركتها والتعاون عليها — مع سجل إصدارات كامل وفرق وروابط محمية.')}</p>
          <div className="grid grid-cols-2 gap-3 text-sm text-[#c3cdec]">
            {[
              [History, t('Full version history', 'سجل إصدارات كامل')],
              [Users, t('Teams and shared spaces', 'فرق ومساحات مشتركة')],
              [ShieldCheck, t('Password-protected links', 'روابط بكلمة سر وانتهاء')],
              [Sparkles, t('Live editing and comments', 'تحرير وتعليقات مباشرة')],
            ].map(([Icon, label]: any, i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <Icon size={18} className="text-[#9aa9ff]" />{label}
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-[#5f6b92]">{t('Your files live in your own connected Drive.', 'تطبيق محلي — بياناتك بتفضل على جهازك.')}</p>
      </div>

      <div className="relative flex items-center justify-center px-6 py-12">
        <div className="absolute top-4 end-4"><LangToggle /></div>
        <form onSubmit={submit} className="w-full max-w-md space-y-5 enter">
          <div className="flex items-center gap-3 lg:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#6d7cff] to-[#a855f7]"><Cloud /></div>
            <span className="gradient-text text-2xl font-extrabold">سَحابة</span>
          </div>
          <div>
            <h2 className="text-3xl font-bold">{mode === 'login' ? t('Welcome back', 'أهلاً بعودتك') : t('Create a new account', 'اعمل حساب جديد')}</h2>
            <p className="mt-2 text-sm text-[#8e9ac0]">{mode === 'login' ? t('Sign in to reach your drive.', 'سجّل الدخول عشان توصل لدرايفك.') : t('Just a minute and you are ready to go.', 'دقيقة واحدة وابدأ تستخدم درايفك.')}</p>
          </div>

          <div className="flex rounded-xl bg-white/5 p-1 text-sm">
            {(['login', 'register'] as const).map((m) => (
              <button type="button" key={m} onClick={() => { setMode(m); setError('') }}
                className={`flex-1 rounded-lg py-2 font-semibold transition ${mode === m ? 'bg-[#6d7cff] text-white shadow' : 'text-[#93a0c7] hover:text-white'}`}>
                {m === 'login' ? t('Sign in', 'تسجيل الدخول') : t('Create account', 'حساب جديد')}
              </button>
            ))}
          </div>

          {mode === 'register' && (
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-[#b8c4e8]">{t('Name', 'الاسم')}</span>
              <div className="relative"><UserRound className="absolute start-3 top-3.5 text-[#6d789f]" size={17} />
                <input className="field ps-10" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Your name', 'اسمك')} required minLength={2} /></div>
            </label>
          )}
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-[#b8c4e8]">{t('Email', 'البريد الإلكتروني')}</span>
            <div className="relative"><Mail className="absolute start-3 top-3.5 text-[#6d789f]" size={17} />
              <input className="field ps-10" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required /></div>
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-[#b8c4e8]">{t('Password', 'كلمة المرور')}</span>
            <div className="relative"><LockKeyhole className="absolute start-3 top-3.5 text-[#6d789f]" size={17} />
              <input className="field ps-10" type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={8} /></div>
          </label>

          {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}
          <button className="btn btn-primary w-full py-3 text-base" disabled={busy}>
            {busy ? <><span className="spin h-4 w-4 rounded-full border-2 border-white/30 border-t-white" /> {t('Please wait…', 'جاري...')}</> : <>{mode === 'login' ? t('Sign in', 'دخول') : t('Create account', 'إنشاء الحساب')} <Arrow size={17} /></>}
          </button>
          <p className="text-center text-xs text-[#5f6b92]">{t('By creating an account you agree to use the app with your own storage.', 'بإنشاء حساب، أنت بتوافق على استخدام التطبيق محلياً على جهازك.')}</p>
        </form>
      </div>
    </div>
  )
}
