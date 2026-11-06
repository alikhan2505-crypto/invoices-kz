import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { getUser, loadConnection, markSessionExpired, listOrders } = vi.hoisted(() => ({
  getUser: vi.fn(), loadConnection: vi.fn(), markSessionExpired: vi.fn(), listOrders: vi.fn(),
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser },
    from: () => ({ update: () => ({ eq: () => ({ eq: () => ({ is: async () => ({}) }) }) }) }),
  }),
}))
vi.mock('@/lib/kaspiShop/planGate', () => ({ kaspiShopPlanGate: vi.fn(async () => null) }))
vi.mock('@/lib/kaspiShop/connection', () => ({
  loadConnection: (...a: unknown[]) => loadConnection(...a),
  markSessionExpired: (...a: unknown[]) => markSessionExpired(...a),
}))
vi.mock('@/lib/kaspiShop/cabinetApi', () => ({ listOrders: (...a: unknown[]) => listOrders(...a) }))

import { GET } from './route'

function req(qs = 'status=NEW&page=0') {
  return new NextRequest(`http://localhost/api/kaspi-shop/orders?${qs}`, { headers: { authorization: 'Bearer tok' } })
}

describe('GET /api/kaspi-shop/orders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    loadConnection.mockResolvedValue({ id: 'c1', sessionCookies: 'cookie', merchantId: 'm' })
  })

  it('a Kaspi failure is a 502 with a message, NOT a 200 with an empty list (K3)', async () => {
    listOrders.mockResolvedValue({ orders: [], total: 0, sessionExpired: false, failed: true, error: 'Kaspi ответил HTTP 429' })
    const res = await GET(req())
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toMatch(/Kaspi не отдал список заказов/)
    expect(body.sessionExpired).toBe(false)
    expect(body.orders).toBeUndefined()
    expect(markSessionExpired).not.toHaveBeenCalled()
  })

  it('a dead session marks the connection expired and answers 502 with sessionExpired:true', async () => {
    listOrders.mockResolvedValue({ orders: [], total: 0, sessionExpired: true, failed: true })
    const res = await GET(req())
    expect(res.status).toBe(502)
    expect((await res.json()).sessionExpired).toBe(true)
    expect(markSessionExpired).toHaveBeenCalledWith('c1')
  })

  it('a healthy page is a 200 with orders and total', async () => {
    listOrders.mockResolvedValue({ orders: [{ code: '1', items: [] }], total: 1, sessionExpired: false, failed: false })
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ total: 1, sessionExpired: false })
  })

  it('a real empty status is still a 200 with an empty list', async () => {
    listOrders.mockResolvedValue({ orders: [], total: 0, sessionExpired: false, failed: false })
    const res = await GET(req())
    expect(res.status).toBe(200)
  })

  it('rejects an unknown status without calling Kaspi', async () => {
    const res = await GET(req('status=DROP_TABLE&page=0'))
    expect(res.status).toBe(400)
    expect(listOrders).not.toHaveBeenCalled()
  })

  it('normalizes a garbage page number to 0', async () => {
    listOrders.mockResolvedValue({ orders: [], total: 0, sessionExpired: false, failed: false })
    await GET(req('status=NEW&page=-3'))
    await GET(req('status=NEW&page=2.5'))
    expect(listOrders.mock.calls[0][3]).toBe(0)
    expect(listOrders.mock.calls[1][3]).toBe(0)
  })
})
