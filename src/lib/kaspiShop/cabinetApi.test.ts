import { describe, it, expect, vi } from 'vitest'
import {
  extractPointCity, confirmPacking, listOrders, totalStock, getOrderCounters, getOrderDetail,
  listCatalogWithStatus, fetchOffersDetailsChecked, getMerchantPointsDetailed, fetchCityNamesChecked,
  CATALOG_MAX_PAGES, DETAILS_CHUNK_SIZE,
} from './cabinetApi'

describe('totalStock', () => {
  it('sums stock across every store point', () => {
    expect(totalStock({ availabilities: [{ stockCount: 16 }, { stockCount: 4 }] })).toBe(20)
  })

  it('treats an untracked (null) point stock as contributing nothing', () => {
    expect(totalStock({ availabilities: [{ stockCount: null }, { stockCount: 9 }] })).toBe(9)
  })

  it('returns 0 for an offer with no availabilities at all', () => {
    expect(totalStock({ availabilities: [] })).toBe(0)
  })
})

describe('extractPointCity', () => {
  it('extracts city id/name from a point (warehouse/destination) with a city', () => {
    expect(extractPointCity({ city: { id: 366, name: 'Алматы' } })).toEqual({ cityId: '366', cityName: 'Алматы' })
  })

  it('returns nulls when the point has no city', () => {
    expect(extractPointCity({})).toEqual({ cityId: null, cityName: null })
  })

  it('returns nulls for a null or undefined point', () => {
    expect(extractPointCity(null)).toEqual({ cityId: null, cityName: null })
    expect(extractPointCity(undefined)).toEqual({ cityId: null, cityName: null })
  })

  it('coerces a numeric city id to a string', () => {
    const result = extractPointCity({ city: { id: 30067228, name: 'Шымкент' } })
    expect(result.cityId).toBe('30067228')
    expect(typeof result.cityId).toBe('string')
  })
})

function jsonResponse(body: any, status = 200) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function orderFragment(code: string) {
  return {
    code,
    customer: { firstName: 'Акбота', lastName: 'О.' },
    totalPrice: 4100,
    creationTime: '2026-05-02T17:06:35.489',
    warehouse: { city: { id: 366, name: 'Алматы' } },
    delivery: { plannedDeliveryDate: '2026-05-05T20:00:00' },
    entries: [],
  }
}

