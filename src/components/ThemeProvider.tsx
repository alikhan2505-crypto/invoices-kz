'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

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
  const pathname = usePathname()

  useEffect(() => {
    const saved = localStorage.getItem('theme') || 'light'
    setTheme(saved)
    const applied = FORCE_LIGHT_ROUTES.has(pathname) ? 'light' : saved
    document.documentElement.setAttribute('data-theme', applied)
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