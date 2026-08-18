'use client'
import { createContext, useContext, useEffect, useState } from 'react'

// Light is the default theme -- the approved reference design (the Focus
// artifact) is the LIGHT version: soft #F5F6FB ground with pastel aurora
// blobs and white cards. Dark exists as a fully supported alternative for
// users who toggle it. (A brief dark-default experiment on 2026-08-19 was
// reverted the same day once the founder confirmed the approved reference
// is the light one.)
const ThemeContext = createContext({ theme: 'light', toggle: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState('light')

  useEffect(() => {
    const saved = localStorage.getItem('theme') || 'light'
    setTheme(saved)
    document.documentElement.setAttribute('data-theme', saved)
  }, [])

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