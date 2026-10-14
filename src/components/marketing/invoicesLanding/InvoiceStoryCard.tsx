'use client'

import { useEffect } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { PseudoQr } from './PseudoQr'
import { groupThousands, useLoopStep } from './useLoopStep'

// Карточка счёта в hero (телефон/планшет + фолбэк 3D-робота на десктопе)
// рассказывает историю одного счёта по кругу: строки появляются -> итог
// с НДС 16% досчитывается -> появляется Kaspi QR, по нему «проходит» скан
// -> штамп «Оплачено» прихлопывает -> всё гаснет и заново.
// Высота карточки постоянная: все строки, QR и штамп всегда в DOM, меняются
// только opacity/transform -- ничего вокруг не прыгает.

export interface StoryMockCopy {
  url: string
  number: string
  client: string
  service: string
  vat: string
  total: string
  paid: string
  draft: string
  awaiting: string
  payQr: string
  stamp: string
}

const COLOR = { violet: '#6E5ED8', teal: '#0B7A88', magenta: '#CE4C86', mint: '#5EEAD4' }
const SURFACE = 'rgba(20,23,46,0.86)'
const BORDER = 'rgba(255,255,255,0.12)'
const EASE = [0.16, 1, 0.3, 1] as const

// кадры: 0 пустой бланк, 1 услуга, 2 НДС, 3 итог, 4 QR + скан, 5 оплачено
const DURATIONS = [900, 650, 650, 1100, 1700, 2900] as const
const FINAL = 5
const SERVICE = 150000
const VAT = 24000 // 16% от 150 000
const TOTAL = SERVICE + VAT

const fmt = (n: number) => `${groupThousands(n)} ₸`

