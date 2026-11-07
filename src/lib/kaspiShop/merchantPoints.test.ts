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

import {
  getCachedMerchantPoints, readPointsCache, mergePoints,
  MERCHANT_POINTS_TTL_MS, MERCHANT_POINTS_PARTIAL_TTL_MS, MERCHANT_POINTS_EMPTY_TTL_MS,
} from './merchantPoints'

const P1 = { storeCode: 'PP1', cityId: '1', cityName: 'Астана' }
const P2 = { storeCode: 'PP2', cityId: null, cityName: null }

describe('readPointsCache', () => {
  const now = Date.parse('2026-11-06T12:00:00Z')
  it('a legacy bare array is readable but stale (no TTL existed)', () => {
    expect(readPointsCache([P1], now)).toEqual({ points: [P1], fresh: false, partial: false })
  })
  it('a v2 cache is fresh inside the TTL and stale after it', () => {
    const fresh = { v: 2, cachedAt: new Date(now - 1000).toISOString(), points: [P1] }
    const old = { v: 2, cachedAt: new Date(now - MERCHANT_POINTS_TTL_MS - 1000).toISOString(), points: [P1] }
    expect(readPointsCache(fresh, now).fresh).toBe(true)
    expect(readPointsCache(old, now).fresh).toBe(false)
  })
  it('garbage is an empty stale cache', () => {
    expect(readPointsCache(null, now)).toEqual({ points: [], fresh: false, partial: false })
    expect(readPointsCache({ x: 1 }, now)).toEqual({ points: [], fresh: false, partial: false })
  })
  it('a partial cache lives only the short TTL, a complete one the full day', () => {
    const at = (ms: number) => new Date(now - ms).toISOString()
    const partialYoung = { v: 2, partial: true, cachedAt: at(MERCHANT_POINTS_PARTIAL_TTL_MS - 1000), points: [P2] }
    const partialOld = { v: 2, partial: true, cachedAt: at(MERCHANT_POINTS_PARTIAL_TTL_MS + 1000), points: [P2] }
    const completeSameAge = { v: 2, cachedAt: at(MERCHANT_POINTS_PARTIAL_TTL_MS + 1000), points: [P1] }
    expect(readPointsCache(partialYoung, now)).toMatchObject({ fresh: true, partial: true })
    expect(readPointsCache(partialOld, now)).toMatchObject({ fresh: false, partial: true })
    expect(readPointsCache(completeSameAge, now)).toMatchObject({ fresh: true, partial: false })
    expect(MERCHANT_POINTS_PARTIAL_TTL_MS).toBeGreaterThanOrEqual(10 * 60 * 1000)
    expect(MERCHANT_POINTS_PARTIAL_TTL_MS).toBeLessThanOrEqual(15 * 60 * 1000)
  })
  it('a partial cache with NO points lives about a minute, not ten (a transient Kaspi failure must not stick)', () => {
    const at = (ms: number) => new Date(now - ms).toISOString()
    expect(MERCHANT_POINTS_EMPTY_TTL_MS).toBeGreaterThanOrEqual(30 * 1000)
    expect(MERCHANT_POINTS_EMPTY_TTL_MS).toBeLessThanOrEqual(2 * 60 * 1000)
    const young = { v: 2, partial: true, cachedAt: at(MERCHANT_POINTS_EMPTY_TTL_MS - 1000), points: [] }
    const old = { v: 2, partial: true, cachedAt: at(MERCHANT_POINTS_EMPTY_TTL_MS + 1000), points: [] }
    expect(readPointsCache(young, now)).toMatchObject({ fresh: true, partial: true })
    expect(readPointsCache(old, now)).toMatchObject({ fresh: false, partial: true })
  })
})

