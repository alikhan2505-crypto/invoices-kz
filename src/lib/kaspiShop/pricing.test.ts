import { describe, it, expect } from 'vitest'
import { computeRepriceCandidate, generatePriceListXml, resolveTargetCities, computePerCityReprice } from './pricing'

describe('computeRepriceCandidate', () => {
  it('undercuts the competitor by the seller-set step when above the floor (default strategy)', () => {
    const result = computeRepriceCandidate({ competitorPrices: [10000], undercutStep: 100, floorPrice: 5000 })
    expect(result).toEqual({ price: 9900, heldAtFloor: false })
  })

  it('holds at the floor when undercutting would go below it', () => {
    const result = computeRepriceCandidate({ competitorPrices: [5050], undercutStep: 100, floorPrice: 5000 })
    expect(result).toEqual({ price: 5000, heldAtFloor: true })
  })

  it('holds at exactly the floor when the candidate lands exactly on it', () => {
    const result = computeRepriceCandidate({ competitorPrices: [5100], undercutStep: 100, floorPrice: 5000 })
    expect(result).toEqual({ price: 5000, heldAtFloor: false })
  })

  it('holds at own current price (not flagged heldAtFloor) when there are no competitors', () => {
    const result = computeRepriceCandidate({ competitorPrices: [], undercutStep: 100, floorPrice: 5000, ownCurrentPrice: 8500 })
    expect(result).toEqual({ price: 8500, heldAtFloor: false })
  })

  it('falls back to the floor when there are no competitors and no current price', () => {
    const result = computeRepriceCandidate({ competitorPrices: [], undercutStep: 100, floorPrice: 5000 })
    expect(result).toEqual({ price: 5000, heldAtFloor: false })
  })

  it('steps back up by undercutStep when no competitor is found and we are pinned at the floor', () => {
    const result = computeRepriceCandidate({ competitorPrices: [], undercutStep: 100, floorPrice: 5000, ownCurrentPrice: 5000 })
    expect(result).toEqual({ price: 5100, heldAtFloor: false })
  })

  it('also recovers if own current price somehow sits below the floor', () => {
    const result = computeRepriceCandidate({ competitorPrices: [], undercutStep: 50, floorPrice: 5000, ownCurrentPrice: 4900 })
    expect(result).toEqual({ price: 4950, heldAtFloor: false })
  })

  it('does not keep climbing once recovered above the floor -- holds flat on the next no-competitor cycle', () => {
    const result = computeRepriceCandidate({ competitorPrices: [], undercutStep: 100, floorPrice: 5000, ownCurrentPrice: 5100 })
    expect(result).toEqual({ price: 5100, heldAtFloor: false })
  })

  it('undercut_leader uses the lowest of several competitor prices', () => {
    const result = computeRepriceCandidate({ competitorPrices: [10500, 10000, 11000], undercutStep: 100, floorPrice: 5000 })
    expect(result).toEqual({ price: 9900, heldAtFloor: false })
  })
})

describe('computeRepriceCandidate strategies', () => {
  it('match_leader sets price equal to the lowest competitor', () => {
    const result = computeRepriceCandidate({
      competitorPrices: [10000, 10500],
      undercutStep: 100,
      floorPrice: 8000,
      strategy: 'match_leader',
    })
    expect(result).toEqual({ price: 10000, heldAtFloor: false })
  })

  it('match_leader holds at floor if the leader price is below floor', () => {
    const result = computeRepriceCandidate({
      competitorPrices: [7000],
      undercutStep: 100,
      floorPrice: 8000,
      strategy: 'match_leader',
    })
    expect(result).toEqual({ price: 8000, heldAtFloor: true })
  })

  it('stay_above_leader sits step above the lowest competitor when we are not already cheapest', () => {
    const result = computeRepriceCandidate({
      competitorPrices: [10000, 10500],
      undercutStep: 100,
      floorPrice: 8000,
      strategy: 'stay_above_leader',
      ownCurrentPrice: 10200,
    })
    expect(result).toEqual({ price: 10100, heldAtFloor: false })
  })

  it('stay_above_leader cedes the top spot and moves above the next seller if we are already cheapest', () => {
    const result = computeRepriceCandidate({
      competitorPrices: [10000, 10500],
      undercutStep: 100,
      floorPrice: 8000,
      strategy: 'stay_above_leader',
      ownCurrentPrice: 9500,
    })
    expect(result).toEqual({ price: 10100, heldAtFloor: false })
  })

  it('be_second sits step above the second-lowest competitor when there are 2+ competitors', () => {
    const result = computeRepriceCandidate({
      competitorPrices: [10000, 10500, 11000],
      undercutStep: 100,
      floorPrice: 8000,
      strategy: 'be_second',
    })
    expect(result).toEqual({ price: 10600, heldAtFloor: false })
  })

  it('be_second sits step above the only competitor when there is exactly one', () => {
    const result = computeRepriceCandidate({
      competitorPrices: [10000],
      undercutStep: 100,
      floorPrice: 8000,
      strategy: 'be_second',
    })
    expect(result).toEqual({ price: 10100, heldAtFloor: false })
  })

  it('be_second holds at floor if the second-lowest tier would be below floor', () => {
    const result = computeRepriceCandidate({
      competitorPrices: [6000, 6500],
      undercutStep: 100,
      floorPrice: 8000,
      strategy: 'be_second',
    })
    expect(result).toEqual({ price: 8000, heldAtFloor: true })
  })
})

