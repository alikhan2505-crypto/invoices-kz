import { describe, it, expect, vi, beforeEach } from 'vitest'

const { maybeSingle, update, getMerchantPointsDetailed } = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  update: vi.fn(),
  getMerchantPointsDetailed: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
      update: (payload: unknown) => { update(payload); return { eq: async () => ({ error: null }) } },
    }),
  }),
}))
vi.mock('./cabinetApi', () => ({ getMerchantPointsDetailed: (...a: unknown[]) => getMerchantPointsDetailed(...a) }))

import { getCachedMerchantPoints, readPointsCache, MERCHANT_POINTS_TTL_MS } from './merchantPoints'

const P1 = { storeCode: 'PP1', cityId: '1', cityName: 'Астана' }
const P2 = { storeCode: 'PP2', cityId: null, cityName: null }

describe('readPointsCache', () => {
  const now = Date.parse('2026-11-06T12:00:00Z')
  it('a legacy bare array is readable but stale (no TTL existed)', () => {
    expect(readPointsCache([P1], now)).toEqual({ points: [P1], fresh: false })
  })
  it('a v2 cache is fresh inside the TTL and stale after it', () => {
    const fresh = { v: 2, cachedAt: new Date(now - 1000).toISOString(), points: [P1] }
    const old = { v: 2, cachedAt: new Date(now - MERCHANT_POINTS_TTL_MS - 1000).toISOString(), points: [P1] }
    expect(readPointsCache(fresh, now).fresh).toBe(true)
    expect(readPointsCache(old, now).fresh).toBe(false)
  })
  it('garbage is an empty stale cache', () => {
    expect(readPointsCache(null, now)).toEqual({ points: [], fresh: false })
    expect(readPointsCache({ x: 1 }, now)).toEqual({ points: [], fresh: false })
  })
})

describe('getCachedMerchantPoints', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns a fresh cache without calling Kaspi', async () => {
    maybeSingle.mockResolvedValue({ data: { merchant_points_cache: { v: 2, cachedAt: new Date().toISOString(), points: [P1] } } })
    expect(await getCachedMerchantPoints('c1', 'cookie', 'm')).toEqual([P1])
    expect(getMerchantPointsDetailed).not.toHaveBeenCalled()
  })

  it('caches a COMPLETE result with a timestamp', async () => {
    maybeSingle.mockResolvedValue({ data: { merchant_points_cache: null } })
    getMerchantPointsDetailed.mockResolvedValue({ points: [P1], complete: true, sessionExpired: false })
    await getCachedMerchantPoints('c1', 'cookie', 'm')
    expect(update).toHaveBeenCalledTimes(1)
    const payload = update.mock.calls[0][0].merchant_points_cache
    expect(payload.v).toBe(2)
    expect(payload.points).toEqual([P1])
    expect(Number.isFinite(Date.parse(payload.cachedAt))).toBe(true)
  })

  it('does NOT cache a partial result (city names missing, catalog cut off), so the city list can recover next time', async () => {
    maybeSingle.mockResolvedValue({ data: { merchant_points_cache: null } })
    getMerchantPointsDetailed.mockResolvedValue({ points: [P2], complete: false, sessionExpired: false })
    expect(await getCachedMerchantPoints('c1', 'cookie', 'm')).toEqual([P2])
    expect(update).not.toHaveBeenCalled()
  })

  it('an expired cache is refreshed when Kaspi answers fully', async () => {
    maybeSingle.mockResolvedValue({ data: { merchant_points_cache: { v: 2, cachedAt: '2020-01-01T00:00:00Z', points: [P2] } } })
    getMerchantPointsDetailed.mockResolvedValue({ points: [P1], complete: true, sessionExpired: false })
    expect(await getCachedMerchantPoints('c1', 'cookie', 'm')).toEqual([P1])
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('an old cache is kept as the answer (and not overwritten) when the refresh is partial', async () => {
    maybeSingle.mockResolvedValue({ data: { merchant_points_cache: [P1] } })
    getMerchantPointsDetailed.mockResolvedValue({ points: [], complete: false, sessionExpired: false })
    expect(await getCachedMerchantPoints('c1', 'cookie', 'm')).toEqual([P1])
    expect(update).not.toHaveBeenCalled()
  })
})