describe('mergePoints', () => {
  const P1c = { storeCode: 'PP1', cityId: '2', cityName: 'Алматы' }
  it('union by storeCode; an entry with a city beats one without, in either order', () => {
    const P1nocity = { storeCode: 'PP1', cityId: null, cityName: null }
    expect(mergePoints([P1nocity], [P1c])).toEqual([P1c])
    expect(mergePoints([P1c], [P1nocity])).toEqual([P1c])
    expect(mergePoints([P1], [P2]).map(p => p.storeCode)).toEqual(['PP1', 'PP2'])
  })
  it('both have a city: the fresh one wins', () => {
    expect(mergePoints([P1], [P1c])).toEqual([P1c])
  })
  it('empty sides', () => {
    expect(mergePoints([], [])).toEqual([])
    expect(mergePoints([P1], [])).toEqual([P1])
    expect(mergePoints([], [P2])).toEqual([P2])
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

  it('a partial result is cached SHORT with partial:true (not as a complete one), so it recovers after the short TTL', async () => {
    maybeSingle.mockResolvedValue({ data: { merchant_points_cache: null } })
    getMerchantPointsDetailed.mockResolvedValue({ points: [P2], complete: false, sessionExpired: false })
    expect(await getCachedMerchantPoints('c1', 'cookie', 'm')).toEqual([P2])
    expect(update).toHaveBeenCalledTimes(1)
    const payload = update.mock.calls[0][0].merchant_points_cache
    expect(payload).toMatchObject({ v: 2, partial: true, points: [P2] })
  })

  it('an unlucky store is NOT rescanned on every call: a fresh partial cache (even empty) is returned without calling Kaspi', async () => {
    maybeSingle.mockResolvedValue({ data: { merchant_points_cache: { v: 2, partial: true, cachedAt: new Date().toISOString(), points: [] } } })
    expect(await getCachedMerchantPoints('c1', 'cookie', 'm')).toEqual([])
    expect(getMerchantPointsDetailed).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('an expired partial cache is rescanned; a complete answer replaces it as a full cache', async () => {
    maybeSingle.mockResolvedValue({ data: { merchant_points_cache: { v: 2, partial: true, cachedAt: new Date(Date.now() - MERCHANT_POINTS_PARTIAL_TTL_MS - 5000).toISOString(), points: [P2] } } })
    getMerchantPointsDetailed.mockResolvedValue({ points: [P1], complete: true, sessionExpired: false })
    expect(await getCachedMerchantPoints('c1', 'cookie', 'm')).toEqual([P1])
    const payload = update.mock.calls[0][0].merchant_points_cache
    expect('partial' in payload).toBe(false)
  })

  it('a dead session is not cached as a negative result (points are needed right after reconnecting)', async () => {
    maybeSingle.mockResolvedValue({ data: { merchant_points_cache: null } })
    getMerchantPointsDetailed.mockResolvedValue({ points: [], complete: false, sessionExpired: true })
    expect(await getCachedMerchantPoints('c1', 'cookie', 'm')).toEqual([])
    expect(update).not.toHaveBeenCalled()
  })

  it('an expired cache is refreshed when Kaspi answers fully', async () => {
    maybeSingle.mockResolvedValue({ data: { merchant_points_cache: { v: 2, cachedAt: '2020-01-01T00:00:00Z', points: [P2] } } })
    getMerchantPointsDetailed.mockResolvedValue({ points: [P1], complete: true, sessionExpired: false })
    expect(await getCachedMerchantPoints('c1', 'cookie', 'm')).toEqual([P1])
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('a fresh PARTIAL scan that found more points is merged with the cache, not thrown away: the new point appears and is saved', async () => {
    const P3 = { storeCode: 'PP3', cityId: '3', cityName: 'Шымкент' }
    maybeSingle.mockResolvedValue({ data: { merchant_points_cache: { v: 2, partial: true, cachedAt: new Date(Date.now() - MERCHANT_POINTS_PARTIAL_TTL_MS - 5000).toISOString(), points: [P1] } } })
    getMerchantPointsDetailed.mockResolvedValue({ points: [P1, P3], complete: false, sessionExpired: false })
    const out = await getCachedMerchantPoints('c1', 'cookie', 'm')
    expect(out.map(p => p.storeCode)).toEqual(['PP1', 'PP3'])
    expect(update.mock.calls[0][0].merchant_points_cache).toMatchObject({ v: 2, partial: true, points: [P1, P3] })
  })

  it('stale complete cache + partial refresh with a new point: union, the old point that Kaspi did not return this time is kept', async () => {
    maybeSingle.mockResolvedValue({ data: { merchant_points_cache: { v: 2, cachedAt: '2020-01-01T00:00:00Z', points: [P1] } } })
    getMerchantPointsDetailed.mockResolvedValue({ points: [P2], complete: false, sessionExpired: false })
    const out = await getCachedMerchantPoints('c1', 'cookie', 'm')
    expect(out.map(p => p.storeCode).sort()).toEqual(['PP1', 'PP2'])
  })

  it('a partial refresh that knows a point only without city does not erase the cached city', async () => {
    const P1nocity = { storeCode: 'PP1', cityId: null, cityName: null }
    maybeSingle.mockResolvedValue({ data: { merchant_points_cache: [P1] } })
    getMerchantPointsDetailed.mockResolvedValue({ points: [P1nocity], complete: false, sessionExpired: false })
    expect(await getCachedMerchantPoints('c1', 'cookie', 'm')).toEqual([P1])
  })

  it('an EMPTY partial result (transient failure) is re-tried after about a minute, while one inside the minute is not rescanned', async () => {
    maybeSingle.mockResolvedValue({ data: { merchant_points_cache: { v: 2, partial: true, cachedAt: new Date(Date.now() - MERCHANT_POINTS_EMPTY_TTL_MS - 5000).toISOString(), points: [] } } })
    getMerchantPointsDetailed.mockResolvedValue({ points: [P1], complete: true, sessionExpired: false })
    expect(await getCachedMerchantPoints('c1', 'cookie', 'm')).toEqual([P1])
    expect(getMerchantPointsDetailed).toHaveBeenCalledTimes(1)
  })

  it('a legacy bare array is stale: it is rescanned, and when the refresh is partial the old points stay the answer (re-saved as short partial, not lost)', async () => {
    maybeSingle.mockResolvedValue({ data: { merchant_points_cache: [P1] } })
    getMerchantPointsDetailed.mockResolvedValue({ points: [], complete: false, sessionExpired: false })
    expect(await getCachedMerchantPoints('c1', 'cookie', 'm')).toEqual([P1])
    expect(getMerchantPointsDetailed).toHaveBeenCalledTimes(1)
    expect(update.mock.calls[0][0].merchant_points_cache).toMatchObject({ v: 2, partial: true, points: [P1] })
  })
})
