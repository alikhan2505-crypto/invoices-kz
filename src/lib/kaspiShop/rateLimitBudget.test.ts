import { describe, it, expect } from 'vitest'
import { remainingBudget, isWithinBudget, KASPI_RATE_LIMIT_MAX, KASPI_RATE_LIMIT_WINDOW_MS } from './rateLimitBudget'

describe('remainingBudget', () => {
  it('returns the full limit when there is no history', () => {
    expect(remainingBudget([], 1_000_000)).toBe(KASPI_RATE_LIMIT_MAX)
  })

  it('subtracts changes that fall within the rolling window', () => {
    const now = 1_000_000
    const recent = [now - 1000, now - 2000, now - 3000]
    expect(remainingBudget(recent, now)).toBe(KASPI_RATE_LIMIT_MAX - 3)
  })

  it('ignores changes older than the rolling window', () => {
    const now = 1_000_000
    const old = [now - (KASPI_RATE_LIMIT_WINDOW_MS + 1000)]
    expect(remainingBudget(old, now)).toBe(KASPI_RATE_LIMIT_MAX)
  })

  it('never returns negative', () => {
    const now = 1_000_000
    const wayTooMany = Array.from({ length: KASPI_RATE_LIMIT_MAX + 50 }, (_, i) => now - i)
    expect(remainingBudget(wayTooMany, now)).toBe(0)
  })
})

describe('isWithinBudget', () => {
  it('is true when remaining budget is above zero', () => {
    expect(isWithinBudget([], 1_000_000)).toBe(true)
  })

  it('is false when the window is fully spent', () => {
    const now = 1_000_000
    const full = Array.from({ length: KASPI_RATE_LIMIT_MAX }, (_, i) => now - i)
    expect(isWithinBudget(full, now)).toBe(false)
  })
})
