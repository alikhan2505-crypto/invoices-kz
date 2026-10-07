'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { useEffectivePath } from '@/lib/useEffectivePath'

// Light is the default theme -- the approved reference design (the Focus
// artifact) is the LIGHT version: soft #F5F6FB ground with pastel aurora
// blobs and white cards. Dark exists as a fully supported alternative for
// users who toggle it. (A brief dark-default experiment on 2026-08-19 was
// reverted the same day once the founder confirmed the approved reference
// is the light one.)
const ThemeContext = createContext({ theme: 'light', toggle: () => {} })

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
  const [theme, setTheme] = useState('light')
  const pathname = useEffectivePath()

  useEffect(() => {
    const saved = localStorage.getItem('theme')
    // A visitor who has never touched the toggle has no `saved` value --
    // that's the "system" state, not an implicit choice of light. The old
    // code defaulted `saved` to 'light' and stamped data-theme="light"
    // unconditionally, which permanently beat globals.css's
    // `@media (prefers-color-scheme: dark)` block for every --nav-* token
    // (same specificity, later source order) -- the whole dashboard stayed
    // light for every OS-dark visitor who'd never manually toggled, which
    // is most of them. Leaving the attribute UNSET for that case lets the
    // media query govern, as its own comment in globals.css already assumed.
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    setTheme(saved ?? (systemDark ? 'dark' : 'light'))
    if (FORCE_LIGHT_ROUTES.has(pathname)) {
      document.documentElement.setAttribute('data-theme', 'light')
    } else if (saved) {
      document.documentElement.setAttribute('data-theme', saved)
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
  }, [pathname])

  function toggle() {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    localStorage.setItem('theme', next)
    document.documentElement.setAttribute('data-theme', next)
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)