describe('listOrders', () => {
  it('requests the normal (non-advanced) branch when no order code is given', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({
      data: { merchant: { orders: { orders: { total: 1, orders: [orderFragment('906725811')] } } } },
    }))
    const result = await listOrders('cookie=1', '425002', 'NEW', 0, '', '', fetchFn as any)
    const [, init] = fetchFn.mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.variables.withAdvancedOrders).toBe(false)
    expect(body.variables.input).toEqual({ presetFilter: 'NEW', orderCode: '', cityId: '' })
    expect(body.variables.advancedInput).toEqual({ orderCode: '', phoneNumber: '', productCode: '' })
    expect(result.total).toBe(1)
    expect(result.orders[0].code).toBe('906725811')
  })

  it('switches to the advanced-search branch when an order code is given, and reads advancedOrders', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({
      data: { merchant: { orders: { advancedOrders: { total: 1, orders: [orderFragment('906725811')] } } } },
    }))
    const result = await listOrders('cookie=1', '425002', 'NEW', 0, '', '906725811', fetchFn as any)
    const [, init] = fetchFn.mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.variables.withAdvancedOrders).toBe(true)
    expect(body.variables.advancedInput).toEqual({ orderCode: '906725811', phoneNumber: '', productCode: '' })
    expect(result.total).toBe(1)
    expect(result.orders[0].code).toBe('906725811')
  })

  it('reports sessionExpired only after a retry also 401s', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, 401))
    const result = await listOrders('c', '425002', 'NEW', 0, '', '', fetchFn as any)
    expect(result).toMatchObject({ orders: [], total: 0, sessionExpired: true, failed: true })
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('treats 403 like 401: retried once, then sessionExpired', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, 403))
    const result = await listOrders('c', '425002', 'NEW', 0, '', '', fetchFn as any)
    expect(result).toMatchObject({ orders: [], total: 0, sessionExpired: true, failed: true })
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('a 500 is failed (not an honest empty page) and not a session expiry', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse('boom', 500))
    const result = await listOrders('c', '425002', 'NEW', 0, '', '', fetchFn as any)
    expect(result).toMatchObject({ orders: [], total: 0, sessionExpired: false, failed: true })
    expect(result.error).toMatch(/500/)
  })

  it('an unexpected response shape is failed', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ data: null, errors: [{ message: 'Bad Request' }] }))
    const result = await listOrders('c', '425002', 'NEW', 0, '', '', fetchFn as any)
    expect(result).toMatchObject({ orders: [], total: 0, failed: true })
  })

  it('a thrown fetch (timeout) is failed, not an exception', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError'))
    const result = await listOrders('c', '425002', 'NEW', 0, '', '', fetchFn as any)
    expect(result).toMatchObject({ orders: [], total: 0, sessionExpired: false, failed: true, error: 'Kaspi не ответил вовремя' })
  })

  it('a real empty status (orders: [], total: 0) is NOT a failure', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ data: { merchant: { orders: { orders: { total: 0, orders: [] } } } } }))
    const result = await listOrders('c', '425002', 'NEW', 0, '', '', fetchFn as any)
    expect(result).toMatchObject({ orders: [], total: 0, sessionExpired: false, failed: false })
  })

  it('gives every attempt a timeout signal', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ data: { merchant: { orders: { orders: { total: 0, orders: [] } } } } }))
    await listOrders('c', '425002', 'NEW', 0, '', '', fetchFn as any)
    expect(fetchFn.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })

  it('does not report sessionExpired when a 401 is followed by a real retry success', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(jsonResponse({
        data: { merchant: { orders: { orders: { total: 1, orders: [orderFragment('906725811')] } } } },
      }))
    const result = await listOrders('c', '425002', 'NEW', 0, '', '', fetchFn as any)
    expect(result.sessionExpired).toBe(false)
    expect(result.orders[0].code).toBe('906725811')
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
})

describe('confirmPacking', () => {
  it('sends the exact captured cargo/assembled body for every selected order', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('', { status: 200 }))
    const result = await confirmPacking('cookie=1', '30067228', [
      { orderCode: '1050124508', quantity: 9 },
      { orderCode: '1050124509', quantity: 2 },
    ], fetchFn as any)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://mc.shop.kaspi.kz/mc/api/order/cargo/assembled?_m=30067228')
    expect(JSON.parse(init.body)).toEqual({
      cargos: [
        { orderCode: '1050124508', newCargoSpace: 1, quantity: 9 },
        { orderCode: '1050124509', newCargoSpace: 1, quantity: 2 },
      ],
    })
    expect(result).toEqual({ success: true, sessionExpired: false })
  })

  it('reports sessionExpired on 401', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, 401))
    const result = await confirmPacking('c', '30067228', [{ orderCode: 'x', quantity: 1 }], fetchFn as any)
    expect(result).toEqual({ success: false, sessionExpired: true })
  })

  it('surfaces a non-2xx failure with the response body', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('bad request', { status: 400 }))
    const result = await confirmPacking('c', '30067228', [{ orderCode: 'x', quantity: 1 }], fetchFn as any)
    expect(result.success).toBe(false)
    expect(result.sessionExpired).toBe(false)
    expect(result.message).toContain('bad request')
  })
})

