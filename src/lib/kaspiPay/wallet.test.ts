import { describe, it, expect } from 'vitest'
import { computeCommission, COMMISSION_RATE } from './wallet'

describe('computeCommission', () => {
  it('is 2% of the amount', () => {
    expect(COMMISSION_RATE).toBe(0.02)
    expect(computeCommission(1000)).toBe(20)
  })

  it('rounds to the nearest tenge', () => {
    expect(computeCommission(999)).toBe(20)   // 19.98 -> 20
    expect(computeCommission(101)).toBe(2)    // 2.02 -> 2
    expect(computeCommission(175)).toBe(4)    // 3.5 -> 4
  })

  it('is zero for a zero amount', () => {
    expect(computeCommission(0)).toBe(0)
  })
})
