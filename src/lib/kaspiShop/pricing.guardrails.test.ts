import { describe, it, expect } from 'vitest'
import { computeRepriceCandidate, computePerCityReprice } from './pricing'

// Аудит Kaspi 06.11.2026 (K6, K16, K17): потолок и пол -- жёсткие границы
// в КАЖДОЙ ветке, результат никогда не <= 0 и не NaN.
const strategies = ['undercut_leader', 'match_leader', 'stay_above_leader', 'be_second'] as const

describe('computeRepriceCandidate: hard ceiling (maxPrice)', () => {
  it.each(strategies)('%s: a lone competitor far above maxPrice cannot drag the price over the ceiling', strategy => {
    const result = computeRepriceCandidate({
      competitorPrices: [50000], undercutStep: 100, floorPrice: 5000, maxPrice: 20000, strategy, ownCurrentPrice: 15000,
    })
    expect(result.price).toBe(20000)
    expect(result.heldAtFloor).toBe(false)
  })

  it('undercut_leader: only competitor 50000, step 100, max 20000 gives 20000 (audit probe, was 49900)', () => {
    expect(computeRepriceCandidate({ competitorPrices: [50000], undercutStep: 100, floorPrice: 100, maxPrice: 20000 }).price).toBe(20000)
  })

  it('stay_above_leader: competitor 18000, step 1000, max 18500 gives 18500 (audit probe, was 19000)', () => {
    expect(computeRepriceCandidate({
      competitorPrices: [18000], undercutStep: 1000, floorPrice: 5000, maxPrice: 18500, strategy: 'stay_above_leader',
    }).price).toBe(18500)
  })

  it('be_second: the second-lowest competitor above max is capped too', () => {
    expect(computeRepriceCandidate({
      competitorPrices: [9000, 30000], undercutStep: 100, floorPrice: 5000, maxPrice: 12000, strategy: 'be_second',
    }).price).toBe(12000)
  })

  it('a placeholder competitor price of 99 999 999 is capped at maxPrice', () => {
    expect(computeRepriceCandidate({
      competitorPrices: [99_999_999], undercutStep: 100, floorPrice: 5000, maxPrice: 8000, strategy: 'stay_above_leader',
    }).price).toBe(8000)
  })

  it('a competitor below maxPrice is unaffected by the ceiling', () => {
    expect(computeRepriceCandidate({ competitorPrices: [7000], undercutStep: 100, floorPrice: 5000, maxPrice: 8000 }).price).toBe(6900)
  })

  it('holds at the ceiling (not at the stale higher price) with no competitor and own price above maxPrice', () => {
    const r = computeRepriceCandidate({
      competitorPrices: [], undercutStep: 100, floorPrice: 5000, maxPrice: 8000, ownCurrentPrice: 9500, noCompetitorStreak: 0,
    })
    expect(r.price).toBe(8000)
  })

  it('pump never starts from a price above the ceiling', () => {
    const r = computeRepriceCandidate({
      competitorPrices: [], undercutStep: 100, floorPrice: 5000, maxPrice: 8000, ownCurrentPrice: 9500, noCompetitorStreak: 9,
    })
    expect(r.price).toBe(8000)
  })

  it('without maxPrice nothing caps the competitor-driven price', () => {
    expect(computeRepriceCandidate({ competitorPrices: [50000], undercutStep: 100, floorPrice: 5000 }).price).toBe(49900)
  })

  it('a ceiling at or below the floor is ignored, the floor still wins (never below floor)', () => {
    const r = computeRepriceCandidate({ competitorPrices: [3000], undercutStep: 100, floorPrice: 5000, maxPrice: 4000 })
    expect(r).toEqual({ price: 5000, heldAtFloor: true, newStreak: 0 })
    expect(computeRepriceCandidate({ competitorPrices: [9000], undercutStep: 100, floorPrice: 5000, maxPrice: 4000 }).price).toBe(8900)
  })

  it('per-city: every city is capped independently by the same ceiling', () => {
    const results = computePerCityReprice({
      cityOffers: [
        { cityCode: 'A', offers: [{ merchantId: 'm1', price: 40000 }] },
        { cityCode: 'B', offers: [{ merchantId: 'm1', price: 7000 }] },
      ],
      excludedMerchantIds: [], undercutStep: 100, floorPrice: 5000, maxPrice: 12000, strategy: 'stay_above_leader',
      currentCityPrices: { A: 9000, B: 9000 },
    })
    expect(results.map(r => r.price)).toEqual([12000, 7100])
  })
})

