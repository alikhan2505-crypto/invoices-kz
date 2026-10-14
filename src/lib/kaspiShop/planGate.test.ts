import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockMaybeSingle = vi.fn()
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }))
const mockIn = vi.fn()
const mockSelect = vi.fn(() => ({ eq: mockEq, in: mockIn }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({ select: mockSelect }),
  }),
}))

import {
  hasKaspiShopAccess, kaspiShopPlanGate, KASPI_SHOP_NOT_PRO_BODY, KASPI_SHOP_PROFILE_COLUMNS,
  filterByOwnerAccess, loadOwnerPlanProfiles, ownerHasKaspiShopAccess, trackedProductOwnerId,
} from './planGate'

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

describe('filterByOwnerAccess', () => {
  type Item = { id: string; owner: string | null }
  const ownerOf = (i: Item) => i.owner
  const profiles = new Map<string, any>([
    ['pro', { plan: 'pro' }],
    ['lapsed', { plan: 'pro', plan_expires_at: past() }],
    ['basic', { plan: 'basic' }],
    ['admin', { is_admin: true, plan: 'free' }],
  ])

  it('keeps only items whose owner is Pro or admin, in their original order', () => {
    const items: Item[] = [
      { id: '1', owner: 'lapsed' },
      { id: '2', owner: 'pro' },
      { id: '3', owner: 'basic' },
      { id: '4', owner: 'admin' },
      { id: '5', owner: 'pro' },
    ]
    expect(filterByOwnerAccess(items, ownerOf, profiles).map(i => i.id)).toEqual(['2', '4', '5'])
  })

  it('drops items with no owner id or an owner missing from the map (fail closed)', () => {
    const items: Item[] = [{ id: '1', owner: null }, { id: '2', owner: 'ghost' }, { id: '3', owner: 'pro' }]
    expect(filterByOwnerAccess(items, ownerOf, profiles).map(i => i.id)).toEqual(['3'])
  })

  it('returns an empty list for an empty batch', () => {
    expect(filterByOwnerAccess([], ownerOf, profiles)).toEqual([])
  })
})

describe('loadOwnerPlanProfiles', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads each distinct owner once, keyed by id, skipping empty ids', async () => {
    mockIn.mockResolvedValue({ data: [{ id: 'a', plan: 'pro' }, { id: 'b', plan: 'basic' }], error: null })
    const map = await loadOwnerPlanProfiles(['a', 'b', 'a', null, undefined, ''])
    expect(mockIn).toHaveBeenCalledTimes(1)
    expect(mockIn).toHaveBeenCalledWith('id', ['a', 'b'])
    expect(mockSelect).toHaveBeenCalledWith(`id, ${KASPI_SHOP_PROFILE_COLUMNS}`)
    expect(map.get('a')).toEqual({ id: 'a', plan: 'pro' })
    expect(map.get('b')).toEqual({ id: 'b', plan: 'basic' })
  })

  it('makes no query for an empty batch', async () => {
    const map = await loadOwnerPlanProfiles([])
    expect(mockIn).not.toHaveBeenCalled()
    expect(map.size).toBe(0)
  })

  it('chunks a large batch', async () => {
    mockIn.mockResolvedValue({ data: [], error: null })
    const ids = Array.from({ length: 450 }, (_, i) => `u${i}`)
    await loadOwnerPlanProfiles(ids)
    expect(mockIn).toHaveBeenCalledTimes(3)
  })

  it('throws on a read error instead of returning a partial map', async () => {
    mockIn.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(loadOwnerPlanProfiles(['a'])).rejects.toThrow('boom')
  })
})

describe('ownerHasKaspiShopAccess', () => {
  beforeEach(() => vi.clearAllMocks())

  it('is true for a Pro owner and for an admin owner', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { plan: 'pro' }, error: null })
    expect(await ownerHasKaspiShopAccess('u1')).toBe(true)
    mockMaybeSingle.mockResolvedValueOnce({ data: { is_admin: true }, error: null })
    expect(await ownerHasKaspiShopAccess('u2')).toBe(true)
  })

  it('is false for a lapsed Pro owner, a missing profile, or no owner id', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { plan: 'pro', plan_expires_at: past() }, error: null })
    expect(await ownerHasKaspiShopAccess('u3')).toBe(false)
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })
    expect(await ownerHasKaspiShopAccess('u4')).toBe(false)
    expect(await ownerHasKaspiShopAccess(null)).toBe(false)
  })

  it('throws on a read error so the caller picks how to fail closed', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    await expect(ownerHasKaspiShopAccess('u5')).rejects.toThrow('boom')
  })
})

describe('trackedProductOwnerId', () => {
  it('prefers the connection owner over the product row user_id', () => {
    expect(trackedProductOwnerId({ user_id: 'row', kaspi_shop_connections: { user_id: 'conn' } })).toBe('conn')
  })

  it('accepts the joined connection as a one-element array', () => {
    expect(trackedProductOwnerId({ user_id: 'row', kaspi_shop_connections: [{ user_id: 'conn' }] })).toBe('conn')
  })

  it('falls back to the product row user_id when the join is empty', () => {
    expect(trackedProductOwnerId({ user_id: 'row', kaspi_shop_connections: null })).toBe('row')
    expect(trackedProductOwnerId({ user_id: 'row', kaspi_shop_connections: [] })).toBe('row')
    expect(trackedProductOwnerId({ user_id: 'row' })).toBe('row')
  })

  it('returns null when nothing names an owner (callers then fail closed)', () => {
    expect(trackedProductOwnerId({})).toBeNull()
    expect(trackedProductOwnerId(null)).toBeNull()
  })
})
