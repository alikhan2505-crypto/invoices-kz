import { describe, it, expect, vi } from 'vitest'
import { extractPointCity, confirmPacking, listOrders } from './cabinetApi'

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

  it('reports sessionExpired on 401', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, 401))
    const result = await listOrders('c', '425002', 'NEW', 0, '', '', fetchFn as any)
    expect(result).toEqual({ orders: [], total: 0, sessionExpired: true })
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
