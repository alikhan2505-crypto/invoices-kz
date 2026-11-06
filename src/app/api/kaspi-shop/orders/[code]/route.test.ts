import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { getUser, loadConnection, markSessionExpired, getOrderDetail } = vi.hoisted(() => ({
  getUser: vi.fn(), loadConnection: vi.fn(), markSessionExpired: vi.fn(), getOrderDetail: vi.fn(),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { getUser } }) }))
vi.mock('@/lib/kaspiShop/planGate', () => ({ kaspiShopPlanGate: vi.fn(async () => null) }))
vi.mock('@/lib/kaspiShop/connection', () => ({
  loadConnection: (...a: unknown[]) => loadConnection(...a),
  markSessionExpired: (...a: unknown[]) => markSessionExpired(...a),
}))
vi.mock('@/lib/kaspiShop/cabinetApi', () => ({ getOrderDetail: (...a: unknown[]) => getOrderDetail(...a) }))

import { GET } from './route'

const req = () => new NextRequest('http://localhost/api/kaspi-shop/orders/906725811', { headers: { authorization: 'Bearer tok' } })
const params = { params: Promise.resolve({ code: '906725811' }) }

describe('GET /api/kaspi-shop/orders/[code]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    loadConnection.mockResolvedValue({ id: 'c1', sessionCookies: 'cookie', merchantId: 'm' })
  })

  it('a dead session is reported as such (not "Заказ не найден") and marks the connection expired', async () => {
    getOrderDetail.mockResolvedValue({ order: null, sessionExpired: true, failed: true })
    const res = await GET(req(), params)
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.sessionExpired).toBe(true)
    expect(body.error).not.toMatch(/не найден/)
    expect(markSessionExpired).toHaveBeenCalledWith('c1')
  })

  it('a Kaspi failure is 502, not a 404', async () => {
    getOrderDetail.mockResolvedValue({ order: null, sessionExpired: false, failed: true, error: 'Kaspi ответил HTTP 500' })
    expect((await GET(req(), params)).status).toBe(502)
  })

  it('a genuinely missing order is a 404', async () => {
    getOrderDetail.mockResolvedValue({ order: null, sessionExpired: false, failed: false })
    expect((await GET(req(), params)).status).toBe(404)
  })

  it('a found order is returned as before', async () => {
    getOrderDetail.mockResolvedValue({ order: { code: '906725811' }, sessionExpired: false, failed: false })
    const res = await GET(req(), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ code: '906725811' })
  })
})
