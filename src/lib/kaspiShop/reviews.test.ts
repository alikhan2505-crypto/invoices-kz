import { describe, it, expect } from 'vitest'
import { mapReviewsResponse, computeReviewStats, filterByStars, buildProductPageUrl, buildReviewsRequestUrl } from './reviews'

describe('mapReviewsResponse', () => {
  it('maps a well-formed response into a ProductReviewsPage (confirmed-live shape)', () => {
    const json = {
      data: [
        { rating: 5, comment: { minus: '', plus: '', text: 'Хорошие плотные салфетки.' }, author: 'Айнагуль', date: '09.07.2026' },
        { rating: 4, comment: { minus: '', plus: '', text: 'Неплохо.' }, author: 'Мария', date: '28.05.2026' },
        { rating: 3, comment: { minus: '', plus: '', text: '' }, author: null, date: null },
      ],
      summary: { global: 4.6, statistic: [] },
      groupSummary: [{ id: 'ALL', total: 3 }, { id: 'COMMENT', total: 2 }],
    }

    const result = mapReviewsResponse(json)

    expect(result.avgRating).toBe(4.6)
    expect(result.totalCount).toBe(3)
    expect(result.reviews).toEqual([
      { rating: 5, text: 'Хорошие плотные салфетки.', authorName: 'Айнагуль', date: '2026-07-09T00:00:00.000Z' },
      { rating: 4, text: 'Неплохо.', authorName: 'Мария', date: '2026-05-28T00:00:00.000Z' },
      { rating: 3, text: '', authorName: null, date: null },
    ])
  })

  it('parses Kaspi\'s DD.MM.YYYY date, not a generic Date() guess', () => {
    const result = mapReviewsResponse({ data: [{ rating: 5, comment: { text: 'x' }, author: 'A', date: '01.02.2026' }] })
    // If this were misread as MM.DD (a real risk with new Date() on this
    // format) it would come out as March 2nd instead of February 1st.
    expect(result.reviews[0].date).toBe('2026-02-01T00:00:00.000Z')
  })

  it('drops entries with a missing or out-of-range rating instead of throwing', () => {
    const json = {
      data: [
        { rating: 5, comment: { text: 'valid' }, author: null, date: null },
        { rating: 0, comment: { text: 'invalid low' } },
        { rating: 6, comment: { text: 'invalid high' } },
        { rating: 'not-a-number', comment: { text: 'invalid type' } },
        { comment: { text: 'missing rating entirely' } },
        null,
      ],
    }
    const result = mapReviewsResponse(json)
    expect(result.reviews).toEqual([{ rating: 5, text: 'valid', authorName: null, date: null }])
  })

  it('rounds a fractional individual review rating to the nearest star', () => {
    const result = mapReviewsResponse({ data: [{ rating: 4.6, comment: { text: 'x' } }] })
    expect(result.reviews[0].rating).toBe(5)
  })

  it('caps reviews at MAX_REVIEWS_PER_PRODUCT (50)', () => {
    const data = Array.from({ length: 80 }, () => ({ rating: 5, comment: { text: 'x' } }))
    const result = mapReviewsResponse({ data })
    expect(result.reviews).toHaveLength(50)
  })

  it('returns an empty page when data is missing or not an array', () => {
    expect(mapReviewsResponse({ summary: { global: 4.5 } })).toEqual({ reviews: [], avgRating: null, totalCount: null })
    expect(mapReviewsResponse({ data: { reviews: [] } })).toEqual({ reviews: [], avgRating: null, totalCount: null })
  })

  it('returns an empty page for a null input', () => {
    expect(mapReviewsResponse(null)).toEqual({ reviews: [], avgRating: null, totalCount: null })
  })

  it('returns an empty page for a completely unrelated shape', () => {
    expect(mapReviewsResponse({ foo: 'bar' })).toEqual({ reviews: [], avgRating: null, totalCount: null })
  })

  it('reads totalCount from the ALL entry of groupSummary, not COMMENT', () => {
    const json = {
      data: [{ rating: 5, comment: { text: 'x' } }],
      groupSummary: [{ id: 'ALL', total: 56 }, { id: 'COMMENT', total: 24 }],
    }
    expect(mapReviewsResponse(json).totalCount).toBe(56)
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
  it('builds the confirmed-live URL shape: sku, filter=ALL, sort=POPULARITY, limit', () => {
    const url = buildReviewsRequestUrl('114958921', 10)
    expect(url).toBe('https://kaspi.kz/yml/review-view/api/v1/reviews/product/114958921?filter=ALL&sort=POPULARITY&limit=10&withAgg=true')
  })

  it('defaults the limit to MAX_REVIEWS_PER_PRODUCT', () => {
    expect(buildReviewsRequestUrl('114958921')).toContain('limit=50')
  })
})

import { aggregateReviewCache, type ReviewCacheRow, type ReviewProduct } from './reviews'

describe('aggregateReviewCache (аудит K40, K42)', () => {
  const rev = (rating: number) => ({ rating, text: '', authorName: null, date: null })
  const products: ReviewProduct[] = [
    { id: 'p1', name: 'Товар 1', masterSku: 'SKU1' },
    { id: 'p2', name: 'Товар 2', masterSku: 'SKU2' },
  ]
  const row = (id: string, o: Partial<ReviewCacheRow> = {}): ReviewCacheRow => ({
    trackedProductId: id, reviews: [rev(5)], fetchError: null, fetchedAt: '2026-11-06T10:00:00.000Z', avgRating: 4.5, totalCount: 100, ...o,
  })

  it('K40: заголовочные числа берутся из total_count и avg_rating карточек, средняя взвешена по числу отзывов', () => {
    const agg = aggregateReviewCache(products, [
      row('p1', { avgRating: 5, totalCount: 245, reviews: [rev(5), rev(5)] }),
      row('p2', { avgRating: 4, totalCount: 5, reviews: [rev(4)] }),
    ])
    expect(agg.catalog.totalCount).toBe(250) // а не 3 загруженных отзыва
    expect(agg.catalog.avgRating).toBe(5) // (5*245 + 4*5) / 250 = 4.98 -> 5.0
    expect(agg.aggregated).toHaveLength(3)
  })

  it('K40: пока Kaspi не вернул числа, это null, а не 0', () => {
    const agg = aggregateReviewCache(products, [row('p1', { avgRating: null, totalCount: null })])
    expect(agg.catalog.totalCount).toBeNull()
    expect(agg.catalog.avgRating).toBeNull()
  })

  it('дубли строк одного master SKU после переподключения не удваивают отзывы и числа', () => {
    const dupes: ReviewProduct[] = [
      { id: 'a', name: 'Товар', masterSku: 'SKU1' },
      { id: 'b', name: 'Товар', masterSku: 'SKU1' },
    ]
    const agg = aggregateReviewCache(dupes, [
      row('a', { totalCount: 100, fetchedAt: '2026-11-01T10:00:00.000Z' }),
      row('b', { totalCount: 120, fetchedAt: '2026-11-06T10:00:00.000Z' }),
    ])
    expect(agg.catalog.totalCount).toBe(120) // свежая строка, не сумма
    expect(agg.aggregated).toHaveLength(1)
    expect(agg.catalog.productsCount).toBe(1)
  })

  it('K42: прогресс считается по строкам, обновлённым текущим запуском, а не по самой свежей строке всех товаров', () => {
    const since = '2026-11-06T12:00:00.000Z'
    // p1 обновлён уже новым запуском, p2 ещё старый: раньше хватало max(fetched_at) >= since,
    // и обновление объявлялось законченным по первому же пришедшему товару
    const agg = aggregateReviewCache(products, [
      row('p1', { fetchedAt: '2026-11-06T12:00:30.000Z' }),
      row('p2', { fetchedAt: '2026-11-06T09:00:00.000Z' }),
    ], since)
    expect(agg.refresh).toEqual({ expected: 2, updated: 1 })
    const done = aggregateReviewCache(products, [
      row('p1', { fetchedAt: '2026-11-06T12:00:30.000Z' }),
      row('p2', { fetchedAt: '2026-11-06T12:01:00.000Z' }),
    ], since)
    expect(done.refresh).toEqual({ expected: 2, updated: 2 })
  })

  it('K42: since сравнивается как момент времени, формат Postgres (+00:00, микросекунды) не ломает сравнение', () => {
    const agg = aggregateReviewCache([products[0]], [row('p1', { fetchedAt: '2026-11-06T12:00:00.123456+00:00' })], '2026-11-06T12:00:00.000Z')
    expect(agg.refresh).toEqual({ expected: 1, updated: 1 })
  })

  it('без since прогресса нет; товар без кэша ожидается, но не обновлён', () => {
    expect(aggregateReviewCache(products, [row('p1')]).refresh).toBeNull()
    expect(aggregateReviewCache(products, [row('p1')], '2026-01-01T00:00:00.000Z').refresh).toEqual({ expected: 2, updated: 1 })
  })

  it('ошибки обновления считаются по выбранным строкам и не затирают отзывы', () => {
    const agg = aggregateReviewCache(products, [row('p1', { fetchError: 'HTTP 429' }), row('p2')])
    expect(agg.errorCount).toBe(1)
    expect(agg.aggregated).toHaveLength(2)
  })
})
