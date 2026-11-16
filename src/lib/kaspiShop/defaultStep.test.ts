import { describe, it, expect } from 'vitest'
import { defaultUndercutStep } from './defaultStep'

describe('defaultUndercutStep', () => {
  it('0,1% цены, не меньше 1 ₸', () => {
    expect(defaultUndercutStep(190)).toBe(1)
    expect(defaultUndercutStep(1499)).toBe(1)
    expect(defaultUndercutStep(1500)).toBe(2)
    expect(defaultUndercutStep(78990)).toBe(79)
    expect(defaultUndercutStep(1_000_000)).toBe(1000)
  })
  it('нет цены или мусор: 1 ₸', () => {
    for (const v of [0, -5, NaN, null, undefined, 'abc']) expect(defaultUndercutStep(v)).toBe(1)
  })
  it('цена строкой тоже годится', () => {
    expect(defaultUndercutStep('78990')).toBe(79)
  })
})
