'use client'

import type { CSSProperties } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useLanguage } from './LanguageProvider'
import { invoiceFlowDict } from '@/lib/i18n/invoiceFlow'
import { EASE } from '@/lib/numberTween'
import { useTweenedNumber } from './useTweenedNumber'

/**
 * Which part of the document the form is currently editing. /create sets it
 * from focus: a client field lights the «Кому» block, an item row its own row,
 * the due date its line. Pages that pass nothing get no highlight at all.
 */
export type PreviewHighlight =
  | { kind: 'client' }
  | { kind: 'due' }
  | { kind: 'row'; key: string }
  | null

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
  /**
   * Stable identity per entry of `services`, same order. Without it rows are
   * keyed by position, which is fine for a read-only invoice but on /create
   * made the enter animation play on the wrong row when an item was inserted
   * at the top.
   */
  serviceKeys?: string[]
  highlight?: PreviewHighlight
  /**
   * Soft placeholder bars in «Кому» while the client name / БИН are still
   * empty -- a form being filled in. Off for a saved invoice, where an empty
   * field is just empty.
   */
  skeletonWhenEmpty?: boolean
}

// This is the actual printed/PDF-facing invoice document, not app chrome —
// it intentionally keeps a fixed light "paper" look in BOTH app themes
// (like a real printed invoice would), so it never gets glass/blur treatment
// and its colors are pinned as literal values rather than the theme-reactive
// --nav-* custom properties (which would otherwise flip to unreadable
// light-on-white text the moment the app is switched to dark mode while this
// card stays white). These are the app's own light-mode palette values —
// same navy/violet accent family as --nav-accent, replacing the old
// unrelated raw #1C2056/#2DC48D hardcodes. The focus highlight and the
// skeleton bars below sit on that same paper, so they are pinned too.
const DOC = {
  ink: '#14162A',
  inkSecondary: '#565C7E',
  inkMuted: '#8A8FB0',
  border: 'rgba(20,22,42,0.09)',
  chip: '#F5F6FB',
  accent: '#5B4CE0',
  success: '#12946B',
  successSoft: 'rgba(18,148,107,0.10)',
  highlight: 'rgba(91,76,224,0.08)',
  skeleton: 'rgba(20,22,42,0.07)',
}

function formatMoney(n: number): string {
  return Math.round(n).toLocaleString('ru-KZ') + ' ₸'
}

/** A money figure that counts to each new value (instant under reduced motion). */
function Money({ value, className, style }: { value: number; className?: string; style?: CSSProperties }) {
  const shown = useTweenedNumber(value)
  return <span className={`tabular-nums ${className || ''}`} style={style}>{formatMoney(shown)}</span>
}

/**
 * The soft "this is what you are editing" wash. Background plus a spread
 * shadow of the same colour, so it reads as padded without adding a pixel of
 * padding -- nothing around it moves when focus comes and goes.
 */
function highlightStyle(active: boolean, reduceMotion: boolean): CSSProperties {
  return {
    borderRadius: 8,
    background: active ? DOC.highlight : 'transparent',
    boxShadow: `0 0 0 5px ${active ? DOC.highlight : 'transparent'}`,
    transition: reduceMotion ? 'none' : 'background-color 220ms ease, box-shadow 220ms ease',
  }
}

