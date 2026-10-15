import { describe, it, expect } from 'vitest'
import { computePlanActivation, splitPlanPayment, MIN_KASPI_REMAINDER_TENGE, planPaymentNote } from './planActivation'

const DAY = 24 * 60 * 60 * 1000
const now = new Date('2026-10-15T10:00:00.000Z')

describe('computePlanActivation', () => {
  it('starts from now for a first purchase', () => {
    const { expiresAt, bonusConsumed } = computePlanActivation(null, { plan: 'pro', billing_period: 'monthly' }, now)
    expect(Math.round((expiresAt.getTime() - now.getTime()) / DAY)).toBe(30)
    expect(bonusConsumed).toBe(false)
  })

  it('adds 365 days for annual', () => {
    const { expiresAt } = computePlanActivation({ plan: 'free' }, { plan: 'pro', billing_period: 'annual' }, now)
    expect(Math.round((expiresAt.getTime() - now.getTime()) / DAY)).toBe(365)
  })

  it('stacks a same-plan renewal on the remaining days (DB timestamps without zone are UTC)', () => {
    const profile = { plan: 'pro', plan_expires_at: '2026-10-27T10:00:00' } // 12 days left
    const { expiresAt } = computePlanActivation(profile, { plan: 'pro', billing_period: 'monthly' }, now)
    expect(Math.round((expiresAt.getTime() - now.getTime()) / DAY)).toBe(42)
  })

  it('does not stack on a different or expired plan', () => {
    const other = computePlanActivation({ plan: 'basic', plan_expires_at: '2026-10-27T10:00:00' }, { plan: 'pro', billing_period: 'monthly' }, now)
    expect(Math.round((other.expiresAt.getTime() - now.getTime()) / DAY)).toBe(30)
    const expired = computePlanActivation({ plan: 'pro', plan_expires_at: '2026-10-01T10:00:00' }, { plan: 'pro', billing_period: 'monthly' }, now)
    expect(Math.round((expired.expiresAt.getTime() - now.getTime()) / DAY)).toBe(30)
  })

  it('folds remaining bonus days in once and asks to clear them', () => {
    const { expiresAt, bonusConsumed } = computePlanActivation(
      { plan: 'free', bonus_expires_at: '2026-10-20T10:00:00' }, { plan: 'pro', billing_period: 'monthly' }, now)
    expect(Math.round((expiresAt.getTime() - now.getTime()) / DAY)).toBe(35)
    expect(bonusConsumed).toBe(true)
  })

  it('ignores an expired bonus', () => {
    const r = computePlanActivation({ plan: 'free', bonus_expires_at: '2026-10-01T10:00:00' }, { plan: 'pro', billing_period: 'monthly' }, now)
    expect(r.bonusConsumed).toBe(false)
  })
})

describe('splitPlanPayment', () => {
  it('pays fully from the wallet when the balance covers the price', () => {
    expect(splitPlanPayment(5990, 5990)).toEqual({ mode: 'wallet_full', wallet: 5990, kaspi: 0 })
    expect(splitPlanPayment(5990, '7000.50')).toEqual({ mode: 'wallet_full', wallet: 5990, kaspi: 0 })
  })

  it('splits wallet + Kaspi when the balance is smaller', () => {
    expect(splitPlanPayment(5990, 300)).toEqual({ mode: 'partial', wallet: 300, kaspi: 5690 })
    expect(splitPlanPayment(5990, 300.9)).toEqual({ mode: 'partial', wallet: 300, kaspi: 5690 })
  })

  it('always leaves at least the Kaspi minimum for the Kaspi part', () => {
    const r = splitPlanPayment(5990, 5950)
    expect(r).toEqual({ mode: 'partial', wallet: 5990 - MIN_KASPI_REMAINDER_TENGE, kaspi: MIN_KASPI_REMAINDER_TENGE })
    expect(r.wallet + r.kaspi).toBe(5990)
  })

  it('never uses a zero or negative balance', () => {
    expect(splitPlanPayment(5990, 0)).toEqual({ mode: 'kaspi_only', wallet: 0, kaspi: 5990 })
    expect(splitPlanPayment(5990, -745)).toEqual({ mode: 'kaspi_only', wallet: 0, kaspi: 5990 })
    expect(splitPlanPayment(5990, null)).toEqual({ mode: 'kaspi_only', wallet: 0, kaspi: 5990 })
    expect(splitPlanPayment(5990, 'abc')).toEqual({ mode: 'kaspi_only', wallet: 0, kaspi: 5990 })
  })

  it('wallet + kaspi always equals the price', () => {
    for (const balance of [1, 99, 100, 2500, 5889, 5890, 5891, 5989, 5990, 10000]) {
      const r = splitPlanPayment(5990, balance)
      expect(r.wallet + r.kaspi).toBe(5990)
      expect(r.wallet).toBeLessThanOrEqual(balance)
      expect(r.wallet).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('planPaymentNote', () => {
  it('names the plan and period', () => {
    expect(planPaymentNote('pro', 'annual')).toBe('Оплата тарифа Про (год)')
    expect(planPaymentNote('basic', 'monthly')).toBe('Оплата тарифа Базовый (месяц)')
  })
})
