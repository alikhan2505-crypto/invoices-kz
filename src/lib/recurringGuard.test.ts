import { describe, expect, it } from 'vitest'
import { getActivePlan } from './plan'
import { currentPeriodStart, shouldSkipRecurringOwner } from './recurringGuard'

const future = new Date(Date.now() + 30 * 86_400_000).toISOString()
const past = new Date(Date.now() - 30 * 86_400_000).toISOString()
const skip = (profile: any) => shouldSkipRecurringOwner(profile, getActivePlan(profile))

describe('shouldSkipRecurringOwner', () => {
  it('пропускает отсутствующий профиль', () => {
    expect(shouldSkipRecurringOwner(null, getActivePlan(null))).toBe(true)
  })
  it('пропускает Free, просроченный Про, Базовый, пробный и бонус', () => {
    expect(skip({ plan: 'free' })).toBe(true)
    expect(skip({ plan: 'pro', plan_expires_at: past })).toBe(true)
    expect(skip({ plan: 'basic', plan_expires_at: future })).toBe(true)
    expect(skip({ plan: 'free', trial_expires_at: future })).toBe(true)
    expect(skip({ plan: 'free', bonus_expires_at: future })).toBe(true)
  })
  it('пропускает удалённый аккаунт даже с активным Про', () => {
    expect(skip({ plan: 'pro', plan_expires_at: future, deleted_at: '2026-10-01T00:00:00Z' })).toBe(true)
  })
  it('пускает активный Про', () => {
    expect(skip({ plan: 'pro', plan_expires_at: future, deleted_at: null })).toBe(false)
    expect(skip({ plan: 'pro', plan_expires_at: null })).toBe(false)
  })
})

describe('currentPeriodStart', () => {
  it('первое число месяца 00:00 UTC', () => {
    expect(currentPeriodStart(new Date('2026-10-23T09:00:00Z')).toISOString()).toBe('2026-10-01T00:00:00.000Z')
    expect(currentPeriodStart(new Date('2026-11-01T00:00:00Z')).toISOString()).toBe('2026-11-01T00:00:00.000Z')
    expect(currentPeriodStart(new Date('2026-12-31T23:59:59Z')).toISOString()).toBe('2026-12-01T00:00:00.000Z')
  })
})