describe('getOrderCounters', () => {
  const ok = { data: { merchant: { orders: { counts: [{ tab: 'NEW', count: 3 }, { tab: 'ARCHIVED', count: 0 }] } } } }

  it('maps counts on success', async () => {
    const result = await getOrderCounters('c', 'm', vi.fn().mockResolvedValue(jsonResponse(ok)) as any)
    expect(result).toMatchObject({ counts: { NEW: 3, ARCHIVED: 0 }, sessionExpired: false, failed: false })
  })

  it('a 500 is failed with empty counts (unknown, not zero)', async () => {
    const result = await getOrderCounters('c', 'm', vi.fn().mockResolvedValue(jsonResponse('x', 500)) as any)
    expect(result).toMatchObject({ counts: {}, sessionExpired: false, failed: true })
  })

  it('403 after one retry is sessionExpired + failed', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, 403))
    const result = await getOrderCounters('c', 'm', fetchFn as any)
    expect(result).toMatchObject({ counts: {}, sessionExpired: true, failed: true })
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('an unexpected shape is failed', async () => {
    const result = await getOrderCounters('c', 'm', vi.fn().mockResolvedValue(jsonResponse({ data: {} })) as any)
    expect(result).toMatchObject({ counts: {}, failed: true })
  })
})

describe('getOrderDetail', () => {
  const detail = {
    code: '906725811', status: 'NEW', creationTime: '2026-05-02T17:06:35.489', totalPrice: 4100,
    customer: { firstName: 'Акбота', lastName: 'О.' },
    destination: { city: { name: 'Астана' } },
    warehouse: { city: { name: 'Шымкент' } },
    delivery: { plannedDeliveryDate: '2026-05-05T20:00:00' },
    entries: [],
  }

  it('city is the seller point (warehouse), same as the list and the Excel export; the buyer city is kept separately', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ data: { merchant: { orderDetail: detail } } }))
    const result = await getOrderDetail('c', 'm', '906725811', fetchFn as any)
    expect(result.failed).toBe(false)
    expect(result.order?.cityName).toBe('Шымкент')
    expect(result.order?.destinationCityName).toBe('Астана')
  })

  it('a genuinely missing order (orderDetail null) is not a failure', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ data: { merchant: { orderDetail: null } } }))
    expect(await getOrderDetail('c', 'm', 'x', fetchFn as any)).toEqual({ order: null, sessionExpired: false, failed: false })
  })

  it('401/403 is sessionExpired, not "order not found"', async () => {
    for (const status of [401, 403]) {
      const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, status))
      expect(await getOrderDetail('c', 'm', 'x', fetchFn as any)).toMatchObject({ order: null, sessionExpired: true, failed: true })
    }
  })

  it('a 500 or a body without merchant is failed', async () => {
    expect(await getOrderDetail('c', 'm', 'x', vi.fn().mockResolvedValue(jsonResponse('x', 500)) as any)).toMatchObject({ order: null, failed: true, sessionExpired: false })
    expect(await getOrderDetail('c', 'm', 'x', vi.fn().mockResolvedValue(jsonResponse({ data: null })) as any)).toMatchObject({ order: null, failed: true })
  })
})

function offerRow(sku: string) {
  return { sku, masterSku: `M${sku}`, title: `T${sku}`, minPrice: 100, points: ['PP1'], allCityPrices: {}, availabilities: [] }
}
function catalogPage(skus: string[]) {
  return jsonResponse({ data: skus.map(offerRow) })
}

