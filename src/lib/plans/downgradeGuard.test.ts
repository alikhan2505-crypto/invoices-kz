import { describe, it, expect } from 'vitest'
import { isDowngradeBlocked } from './downgradeGuard'

const now = new Date('2026-10-15T10:00:00.000Z')

describe('isDowngradeBlocked', () => {
  it('blocks buying Basic while Pro is still active', () => {
    expect(isDowngradeBlocked({ plan: 'pro', plan_expires_at: '2026-10-27T10:00:00' }, 'basic', now)).toBe(true)
  })

  it('lets a lapsed Pro buy Basic', () => {
    expect(isDowngradeBlocked({ plan: 'pro', plan_expires_at: '2026-10-01T10:00:00' }, 'basic', now)).toBe(false)
    expect(isDowngradeBlocked({ plan: 'pro', plan_expires_at: null }, 'basic', now)).toBe(false)
  })

  it('never blocks Pro purchases, Basic renewals, free accounts or a missing profile', () => {
    const active = '2026-10-27T10:00:00'
    expect(isDowngradeBlocked({ plan: 'pro', plan_expires_at: active }, 'pro', now)).toBe(false)
    expect(isDowngradeBlocked({ plan: 'basic', plan_expires_at: active }, 'basic', now)).toBe(false)
    expect(isDowngradeBlocked({ plan: 'basic', plan_expires_at: active }, 'pro', now)).toBe(false)
    expect(isDowngradeBlocked({ plan: 'free', plan_expires_at: active }, 'basic', now)).toBe(false)
    expect(isDowngradeBlocked(null, 'basic', now)).toBe(false)
    expect(isDowngradeBlocked(undefined, 'basic', now)).toBe(false)
  })
})
