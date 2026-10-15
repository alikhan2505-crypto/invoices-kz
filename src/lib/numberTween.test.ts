import { describe, it, expect } from 'vitest'
import { cubicBezier, easeSmooth, tweenAt } from './numberTween'

describe('cubicBezier / easeSmooth', () => {
  it('начинается в 0 и заканчивается в 1, за пределами отрезка зажат', () => {
    expect(easeSmooth(0)).toBe(0)
    expect(easeSmooth(1)).toBe(1)
    expect(easeSmooth(-1)).toBe(0)
    expect(easeSmooth(2)).toBe(1)
  })

  it('монотонно растёт и не перелетает (без отскока)', () => {
    let prev = 0
    for (let i = 1; i <= 100; i++) {
      const v = easeSmooth(i / 100)
      expect(v).toBeGreaterThanOrEqual(prev)
      expect(v).toBeLessThanOrEqual(1)
      prev = v
    }
  })

  it('кривая замедляется: к середине пройдено больше половины', () => {
    expect(easeSmooth(0.5)).toBeGreaterThan(0.5)
  })

  it('линейная кривая даёт линейный прогресс', () => {
    const linear = cubicBezier(0, 0, 1, 1)
    expect(linear(0.25)).toBeCloseTo(0.25, 5)
    expect(linear(0.75)).toBeCloseTo(0.75, 5)
  })
})

describe('tweenAt', () => {
  it('в начале — исходное значение, в конце и после — ровно целевое', () => {
    expect(tweenAt(100, 500, 0, 400)).toBe(100)
    expect(tweenAt(100, 500, 400, 400)).toBe(500)
    expect(tweenAt(100, 500, 10_000, 400)).toBe(500)
  })

  it('считает и вверх, и вниз, оставаясь между концами', () => {
    const up = tweenAt(0, 1000, 200, 400)
    expect(up).toBeGreaterThan(0)
    expect(up).toBeLessThan(1000)
    const down = tweenAt(1000, 0, 200, 400)
    expect(down).toBeGreaterThan(0)
    expect(down).toBeLessThan(1000)
    expect(up + down).toBeCloseTo(1000, 6)
  })

  it('нулевая длительность — сразу целевое значение', () => {
    expect(tweenAt(1, 2, 0, 0)).toBe(2)
  })

  it('NaN/Infinity на входе — сразу целевое, без мусора на экране', () => {
    expect(tweenAt(NaN, 5, 100, 400)).toBe(5)
    expect(tweenAt(0, Infinity, 100, 400)).toBe(Infinity)
  })

  it('принимает свою функцию сглаживания', () => {
    expect(tweenAt(0, 100, 50, 100, x => x)).toBe(50)
  })
})
