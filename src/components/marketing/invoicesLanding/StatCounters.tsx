'use client'

import { useEffect, useRef } from 'react'
import { animate, motion, useInView, useMotionValue, useTransform } from 'framer-motion'
import { useReducedMotionSafe } from './useLoopStep'

// Цифры под hero. Старый CountUp до 1 / 2 / 0 было не видно глазом, поэтому
// у каждой цифры свой эффект, но значение то же, что в тексте страницы:
//  - timer: секундомер 0:00 -> 1:00 с кольцом («минута на счёт»);
//  - ramp:  0,0% -> 2,0% с десятыми, в конце -- «2%»;
//  - slot:  барабан 0 -> 9 -> 0, останавливается на «0 ₸».
// Играет один раз при появлении на экране. Для скринридера -- обычный
// текст (sr-only), анимированная часть aria-hidden. Reduced motion --
// сразу финальное значение.

export type StatKind = 'timer' | 'ramp' | 'slot'
export interface StatCopy {
  kind: StatKind
  value: number
  suffix: string
  unit?: string
  label: string
}

const VIOLET = '#6E5ED8'
const MINT = '#5EEAD4'
const OUT = [0.22, 1, 0.36, 1] as const

export function StatCounter({ stat, decimalSep }: { stat: StatCopy; decimalSep: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const reduce = useReducedMotionSafe()

  return (
    <div ref={ref} className="text-center">
      <div className="text-[clamp(2rem,4vw,2.75rem)] font-bold leading-none tracking-[-0.02em]" style={{ color: VIOLET }}>
        <span className="sr-only">
          {stat.value}
          {stat.suffix}
        </span>
        <span aria-hidden="true" className="inline-flex h-[1.15em] items-center justify-center">
          {stat.kind === 'timer' && <Timer play={inView} reduce={reduce} unit={stat.unit ?? ''} />}
          {stat.kind === 'ramp' && <Ramp play={inView} reduce={reduce} target={stat.value} suffix={stat.suffix} sep={decimalSep} />}
          {stat.kind === 'slot' && <Slot play={inView} reduce={reduce} suffix={stat.suffix} />}
        </span>
      </div>
      <div className="mt-3 text-[13px]" style={{ color: 'rgba(255,255,255,0.82)' }}>{stat.label}</div>
    </div>
  )
}

/* Секундомер: 0:00 -> 1:00 за ~1.7 с, кольцо обегает круг синхронно. */
function Timer({ play, reduce, unit }: { play: boolean; reduce: boolean; unit: string }) {
  const sec = useMotionValue(0)
  const text = useTransform(sec, (v) => {
    const s = Math.round(v)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  })
  const ring = useTransform(sec, [0, 60], [0, 1])
  useEffect(() => {
    if (reduce) {
      sec.set(60)
      return
    }
    if (!play) return
    const c = animate(sec, 60, { duration: 1.7, ease: OUT, delay: 0.15 })
    return () => c.stop()
  }, [play, reduce, sec])

  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 24 24" className="h-[0.8em] w-[0.8em] -rotate-90" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.12)" strokeWidth="2.6" />
        <motion.circle cx="12" cy="12" r="9" stroke={MINT} strokeWidth="2.6" strokeLinecap="round" style={{ pathLength: ring }} />
      </svg>
      <motion.span className="tabular-nums">{text}</motion.span>
      <span className="text-[0.5em] font-semibold tracking-normal" style={{ color: 'rgba(255,255,255,0.7)' }}>
        {unit}
      </span>
    </span>
  )
}

/* Комиссия: 0,0% -> 2,0% с десятыми, на финише десятые уходят -- «2%». */
function Ramp({ play, reduce, target, suffix, sep }: { play: boolean; reduce: boolean; target: number; suffix: string; sep: string }) {
  const v = useMotionValue(0)
  const text = useTransform(v, (x) => (x >= target ? `${target}${suffix}` : `${x.toFixed(1).replace('.', sep)}${suffix}`))
  useEffect(() => {
    if (reduce) {
      v.set(target)
      return
    }
    if (!play) return
    const c = animate(v, target, { duration: 1.5, ease: OUT, delay: 0.25 })
    return () => c.stop()
  }, [play, reduce, target, v])

  return <motion.span className="tabular-nums">{text}</motion.span>
}

/* Абонплата: барабан крутится 0..9 два оборота и встаёт на 0 с лёгким
   перелётом. Высота окна -- одна строка (1em), всё остальное transform. */
const REEL = Array.from({ length: 21 }, (_, i) => String(i % 10))
function Slot({ play, reduce, suffix }: { play: boolean; reduce: boolean; suffix: string }) {
  const last = REEL.length - 1
  return (
    <span className="inline-flex items-center">
      <span className="relative inline-block h-[1em] overflow-hidden leading-none">
        <span className="invisible">0</span>
        <motion.span
          className="absolute left-0 top-0 flex flex-col"
          initial={false}
          animate={{ y: reduce || play ? `${-last}em` : '0em' }}
          transition={reduce ? { duration: 0 } : { duration: 1.9, ease: [0.15, 0.8, 0.3, 1.04], delay: 0.35 }}
        >
          {REEL.map((d, i) => (
            <span key={i} className="block h-[1em] leading-none">
              {d}
            </span>
          ))}
        </motion.span>
      </span>
      <span className="whitespace-pre">{suffix}</span>
    </span>
  )
}
