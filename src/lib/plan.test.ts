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

  it('grants canAcquiring only to an active Pro plan, not Basic/trial/bonus', () => {
    expect(getActivePlan({ plan: 'pro' }).canAcquiring).toBe(true)
    expect(getActivePlan({ plan: 'basic' }).canAcquiring).toBe(false)
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
    expect(getActivePlan({ bonus_expires_at: future }).canAcquiring).toBe(false)
    expect(getActivePlan({ trial_expires_at: future }).canAcquiring).toBe(false)
    expect(getActivePlan(null).canAcquiring).toBe(false)
  })

  it('grants canAiAgent only to an active Pro plan, not Basic/trial/bonus', () => {
    expect(getActivePlan({ plan: 'pro' }).canAiAgent).toBe(true)
    expect(getActivePlan({ plan: 'basic' }).canAiAgent).toBe(false)
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
    expect(getActivePlan({ bonus_expires_at: future }).canAiAgent).toBe(false)
    expect(getActivePlan({ trial_expires_at: future }).canAiAgent).toBe(false)
    expect(getActivePlan(null).canAiAgent).toBe(false)
  })

  it('grants canKaspiShop only to an active Pro plan, not Basic/trial/bonus', () => {
    expect(getActivePlan({ plan: 'pro' }).canKaspiShop).toBe(true)
    expect(getActivePlan({ plan: 'basic' }).canKaspiShop).toBe(false)
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
    expect(getActivePlan({ bonus_expires_at: future }).canKaspiShop).toBe(false)
    expect(getActivePlan({ trial_expires_at: future }).canKaspiShop).toBe(false)
    expect(getActivePlan(null).canKaspiShop).toBe(false)
  })

  it('grants canEsf only on an active pro plan', () => {
    expect(getActivePlan({ plan: 'pro' }).canEsf).toBe(true)
    expect(getActivePlan({ plan: 'basic' }).canEsf).toBe(false)
    expect(getActivePlan({}).canEsf).toBe(false)
  })

  // Real incident 2026-10-05: an is_admin account whose plan AND trial had
  // both lapsed got bounced out of /create, the PDF signature choice, ЭЦП
  // signing and templates -- every one of those gates read getActivePlan()
  // without a separate is_admin check. The browser-side checks must match
  // the server's own exemption (enforce_invoice_limit() returns immediately
  // for is_admin_user()), for every capability, not just the ones that have
  // already broken once.
  it('is_admin unlocks every capability regardless of plan/trial/bonus state', () => {
    const lapsed = getActivePlan({ is_admin: true })
    expect(lapsed.isActive).toBe(true)
    expect(lapsed.invoiceLimit).toBeNull()
    for (const key of ['canEmail', 'canSign', 'canKpAvrNakl', 'canTemplates', 'canRecurring', 'canEcp', 'canAcquiring', 'canEsf', 'canAiAgent', 'canKaspiShop'] as const) {
      expect(lapsed[key]).toBe(true)
    }
  })

  it('is_admin unlocks everything even with an explicitly expired plan', () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const result = getActivePlan({ is_admin: true, plan: 'pro', plan_expires_at: past })
    expect(result.isActive).toBe(true)
    expect(result.canKaspiShop).toBe(true)
    expect(result.canSign).toBe(true)
    expect(result.invoiceLimit).toBeNull()
    // The underlying (expired) plan/label are left alone -- is_admin unlocks
    // capabilities, it doesn't pretend the subscription itself is current.
    expect(result.plan).toBe('free')
  })

  it('is_admin: false (or absent) never triggers the override', () => {
    expect(getActivePlan({ is_admin: false }).isActive).toBe(false)
    expect(getActivePlan({ plan: 'basic' }).canKaspiShop).toBe(false)
  })
})