describe('listCatalogWithStatus', () => {
  it('reads every page until a short one and reports complete', async () => {
    const full = Array.from({ length: 100 }, (_, i) => `a${i}`)
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(catalogPage(full))
      .mockResolvedValueOnce(catalogPage(['b1', 'b2']))
    const result = await listCatalogWithStatus('c', 'm', true, fetchFn as any)
    expect(result).toMatchObject({ complete: true, failed: false, sessionExpired: false })
    expect(result.offers).toHaveLength(102)
  })

  it('a page-0 500 is failed with no offers (not "0 товаров")', async () => {
    const result = await listCatalogWithStatus('c', 'm', true, vi.fn().mockResolvedValue(jsonResponse('x', 500)) as any)
    expect(result).toMatchObject({ offers: [], complete: false, failed: true, sessionExpired: false })
  })

  it('a failure on page 2 keeps the partial offers but is never complete', async () => {
    const full = Array.from({ length: 100 }, (_, i) => `a${i}`)
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(catalogPage(full))
      .mockResolvedValueOnce(jsonResponse('x', 429))
    const result = await listCatalogWithStatus('c', 'm', true, fetchFn as any)
    expect(result.offers).toHaveLength(100)
    expect(result).toMatchObject({ complete: false, failed: true })
  })

  it('401 and 403 are sessionExpired and not complete', async () => {
    for (const status of [401, 403]) {
      const result = await listCatalogWithStatus('c', 'm', true, vi.fn().mockResolvedValue(jsonResponse({}, status)) as any)
      expect(result).toMatchObject({ sessionExpired: true, complete: false, failed: true })
    }
  })

  it('an unexpected body shape is failed', async () => {
    const result = await listCatalogWithStatus('c', 'm', true, vi.fn().mockResolvedValue(jsonResponse({ oops: 1 })) as any)
    expect(result).toMatchObject({ complete: false, failed: true })
  })

  it('an empty data[] on page 0 is a complete empty catalog (not a failure)', async () => {
    const result = await listCatalogWithStatus('c', 'm', false, vi.fn().mockResolvedValue(jsonResponse({ data: [] })) as any)
    expect(result).toMatchObject({ offers: [], complete: true, failed: false })
  })

  it('a thrown fetch is failed, not an exception', async () => {
    const result = await listCatalogWithStatus('c', 'm', true, vi.fn().mockRejectedValue(new DOMException('t', 'TimeoutError')) as any)
    expect(result).toMatchObject({ complete: false, failed: true, error: 'Kaspi не ответил вовремя' })
  })

  it('stops when Kaspi ignores p and repeats the same page, and says so instead of looping forever', async () => {
    const full = Array.from({ length: 100 }, (_, i) => `a${i}`)
    const fetchFn = vi.fn().mockImplementation(async () => catalogPage(full))
    const result = await listCatalogWithStatus('c', 'm', true, fetchFn as any)
    expect(result).toMatchObject({ complete: false, failed: true })
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('has a page cap: an endless stream of distinct full pages ends at CATALOG_MAX_PAGES, never complete', async () => {
    let n = 0
    const fetchFn = vi.fn().mockImplementation(async () => catalogPage(Array.from({ length: 100 }, () => `s${n++}`)))
    const result = await listCatalogWithStatus('c', 'm', true, fetchFn as any)
    expect(fetchFn).toHaveBeenCalledTimes(CATALOG_MAX_PAGES)
    expect(result).toMatchObject({ complete: false, failed: true })
  })

  it('gives every request a timeout signal', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ data: [] }))
    await listCatalogWithStatus('c', 'm', true, fetchFn as any)
    expect(fetchFn.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })
})

