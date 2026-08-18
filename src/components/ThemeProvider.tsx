'use client'
import { createContext, useContext, useEffect, useState } from 'react'

// Dark is the default theme (the approved aurora-glass design is dark-first;
// light exists and is fully supported, but only for users who explicitly
// choose it -- see toggle() below). Both the pre-effect initial state and
// the localStorage fallback agree on 'dark' so there's no flash of the
// wrong theme between first paint and this effect running.
const ThemeContext = createContext({ theme: 'dark', toggle: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState('dark')

  useEffect(() => {
    const saved = localStorage.getItem('theme') || 'dark'
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