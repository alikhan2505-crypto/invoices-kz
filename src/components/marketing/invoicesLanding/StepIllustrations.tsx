'use client'

import { motion } from 'framer-motion'
import { PseudoQr } from './PseudoQr'
import { useLoopStep } from './useLoopStep'

// Маленькие зацикленные иллюстрации к трём шагам «Как это работает».
// Каждая -- в коробке фиксированного размера (176x104), крутится только
// пока видна на экране (useLoopStep), при reduced motion стоит на
// финальном кадре. Всё движение -- transform/opacity.

const MINT = '#5EEAD4'
const VIOLET = '#6E5ED8'
const MAGENTA = '#CE4C86'
const EASE = [0.16, 1, 0.3, 1] as const
const LINE = 'rgba(255,255,255,0.1)'

export interface StepArtCopy {
  number: string
  awaiting: string
  stamp: string
}

function Frame({ children, frameRef }: { children: React.ReactNode; frameRef: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={frameRef}
      aria-hidden="true"
      className="relative mx-auto h-[104px] w-[176px] select-none overflow-hidden rounded-xl"
      style={{ background: 'rgba(255,255,255,0.035)', border: `1px solid ${LINE}` }}
    >
      {children}
    </div>
  )
}

/* Шаг 1: поля формы заполняются по очереди, потом выскакивает «PDF ✓». */
const FORM_DURATIONS = [700, 650, 650, 650, 2200] as const
const FIELDS = [0.72, 0.5, 0.86]
export function StepFormArt() {
  const { ref, step, reduce } = useLoopStep<HTMLDivElement>(FORM_DURATIONS)
  const tr = { duration: reduce ? 0 : 0.55, ease: EASE }
  return (
    <Frame frameRef={ref}>
      <div className="absolute inset-x-3 top-3 space-y-2">
        {FIELDS.map((w, i) => {
          const filled = step >= i + 1
          const typing = step === i + 1 && !reduce
          return (
            <div key={i}>
              <div className="mb-1 h-1 w-8 rounded-full" style={{ background: 'rgba(255,255,255,0.18)' }} />
              <div
                className="relative h-[15px] overflow-hidden rounded-[5px]"
                style={{ background: 'rgba(255,255,255,0.05)', boxShadow: `inset 0 0 0 1px ${LINE}` }}
              >
                {/* фокус поля -- фиолетовая рамка поверх, только opacity */}
                <motion.span
                  className="pointer-events-none absolute inset-0 rounded-[5px]"
                  style={{ boxShadow: `inset 0 0 0 1px ${VIOLET}` }}
                  initial={false}
                  animate={{ opacity: typing ? 1 : 0 }}
                  transition={{ duration: 0.2 }}
                />
                <motion.div
                  className="absolute left-1.5 top-1/2 h-1.5 origin-left rounded-full"
                  style={{ width: `${w * 100 - 8}%`, marginTop: -3, background: 'rgba(255,255,255,0.55)' }}
                  initial={false}
                  animate={{ scaleX: filled ? 1 : 0 }}
                  transition={tr}
                />
              </div>
            </div>
          )
        })}
      </div>
      <motion.div
        className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-bold text-white"
        style={{ background: VIOLET }}
        initial={false}
        animate={step >= 4 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6 }}
        transition={step >= 4 && !reduce ? { type: 'spring', stiffness: 520, damping: 20 } : { duration: reduce ? 0 : 0.25 }}
      >
        PDF
        <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7" />
        </svg>
      </motion.div>
    </Frame>
  )
}

/* Шаг 2: телефон наезжает на Kaspi QR в счёте, скан-линия, на экране ✓. */
const SCAN_DURATIONS = [800, 900, 1300, 2000] as const
export function StepScanArt() {
  const { ref, step, reduce } = useLoopStep<HTMLDivElement>(SCAN_DURATIONS)
  const over = step >= 1
  return (
    <Frame frameRef={ref}>
      {/* счёт с QR */}
      <div className="absolute left-4 top-3 h-[78px] w-[64px] rounded-md p-1.5" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="h-1 w-8 rounded-full" style={{ background: 'rgba(255,255,255,0.3)' }} />
        <div className="mt-1 h-1 w-6 rounded-full" style={{ background: 'rgba(255,255,255,0.18)' }} />
        <PseudoQr className="mt-2 h-[42px] w-[42px]" />
      </div>
      {/* телефон */}
      <motion.div
        className="absolute right-5 top-2 h-[88px] w-[50px] rounded-[11px] p-[3px]"
        style={{ background: '#0a0d1f', boxShadow: `0 0 0 1.5px rgba(255,255,255,0.35), 0 10px 22px rgba(0,0,0,0.45)` }}
        initial={false}
        animate={over ? { x: -84, y: 2, rotate: 0 } : { x: 0, y: 0, rotate: 9 }}
        transition={{ duration: reduce ? 0 : 0.7, ease: EASE }}
      >
        <div className="relative h-full w-full overflow-hidden rounded-[8px]" style={{ background: 'rgba(255,255,255,0.06)' }}>
          {/* камера видит QR из счёта под телефоном */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            initial={false}
            animate={{ opacity: over ? 0.9 : 0 }}
            transition={{ duration: reduce ? 0 : 0.4, delay: over && !reduce ? 0.35 : 0 }}
          >
            <PseudoQr className="h-[30px] w-[30px]" />
          </motion.div>
          {/* видоискатель */}
          <div className="absolute rounded-[4px]" style={{ left: 7, right: 7, top: 24, bottom: 24, border: '1.2px dashed rgba(255,255,255,0.35)' }} />
          {!reduce && step === 2 && (
            <motion.span
              className="absolute inset-x-1.5 top-0 h-[2px] rounded-full"
              style={{ background: MINT, boxShadow: `0 0 8px 1px ${MINT}` }}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: [24, 58, 24], opacity: [0, 1, 1, 0] }}
              transition={{ duration: 1.2, ease: 'easeInOut' }}
            />
          )}
          {/* оплачено: экран заливается, по центру галочка */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: MINT }}
            initial={false}
            animate={{ opacity: step >= 3 ? 1 : 0 }}
            transition={{ duration: reduce ? 0 : 0.3 }}
          >
            <motion.svg
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="#0a0d1f"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={false}
              animate={{ scale: step >= 3 ? 1 : 0.4 }}
              transition={step >= 3 && !reduce ? { type: 'spring', stiffness: 480, damping: 18 } : { duration: 0 }}
            >
              <path d="M5 12.5l4.5 4.5L19 7" />
            </motion.svg>
          </motion.div>
        </div>
      </motion.div>
    </Frame>
  )
}

