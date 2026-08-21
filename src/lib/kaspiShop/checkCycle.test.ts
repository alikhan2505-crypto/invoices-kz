import { describe, it, expect } from 'vitest'
import { isCheckDue } from './checkCycle'

// Pure-predicate coverage for the shared due/not-due logic used by both
// getDueTrackedProducts (global, cron-secret-gated) and the "Готовы
// применить" stat on GET /api/kaspi-shop/products (per-user). Everything
// else in checkCycle.ts talks to Supabase directly and isn't unit-testable
// without a live/mocked DB, matching the rest of this file's existing test
// coverage (see rateLimitBudget.test.ts for the same pure-function pattern).
describe('isCheckDue', () => {
  it('is due when there is no prior check', () => {
    expect(isCheckDue(null, 15, 1_000_000)).toBe(true)
  })

  it('is not due before the configured frequency has elapsed', () => {
    const now = 1_000_000
    const lastCheckedAt = new Date(now - 5 * 60_000).toISOString() // 5 min ago
    expect(isCheckDue(lastCheckedAt, 15, now)).toBe(false)
  })

  it('is due once the configured frequency has elapsed', () => {
    const now = 1_000_000
    const lastCheckedAt = new Date(now - 15 * 60_000).toISOString() // exactly 15 min ago
    expect(isCheckDue(lastCheckedAt, 15, now)).toBe(true)
  })

  it('is due when well past the configured frequency', () => {
    const now = 1_000_000
    const lastCheckedAt = new Date(now - 60 * 60_000).toISOString() // 1 hour ago
    expect(isCheckDue(lastCheckedAt, 15, now)).toBe(true)
  })
})