export function InvoiceStoryCard({ t }: { t: StoryMockCopy }) {
  const { ref, step, active, reduce } = useLoopStep<HTMLDivElement>(DURATIONS, FINAL)

  // итог досчитывается от 0 -- MotionValue пишет в DOM сам, без ререндеров
  const total = useMotionValue(0)
  const totalText = useTransform(total, (v) => fmt(v))
  useEffect(() => {
    if (step < 3) {
      total.set(0)
      return
    }
    if (reduce || step > 3) {
      total.set(TOTAL)
      return
    }
    const c = animate(total, TOTAL, { duration: 0.8, ease: [0.22, 1, 0.36, 1] })
    return () => c.stop()
  }, [step, reduce, total])

  const status = step >= 5 ? 2 : step >= 4 ? 1 : 0
  const statusLabels = [t.draft, t.awaiting, t.paid]
  const tr = { duration: reduce ? 0 : 0.42, ease: EASE }

  return (
    <motion.div
      ref={ref}
      aria-hidden="true"
      initial={reduce ? false : { opacity: 0, y: 30, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: reduce ? 0 : 0.7, ease: EASE }}
      className="relative mx-auto w-full max-w-md select-none"
    >
      {/* мягкое свечение -- радиальный градиент без filter: blur (дорого на телефонах) */}
      <div
        className="pointer-events-none absolute -inset-10 rounded-full sm:-inset-16"
        style={{ background: `radial-gradient(closest-side, ${COLOR.violet}38, transparent 72%)` }}
      />
      <motion.div
        animate={active ? { y: [0, -10, 0] } : { y: 0 }}
        transition={active ? { duration: 6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.6 }}
        className="relative overflow-hidden rounded-3xl text-left"
        style={{ background: SURFACE, border: `1px solid ${BORDER}`, boxShadow: '0 40px 80px rgba(0,0,0,0.55)' }}
      >
        <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR.magenta, opacity: 0.7 }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR.violet, opacity: 0.7 }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR.teal, opacity: 0.7 }} />
          <span className="ml-2 truncate text-[11px]" style={{ color: 'rgba(255,255,255,0.68)' }}>
            {t.url}
          </span>
        </div>

        <div className="relative p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.68)' }}>{t.number}</div>
              <div className="mt-0.5 truncate text-[16px] font-semibold">{t.client}</div>
            </div>
            {/* три статуса стопкой в одной ячейке грида: ширина = самой
                длинной надписи, смена статуса не двигает строку */}
            <span className="grid shrink-0 text-[10px] font-bold">
              {statusLabels.map((label, i) => (
                <motion.span
                  key={i}
                  className="col-start-1 row-start-1 whitespace-nowrap rounded-lg px-2.5 py-1 text-center"
                  style={{
                    background: i === 2 ? COLOR.teal : i === 1 ? 'rgba(206,76,134,0.18)' : 'rgba(255,255,255,0.08)',
                    color: i === 2 ? '#fff' : i === 1 ? '#F5A3C7' : 'rgba(255,255,255,0.7)',
                  }}
                  initial={false}
                  animate={{ opacity: status === i ? 1 : 0, scale: status === i ? 1 : 0.9 }}
                  transition={{ duration: reduce ? 0 : 0.3, ease: EASE }}
                >
                  {label}
                </motion.span>
              ))}
            </span>
          </div>

          <div className="mt-4 space-y-2 text-[12px]" style={{ color: 'rgba(255,255,255,0.82)' }}>
            <SkeletonRow on={step >= 1} reduce={reduce} label={t.service} value={fmt(SERVICE)} />
            <SkeletonRow on={step >= 2} reduce={reduce} label={t.vat} value={fmt(VAT)} />
          </div>

          <div className="mt-4 flex items-center justify-between border-t pt-4" style={{ borderColor: BORDER }}>
            <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.82)' }}>{t.total}</span>
            <motion.span
              className="text-[20px] font-bold tabular-nums"
              style={{ color: COLOR.mint }}
              initial={false}
              animate={{ opacity: step >= 3 ? 1 : 0 }}
              transition={tr}
            >
              {totalText}
            </motion.span>
          </div>

          {/* Kaspi QR + штамп. Блок фиксированной высоты, всё внутри -- по opacity/transform. */}
          <div className="relative mt-4 h-[76px]">
            <motion.div
              className="flex h-full items-center gap-3.5"
              initial={false}
              animate={step >= 4 ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
              transition={tr}
            >
              <motion.div
                className="relative h-[76px] w-[76px] shrink-0 overflow-hidden rounded-xl"
                initial={false}
                animate={{ opacity: step >= 5 ? 0.35 : 1, scale: step >= 5 ? 0.96 : 1 }}
                transition={{ duration: reduce ? 0 : 0.4, ease: EASE }}
              >
                <PseudoQr className="h-full w-full" />
                {/* скан-линия: сверху вниз и обратно, пока клиент наводит камеру */}
                {!reduce && step === 4 && (
                  <motion.span
                    className="absolute inset-x-1 top-0 h-[3px] rounded-full"
                    style={{ background: COLOR.mint, boxShadow: `0 0 10px 2px ${COLOR.mint}` }}
                    initial={{ y: 2, opacity: 0 }}
                    animate={{ y: [2, 70, 2], opacity: [0, 1, 1, 0] }}
                    transition={{ duration: 1.5, ease: 'easeInOut', delay: 0.15 }}
                  />
                )}
              </motion.div>
              <motion.div
                className="min-w-0"
                initial={false}
                animate={{ opacity: step >= 5 ? 0.35 : 1 }}
                transition={{ duration: reduce ? 0 : 0.4, ease: EASE }}
              >
                <div className="text-[12px] font-semibold text-white">{t.payQr}</div>
                <div className="mt-1 text-[11px] tabular-nums" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  Kaspi Pay · {fmt(TOTAL)}
                </div>
              </motion.div>
            </motion.div>

            {/* штамп «Оплачено» -- прихлопывает: большой и прозрачный -> на место */}
            <div className="pointer-events-none absolute inset-y-0 right-1 flex items-center">
              <motion.div
                className="flex flex-col items-center rounded-xl px-3.5 py-1.5"
                style={{ border: `2.5px solid ${COLOR.mint}`, color: COLOR.mint, background: 'rgba(10,13,31,0.72)' }}
                initial={false}
                animate={step >= 5 ? { opacity: 1, scale: 1, rotate: -9 } : { opacity: 0, scale: reduce ? 1 : 1.9, rotate: -16 }}
                transition={
                  step >= 5 && !reduce
                    ? { type: 'spring', stiffness: 520, damping: 22, mass: 0.9 }
                    : { duration: reduce ? 0 : 0.3 }
                }
              >
                <span className="text-[15px] font-black uppercase tracking-[0.14em]">{t.stamp}</span>
                <span className="text-[9.5px] font-semibold tracking-wide tabular-nums">Kaspi · {fmt(TOTAL)}</span>
              </motion.div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* Строка счёта: пока не «заполнена» -- серая полоска-скелет на её месте,
   потом скелет гаснет, а текст въезжает. Высота строки одна и та же. */
function SkeletonRow({ on, reduce, label, value }: { on: boolean; reduce: boolean; label: string; value: string }) {
  const tr = { duration: reduce ? 0 : 0.4, ease: EASE }
  return (
    <div className="relative">
      <motion.div
        className="absolute inset-0 flex items-center justify-between"
        initial={false}
        animate={{ opacity: on ? 0 : 1 }}
        transition={tr}
      >
        <span className="h-2 w-[55%] rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }} />
        <span className="h-2 w-[18%] rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }} />
      </motion.div>
      <motion.div
        className="flex justify-between gap-3"
        initial={false}
        animate={on ? { opacity: 1, x: 0 } : { opacity: 0, x: -8 }}
        transition={tr}
      >
        <span className="truncate">{label}</span>
        <span className="shrink-0 tabular-nums">{value}</span>
      </motion.div>
    </div>
  )
}
