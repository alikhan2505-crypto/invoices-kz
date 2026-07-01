import { describe, it, expect } from 'vitest'
import { getActivePlan } from './plan'

describe('getActivePlan', () => {
  it('returns inactive free plan when profile is missing', () => {
    const result = getActivePlan(null)
    expect(result.plan).toBe('free')
    expect(result.isActive).toBe(false)
  })

  it('returns inactive free plan when nothing applies', () => {
    const result = getActivePlan({})
    expect(result.plan).toBe('free')
    expect(result.isActive).toBe(false)
  })

  it('treats a perpetual paid plan (no expiry) as active', () => {
    const result = getActivePlan({ plan: 'pro' })
    expect(result.isActive).toBe(true)
    expect(result.canKpAvrNakl).toBe(true)
  })

  it('treats an unexpired paid plan as active', () => {
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString()
    const result = getActivePlan({ plan: 'basic', plan_expires_at: future })
    expect(result.isActive).toBe(true)
    expect(result.plan).toBe('basic')
  })

  it('falls through to free once a paid plan has expired', () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const result = getActivePlan({ plan: 'pro', plan_expires_at: past })
    expect(result.plan).toBe('free')
    expect(result.isActive).toBe(false)
  })

  it('treats unexpired bonus days as an active basic plan', () => {
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
    const result = getActivePlan({ bonus_expires_at: future })
    expect(result.isActive).toBe(true)
    expect(result.plan).toBe('basic')
  })

  it('treats an unexpired trial as an active basic plan', () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    const result = getActivePlan({ trial_expires_at: future })
    expect(result.isActive).toBe(true)
    expect(result.isTrial).toBe(true)
  })

  it('never returns plan "free" with isActive true (showWatermark relies on this)', () => {
    const cases = [
      null,
      {},
      { plan: 'pro', plan_expires_at: new Date(Date.now() - 1000).toISOString() },
    ]
    for (const profile of cases) {
      const result = getActivePlan(profile)
      if (result.plan === 'free') expect(result.isActive).toBe(false)
    }
  })
})
