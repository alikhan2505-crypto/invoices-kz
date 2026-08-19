'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLanguage } from './LanguageProvider'
import { invoiceFlowDict } from '@/lib/i18n/invoiceFlow'

export interface InvoiceLivePreviewProps {
  invoiceNumber: string
  date: string
  dueDate?: string
  companyName: string
  companyBin: string
  clientName: string
  clientBin: string
  services: { name: string; qty: number; price: number; unit?: string }[]
  note?: string
  vatType: 'no_vat' | 'vat_0' | 'vat_16'
  total: number
}

// Smooth deceleration only — no bounce/spring overshoot anywhere in this component.
const EASE = [0.16, 1, 0.3, 1] as const

// This is the actual printed/PDF-facing invoice document, not app chrome —
// it intentionally keeps a fixed light "paper" look in BOTH app themes
// (like a real printed invoice would), so it never gets glass/blur treatment
// and its colors are pinned as literal values rather than the theme-reactive
// --nav-* custom properties (which would otherwise flip to unreadable
// light-on-white text the moment the app is switched to dark mode while this
// card stays white). These are the app's own light-mode palette values —
// same navy/violet accent family as --nav-accent, replacing the old
// unrelated raw #1C2056/#2DC48D hardcodes.
const DOC = {
  ink: '#14162A',
  inkSecondary: '#565C7E',
  inkMuted: '#8A8FB0',
  border: 'rgba(20,22,42,0.09)',
  chip: '#F5F6FB',
  accent: '#5B4CE0',
  success: '#12946B',
  successSoft: 'rgba(18,148,107,0.10)',
}

// Cubic-bezier evaluator matching the EASE curve above, used to drive the
// requestAnimationFrame count-up so it decelerates identically to the
// Framer Motion row transitions.
function cubicBezier(p1x: number, p1y: number, p2x: number, p2y: number) {
  const a = (a1: number, a2: number) => 1 - 3 * a2 + 3 * a1
  const b = (a1: number, a2: number) => 3 * a2 - 6 * a1
  const c = (a1: number) => 3 * a1

  const calcBezier = (t: number, a1: number, a2: number) =>
    ((a(a1, a2) * t + b(a1, a2)) * t + c(a1)) * t

  const getSlope = (t: number, a1: number, a2: number) =>
    3 * a(a1, a2) * t * t + 2 * b(a1, a2) * t + c(a1)

  const getTForX = (x: number) => {
    let t = x
    for (let i = 0; i < 8; i++) {
      const slope = getSlope(t, p1x, p2x)
      if (slope === 0) return t
      const x2 = calcBezier(t, p1x, p2x) - x
      t -= x2 / slope
    }
    return t
  }

  return (x: number) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    return calcBezier(getTForX(x), p1y, p2y)
  }
}

const easeSmooth = cubicBezier(EASE[0], EASE[1], EASE[2], EASE[3])

function formatMoney(n: number): string {
  return Math.round(n).toLocaleString('ru-KZ') + ' ₸'
}

