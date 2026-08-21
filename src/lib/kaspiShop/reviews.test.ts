import { describe, it, expect } from 'vitest'
import { mapReviewsResponse, computeReviewStats, filterByStars, buildProductPageUrl, buildReviewsRequestUrl } from './reviews'

describe('mapReviewsResponse', () => {
  it('maps a well-formed response into a ProductReviewsPage', () => {
    const json = {
      data: {
        averageRating: 4.6,
        totalCount: 3,
        reviews: [
          { rating: 5, text: 'Отличный товар!', authorName: 'Иван', date: '2026-08-01T10:00:00Z' },
          { rating: 4, text: 'Хорошо, но доставка долгая', authorName: 'Мария', date: '2026-07-28T10:00:00Z' },
          { rating: 3, text: '', authorName: null, date: null },
        ],
      },
    }

    const result = mapReviewsResponse(json)

    expect(result.avgRating).toBe(4.6)
    expect(result.totalCount).toBe(3)
    expect(result.reviews).toEqual([
      { rating: 5, text: 'Отличный товар!', authorName: 'Иван', date: '2026-08-01T10:00:00.000Z' },
      { rating: 4, text: 'Хорошо, но доставка долгая', authorName: 'Мария', date: '2026-07-28T10:00:00.000Z' },
      { rating: 3, text: '', authorName: null, date: null },
    ])
  })

  it('falls back to alternate field names (grade/score, comment/reviewText, author/userName/clientName)', () => {
    const json = {
      data: {
        content: [
          { grade: 2, comment: 'so-so', author: 'A' },
          { score: 1, reviewText: 'bad', userName: 'B' },
          { rating: 5, text: 'great', clientName: 'C' },
        ],
      },
    }
    const result = mapReviewsResponse(json)
    expect(result.reviews.map(r => r.rating)).toEqual([2, 1, 5])
    expect(result.reviews.map(r => r.authorName)).toEqual(['A', 'B', 'C'])
  })

  it('supports a response with no top-level data wrapper', () => {
    const result = mapReviewsResponse({ reviews: [{ rating: 5, text: 'ok' }] })
    expect(result.reviews).toHaveLength(1)
  })

  it('supports items[] as an alternate list key', () => {
    const result = mapReviewsResponse({ data: { items: [{ rating: 4, text: 'ok' }] } })
    expect(result.reviews).toHaveLength(1)
  })

  it('drops entries with a missing or out-of-range rating instead of throwing', () => {
    const json = {
      data: {
        reviews: [
          { rating: 5, text: 'valid' },
          { rating: 0, text: 'invalid low' },
          { rating: 6, text: 'invalid high' },
          { rating: 'not-a-number', text: 'invalid type' },
          { text: 'missing rating entirely' },
          null,
        ],
      },
    }
    const result = mapReviewsResponse(json)
    expect(result.reviews).toEqual([{ rating: 5, text: 'valid', authorName: null, date: null }])
  })

  it('rounds a fractional individual review rating to the nearest star', () => {
    const result = mapReviewsResponse({ data: { reviews: [{ rating: 4.6, text: 'x' }] } })
    expect(result.reviews[0].rating).toBe(5)
  })

  it('caps reviews at MAX_REVIEWS_PER_PRODUCT (50)', () => {
    const reviews = Array.from({ length: 80 }, () => ({ rating: 5, text: 'x' }))
    const result = mapReviewsResponse({ data: { reviews } })
    expect(result.reviews).toHaveLength(50)
  })

  it('returns an empty page when the reviews list is missing entirely', () => {
    const result = mapReviewsResponse({ data: { averageRating: 4.5 } })
    expect(result).toEqual({ reviews: [], avgRating: null, totalCount: null })
  })

  it('returns an empty page for a null input', () => {
    expect(mapReviewsResponse(null)).toEqual({ reviews: [], avgRating: null, totalCount: null })
  })

  it('returns an empty page for a completely unrelated shape', () => {
    expect(mapReviewsResponse({ foo: 'bar' })).toEqual({ reviews: [], avgRating: null, totalCount: null })
  })
})

describe('computeReviewStats', () => {
  it('computes avg/total/negative/fiveStar for a mixed set', () => {
    const stats = computeReviewStats([5, 5, 4, 3, 2, 1])
    expect(stats.total).toBe(6)
    expect(stats.avgRating).toBe(3.3)
    expect(stats.fiveStar).toBe(2)
    // <=3 counts as negative: 3, 2, 1 -> 3 reviews
    expect(stats.negative).toBe(3)
  })

  it('treats exactly 3 stars as negative and 4 stars as not negative (boundary)', () => {
    const stats = computeReviewStats([3, 4])
    expect(stats.negative).toBe(1)
  })

  it('returns zeroed stats for an empty list', () => {
    expect(computeReviewStats([])).toEqual({ avgRating: 0, total: 0, negative: 0, fiveStar: 0 })
  })

  it('rounds avgRating to one decimal place', () => {
    const stats = computeReviewStats([5, 5, 5, 4])
    expect(stats.avgRating).toBe(4.8)
  })

  it('counts an all-5-star set correctly', () => {
    const stats = computeReviewStats([5, 5, 5])
    expect(stats).toEqual({ avgRating: 5, total: 3, negative: 0, fiveStar: 3 })
  })
})

describe('filterByStars', () => {
  const reviews = [{ rating: 5 }, { rating: 5 }, { rating: 3 }, { rating: 1 }]

  it('returns everything when stars is null ("All" pill)', () => {
    expect(filterByStars(reviews, null)).toHaveLength(4)
  })

  it('filters to only the matching star rating', () => {
    expect(filterByStars(reviews, 5)).toHaveLength(2)
    expect(filterByStars(reviews, 3)).toHaveLength(1)
    expect(filterByStars(reviews, 2)).toHaveLength(0)
  })
})

describe('buildProductPageUrl', () => {
  it('builds the confirmed-live URL shape with an empty slug', () => {
    expect(buildProductPageUrl('114958921')).toBe('https://kaspi.kz/shop/p/-114958921/?c=750000000')
  })

  it('accepts a custom city id', () => {
    expect(buildProductPageUrl('114958921', '710000000')).toBe('https://kaspi.kz/shop/p/-114958921/?c=710000000')
  })
})

describe('buildReviewsRequestUrl', () => {
  it('builds a URL containing the sku, page, and size', () => {
    const url = buildReviewsRequestUrl('114958921', 1, 10)
    expect(url).toContain('114958921')
    expect(url).toContain('page=1')
    expect(url).toContain('size=10')
  })
})
