import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Languages } from 'lucide-react'

export type Lang = 'en' | 'ar'
const STORAGE_KEY = 'sahaba_lang'

export const currentLang = (): Lang => (localStorage.getItem(STORAGE_KEY) === 'ar' ? 'ar' : 'en')

export function translate(
  en: string,
  ar: string = en,
  vars?: Record<string, string | number>,
  lang: Lang = currentLang(),
): string {
  let out = lang === 'ar' ? ar : en
  if (vars) for (const [key, value] of Object.entries(vars)) out = out.replaceAll(`{${key}}`, String(value))
  return out
}

type LangContextValue = {
  lang: Lang
  dir: 'ltr' | 'rtl'
  setLang: (lang: Lang) => void
  toggleLang: () => void
  t: (en: string, ar?: string, vars?: Record<string, string | number>) => string
}

const LangContext = createContext<LangContextValue>({
  lang: 'en', dir: 'ltr', setLang: () => {}, toggleLang: () => {},
  t: (en, ar, vars) => translate(en, ar, vars, 'en'),
})

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>(currentLang)

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
    document.title = 'Sahaba — ' + (lang === 'ar' ? 'درايفك المحلي' : 'Your drive')
    localStorage.setItem(STORAGE_KEY, lang)
  }, [lang])

  const t = useCallback((en: string, ar?: string, vars?: Record<string, string | number>) =>
    translate(en, ar, vars, lang), [lang])

  const value = useMemo<LangContextValue>(() => ({
    lang,
    dir: lang === 'ar' ? 'rtl' : 'ltr',
    setLang,
    toggleLang: () => setLang((l) => (l === 'en' ? 'ar' : 'en')),
    t,
  }), [lang, t])

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export const useLang = () => useContext(LangContext)
export const useT = () => useLang().t

export function LangToggle({ floating = false }: { floating?: boolean }) {
  const { lang, toggleLang, t } = useLang()
  return (
    <button
      type="button"
      title={t('Switch to Arabic', 'التبديل للعربية')}
      onClick={toggleLang}
      className={floating
        ? 'fixed bottom-4 end-4 z-50 flex items-center gap-1.5 rounded-full border border-white/15 bg-[#07343b]/95 px-3 py-2 text-xs font-bold text-[#bfe9e6] shadow-xl backdrop-blur transition hover:border-[#14b8a6] hover:text-white'
        : 'flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold text-[#86b8b5] transition hover:bg-white/10 hover:text-white'}
    >
      <Languages size={16} />
      <span>{lang === 'en' ? 'EN' : 'ع'}</span>
    </button>
  )
}
