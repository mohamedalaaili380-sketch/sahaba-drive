import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useT } from './i18n'

export type Theme = 'light' | 'dark'
const STORAGE_KEY = 'sahaba_theme'

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

type ThemeContextValue = {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light', setTheme: () => {}, toggleTheme: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    localStorage.setItem(STORAGE_KEY, theme)
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#03252c' : '#062f36')
  }, [theme])

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    setTheme,
    toggleTheme: () => setTheme((current) => (current === 'dark' ? 'light' : 'dark')),
  }), [theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)

export function ThemeToggle({ floating = false }: { floating?: boolean }) {
  const { theme, toggleTheme } = useTheme()
  const t = useT()
  const dark = theme === 'dark'
  const label = dark
    ? t('Switch to light mode', 'التبديل للوضع الفاتح')
    : t('Switch to dark mode', 'التبديل للوضع الداكن')
  const Icon = dark ? Sun : Moon

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={dark}
      onClick={toggleTheme}
      className={floating
        ? 'fixed bottom-4 end-16 z-50 flex items-center gap-1.5 rounded-full border border-white/15 bg-[#03252c]/95 px-3 py-2 text-xs font-bold text-[#bfe9e6] shadow-xl backdrop-blur transition hover:border-[#2dd4bf] hover:text-white'
        : 'flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold text-[#86b8b5] transition hover:bg-white/10 hover:text-white'}
    >
      <Icon size={16} />
    </button>
  )
}
