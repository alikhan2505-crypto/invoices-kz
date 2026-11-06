import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { getUser, loadConnection, markSessionExpired, listOrders } = vi.hoisted(() => ({
  getUser: vi.fn(), loadConnection: vi.fn(), markSessionExpired: vi.fn(), listOrders: vi.fn(),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { getUser } }) }))
vi.mock('@/lib/kaspiShop/planGate', () => ({ kaspiShopPlanGate: vi.fn(async () => null) }))
vi.mock('@/lib/kaspiShop/connection', () => ({
  loadConnection: (...a: unknown[]) => loadConnection(...a),
  markSessionExpired: (...a: unknown[]) => markSessionExpired(...a),
}))
vi.mock('@/lib/kaspiShop/cabinetApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/kaspiShop/cabinetApi')>('@/lib/kaspiShop/cabinetApi')
  return { ...actual, listOrders: (...a: unknown[]) => listOrders(...a) }
})

import { GET } from './route'

const req = (qs = 'status=NEW') => new NextRequest(`http://localhost/api/kaspi-shop/orders/export?${qs}`, { headers: { authorization: 'Bearer tok' } })

function order(code: string) {
  return { code, status: 'NEW', customerFirstName: 'A', customerLastName: 'B', totalPrice: 100, creationTime: '2026-11-05T10:00:00.000Z', cityId: null, cityName: 'Астана', plannedDeliveryDate: null, items: [] }
}
const page = (prefix: string, n: number, total: number) => ({
  orders: Array.from({ length: n }, (_, i) => order(`${prefix}${i}`)), total, sessionExpired: false, failed: false,
})

describe('GET /api/kaspi-shop/orders/export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    loadConnection.mockResolvedValue({ id: 'c1', sessionCookies: 'cookie', merchantId: 'm' })
  })

  it('a failure on page 0 answers 502 with a message, NOT an empty valid xlsx with 200 (K3c)', async () => {
    listOrders.mockResolvedValue({ orders: [], total: 0, sessionExpired: false, failed: true, error: 'Kaspi ответил HTTP 429' })
    const res = await GET(req())
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/Kaspi не отдал заказы/)
    expect(res.headers.get('content-type')).not.toMatch(/spreadsheet/)
  })

  it('a dead session is reported and marks the connection expired', async () => {
    listOrders.mockResolvedValue({ orders: [], total: 0, sessionExpired: true, failed: true })
    const res = await GET(req())
    expect(res.status).toBe(400)
    expect((await res.json()).sessionExpired).toBe(true)
    expect(markSessionExpired).toHaveBeenCalledWith('c1')
  })

  it('a complete export states the exact number of rows and is not truncated', async () => {
    listOrders.mockResolvedValueOnce(page('a', 10, 13)).mockResolvedValueOnce(page('b', 3, 13))
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(res.headers.get('x-exported-count')).toBe('13')
    expect(res.headers.get('x-total-count')).toBe('13')
    expect(res.headers.get('x-truncated')).toBe('false')
    expect(res.headers.get('x-export-failed')).toBe('false')
  })

  it('a failure on page 2 returns the partial file, flagged truncated with the exact counts', async () => {
    listOrders.mockResolvedValueOnce(page('a', 10, 30)).mockResolvedValueOnce({ orders: [], total: 0, sessionExpired: false, failed: true, error: 'x' })
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(res.headers.get('x-exported-count')).toBe('10')
    expect(res.headers.get('x-total-count')).toBe('30')
    expect(res.headers.get('x-truncated')).toBe('true')
    expect(res.headers.get('x-export-failed')).toBe('true')
  })

  it('stops at the 500-order cap and says so', async () => {
    listOrders.mockImplementation(async (_c: string, _m: string, _s: string, p: number) => page(`p${p}-`, 10, 900))
    const res = await GET(req())
    expect(res.headers.get('x-exported-count')).toBe('500')
    expect(res.headers.get('x-total-count')).toBe('900')
    expect(res.headers.get('x-truncated')).toBe('true')
    expect(listOrders).toHaveBeenCalledTimes(50)
  })

  it('names the file by the Almaty date', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-06T20:30:00.000Z'))
    listOrders.mockResolvedValueOnce(page('a', 1, 1))
    const res = await GET(req())
    vi.useRealTimers()
    expect(res.headers.get('content-disposition')).toContain('zakazy_NEW_2026-11-07.xlsx')
  })
})
