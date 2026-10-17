'use client'
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BOT_UA, DEFAULT_LANG, asLang, resolveLang, routeLang, type Lang } from '@/lib/langResolve'

export type { Lang }
export { DEFAULT_LANG }

// Язык по умолчанию — русский либо язык системы посетителя (решение основателя
// 17.10.2026, раньше был казахский). Правила и их обоснование — в
// src/lib/langResolve.ts. Явный выбор человека (кука lang / localStorage 'lang')
// всегда побеждает; догадка по языку браузера не сохраняется.
//
// Как нет «мигания»: сервер и статические страницы всегда отдают русский HTML
// (<html lang="ru">). Встроенный скрипт в <head> (LANG_BOOT_SCRIPT) до первой
// отрисовки вычисляет язык посетителя; если он не русский, прячет body
// (data-lang-hold), а этот провайдер сразу после гидрации, ещё до отрисовки
// (useLayoutEffect), переключает состояние и снимает скрытие. Русскому
// посетителю ничего не прячется и ничего не перерисовывается.

// localStorage живёт отдельно на каждом поддомене: выбрал «Рус» на invoices.kz —
// а kaspi.invoices.kz открывался бы на другом языке. Поэтому выбор дублируется в
// куку на весь .invoices.kz; при чтении кука главнее — в ней самый свежий
// выбор, где бы он ни был сделан.
const COOKIE = 'lang'

function readCookie(): Lang | null {
  const m = document.cookie.match(/(?:^|;\s*)lang=([^;]*)/)
  return asLang(m?.[1])
}

function readStored(): Lang | null {
  try { return asLang(localStorage.getItem('lang')) } catch { return null }
}

function writeStored(l: Lang) {
  try { localStorage.setItem('lang', l) } catch { /* приватный режим — кука всё равно запишется */ }
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
  // Первый рендер (и серверный, и гидрационный) — всегда DEFAULT_LANG, как в
  // серверном HTML: расхождений гидрации нет.
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG)
  const resolvedRef = useRef<Lang>(DEFAULT_LANG)

  // До отрисовки браузера: вычисляем язык посетителя и, если он не русский,
  // перерисовываем сразу же (до первого кадра). Для русского — ни одного
  // лишнего рендера.
  useLayoutEffect(() => {
    const fromCookie = readCookie()
    const fromStorage = readStored()
    const resolved = resolveLang({
      cookie: fromCookie,
      stored: fromStorage,
      languages: navigator.languages?.length ? navigator.languages : [navigator.language],
      isBot: BOT_UA.test(navigator.userAgent || ''),
    })
    // Выбор, сделанный до появления куки, переносим в неё — чтобы поддомены его
    // узнали. Только настоящий выбор; язык-догадка не сохраняется.
    if (!fromCookie && fromStorage) writeCookie(fromStorage)
    if (fromCookie && fromCookie !== fromStorage) writeStored(fromCookie)
    resolvedRef.current = resolved
    document.documentElement.setAttribute('data-lang-ready', '')
    document.documentElement.setAttribute('lang', routeLang(window.location.pathname) ?? resolved)
    if (resolved === DEFAULT_LANG) {
      document.documentElement.removeAttribute('data-lang-hold')
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- язык посетителя известен только в браузере
      setLangState(resolved)
    }
  }, [])

  // Скрытие (data-lang-hold) снимаем, когда на экране уже текст нужного языка.
  useEffect(() => {
    if (lang === resolvedRef.current) document.documentElement.removeAttribute('data-lang-hold')
  }, [lang])

  function setLang(next: Lang) {
    setLangState(next)
    writeStored(next)
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
