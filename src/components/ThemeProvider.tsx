'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { useEffectivePath } from '@/lib/useEffectivePath'

// Light is the default theme -- the approved reference design (the Focus
// artifact) is the LIGHT version: soft #F5F6FB ground with pastel aurora
// blobs and white cards. Dark exists as a fully supported alternative for
// users who toggle it. (A brief dark-default experiment on 2026-08-19 was
// reverted the same day once the founder confirmed the approved reference
// is the light one.)
export type ThemeMode = 'system' | 'light' | 'dark'

// theme — то, что реально на экране ('light' | 'dark'); mode — выбор
// человека. 'system' = в localStorage ничего нет, и тему ведёт
// `@media (prefers-color-scheme: dark)` в globals.css (ревизия /profile
// 15.10.2026: вместо двухпозиционного «Светлая тема» — три варианта).
const ThemeContext = createContext<{
  theme: 'light' | 'dark'
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
  toggle: () => void
}>({ theme: 'light', mode: 'system', setMode: () => {}, toggle: () => {} })

function readStoredMode(): ThemeMode {
  try {
    const saved = localStorage.getItem('theme')
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch {
    return 'system'
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches
}

// The dark-designed marketing pages have no theme toggle and are styled
// assuming light-mode colors. globals.css has ~40 `[data-theme="dark"] ... !important`
// overrides written for the dashboard (e.g. forcing h2/h3/font-bold text to
// var(--text-primary)); those beat the marketing pages' own inline accent
// colors and repaint accent figures (stat digits, eyebrows) pure white for
// any visitor who previously toggled dark mode in the app. Force these
// routes to 'light' regardless of the stored preference so the dashboard's
// dark-mode overrides never leak into them.
const FORCE_LIGHT_ROUTES = new Set(['/', '/cashier-api'])

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system')
  const [systemDark, setSystemDark] = useState(false)
  const pathname = useEffectivePath()

  // A visitor who has never touched the switch has no stored value -- that's
  // the "system" state, not an implicit choice of light. The old code
  // defaulted to 'light' and stamped data-theme="light" unconditionally,
  // which permanently beat globals.css's `@media (prefers-color-scheme: dark)`
  // block for every --nav-* token (same specificity, later source order).
  // Leaving the attribute UNSET for that case lets the media query govern.
  useEffect(() => {
    // localStorage и matchMedia есть только в браузере — читаем после монтирования.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModeState(readStoredMode())
    setSystemDark(systemPrefersDark())
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])

  useEffect(() => {
    const stored = readStoredMode()
    if (FORCE_LIGHT_ROUTES.has(pathname)) {
      document.documentElement.setAttribute('data-theme', 'light')
    } else if (stored !== 'system') {
      document.documentElement.setAttribute('data-theme', stored)
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
  }, [pathname])

  function setMode(next: ThemeMode) {
    setModeState(next)
    try {
      // «Как в системе» — это отсутствие сохранённого выбора, а не третье значение.
      if (next === 'system') localStorage.removeItem('theme')
      else localStorage.setItem('theme', next)
    } catch {
      // Хранилище недоступно (приватный режим) — тема всё равно сменится до перезагрузки.
    }
    if (FORCE_LIGHT_ROUTES.has(pathname)) return
    if (next === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', next)
  }

  const theme: 'light' | 'dark' = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode

  function toggle() {
    setMode(theme === 'light' ? 'dark' : 'light')
  }

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)