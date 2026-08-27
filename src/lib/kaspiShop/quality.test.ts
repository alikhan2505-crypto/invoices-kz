import { describe, it, expect, vi } from 'vitest'
import { getQualityOverview, getQualityCategories, QUALITY_TABS } from './quality'

function jsonResponse(body: any, status = 200) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const REAL_METRIC_DETAILS = {
  data: {
    merchant: {
      qualityControl: {
        ratingWithStatistics: {
          details: { goodValue: 4.6, violationValue: 4.0, zonePercentage: 0.0, percentage: 0.0, daysPerPeriod: 90, from: '2026-05-27T19:00:00.000Z', to: '2026-08-25T18:59:59.999Z', formulaElements: { numerator: 0, denominator: 0 }, notEnoughData: true },
          statistics: { oneCount: 0, twoCount: 0, threeCount: 0, fourCount: 0, fiveCount: 0 },
        },
        returned: { details: { goodValue: 1.0, violationValue: 2.0, zonePercentage: 100.0, percentage: 0.0, daysPerPeriod: 30, from: '2026-07-26T19:00:00.000Z', to: '2026-08-25T18:59:59.999Z', formulaElements: { numerator: 0, denominator: 0 }, notEnoughData: true } },
        lateKaspiDelivery: { details: { goodValue: 5.0, violationValue: 10.0, zonePercentage: 100.0, percentage: 0.0, daysPerPeriod: 30, from: '2026-07-26T19:00:00.000Z', to: '2026-08-25T18:59:59.999Z', formulaElements: { numerator: 0, denominator: 7 }, notEnoughData: true } },
        lateExpressDelivery: null,
        cancelled: { details: { goodValue: 1.0, violationValue: 3.0, zonePercentage: 100.0, percentage: 0.0, daysPerPeriod: 30, from: '2026-07-26T19:00:00.000Z', to: '2026-08-25T18:59:59.999Z', formulaElements: { numerator: 0, denominator: 0 }, notEnoughData: true } },
        bannerGroup: { warning: null },
        ordersCount: 0,
      },
    },
  },
}

describe('QUALITY_TABS', () => {
  it('maps our stable tab keys to Kaspi\'s real (live-verified) metricType enum + boolean flags', () => {
    expect(QUALITY_TABS.rating).toEqual({ metricType: 'RATING', isRating: true, isReturned: false, isLateKaspiDelivery: false, isCancelled: false })
    // RETURN/CANCEL are singular -- confirmed live 2026-08-27, the earlier
    // findings doc guessed RETURNS/CANCELS which would have broken the
    // whole GraphQL query (unknown enum value).
    expect(QUALITY_TABS.returns).toEqual({ metricType: 'RETURN', isRating: false, isReturned: true, isLateKaspiDelivery: false, isCancelled: false })
    expect(QUALITY_TABS.lateDelivery).toEqual({ metricType: 'LATE_KASPI_DELIVERY', isRating: false, isReturned: false, isLateKaspiDelivery: true, isCancelled: false })
    expect(QUALITY_TABS.cancellations).toEqual({ metricType: 'CANCEL', isRating: false, isReturned: false, isLateKaspiDelivery: false, isCancelled: true })
  })
})

describe('getQualityOverview', () => {
  it('maps the real captured getSingleMetricDetails response into a flat 4-metric bundle', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(REAL_METRIC_DETAILS))
    const result = await getQualityOverview('cookie=1', '30067228', fetchFn as any)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://mc.shop.kaspi.kz/mc/facade/graphql?opName=getSingleMetricDetails')
    expect(JSON.parse(init.body).variables).toEqual({ id: '30067228', version: 'V2' })
    expect(result.sessionExpired).toBe(false)
    expect(result.overview?.rating).toEqual({
      goodValue: 4.6, violationValue: 4.0, zonePercentage: 0.0, percentage: 0.0,
      daysPerPeriod: 90, from: '2026-05-27T19:00:00.000Z', to: '2026-08-25T18:59:59.999Z',
      notEnoughData: true, numerator: 0, denominator: 0,
      statistics: { oneCount: 0, twoCount: 0, threeCount: 0, fourCount: 0, fiveCount: 0 },
    })
    expect(result.overview?.returns.violationValue).toBe(2.0)
    expect(result.overview?.lateDelivery.denominator).toBe(7)
    expect(result.overview?.cancellations.goodValue).toBe(1.0)
    expect(result.overview?.ordersCount).toBe(0)
    expect(result.overview?.warning).toBeNull()
  })

  it('tolerates lateExpressDelivery being null without throwing', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(REAL_METRIC_DETAILS))
    const result = await getQualityOverview('c', '30067228', fetchFn as any)
    expect(result.overview).not.toBeNull()
  })

  it('reports sessionExpired on 401', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, 401))
    const result = await getQualityOverview('c', '30067228', fetchFn as any)
    expect(result).toEqual({ overview: null, sessionExpired: true })
  })
})

describe('getQualityCategories', () => {
  it('rejects a tab key outside the known set before any network call', async () => {
    const fetchFn = vi.fn()
    await expect(getQualityCategories('c', '30067228', 'returnsxx' as any, 0, fetchFn as any)).rejects.toThrow(/tab/i)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('sends the correct real enum + boolean flags for the returns tab (RETURN, singular)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({
      data: { merchant: { qualityControl: { categories: { totalCount: 1, items: [
        { categoryCode: 'Household goods', categoryDisplayName: 'Хозяйственные товары', qualityMetrics: { performanceStatus: 'TOP', returns: { percentage: 0.0, performanceStatus: 'TOP', totalCount: 1, warningLevel: null, violatedCount: 0, daysPerPeriod: 30, from: 'a', to: 'b', notEnoughData: true } } },
      ] } } } },
    }))
    const result = await getQualityCategories('cookie=1', '30067228', 'returns', 0, fetchFn as any)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://mc.shop.kaspi.kz/mc/facade/graphql?opName=getQCByCategories')
    const body = JSON.parse(init.body)
    expect(body.variables).toEqual({
      merchantUid: '30067228', page: 0, size: 10,
      metricType: 'RETURN', isCancelled: false, isReturned: true, isLateKaspiDelivery: false, isRating: false,
    })
    expect(result.categories).toEqual([{
      categoryCode: 'Household goods', categoryDisplayName: 'Хозяйственные товары', performanceStatus: 'TOP',
      metric: { percentage: 0.0, performanceStatus: 'TOP', totalCount: 1, warningLevel: null, violatedCount: 0, daysPerPeriod: 30, from: 'a', to: 'b', notEnoughData: true },
    }])
    expect(result.total).toBe(1)
  })

  it('sends CANCEL (singular) for the cancellations tab', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ data: { merchant: { qualityControl: { categories: { totalCount: 0, items: [] } } } } }))
    await getQualityCategories('c', '30067228', 'cancellations', 0, fetchFn as any)
    const body = JSON.parse(fetchFn.mock.calls[0][1].body)
    expect(body.variables.metricType).toBe('CANCEL')
    expect(body.variables.isCancelled).toBe(true)
  })

  it('reports sessionExpired on 403', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, 403))
    const result = await getQualityCategories('c', '30067228', 'rating', 0, fetchFn as any)
    expect(result).toEqual({ categories: [], total: 0, sessionExpired: true })
  })
})
