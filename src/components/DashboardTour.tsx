'use client'
import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'

type Step = { anchor: string; title: string; body: string }

// Anchors are data-tour attributes on elements that already exist; the tour
// never renders its own copy of them. A step whose anchor is missing from the
// DOM (e.g. the mobile-only menu button on a desktop viewport) is skipped
// rather than pointing at nothing.
const STEPS: Step[] = [
  {
    anchor: 'products',
    title: 'Четыре продукта на одной платформе',
    body: 'Счета, приём оплат Kaspi, ИИ-агент и Kaspi Bot. Начните с любого — остальные подключите когда понадобятся.',
  },
  {
    anchor: 'create-invoice',
    title: 'Первый счёт — за минуту',
    body: 'Реквизиты компании спросим здесь же, в момент создания, а не заранее.',
  },
  {
    anchor: 'menu',
    title: 'Всё меню здесь',
    body: 'Разделы и их страницы. Открытым показывается только тот раздел, в котором вы сейчас.',
  },
  {
    anchor: 'wallet',
    title: 'Единый кошелёк',
    body: 'С него списывается комиссия за счета, проверки Kaspi Bot и ответы ИИ-агента. Один баланс на всю платформу.',
  },
]

const PAD = 6      // breathing room around the highlighted element
const GAP = 10     // distance from the element to the tooltip
const MARGIN = 12  // minimum distance from the viewport edges

export default function DashboardTour() {
  const [open, setOpen] = useState(false)
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [vw, setVw] = useState(0)
  const [vh, setVh] = useState(0)

  // Decide once, on mount, whether this account has seen the tour. A missing
  // profile row (or any error) means "don't show" -- the tour is a nicety and
  // must never be the thing that breaks a dashboard load.
  //
  // Yes, dashboard/page.tsx already fetches this profile for its own reasons,
  // so this is a second read of the same row. That is a deliberate trade: one
  // indexed primary-key lookup buys a component that mounts anywhere with no
  // props and no coupling to the dashboard's loading state. If the dashboard's
  // first paint ever becomes the thing to optimise, pass the flag in as a prop
  // then -- not before.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('profiles')
        .select('tour_completed_at')
        .eq('id', user.id)
        .maybeSingle()
      if (!cancelled && data && !data.tour_completed_at) setOpen(true)
    })()
    return () => { cancelled = true }
  }, [])

  const measure = useCallback(() => {
    const step = STEPS[i]
    if (!step) return
    const el = document.querySelector(`[data-tour="${step.anchor}"]`)
    setVw(window.innerWidth)
    setVh(window.innerHeight)
    setRect(el ? el.getBoundingClientRect() : null)
  }, [i])

  useEffect(() => {
    if (!open) return
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, measure])

  const finish = useCallback(async () => {
    setOpen(false)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('profiles')
      .update({ tour_completed_at: new Date().toISOString() })
      .eq('id', user.id)
  }, [])

  const next = useCallback(() => {
    // Skip forward over any step whose anchor isn't on this viewport.
    for (let j = i + 1; j < STEPS.length; j++) {
      if (document.querySelector(`[data-tour="${STEPS[j].anchor}"]`)) { setI(j); return }
    }
    finish()
  }, [i, finish])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, finish])

  // Scroll the anchor into view when a step opens, so a highlight never lands
  // off-screen on a long dashboard. Honours prefers-reduced-motion: for those
  // users the jump is instant rather than animated.
  useEffect(() => {
    if (!open) return
    const el = document.querySelector(`[data-tour="${STEPS[i].anchor}"]`)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
    const t = setTimeout(measure, reduce ? 0 : 400)
    return () => clearTimeout(t)
  }, [open, i, measure])

  if (!open || typeof document === 'undefined') return null
  const step = STEPS[i]
  if (!step) return null

  const scrim = 'rgba(10,10,15,0.55)'
  // Four opaque rectangles around the target instead of a mask/clip-path:
  // those two differ across engines, four plain divs do not.
  const box = rect
    ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : null

  const below = box ? box.top + box.height / 2 < vh * 0.6 : true
  const tipWidth = Math.min(320, vw - MARGIN * 2)
  const tipLeft = box
    ? Math.max(MARGIN, Math.min(box.left, vw - tipWidth - MARGIN))
    : MARGIN
  const tipStyle: React.CSSProperties = box
    ? below
      ? { top: box.top + box.height + GAP, left: tipLeft, width: tipWidth }
      : { bottom: vh - box.top + GAP, left: tipLeft, width: tipWidth }
    : { top: '50%', left: MARGIN, width: tipWidth, transform: 'translateY(-50%)' }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Знакомство с платформой"
      className="fixed inset-0 z-[80]"
    >
      {box ? (
        <>
          <div style={{ position: 'fixed', left: 0, top: 0, width: '100%', height: Math.max(0, box.top), background: scrim }} onClick={finish} />
          <div style={{ position: 'fixed', left: 0, top: box.top + box.height, width: '100%', bottom: 0, background: scrim }} onClick={finish} />
          <div style={{ position: 'fixed', left: 0, top: box.top, width: Math.max(0, box.left), height: box.height, background: scrim }} onClick={finish} />
          <div style={{ position: 'fixed', left: box.left + box.width, top: box.top, right: 0, height: box.height, background: scrim }} onClick={finish} />
          <div
            style={{
              position: 'fixed', left: box.left, top: box.top, width: box.width, height: box.height,
              border: '2px solid var(--nav-accent)', borderRadius: 14, pointerEvents: 'none',
              boxShadow: '0 0 0 4px rgba(91,76,224,0.25)',
            }}
          />
        </>
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: scrim }} onClick={finish} />
      )}

      <div
        className="fixed rounded-2xl p-4 nav-glass"
        style={{ ...tipStyle, boxShadow: '0 24px 50px -20px rgba(10,10,15,0.45)' }}
      >
        <div className="text-[11px] font-semibold mb-1" style={{ color: 'var(--nav-text-muted)' }}>
          {i + 1} из {STEPS.length}
        </div>
        <div className="font-semibold text-sm mb-1.5" style={{ color: 'var(--nav-text-primary)' }}>
          {step.title}
        </div>
        <p className="text-[13px] leading-relaxed mb-3" style={{ color: 'var(--nav-text-secondary)' }}>
          {step.body}
        </p>
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={finish}
            className="min-h-[44px] px-3 text-[13px] font-medium rounded-xl"
            style={{ color: 'var(--nav-text-muted)' }}
          >
            Пропустить
          </button>
          <button
            onClick={next}
            className="min-h-[44px] px-5 text-[13px] font-semibold rounded-xl"
            style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
          >
            {i === STEPS.length - 1 ? 'Готово' : 'Далее'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
