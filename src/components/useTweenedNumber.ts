'use client'
import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { tweenAt } from '@/lib/numberTween'

/**
 * `value`, counted smoothly up or down to each new value instead of jumping.
 *
 * A change that arrives mid-run starts from the figure on screen right now,
 * so typing a price digit by digit glides instead of snapping back. With
 * prefers-reduced-motion the real value is returned as is -- no animation,
 * no intermediate frames.
 */
export function useTweenedNumber(value: number, duration = 400): number {
  const reduceMotion = !!useReducedMotion()
  const [display, setDisplay] = useState(value)
  const displayRef = useRef(value)

  useEffect(() => {
    // Reduced motion: the hook returns `value` directly (below), nothing to run.
    if (reduceMotion) return
    const from = displayRef.current
    if (from === value) return
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const next = tweenAt(from, value, now - start, duration)
      displayRef.current = next
      setDisplay(next)
      if (next !== value) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration, reduceMotion])

  return reduceMotion ? value : display
}
