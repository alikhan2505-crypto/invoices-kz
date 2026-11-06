import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { getUser, loadConnection, markSessionExpired, getOrderCounters } = vi.hoisted(() => ({
  getUser: vi.fn(), loadConnection: vi.fn(), markSessionExpired: vi.fn(), getOrderCounters: vi.fn(),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { getUser } }) }))
vi.mock('@/lib/kaspiShop/planGate', () => ({ kaspiShopPlanGate: vi.fn(async () => null) }))
vi.mock('@/lib/kaspiShop/connection', () => ({
  loadConnection: (...a: unknown[]) => loadConnection(...a),
  markSessionExpired: (...a: unknown[]) => markSessionExpired(...a),
}))
vi.mock('@/lib/kaspiShop/cabinetApi', () => ({ getOrderCounters: (...a: unknown[]) => getOrderCounters(...a) }))

import { GET } from './route'

const req = () => new NextRequest('http://localhost/api/kaspi-shop/orders/counters', { headers: { authorization: 'Bearer tok' } })

describe('GET /api/kaspi-shop/orders/counters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    loadConnection.mockResolvedValue({ id: 'c1', sessionCookies: 'cookie', merchantId: 'm' })
  })

  it('a failure is a 502, not a 200 with empty counts that the Overview shows as "0 в работе" (K36)', async () => {
    getOrderCounters.mockResolvedValue({ counts: {}, sessionExpired: false, failed: true, error: 'Kaspi ответил HTTP 500' })
    const res = await GET(req())
    expect(res.status).toBe(502)
    expect((await res.json()).counts).toBeUndefined()
  })

  it('a dead session marks the connection expired', async () => {
    getOrderCounters.mockResolvedValue({ counts: {}, sessionExpired: true, failed: true })
    const res = await GET(req())
    expect(res.status).toBe(502)
    expect((await res.json()).sessionExpired).toBe(true)
    expect(markSessionExpired).toHaveBeenCalledWith('c1')
  })

  it('healthy counts are a 200', async () => {
    getOrderCounters.mockResolvedValue({ counts: { NEW: 3 }, sessionExpired: false, failed: false })
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ counts: { NEW: 3 }, sessionExpired: false })
  })
})
