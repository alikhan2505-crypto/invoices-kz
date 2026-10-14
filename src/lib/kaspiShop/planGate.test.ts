import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockMaybeSingle = vi.fn()
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }))
const mockSelect = vi.fn(() => ({ eq: mockEq }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({ select: mockSelect }),
  }),
}))

import { hasKaspiShopAccess, kaspiShopPlanGate, KASPI_SHOP_NOT_PRO_BODY, KASPI_SHOP_PROFILE_COLUMNS } from './planGate'

const future = () => new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString()
const past = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

describe('hasKaspiShopAccess', () => {
  it('allows an active Pro plan (perpetual or unexpired)', () => {
    expect(hasKaspiShopAccess({ plan: 'pro' })).toBe(true)
    expect(hasKaspiShopAccess({ plan: 'pro', plan_expires_at: future() })).toBe(true)
  })

  it('denies a lapsed Pro plan', () => {
    expect(hasKaspiShopAccess({ plan: 'pro', plan_expires_at: past() })).toBe(false)
  })

  it('denies Basic, bonus days, trial and free', () => {
    expect(hasKaspiShopAccess({ plan: 'basic' })).toBe(false)
    expect(hasKaspiShopAccess({ bonus_expires_at: future() })).toBe(false)
    expect(hasKaspiShopAccess({ trial_expires_at: future() })).toBe(false)
    expect(hasKaspiShopAccess({ plan: 'free' })).toBe(false)
    expect(hasKaspiShopAccess({})).toBe(false)
  })

  it('denies a missing profile (fail closed)', () => {
    expect(hasKaspiShopAccess(null)).toBe(false)
    expect(hasKaspiShopAccess(undefined)).toBe(false)
  })

  it('always allows admins, even with no or a lapsed plan', () => {
    expect(hasKaspiShopAccess({ is_admin: true })).toBe(true)
    expect(hasKaspiShopAccess({ is_admin: true, plan: 'pro', plan_expires_at: past() })).toBe(true)
    expect(hasKaspiShopAccess({ is_admin: true, plan: 'basic' })).toBe(true)
  })
})

describe('kaspiShopPlanGate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns null (let through) for a Pro user and reads the plan columns by user id', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { plan: 'pro' }, error: null })
    expect(await kaspiShopPlanGate('user-1')).toBeNull()
    expect(mockSelect).toHaveBeenCalledWith(KASPI_SHOP_PROFILE_COLUMNS)
    expect(mockEq).toHaveBeenCalledWith('id', 'user-1')
  })

  it('returns null for an admin without Pro', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { is_admin: true, plan: 'free' }, error: null })
    expect(await kaspiShopPlanGate('admin-1')).toBeNull()
  })

  it('returns a 403 with the not_pro body for a Basic user', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { plan: 'basic' }, error: null })
    const res = await kaspiShopPlanGate('user-2')
    expect(res?.status).toBe(403)
    expect(await res?.json()).toEqual(KASPI_SHOP_NOT_PRO_BODY)
  })

  it('blocks with a 500 (not "needs Pro") when the profile read fails (fail closed)', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const res = await kaspiShopPlanGate('user-3')
    expect(res).not.toBeNull()
    expect(res?.status).toBe(500)
    expect((await res?.json()).errorCode).toBeUndefined()
  })

  it('returns a 403 when the user has no profile row', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })
    const res = await kaspiShopPlanGate('user-4')
    expect(res?.status).toBe(403)
    expect(await res?.json()).toEqual(KASPI_SHOP_NOT_PRO_BODY)
  })
})