describe('computeRepriceCandidate: hard floor and sane numbers', () => {
  it.each(strategies)('%s: floor greater than current price, the price is the floor or more, never below', strategy => {
    const r = computeRepriceCandidate({
      competitorPrices: [3500], undercutStep: 100, floorPrice: 5000, strategy, ownCurrentPrice: 3000,
    })
    expect(r.price).toBeGreaterThanOrEqual(5000)
  })

  it('floor above current price with no competitor lifts straight to the floor', () => {
    expect(computeRepriceCandidate({ competitorPrices: [], undercutStep: 100, floorPrice: 5000, ownCurrentPrice: 800 }).price).toBe(5000)
  })

  it.each(strategies)('%s: an absurd competitor price of 1 tenge holds at the floor', strategy => {
    const r = computeRepriceCandidate({ competitorPrices: [1], undercutStep: 100, floorPrice: 5000, strategy })
    expect(r.price).toBeGreaterThanOrEqual(5000)
  })

  it('competitor 0, negative, NaN and Infinity are ignored as non-prices', () => {
    const r = computeRepriceCandidate({ competitorPrices: [0, -50, NaN, Infinity], undercutStep: 100, floorPrice: 5000, ownCurrentPrice: 7000 })
    expect(r).toEqual({ price: 7000, heldAtFloor: false, newStreak: 1 })
    // a real competitor next to the garbage still counts
    expect(computeRepriceCandidate({ competitorPrices: [0, NaN, 9000], undercutStep: 100, floorPrice: 5000 }).price).toBe(8900)
  })

  it('floor 0 or NaN (legacy bad row) never yields a price <= 0 or NaN', () => {
    const r = computeRepriceCandidate({ competitorPrices: [1], undercutStep: 100, floorPrice: 0 })
    expect(Number.isFinite(r.price)).toBe(true)
    expect(r.price).toBeGreaterThan(0)
    const r2 = computeRepriceCandidate({ competitorPrices: [50], undercutStep: 100, floorPrice: NaN, ownCurrentPrice: 4000 })
    expect(r2.price).toBe(4000)
  })

  it('a negative step is treated as 0 (no "competitor + 100" disguised as undercut)', () => {
    expect(computeRepriceCandidate({ competitorPrices: [1500], undercutStep: -100, floorPrice: 100 }).price).toBe(1500)
  })

  it('a NaN step does not poison the price', () => {
    expect(computeRepriceCandidate({ competitorPrices: [1500], undercutStep: NaN, floorPrice: 100 }).price).toBe(1500)
  })

  it('NaN or zero own price counts as "no price" (hold falls back to the floor), not a NaN/0 result', () => {
    expect(computeRepriceCandidate({ competitorPrices: [], undercutStep: 100, floorPrice: 5000, ownCurrentPrice: NaN }).price).toBe(5000)
    expect(computeRepriceCandidate({ competitorPrices: [], undercutStep: 100, floorPrice: 5000, ownCurrentPrice: 0 }).price).toBe(5000)
  })

  it('a fractional step still gives an integer tenge price', () => {
    expect(Number.isInteger(computeRepriceCandidate({ competitorPrices: [1000], undercutStep: 0.5, floorPrice: 100 }).price)).toBe(true)
  })

  it('undercut that would go to zero or below holds at the floor, never <= 0', () => {
    const r = computeRepriceCandidate({ competitorPrices: [50], undercutStep: 100, floorPrice: 10 })
    expect(r).toEqual({ price: 10, heldAtFloor: true, newStreak: 0 })
  })
})

// Engine2: восстановление и памп дают целые тенге, как и конкурентная ветка.
describe('computeRepriceCandidate: whole tenge in recovery and pump', () => {
  it('recovery step with a fractional step is a whole number (was 1000.5)', () => {
    const r = computeRepriceCandidate({ competitorPrices: [], undercutStep: 0.5, floorPrice: 1000, ownCurrentPrice: 1000 })
    expect(Number.isInteger(r.price)).toBe(true)
    expect(r.price).toBe(1001)
  })

  it('recovery from a fractional own price at the floor is whole and never below the floor', () => {
    const r = computeRepriceCandidate({ competitorPrices: [], undercutStep: 0, floorPrice: 1000.4, ownCurrentPrice: 1000.4 })
    expect(r.price).toBeGreaterThanOrEqual(1000.4)
  })

  it('recovery is rounded BEFORE the ceiling clamp', () => {
    const r = computeRepriceCandidate({ competitorPrices: [], undercutStep: 100.6, floorPrice: 1000, maxPrice: 1100, ownCurrentPrice: 1000 })
    expect(r.price).toBe(1100)
  })

  it('pump with a fractional step and fractional own price is whole', () => {
    const r = computeRepriceCandidate({
      competitorPrices: [], undercutStep: 0.5, floorPrice: 1000, maxPrice: 5000, ownCurrentPrice: 2000.3, noCompetitorStreak: 5,
    })
    expect(Number.isInteger(r.price)).toBe(true)
    expect(r.price).toBe(2001)
  })

  it('pump never overshoots the ceiling after rounding', () => {
    const r = computeRepriceCandidate({
      competitorPrices: [], undercutStep: 100.7, floorPrice: 1000, maxPrice: 2050, ownCurrentPrice: 2000, noCompetitorStreak: 5,
    })
    expect(r.price).toBe(2050)
  })

  it('whole numbers stay exactly as before (no behaviour change for integer data)', () => {
    expect(computeRepriceCandidate({ competitorPrices: [], undercutStep: 100, floorPrice: 1000, ownCurrentPrice: 1000 }).price).toBe(1100)
    expect(computeRepriceCandidate({
      competitorPrices: [], undercutStep: 100, floorPrice: 1000, maxPrice: 5000, ownCurrentPrice: 2000, noCompetitorStreak: 5,
    }).price).toBe(2100)
  })
})
