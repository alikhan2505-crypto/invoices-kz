'use client'

import { useEffect, useRef, useState } from 'react'
import { useInView } from 'framer-motion'
import { BentoCard, type BentoItem } from '@/components/ui/bento-grid'

// Плитки «Всё для счетов» с микро-анимацией иконки по смыслу фичи:
// молния прорисовывается (счёт за минуту), Kaspi QR пульсирует, ручка
// расписывается, у ЭСФ ставится галочка, лупа проходит по выписке,
// стрелки повтора делают оборот. Играет один раз, когда плитка въехала
// в экран, и заново при наведении/фокусе (не чаще раза в ~1.4 с).
// Сама анимация -- CSS (invoices-landing.css, всё под
// prefers-reduced-motion: no-preference); перезапуск -- сменой key у
// обёртки иконки, так что keyframes одни на оба случая.

export type BentoMotionKind = 'invoice' | 'kaspi' | 'esign' | 'esf' | 'acquiring' | 'templates'

const P = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function Glyph({ kind }: { kind: BentoMotionKind }) {
  switch (kind) {
    case 'invoice':
      return (
        <svg className="h-5 w-5 inv-pop" aria-hidden="true" {...P}>
          <path className="inv-flash" d="M12.5 2 4 13.5h6.2L11 22l8.5-11.5H13.3L12.5 2Z" fill="currentColor" stroke="none" />
          <path className="inv-draw" pathLength={1} d="M12.5 2 4 13.5h6.2L11 22l8.5-11.5H13.3L12.5 2Z" />
        </svg>
      )
    case 'kaspi':
      return (
        <svg className="h-5 w-5" aria-hidden="true" {...P}>
          <circle className="inv-ring" cx="12" cy="12" r="10.5" strokeWidth={1.4} />
          <rect x="4" y="4" width="6" height="6" rx="1.4" />
          <rect x="14" y="4" width="6" height="6" rx="1.4" />
          <rect x="4" y="14" width="6" height="6" rx="1.4" />
          <path d="M14 14h2.5M19.5 14v2.5M14 17.5v2.5M17 20h3M17 17h.01" />
        </svg>
      )
    case 'esign':
      return (
        <svg className="h-5 w-5" aria-hidden="true" {...P}>
          <g className="inv-pen">
            <path d="M15.2 3.6a1.9 1.9 0 0 1 2.7 2.7L9.6 14.6l-3.4.8.8-3.4 8.2-8.4Z" />
          </g>
          <path className="inv-draw inv-draw-slow" pathLength={1} d="M3.5 20.2c1.4-1.7 2.6-1.7 3.2 0s1.9 1.7 3.1 0 2.3-1.7 3.2 0 2.1 1.5 3.6.1 2 .9 3.9.6" />
        </svg>
      )
    case 'esf':
      return (
        <svg className="h-5 w-5" aria-hidden="true" {...P}>
          <g className="inv-lift">
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
            <path d="M14 3v5h5" />
          </g>
          <path className="inv-draw inv-draw-late" pathLength={1} d="M9 14.5l2 2 4-4" strokeWidth={2.1} />
        </svg>
      )
    case 'acquiring':
      return (
        <svg className="h-5 w-5" aria-hidden="true" {...P}>
          <path className="inv-row inv-row-1" d="M4 5h11" />
          <path className="inv-row inv-row-2" d="M4 9.5h8" />
          <path className="inv-row inv-row-3" d="M4 14h5" />
          <g className="inv-lens">
            <circle cx="15.5" cy="15.5" r="3.5" />
            <path d="M18 18l2.5 2.5" />
          </g>
        </svg>
      )
    case 'templates':
      return (
        <svg className="h-5 w-5 inv-spin-once" aria-hidden="true" {...P}>
          <path d="M17 2.5 20 5.5l-3 3" />
          <path d="M4 11.5v-1a5 5 0 0 1 5-5h11" />
          <path d="M7 21.5 4 18.5l3-3" />
          <path d="M20 12.5v1a5 5 0 0 1-5 5H4" />
        </svg>
      )
  }
}

export function BentoMotionTile({ item, kind }: { item: Omit<BentoItem, 'icon'>; kind: BentoMotionKind }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '0px 0px -15% 0px' })
  // первый проигрыш -- сам факт появления в кадре, дальше -- наведения
  const [replays, setReplays] = useState(0)
  const play = replays + (inView ? 1 : 0)
  const last = useRef(0)

  useEffect(() => {
    if (inView) last.current = performance.now()
  }, [inView])

  const replay = () => {
    const now = performance.now()
    if (!inView || now - last.current < 1400) return
    last.current = now
    setReplays((p) => p + 1)
  }

  return (
    <div ref={ref} className="h-full" onMouseEnter={replay} onFocusCapture={replay}>
      <BentoCard
        item={{
          ...item,
          icon: (
            <span key={play} className="inv-ic flex" data-play={play > 0 ? 'true' : undefined}>
              <Glyph kind={kind} />
            </span>
          ),
        }}
      />
    </div>
  )
}