/** Placeholder bar sitting in a line box of exactly the text's height. */
function SkeletonLine({ lineClass, width }: { lineClass: string; width: string }) {
  return (
    <div className={`${lineClass} flex items-center`} aria-hidden="true">
      <div className="h-[0.6em] rounded-full motion-safe:animate-pulse" style={{ width, background: DOC.skeleton }} />
    </div>
  )
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
  serviceKeys,
  highlight = null,
  skeletonWhenEmpty = false,
}: InvoiceLivePreviewProps) {
  const { lang } = useLanguage()
  const t = invoiceFlowDict[lang]
  const reduceMotion = !!useReducedMotion()

  // Mirrors the VAT math in src/lib/generatePDF.ts and /create's own totals exactly.
  const vatAmount = vatType === 'vat_16' ? Math.round(total - total / 1.16) : 0
  const totalWithoutVat = vatType === 'vat_16' ? Math.round(total / 1.16) : total

  const rows = services
    .map((svc, idx) => ({ svc, key: serviceKeys?.[idx] ?? String(idx) }))
    .filter(r => r.svc.name)

  // Real text replacing a skeleton bar fades in; same box height, so nothing shifts.
  const fade = reduceMotion
    ? { initial: false as const }
    : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { ease: EASE, duration: 0.25 } }

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
        <div className="text-xs mb-3" style={{ color: DOC.inkMuted, ...highlightStyle(highlight?.kind === 'due', reduceMotion) }}>
          {t.dueDateLabel}: {dueDate}
        </div>
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
        <div style={highlightStyle(highlight?.kind === 'client', reduceMotion)}>
          <div className="text-xs uppercase tracking-wide mb-1" style={{ color: DOC.inkMuted }}>{t.previewToLabel}</div>
          {clientName ? (
            <motion.div key="name" {...fade} className="text-sm font-medium" style={{ color: DOC.ink }}>{clientName}</motion.div>
          ) : skeletonWhenEmpty ? (
            <SkeletonLine lineClass="text-sm h-5" width="62%" />
          ) : null}
          {clientBin ? (
            <motion.div key="bin" {...fade} className="text-xs" style={{ color: DOC.inkMuted }}>{t.binLabel(clientBin)}</motion.div>
          ) : skeletonWhenEmpty ? (
            <SkeletonLine lineClass="text-xs h-4" width="38%" />
          ) : null}
        </div>
      </div>

      {/* Services */}
      <div className="pt-3 mb-4" style={{ borderTop: `1px dashed ${DOC.border}` }}>
        <AnimatePresence initial={false}>
          {rows.map(({ svc, key }) => (
            <motion.div
              key={key}
              layout={!reduceMotion}
              initial={reduceMotion ? false : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 }}
              transition={{ ease: EASE, duration: reduceMotion ? 0 : 0.25 }}
              className="flex items-center justify-between gap-3 py-1.5 text-sm"
              style={highlightStyle(highlight?.kind === 'row' && highlight.key === key, reduceMotion)}
            >
              <span style={{ color: DOC.inkSecondary }}>
                {svc.name} × {svc.qty}
                {svc.unit ? ` ${svc.unit}` : ''}
              </span>
              <Money value={svc.qty * svc.price} className="font-medium whitespace-nowrap" style={{ color: DOC.ink }} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Note */}
      {note && (
        <div className="text-xs mb-4 pt-3" style={{ color: DOC.inkMuted, borderTop: `1px dashed ${DOC.border}` }}>{note}</div>
      )}

      {/* Total -- the full VAT breakdown, line for line what /create's own
          totals block shows (Сумма без НДС + НДС 16% / НДС 0%: 0 ₸ / Без НДС —),
          since on a desktop this preview is now the only place those lines
          appear. */}
      <div className="pt-3" style={{ borderTop: `2px solid rgba(20,22,42,0.1)` }}>
        {vatType === 'vat_16' && (
          <>
            <div className="flex justify-between text-xs mb-2" style={{ color: DOC.inkMuted }}>
              <span>{t.amountWithoutVatLabel}</span>
              <Money value={totalWithoutVat} />
            </div>
            <div className="flex justify-between text-xs mb-2" style={{ color: DOC.inkMuted }}>
              <span>{t.vat16Label}</span>
              <Money value={vatAmount} />
            </div>
          </>
        )}
        {vatType === 'vat_0' && (
          <div className="flex justify-between text-xs mb-2" style={{ color: DOC.inkMuted }}>
            <span>{t.vat0Label}</span>
            <span>{t.vat0Amount}</span>
          </div>
        )}
        {vatType !== 'vat_16' && vatType !== 'vat_0' && (
          <div className="flex justify-between text-xs mb-2" style={{ color: DOC.inkMuted }}>
            <span>{t.noVatLabel}</span>
            <span>{t.noVatDash}</span>
          </div>
        )}
        <div className="flex items-center justify-between rounded-xl px-3 py-2.5 -mx-1" style={{ background: DOC.successSoft }}>
          <span className="text-sm font-semibold" style={{ color: DOC.ink }}>{t.amountDueLabel}</span>
          {/* A leaf <Money>, like every other figure here: its per-frame count
              re-renders only itself, not the whole preview and its layout rows. */}
          <Money value={total} className="text-xl font-bold" style={{ color: DOC.success }} />
        </div>
      </div>
      </div>
    </div>
  )
}
