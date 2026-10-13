'use client'
import { createContext, useContext, useEffect, useState } from 'react'

export type Lang = 'ru' | 'kk' | 'en'

// Язык по умолчанию — казахский (решение основателя 13.10.2026: «мы в
// Казахстане»). Касается только тех, кто язык ещё не выбирал: явный выбор
// человека хранится в localStorage 'lang' и всегда побеждает.
export const DEFAULT_LANG: Lang = 'kk'

const LanguageContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: DEFAULT_LANG,
  setLang: () => {},
})

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG)

  useEffect(() => {
    const raw = localStorage.getItem('lang')
    const saved: Lang = raw === 'ru' || raw === 'kk' || raw === 'en' ? raw : DEFAULT_LANG
    setLangState(saved)
    document.documentElement.setAttribute('lang', saved)
  }, [])

  function setLang(next: Lang) {
    setLangState(next)
    localStorage.setItem('lang', next)
    document.documentElement.setAttribute('lang', next)
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => useContext(LanguageContext)