describe('resolveTargetCities', () => {
  it('returns the tracked list unchanged when nothing is excluded', () => {
    expect(resolveTargetCities(['750000000', '710000000'], [])).toEqual(['750000000', '710000000'])
  })

  it('removes cities that are in this product\'s own exclusion list', () => {
    expect(resolveTargetCities(['750000000', '710000000', '590000000'], ['710000000'])).toEqual(['750000000', '590000000'])
  })

  it('excluding a city not in the tracked list is a no-op', () => {
    expect(resolveTargetCities(['750000000'], ['999999999'])).toEqual(['750000000'])
  })

  it('returns an empty list when nothing is tracked', () => {
    expect(resolveTargetCities([], ['710000000'])).toEqual([])
  })
})

describe('computePerCityReprice', () => {
  it('computes an independent price per city from that city\'s own competitor offers and own current price', () => {
    const results = computePerCityReprice({
      cityOffers: [
        { cityCode: 'A', offers: [{ merchantId: 'm1', price: 10000 }] },
        { cityCode: 'B', offers: [{ merchantId: 'm2', price: 8000 }] },
      ],
      excludedMerchantIds: [],
      undercutStep: 100,
      floorPrice: 5000,
      strategy: 'undercut_leader',
      currentCityPrices: { A: 9950, B: 8200 },
    })
    expect(results).toEqual([
      { cityCode: 'A', price: 9900, heldAtFloor: false },
      { cityCode: 'B', price: 7900, heldAtFloor: false },
    ])
  })

  it('filters excluded merchants per city before computing', () => {
    const results = computePerCityReprice({
      cityOffers: [{ cityCode: 'A', offers: [{ merchantId: 'blocked', price: 1000 }, { merchantId: 'm2', price: 9000 }] }],
      excludedMerchantIds: ['blocked'],
      undercutStep: 100,
      floorPrice: 500,
      strategy: 'undercut_leader',
      currentCityPrices: {},
    })
    expect(results).toEqual([{ cityCode: 'A', price: 8900, heldAtFloor: false }])
  })

  it('holds a city at the floor independently of other cities', () => {
    const results = computePerCityReprice({
      cityOffers: [
        { cityCode: 'A', offers: [{ merchantId: 'm1', price: 5050 }] },
        { cityCode: 'B', offers: [{ merchantId: 'm2', price: 20000 }] },
      ],
      excludedMerchantIds: [],
      undercutStep: 100,
      floorPrice: 5000,
      strategy: 'undercut_leader',
      currentCityPrices: { A: 5000, B: 5000 },
    })
    expect(results).toEqual([
      { cityCode: 'A', price: 5000, heldAtFloor: true },
      { cityCode: 'B', price: 19900, heldAtFloor: false },
    ])
  })

  it('returns an empty array for an empty city-offers list', () => {
    expect(computePerCityReprice({
      cityOffers: [], excludedMerchantIds: [], undercutStep: 100, floorPrice: 500, strategy: 'undercut_leader', currentCityPrices: {},
    })).toEqual([])
  })
})

describe('generatePriceListXml', () => {
  it('produces a kaspi_catalog document matching the documented offer schema', () => {
    const xml = generatePriceListXml({
      companyName: 'Test Company',
      merchantId: 'MC123',
      products: [
        { sku: 'SKU1', model: 'iphone 5s white 32gb', brand: 'Apple', storeId: 'point1', stockCount: 5, price: 6418 },
      ],
    })
    expect(xml).toContain('<company>Test Company</company>')
    expect(xml).toContain('<merchantid>MC123</merchantid>')
    expect(xml).toContain('<offer sku="SKU1">')
    expect(xml).toContain('<model>iphone 5s white 32gb</model>')
    expect(xml).toContain('<brand>Apple</brand>')
    expect(xml).toContain('<availability available="yes" storeId="point1" stockCount="5"/>')
    expect(xml).toContain('<price>6418</price>')
  })

  it('escapes special XML characters in text fields', () => {
    const xml = generatePriceListXml({
      companyName: 'A & B',
      merchantId: 'MC123',
      products: [{ sku: 'SKU2', model: 'Cable <3m>', brand: 'X&Y', storeId: 'p1', stockCount: 0, price: 100 }],
    })
    expect(xml).toContain('A &amp; B')
    expect(xml).toContain('Cable &lt;3m&gt;')
    expect(xml).toContain('X&amp;Y')
  })

  it('marks zero stock as unavailable', () => {
    const xml = generatePriceListXml({
      companyName: 'C',
      merchantId: 'M',
      products: [{ sku: 'SKU3', model: 'X', brand: 'Y', storeId: 'p1', stockCount: 0, price: 100 }],
    })
    expect(xml).toContain('available="no"')
  })

  it('rounds price to the nearest whole tenge (Kaspi price-list has no decimals)', () => {
    const xml = generatePriceListXml({
      companyName: 'C',
      merchantId: 'M',
      products: [{ sku: 'SKU4', model: 'X', brand: 'Y', storeId: 'p1', stockCount: 1, price: 100.6 }],
    })
    expect(xml).toContain('<price>101</price>')
  })
})