/* Шаг 3: звонит колокольчик, приходит уведомление, статус счёта
   переключается «Ожидает оплаты» -> «Оплачено». */
const PAID_DURATIONS = [1100, 900, 2400] as const
export function StepPaidArt({ t }: { t: StepArtCopy }) {
  const { ref, step, reduce } = useLoopStep<HTMLDivElement>(PAID_DURATIONS)
  const ring = step >= 1
  const paid = step >= 2
  return (
    <Frame frameRef={ref}>
      {/* уведомление сверху */}
      <motion.div
        className="absolute left-3 top-2.5 flex items-center gap-1.5 rounded-md px-2 py-1 text-[9.5px] font-semibold tabular-nums"
        style={{ background: 'rgba(94,234,212,0.14)', color: MINT }}
        initial={false}
        animate={ring ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
        transition={{ duration: reduce ? 0 : 0.45, ease: EASE }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: MINT }} />
        Kaspi +174&nbsp;000&nbsp;₸
      </motion.div>
      {/* колокольчик */}
      <div className="absolute right-3 top-2">
        <motion.svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          style={{ color: 'rgba(255,255,255,0.8)', transformOrigin: '50% 10%' }}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={step === 1 && !reduce ? { rotate: [0, -20, 16, -10, 6, 0] } : { rotate: 0 }}
          transition={{ duration: 0.8, ease: 'easeInOut' }}
        >
          <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z" />
          <path d="M10 20a2.1 2.1 0 0 0 4 0" />
        </motion.svg>
        <motion.span
          className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full"
          style={{ background: MAGENTA, boxShadow: '0 0 0 2px #14172e' }}
          initial={false}
          animate={{ scale: ring ? 1 : 0 }}
          transition={ring && !reduce ? { type: 'spring', stiffness: 600, damping: 16 } : { duration: reduce ? 0 : 0.2 }}
        />
      </div>
      {/* строка счёта со статусом */}
      <div
        className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 rounded-lg px-2.5 py-2"
        style={{ background: 'rgba(255,255,255,0.06)', boxShadow: `inset 0 0 0 1px ${LINE}` }}
      >
        {/* оплачено -- мятная рамка поверх, только opacity */}
        <motion.span
          className="pointer-events-none absolute inset-0 rounded-lg"
          style={{ boxShadow: `inset 0 0 0 1px ${MINT}` }}
          initial={false}
          animate={{ opacity: paid ? 1 : 0 }}
          transition={{ duration: reduce ? 0 : 0.4 }}
        />
        <div className="min-w-0">
          <div className="text-[10px] font-semibold text-white">{t.number}</div>
          <div className="mt-0.5 text-[9px] tabular-nums" style={{ color: 'rgba(255,255,255,0.6)' }}>174&nbsp;000&nbsp;₸</div>
        </div>
        <span className="grid shrink-0 text-[9px] font-bold">
          {[t.awaiting, t.stamp].map((label, i) => {
            const on = (i === 1) === paid
            return (
              <motion.span
                key={i}
                className="col-start-1 row-start-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-center"
                style={i === 1 ? { background: '#0B7A88', color: '#fff' } : { background: 'rgba(206,76,134,0.18)', color: '#F5A3C7' }}
                initial={false}
                animate={{ opacity: on ? 1 : 0, scale: on ? 1 : 0.85 }}
                transition={on && i === 1 && !reduce ? { type: 'spring', stiffness: 480, damping: 22 } : { duration: reduce ? 0 : 0.25 }}
              >
                {label}
              </motion.span>
            )
          })}
        </span>
      </div>
    </Frame>
  )
}
