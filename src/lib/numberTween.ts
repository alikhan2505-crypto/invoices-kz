// Pure maths behind the animated money figures on /create and in the live
// invoice preview: an easing curve and "where is the number at this moment".
// The React side lives in src/components/useTweenedNumber.ts.

/** The house easing curve, the same one framer-motion gets everywhere (see src/app/dashboard/page.tsx). */
export const EASE = [0.16, 1, 0.3, 1] as const

/**
 * A CSS-style cubic-bezier(p1x, p1y, p2x, p2y) as a function of progress 0..1,
 * so a requestAnimationFrame count-up decelerates exactly like the
 * framer-motion transitions around it.
 */
export function cubicBezier(p1x: number, p1y: number, p2x: number, p2y: number) {
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

export const easeSmooth = cubicBezier(EASE[0], EASE[1], EASE[2], EASE[3])

/**
 * The value a tween from `from` to `to` shows `elapsed` ms into a `duration` ms
 * run. Clamped at both ends, so a late frame lands exactly on `to` and never
 * overshoots -- the last frame must print the real total, not 99.97% of it.
 */
export function tweenAt(
  from: number,
  to: number,
  elapsed: number,
  duration: number,
  ease: (x: number) => number = easeSmooth,
): number {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return to
  if (duration <= 0 || elapsed >= duration) return to
  if (elapsed <= 0) return from
  return from + (to - from) * ease(elapsed / duration)
}
