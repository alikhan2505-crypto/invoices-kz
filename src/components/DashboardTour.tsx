'use client'
import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'

type Step = { anchor: string; title: string; body: string }

// Same easing curve used across the dashboard's own card entrances
// (src/app/dashboard/page.tsx's EASE) -- kept identical rather than
// inventing a second "house" feel for a component that sits on top of it.
const EASE = [0.16, 1, 0.3, 1] as const

// Anchors are data-tour attributes on elements that already exist; the tour
// never renders its own copy of them. A step whose anchor isn't actually
// rendered right now -- absent from the DOM, or present but hidden by CSS
// (e.g. the mobile-only menu button behind `lg:hidden` on a desktop
// viewport) -- is skipped rather than pointing at nothing. See findAnchor().
//
// Ordered as a narrative, not by screen position: make your first invoice,
// see it land in the list, watch the numbers move, then the rest of the
// furniture (navigation, alerts, help, the wallet everything bills to).
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
    anchor: 'recent-invoices',
    title: 'Все счета — здесь',
    body: 'Каждый выставленный счёт появляется в этом списке. Нажмите на любой, чтобы открыть, или посмотрите всю историю целиком.',
  },
  {
    anchor: 'analytics',
    title: 'Выручка на виду',
    body: 'Как только появятся оплаченные счета, здесь будет видно, сколько заработано за день, неделю или месяц.',
  },
  {
    anchor: 'menu',
    title: 'Всё меню здесь',
    body: 'Разделы и их страницы. Открытым показывается только тот раздел, в котором вы сейчас.',
  },
  {
    anchor: 'notifications',
    title: 'Узнаёте первым',
    body: 'Клиент открыл счёт или оплатил его — сообщение придёт сюда, без необходимости проверять вручную.',
  },
  {
    anchor: 'help',
    title: 'Если что-то не получается',
    body: 'Поддержка и разделы о сервисе — начните отсюда, ответим быстро.',
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
  // useReducedMotion over a raw matchMedia check, for the same reason the
  // rest of this codebase does (dashboard/page.tsx's own `reduceMotion`):
  // one source of truth, and it's already a dependency here.
  const reduce = useReducedMotion() ?? false

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
    el?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
    const t = setTimeout(measure, reduce ? 0 : 400)
    return () => clearTimeout(t)
  }, [open, i, measure, reduce])

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
  // `y` centers the box-less fallback vertically via transform rather than a
  // raw pixel `top`, so it doesn't need its own rendered height to centre
  // correctly -- matching what the pre-animation version did with
  // `top: '50%', transform: 'translateY(-50%)'`.
  const tipPos: { top?: number; bottom?: number; left: number; width: number; maxHeight: number; y: number | string } = box
    ? below
      ? { top: box.top + box.height + GAP, left: tipLeft, width: tipWidth, maxHeight: Math.max(0, vh - (box.top + box.height + GAP) - MARGIN), y: 0 }
      : { bottom: vh - box.top + GAP, left: tipLeft, width: tipWidth, maxHeight: Math.max(0, box.top - GAP - MARGIN), y: 0 }
    : { top: vh / 2, left: MARGIN, width: tipWidth, maxHeight: vh - MARGIN * 2, y: '-50%' }

  // One duration/curve for every moving piece here, so the spotlight, its
  // four-rectangle scrim and the tooltip glide between anchors as a single
  // coordinated motion rather than several elements drifting at their own
  // pace. Reduced-motion drops straight to the new position, matching the
  // instant scroll already used above for the same preference.
  const glide = { duration: reduce ? 0 : 0.4, ease: EASE }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Знакомство с платформой"
      className="fixed inset-0 z-[80]"
    >
      {box ? (
        <>
          <motion.div
            style={{ position: 'fixed', left: 0, top: 0, width: '100%', background: scrim }}
            animate={{ height: Math.max(0, box.top) }}
            transition={glide}
            onClick={finish}
          />
          <motion.div
            style={{ position: 'fixed', left: 0, width: '100%', bottom: 0, background: scrim }}
            animate={{ top: box.top + box.height }}
            transition={glide}
            onClick={finish}
          />
          <motion.div
            style={{ position: 'fixed', left: 0, background: scrim }}
            animate={{ top: box.top, width: Math.max(0, box.left), height: box.height }}
            transition={glide}
            onClick={finish}
          />
          <motion.div
            style={{ position: 'fixed', right: 0, background: scrim }}
            animate={{ top: box.top, left: box.left + box.width, height: box.height }}
            transition={glide}
            onClick={finish}
          />
          <motion.div
            style={{
              position: 'fixed',
              border: '2px solid var(--nav-accent)', borderRadius: 14, pointerEvents: 'none',
              boxShadow: '0 0 0 4px rgba(91,76,224,0.25)',
            }}
            animate={{ top: box.top, left: box.left, width: box.width, height: box.height }}
            transition={glide}
          />
        </>
      ) : (
        <motion.div
          style={{ position: 'fixed', inset: 0, background: scrim }}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={glide}
          onClick={finish}
        />
      )}

      {/* The tooltip's position glides like the spotlight above (same
          `glide`), while AnimatePresence crossfades its CONTENT between
          steps -- key={i} means the outgoing card fades/slides out as the
          incoming one fades/slides in, instead of the text swapping
          instantly mid-glide. mode="popLayout" keeps the outgoing card from
          nudging layout while both are briefly mounted together. */}
      <motion.div
        className="fixed"
        animate={{
          top: tipPos.top,
          bottom: tipPos.bottom,
          left: tipPos.left,
          width: tipPos.width,
          y: tipPos.y,
        }}
        transition={glide}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={i}
            initial={reduce ? false : { opacity: 0, y: below ? -8 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: below ? 8 : -8 }}
            transition={{ duration: reduce ? 0 : 0.22, ease: EASE }}
            className="rounded-2xl p-4 nav-glass"
            style={{ maxHeight: tipPos.maxHeight, overflowY: 'auto', boxShadow: '0 24px 50px -20px rgba(10,10,15,0.45)' }}
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
                className="min-h-[44px] px-5 text-[13px] font-semibold rounded-xl transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0"
                style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
              >
                {stepNumber === visibleSteps.length ? 'Готово' : 'Далее'}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>,
    document.body
  )
}
