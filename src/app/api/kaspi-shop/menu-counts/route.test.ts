import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getUser, loadConnection, getOrderCounters, getRefundCounts, getPendingCountOrNull } = vi.hoisted(() => ({ getUser: vi.fn(), loadConnection: vi.fn(), getOrderCounters: vi.fn(), getRefundCounts: vi.fn(), getPendingCountOrNull: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { getUser } }) }))
vi.mock('@/lib/kaspiShop/planGate', () => ({ kaspiShopPlanGate: vi.fn(async () => null) }))
vi.mock('@/lib/kaspiShop/connection', () => ({ loadConnection: (...a: unknown[]) => loadConnection(...a) }))
vi.mock('@/lib/kaspiShop/cabinetApi', () => ({ getOrderCounters: (...a: unknown[]) => getOrderCounters(...a) }))
vi.mock('@/lib/kaspiShop/refunds', async () => {
  const actual = await vi.importActual<typeof import('@/lib/kaspiShop/refunds')>('@/lib/kaspiShop/refunds')
  return { ...actual, getRefundCounts: (...a: unknown[]) => getRefundCounts(...a) }
})
vi.mock('@/lib/kaspiShop/pendingProducts', () => ({ getPendingCountOrNull: (...a: unknown[]) => getPendingCountOrNull(...a) }))

import { GET } from './route'
import { WORKING_ORDER_STATUSES } from '@/lib/kaspiShop/orderStatuses'

function req(token: string | null = 'tok') {
  return new Request('http://localhost/api/kaspi-shop/menu-counts', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  }) as unknown as import('next/server').NextRequest
}

describe('GET /api/kaspi-shop/menu-counts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    loadConnection.mockResolvedValue({ sessionCookies: 'c', merchantId: 'm' })
  })

  it('401 without a valid token and does not touch Kaspi', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(req(null))
    expect(res.status).toBe(401)
    expect(getOrderCounters).not.toHaveBeenCalled()
  })

  it('returns all-unknown (no request to Kaspi) when there is no active connection', async () => {
    loadConnection.mockResolvedValue(null)
    const res = await GET(req())
    expect(await res.json()).toEqual({ orders: null, refunds: null, pendingProducts: null, sessionExpired: false })
    expect(getOrderCounters).not.toHaveBeenCalled()
  })

  it('sums the three counts with the pages\' own definitions', async () => {
    const counts: Record<string, number> = { SOME_CLOSED_STATUS: 50 }
    counts[WORKING_ORDER_STATUSES[0]] = 4
    counts[WORKING_ORDER_STATUSES[1]] = 3
    getOrderCounters.mockResolvedValue({ counts, sessionExpired: false })
    getRefundCounts.mockResolvedValue({
      counts: [
        { tab: 'NEW', tabTitle: 'n', total: 2 },
        { tab: 'DISPUTE', tabTitle: 'd', total: 1 },
        { tab: 'CLOSED', tabTitle: 'c', total: 40 },
      ],
      sessionExpired: false,
    })
    getPendingCountOrNull.mockResolvedValue({ count: 6, sessionExpired: false })
    const body = await (await GET(req())).json()
    expect(body).toEqual({ orders: 7, refunds: 3, pendingProducts: 6, sessionExpired: false })
  })

  it('a failed upstream call is null for that number only', async () => {
    getOrderCounters.mockResolvedValue({ counts: {}, sessionExpired: false })
    getRefundCounts.mockRejectedValue(new Error('boom'))
    getPendingCountOrNull.mockResolvedValue({ count: null, sessionExpired: false })
    const body = await (await GET(req())).json()
    expect(body).toEqual({ orders: null, refunds: null, pendingProducts: null, sessionExpired: false })
  })

  it('a 401/403 on refunds alone does not discard the other counts', async () => {
    getOrderCounters.mockResolvedValue({ counts: { [WORKING_ORDER_STATUSES[0]]: 5 }, sessionExpired: false })
    getRefundCounts.mockResolvedValue({ counts: [], sessionExpired: true })
    getPendingCountOrNull.mockResolvedValue({ count: 2, sessionExpired: false })
    const body = await (await GET(req())).json()
    expect(body).toEqual({ orders: 5, refunds: null, pendingProducts: 2, sessionExpired: false })
  })

  it('reports sessionExpired when the orders call says so', async () => {
    getOrderCounters.mockResolvedValue({ counts: {}, sessionExpired: true })
    getRefundCounts.mockResolvedValue({ counts: [], sessionExpired: true })
    getPendingCountOrNull.mockResolvedValue({ count: null, sessionExpired: true })
    const body = await (await GET(req())).json()
    expect(body).toEqual({ orders: null, refunds: null, pendingProducts: null, sessionExpired: true })
  })
})
