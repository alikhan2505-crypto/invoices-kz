'use client'
import { useEffect, useRef, useState } from 'react'
import { useLanguage, type Lang } from '@/components/LanguageProvider'
import { handoffProductName, handoffReturnHref, parseHandoff, type Handoff } from '@/lib/crossProduct'

const STORAGE_KEY = 'product_handoff'

const TEXT: Record<Lang, { from: (n: string) => string; back: (n: string) => string; close: string }> = {
  ru: { from: (n) => `Вы пришли из «${n}»`, back: (n) => `← Вернуться в «${n}»`, close: 'Закрыть' },
  kk: { from: (n) => `Сіз «${n}» бөлімінен келдіңіз`, back: (n) => `← «${n}» бөліміне оралу`, close: 'Жабу' },
  en: { from: (n) => `You came from ${n}`, back: (n) => `← Back to ${n}`, close: 'Close' },
}

function load(): Handoff | null {
  const fromUrl = parseHandoff(window.location.search)
  if (fromUrl) {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fromUrl)) } catch { /* private mode */ }
    // Keep the address clean; the banner lives on from storage.
    const url = new URL(window.location.href)
    url.searchParams.delete('from')
    url.searchParams.delete('back')
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
    return fromUrl
  }
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const h = JSON.parse(raw) as Handoff
    return parseHandoff(`?from=${encodeURIComponent(h.from)}&back=${encodeURIComponent(h.back)}`)
  } catch {
    return null
  }
}

export default function HandoffBanner() {
  const { lang } = useLanguage()
  const [handoff, setHandoff] = useState<Handoff | null>(null)

  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setHandoff(load())
  }, [])

  // Плашка закреплена внизу экрана и раньше закрывала кнопку покупки Про в конце страницы
  // (прогон воронки Kaspi 07.11.2026, blocker). Теперь странице добавляется нижний отступ ровно
  // по высоте плашки: любой конец страницы можно прокрутить выше неё.
  useEffect(() => {
    const el = barRef.current
    if (!handoff || !el) return
    const prev = document.body.style.paddingBottom
    const apply = () => { document.body.style.paddingBottom = `${Math.ceil(el.getBoundingClientRect().height) + 32}px` }
    apply()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null
    ro?.observe(el)
    return () => { ro?.disconnect(); document.body.style.paddingBottom = prev }
  }, [handoff])

  if (!handoff) return null
  const t = TEXT[lang]
  const name = handoffProductName(handoff)

  function dismiss() {
    try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    setHandoff(null)
  }

  return (
    <div
      ref={barRef}
      role="status"
      className="nav-glass"
      style={{
        position: 'fixed', left: 16, right: 16, marginInline: 'auto', width: 'fit-content', zIndex: 60,
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
        display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'center',
        maxWidth: 'calc(100vw - 32px)', padding: '4px 4px 4px 16px', borderRadius: 16, fontSize: 13,
      }}
    >
      <span style={{ color: 'var(--nav-text-secondary)' }}>{t.from(name)}</span>
      <a href={handoffReturnHref(handoff, window.location.hostname)} style={{ color: 'var(--nav-accent)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 8px' }}>{t.back(name)}</a>
      <button type="button" onClick={dismiss} aria-label={t.close} style={{ color: 'var(--nav-text-muted)', fontSize: 20, lineHeight: 1, minWidth: 44, minHeight: 44 }}>×</button>
    </div>
  )
}
