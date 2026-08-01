import { describe, it, expect } from 'vitest'
import { computeCommission, COMMISSION_RATE } from './wallet'

describe('computeCommission', () => {
  it('is 5% of the amount', () => {
    expect(COMMISSION_RATE).toBe(0.05)
    expect(computeCommission(1000)).toBe(50)
  })

  it('rounds to the nearest tenge', () => {
    expect(computeCommission(999)).toBe(50)   // 49.95 -> 50
    expect(computeCommission(101)).toBe(5)    // 5.05 -> 5
    expect(computeCommission(111)).toBe(6)    // 5.55 -> 6
  })

  it('is zero for a zero amount', () => {
    expect(computeCommission(0)).toBe(0)
  })
})