describe('fetchOffersDetailsChecked', () => {
  const skus = Array.from({ length: 120 }, (_, i) => `s${i}`)

  it('splits the skus into chunks of DETAILS_CHUNK_SIZE', async () => {
    const fetchFn = vi.fn().mockImplementation(async (_u: string, init: any) => {
      const sent: string[] = JSON.parse(init.body).sku
      return jsonResponse(sent.map(sku => ({ sku })))
    })
    const result = await fetchOffersDetailsChecked('c', 'm', skus, fetchFn as any)
    expect(fetchFn).toHaveBeenCalledTimes(3)
    expect(JSON.parse(fetchFn.mock.calls[0][1].body).sku).toHaveLength(DETAILS_CHUNK_SIZE)
    expect(result.ok).toBe(true)
    expect(result.items).toHaveLength(120)
    expect(result.okSkus.size).toBe(120)
  })

  it('a failed chunk marks the run not ok and leaves ONLY that chunk\'s skus out of okSkus', async () => {
    let call = 0
    const fetchFn = vi.fn().mockImplementation(async (_u: string, init: any) => {
      call++
      if (call === 2) return jsonResponse('x', 500)
      const sent: string[] = JSON.parse(init.body).sku
      return jsonResponse(sent.map(sku => ({ sku })))
    })
    const result = await fetchOffersDetailsChecked('c', 'm', skus, fetchFn as any)
    expect(result.ok).toBe(false)
    expect(result.okSkus.has('s0')).toBe(true)
    expect(result.okSkus.has('s60')).toBe(false)
    expect(result.okSkus.has('s110')).toBe(true)
    expect(result.items).toHaveLength(70)
  })

  it('a dead session stops at once and reports sessionExpired', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, 403))
    const result = await fetchOffersDetailsChecked('c', 'm', skus, fetchFn as any)
    expect(result).toMatchObject({ ok: false, sessionExpired: true })
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('a non-array body is a failed chunk, not an empty success', async () => {
    const result = await fetchOffersDetailsChecked('c', 'm', ['a'], vi.fn().mockResolvedValue(jsonResponse({ nope: 1 })) as any)
    expect(result.ok).toBe(false)
    expect(result.okSkus.size).toBe(0)
  })
})

describe('getMerchantPointsDetailed', () => {
  const details = [{ sku: 'a', cities: [{ cityId: '511010000', price: 100, points: [{ pointId: 'm_PP1', available: true }] }] }]
  function router(opts: { catalog?: 'ok' | 'fail'; details?: 'ok' | 'fail'; cities?: 'ok' | 'fail' }) {
    return vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('offer-view/list')) {
        if (opts.catalog === 'fail') return jsonResponse('x', 500)
        return url.includes('a=true') ? jsonResponse({ data: [offerRow('a')] }) : jsonResponse({ data: [] })
      }
      if (url.includes('offer/details')) return opts.details === 'fail' ? jsonResponse('x', 500) : jsonResponse(details)
      if (url.includes('getCities')) return opts.cities === 'fail' ? jsonResponse('x', 500) : jsonResponse({ data: { cities: [{ id: '511010000', name: 'Шымкент' }] } })
      throw new Error('unexpected url ' + url)
    })
  }

  it('everything answered: complete, with the city name', async () => {
    const r = await getMerchantPointsDetailed('c', 'm', router({}) as any)
    expect(r.complete).toBe(true)
    expect(r.points).toEqual(expect.arrayContaining([{ storeCode: 'PP1', cityId: '511010000', cityName: 'Шымкент' }]))
  })

  it('getCities failed: points are returned but NOT complete (would be cached with no city names)', async () => {
    const r = await getMerchantPointsDetailed('c', 'm', router({ cities: 'fail' }) as any)
    expect(r.complete).toBe(false)
    expect(r.points.length).toBeGreaterThan(0)
  })

  it('details failed: not complete', async () => {
    expect((await getMerchantPointsDetailed('c', 'm', router({ details: 'fail' }) as any)).complete).toBe(false)
  })

  it('catalog cut off: not complete', async () => {
    expect((await getMerchantPointsDetailed('c', 'm', router({ catalog: 'fail' }) as any)).complete).toBe(false)
  })
})

describe('fetchCityNamesChecked', () => {
  it('reports ok only when at least one city came back', async () => {
    expect((await fetchCityNamesChecked('c', 'm', vi.fn().mockResolvedValue(jsonResponse({ data: { cities: [{ id: '1', name: 'A' }] } })) as any)).ok).toBe(true)
    expect((await fetchCityNamesChecked('c', 'm', vi.fn().mockResolvedValue(jsonResponse({ data: { cities: [] } })) as any)).ok).toBe(false)
    expect((await fetchCityNamesChecked('c', 'm', vi.fn().mockResolvedValue(jsonResponse('x', 500)) as any)).ok).toBe(false)
    expect((await fetchCityNamesChecked('c', 'm', vi.fn().mockRejectedValue(new Error('net')) as any)).ok).toBe(false)
  })
})
