'use client'
import { createContext, useContext, useEffect, useState } from 'react'

export type Lang = 'ru' | 'kk' | 'en'

// Язык по умолчанию — казахский (решение основателя 13.10.2026: «мы в
// Казахстане»). Касается только тех, кто язык ещё не выбирал: явный выбор
// человека хранится в localStorage 'lang' и всегда побеждает.
export const DEFAULT_LANG: Lang = 'kk'

// localStorage живёт отдельно на каждом поддомене: выбрал «Рус» на invoices.kz —
// а kaspi.invoices.kz всё равно открывался на казахском (ревизия 13.10). Поэтому
// выбор дублируется в куку на весь .invoices.kz; при чтении кука главнее — в ней
// самый свежий выбор, где бы он ни был сделан.
const COOKIE = 'lang'
const asLang = (v: string | null | undefined): Lang | null => (v === 'ru' || v === 'kk' || v === 'en' ? v : null)

function readCookie(): Lang | null {
  const m = document.cookie.match(/(?:^|;\s*)lang=([^;]*)/)
  return asLang(m?.[1])
}

function writeCookie(l: Lang) {
  const host = window.location.hostname
  const domain = host === 'invoices.kz' || host.endsWith('.invoices.kz') ? '; domain=.invoices.kz' : ''
  document.cookie = `${COOKIE}=${l}; path=/; max-age=31536000; samesite=lax${domain}`
}

const LanguageContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: DEFAULT_LANG,
  setLang: () => {},
})

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG)

  useEffect(() => {
    const fromCookie = readCookie()
    const fromStorage = asLang(localStorage.getItem('lang'))
    const saved: Lang = fromCookie ?? fromStorage ?? DEFAULT_LANG
    // Выбор, сделанный до появления куки, переносим в неё — чтобы поддомены его узнали.
    if (!fromCookie && fromStorage) writeCookie(fromStorage)
    if (fromCookie && fromCookie !== fromStorage) localStorage.setItem('lang', fromCookie)
    setLangState(saved)
    document.documentElement.setAttribute('lang', saved)
  }, [])

  function setLang(next: Lang) {
    setLangState(next)
    localStorage.setItem('lang', next)
    writeCookie(next)
    document.documentElement.setAttribute('lang', next)
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => useContext(LanguageContext)
