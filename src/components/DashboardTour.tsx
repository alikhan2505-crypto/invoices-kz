'use client'
import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'

type Step = { anchor: string; title: string; body: string }

// Anchors are data-tour attributes on elements that already exist; the tour
// never renders its own copy of them. A step whose anchor isn't actually
// rendered right now -- absent from the DOM, or present but hidden by CSS
// (e.g. the mobile-only menu button behind `lg:hidden` on a desktop
// viewport) -- is skipped rather than pointing at nothing. See findAnchor().
const STEPS: Step[] = [
  {
    anchor: 'products',
    title: 'Четыре продукта на одной платформе',
    body: 'Счета, приём оплат Kaspi, ИИ-агент и Kaspi Bot. Начните с любого — остальные подключите когда понадобятся.',
  },
  {
    anchor: 'create-invoice',
    title: 'Первый счёт — за минуту',
    body: 'Реквизиты компании понадобятся только на этом шаге — заранее их заполнять не нужно.',
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

// `lg:hidden` is display:none, not unmount -- the mobile menu button is in the
// DOM on desktop too. querySelector would find it and getBoundingClientRect()
// would hand back an all-zero rect, drawing a 12px highlight in the corner for
// a control that isn't on screen. getClientRects() is empty for anything not
// actually rendered, which is the question we mean to ask.
function findAnchor(name: string): Element | null {
  const el = document.querySelector(`[data-tour="${name}"]`)
  return el && el.getClientRects().length > 0 ? el : null
}

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
      if (cancelled || !data || data.tour_completed_at) return
      // Start at the first step whose anchor is actually rendered on this
      // viewport (e.g. skip straight past "menu" on desktop, where that
      // anchor sits in the DOM behind `lg:hidden`). If nothing on this
      // viewport has a rendered anchor, don't open the tour at all rather
      // than show an empty scrim.
      const start = STEPS.findIndex((s) => findAnchor(s.anchor))
      if (start === -1) return
      // Measure now, in this same batched update, instead of leaving
      // vw/vh/rect at their zero/null initial state for one frame -- open
      // and i changing without them means the first paint computes box as
      // null (full-screen scrim, no highlight) and tipWidth as negative
      // (vw is still 0), corrected only after the post-paint effect below
      // runs measure().
      const startEl = findAnchor(STEPS[start].anchor)
      setVw(window.innerWidth)
      setVh(window.innerHeight)
      setRect(startEl ? startEl.getBoundingClientRect() : null)
      setI(start)
      setOpen(true)
    })()
    return () => { cancelled = true }
  }, [])

  const measure = useCallback(() => {
    const step = STEPS[i]
    if (!step) return
    const el = findAnchor(step.anchor)
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
    const { error } = await supabase.from('profiles')
      .update({ tour_completed_at: new Date().toISOString() })
      .eq('id', user.id)
    // Close stays optimistic -- blocking the UI on this round-trip would be
    // worse than a rare re-show -- but a silent failure here means the tour
    // resurrects on next load with no trace, so at least log it.
    if (error) console.error('DashboardTour: failed to save tour_completed_at', error)
  }, [])

  const next = useCallback(() => {
    // Skip forward over any step whose anchor isn't rendered on this viewport.
    for (let j = i + 1; j < STEPS.length; j++) {
      if (findAnchor(STEPS[j].anchor)) { setI(j); return }
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
    const el = findAnchor(STEPS[i].anchor)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
    const t = setTimeout(measure, reduce ? 0 : 400)
    return () => clearTimeout(t)
  }, [open, i, measure])

  // The spotlight hole is a real hole -- the four scrim rectangles only cover
  // the area *around* the highlighted element, so it stays fully clickable by
  // design. If the user activates it directly instead of Далее/Пропустить,
  // that must still count as completing the tour, or finish() never runs and
  // tour_completed_at never gets set. Capture-phase so this observes the
  // click before the anchor's own handler can navigate away; one-shot so it
  // never lingers past this step; never preventDefault/stopPropagation so
  // the click still does exactly what it always did.
  useEffect(() => {
    if (!open) return
    const el = findAnchor(STEPS[i].anchor)
    if (!el) return
    const onAnchorClick = () => finish()
    el.addEventListener('click', onAnchorClick, { capture: true, once: true })
    return () => el.removeEventListener('click', onAnchorClick, { capture: true })
  }, [open, i, finish])

  if (!open || typeof document === 'undefined') return null
  const step = STEPS[i]
  if (!step) return null

  // Number against the steps that will actually be shown on this viewport,
  // not the raw STEPS array -- otherwise a step whose anchor isn't rendered
  // here (e.g. "menu" on desktop, hidden behind `lg:hidden`) is skipped by
  // next() but still counted, so the visible counter jumps 1 -> 2 -> 4.
  // findAnchor stays the single source of truth for visibility, same as
  // everywhere else in this component.
  const visibleSteps = STEPS.filter((s) => findAnchor(s.anchor))
  const stepNumber = visibleSteps.indexOf(step) + 1

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
  // Horizontal position is clamped into the viewport above, but height is not
  // something we can predict from copy length -- so instead of guessing it,
  // cap the tooltip to the room actually available on the side we chose
  // (above/below stays exactly the 60%-of-viewport rule already computed)
  // and let long text scroll inside the card rather than off the screen.
  const tipStyle: React.CSSProperties = box
    ? below
      ? { top: box.top + box.height + GAP, left: tipLeft, width: tipWidth, maxHeight: Math.max(0, vh - (box.top + box.height + GAP) - MARGIN), overflowY: 'auto' }
      : { bottom: vh - box.top + GAP, left: tipLeft, width: tipWidth, maxHeight: Math.max(0, box.top - GAP - MARGIN), overflowY: 'auto' }
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
          {stepNumber} из {visibleSteps.length}
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
