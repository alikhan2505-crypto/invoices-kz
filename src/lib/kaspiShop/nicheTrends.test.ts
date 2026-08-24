import { describe, it, expect } from 'vitest'
import { productDemandScore, categoryDemandScore, mapCategorySample, KASPI_TRENDING_CATEGORIES } from './nicheTrends'

describe('productDemandScore', () => {
  it('log-compresses review count and weights by rating', () => {
    // log10(1 + 99) = 2, rating factor 5/5 = 1
    expect(productDemandScore({ rating: 5, reviewsCount: 99 })).toBeCloseTo(2, 5)
  })

  it('penalizes a poorly-rated product relative to an equally-reviewed, well-rated one', () => {
    const wellRated = productDemandScore({ rating: 5, reviewsCount: 500 })
    const poorlyRated = productDemandScore({ rating: 2, reviewsCount: 500 })
    expect(poorlyRated).toBeLessThan(wellRated)
  })

  it('clamps out-of-range rating and never goes negative on bad input', () => {
    expect(productDemandScore({ rating: 7, reviewsCount: -50 })).toBe(0)
  })

  it('a product with zero reviews scores zero regardless of rating', () => {
    expect(productDemandScore({ rating: 5, reviewsCount: 0 })).toBe(0)
  })
})

describe('categoryDemandScore', () => {
  it('returns 0 for an empty sample', () => {
    expect(categoryDemandScore([], 100)).toBe(0)
  })

  it('with zero growth (first-ever run), equals the mean product score', () => {
    const products = [{ rating: 5, reviewsCount: 99 }, { rating: 5, reviewsCount: 9 }]
    // scores: log10(100)*1=2, log10(10)*1=1 -> mean 1.5
    expect(categoryDemandScore(products, 0)).toBeCloseTo(1.5, 5)
  })

  it('review growth since the last snapshot lifts the score above the flat mean', () => {
    const products = [{ rating: 5, reviewsCount: 99 }]
    const flat = categoryDemandScore(products, 0)
    const growing = categoryDemandScore(products, 900)
    expect(growing).toBeGreaterThan(flat)
    // velocity bonus = 2 * log10(1 + 900) = 2 * log10(901)
    expect(growing - flat).toBeCloseTo(2 * Math.log10(901), 5)
  })

  it('never lets negative growth (a category that lost reviews) subtract from the score', () => {
    const products = [{ rating: 5, reviewsCount: 99 }]
    expect(categoryDemandScore(products, -50)).toBeCloseTo(categoryDemandScore(products, 0), 5)
  })
})

describe('mapCategorySample', () => {
  it('reuses mapNicheResponse to parse the same raw Kaspi response shape', () => {
    const json = {
      data: {
        total: 4200,
        filters: [],
        cards: [
          { id: '1', title: 'Товар 1', unitSalePrice: 5000, rating: 4.9, reviewsQuantity: 300, brand: 'X', previewImages: [{ medium: 'https://cdn/1.jpg' }], shopLink: '/p/tovar-1-1/?c=750000000' },
          { id: '2', title: 'Товар 2', unitSalePrice: 2000, rating: 4.5, reviewsQuantity: 50, brand: 'Y', previewImages: [] },
        ],
      },
    }
    const result = mapCategorySample(json)
    expect(result.total).toBe(4200)
    expect(result.products).toHaveLength(2)
    expect(result.products[0]).toEqual({
      sku: '1', name: 'Товар 1', price: 5000, rating: 4.9, reviewsCount: 300, brand: 'X',
      imageUrl: 'https://cdn/1.jpg', shopUrl: 'https://kaspi.kz/shop/p/tovar-1-1/?c=750000000',
    })
  })

  it('returns an empty sample for a missing/null response, same as mapNicheResponse', () => {
    expect(mapCategorySample(null)).toEqual({ total: 0, products: [] })
  })
})

describe('KASPI_TRENDING_CATEGORIES', () => {
  it('has a reasonable number of well-known categories with unique keys', () => {
    expect(KASPI_TRENDING_CATEGORIES.length).toBeGreaterThanOrEqual(15)
    const keys = KASPI_TRENDING_CATEGORIES.map(c => c.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const c of KASPI_TRENDING_CATEGORIES) {
      expect(c.label.length).toBeGreaterThan(0)
    }
  })
})
