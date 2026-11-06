import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { getUser, loadConnection, markSessionExpired, confirmPacking } = vi.hoisted(() => ({
  getUser: vi.fn(), loadConnection: vi.fn(), markSessionExpired: vi.fn(), confirmPacking: vi.fn(),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { getUser } }) }))
vi.mock('@/lib/kaspiShop/planGate', () => ({ kaspiShopPlanGate: vi.fn(async () => null) }))
vi.mock('@/lib/kaspiShop/connection', () => ({
  loadConnection: (...a: unknown[]) => loadConnection(...a),
  markSessionExpired: (...a: unknown[]) => markSessionExpired(...a),
}))
vi.mock('@/lib/kaspiShop/cabinetApi', () => ({ confirmPacking: (...a: unknown[]) => confirmPacking(...a) }))

import { POST } from './route'

const req = (body: unknown) => new NextRequest('http://localhost/api/kaspi-shop/orders/confirm-packing', {
  method: 'POST', headers: { authorization: 'Bearer tok', 'content-type': 'application/json' }, body: JSON.stringify(body),
})

describe('POST /api/kaspi-shop/orders/confirm-packing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    loadConnection.mockResolvedValue({ id: 'c1', sessionCookies: 'cookie', merchantId: 'm' })
    confirmPacking.mockResolvedValue({ success: true, sessionExpired: false })
  })

  it('sends valid orders to Kaspi', async () => {
    const res = await POST(req({ orders: [{ orderCode: '1', quantity: 2 }] }))
    expect(res.status).toBe(200)
    expect(confirmPacking.mock.calls[0][2]).toEqual([{ orderCode: '1', quantity: 2 }])
  })

  it('rejects quantity 0 / fractional / missing (a zero used to be forwarded to Kaspi) without calling it', async () => {
    for (const quantity of [0, 1.5, -1, undefined, 'x']) {
      const res = await POST(req({ orders: [{ orderCode: '1', quantity }] }))
      expect(res.status).toBe(400)
    }
    expect(confirmPacking).not.toHaveBeenCalled()
  })

  it('caps how many orders one request may confirm', async () => {
    const orders = Array.from({ length: 201 }, (_, i) => ({ orderCode: `c${i}`, quantity: 1 }))
    const res = await POST(req({ orders }))
    expect(res.status).toBe(400)
    expect(confirmPacking).not.toHaveBeenCalled()
  })

  it('a dead session is flagged sessionExpired', async () => {
    confirmPacking.mockResolvedValue({ success: false, sessionExpired: true })
    const res = await POST(req({ orders: [{ orderCode: '1', quantity: 1 }] }))
    expect((await res.json()).sessionExpired).toBe(true)
    expect(markSessionExpired).toHaveBeenCalledWith('c1')
  })
})