export default function InvoiceLivePreview({
  invoiceNumber,
  date,
  dueDate,
  companyName,
  companyBin,
  clientName,
  clientBin,
  services,
  note,
  vatType,
  total,
}: InvoiceLivePreviewProps) {
  const { lang } = useLanguage()
  const t = invoiceFlowDict[lang]
  const [displayTotal, setDisplayTotal] = useState(total)
  const prevTotalRef = useRef(total)

  useEffect(() => {
    const from = prevTotalRef.current
    const to = total
    if (from === to) {
      return
    }

    const duration = 400
    const startTime = performance.now()
    let rafId: number

    const tick = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = easeSmooth(progress)
      setDisplayTotal(from + (to - from) * eased)

      if (progress < 1) {
        rafId = requestAnimationFrame(tick)
      } else {
        prevTotalRef.current = to
        setDisplayTotal(to)
      }
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [total])

  // Mirrors the VAT math in src/lib/generatePDF.ts exactly.
  const vatAmount = vatType === 'vat_16' ? Math.round(total - total / 1.16) : 0

  return (
    <div className="bg-white rounded-2xl shadow-lg ring-1 ring-black/5 overflow-hidden">
      <div className="h-1.5" style={{ background: DOC.accent }} />
      <div className="p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="text-lg font-bold tracking-wide" style={{ color: DOC.ink }}>{invoiceNumber}</div>
        <div className="text-xs rounded-full px-2.5 py-1" style={{ color: DOC.inkMuted, background: DOC.chip }}>{date}</div>
      </div>

      {dueDate && (
        <div className="text-xs mb-3" style={{ color: DOC.inkMuted }}>{t.dueDateLabel}: {dueDate}</div>
      )}

      {/* From */}
      {(companyName || companyBin) && (
        <div className="pt-3 mb-3" style={{ borderTop: `1px dashed ${DOC.border}` }}>
          <div className="text-xs uppercase tracking-wide mb-1" style={{ color: DOC.inkMuted }}>{t.previewFromLabel}</div>
          {companyName && <div className="text-sm font-medium" style={{ color: DOC.ink }}>{companyName}</div>}
          {companyBin && <div className="text-xs" style={{ color: DOC.inkMuted }}>{t.binLabel(companyBin)}</div>}
        </div>
      )}

      {/* To */}
      <div className="pt-3 mb-4" style={{ borderTop: `1px dashed ${DOC.border}` }}>
        <div className="text-xs uppercase tracking-wide mb-1" style={{ color: DOC.inkMuted }}>{t.previewToLabel}</div>
        {clientName && <div className="text-sm font-medium" style={{ color: DOC.ink }}>{clientName}</div>}
        {clientBin && <div className="text-xs" style={{ color: DOC.inkMuted }}>{t.binLabel(clientBin)}</div>}
      </div>

      {/* Services */}
      <div className="pt-3 mb-4" style={{ borderTop: `1px dashed ${DOC.border}` }}>
        <AnimatePresence initial={false}>
          {services.filter(svc => svc.name).map((svc, idx) => (
            <motion.div
              key={idx}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ ease: EASE, duration: 0.25 }}
              className="flex items-center justify-between py-1.5 text-sm"
            >
              <span style={{ color: DOC.inkSecondary }}>
                {svc.name} × {svc.qty}
                {svc.unit ? ` ${svc.unit}` : ''}
              </span>
              <span className="font-medium" style={{ color: DOC.ink }}>
                {formatMoney(svc.qty * svc.price)}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Note */}
      {note && (
        <div className="text-xs mb-4 pt-3" style={{ color: DOC.inkMuted, borderTop: `1px dashed ${DOC.border}` }}>{note}</div>
      )}

      {/* Total */}
      <div className="pt-3" style={{ borderTop: `2px solid rgba(20,22,42,0.1)` }}>
        {vatType === 'vat_16' && (
          <div className="flex justify-between text-xs mb-2" style={{ color: DOC.inkMuted }}>
            <span>{t.vat16Label}</span>
            <span>{formatMoney(vatAmount)}</span>
          </div>
        )}
        {vatType === 'vat_0' && (
          <div className="flex justify-between text-xs mb-2" style={{ color: DOC.inkMuted }}>
            <span>{t.vat0Label}</span>
            <span>{t.vat0Amount}</span>
          </div>
        )}
        <div className="flex items-center justify-between rounded-xl px-3 py-2.5 -mx-1" style={{ background: DOC.successSoft }}>
          <span className="text-sm font-semibold" style={{ color: DOC.ink }}>{t.amountDueLabel}</span>
          <span className="text-xl font-bold" style={{ color: DOC.success }}>{formatMoney(displayTotal)}</span>
        </div>
      </div>
      </div>
    </div>
  )
}
