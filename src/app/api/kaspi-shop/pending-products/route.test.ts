import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { getUser, loadConnection, markSessionExpired, listPendingProducts, getPendingCount } = vi.hoisted(() => ({
  getUser: vi.fn(), loadConnection: vi.fn(), markSessionExpired: vi.fn(), listPendingProducts: vi.fn(), getPendingCount: vi.fn(),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { getUser } }) }))
vi.mock('@/lib/kaspiShop/planGate', () => ({ kaspiShopPlanGate: vi.fn(async () => null) }))
vi.mock('@/lib/kaspiShop/connection', () => ({
  loadConnection: (...a: unknown[]) => loadConnection(...a),
  markSessionExpired: (...a: unknown[]) => markSessionExpired(...a),
}))
vi.mock('@/lib/kaspiShop/pendingProducts', async () => {
  const actual = await vi.importActual<typeof import('@/lib/kaspiShop/pendingProducts')>('@/lib/kaspiShop/pendingProducts')
  return { ...actual, listPendingProducts: (...a: unknown[]) => listPendingProducts(...a), getPendingCount: (...a: unknown[]) => getPendingCount(...a) }
})

import { GET } from './route'

const req = (qs = 'page=1') => new NextRequest(`http://localhost/api/kaspi-shop/pending-products?${qs}`, { headers: { authorization: 'Bearer tok' } })
const five = Array.from({ length: 5 }, (_, i) => ({ code: `c${i}`, name: `n${i}`, brand: null, categoryName: null, imageUrl: null }))

describe('GET /api/kaspi-shop/pending-products', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    loadConnection.mockResolvedValue({ id: 'c1', sessionCookies: 'cookie', merchantId: 'm' })
  })

  it('a Kaspi failure on the list is a 502, NOT "Нераспознанных товаров нет" (K26)', async () => {
    listPendingProducts.mockResolvedValue({ products: [], hasMore: false, sessionExpired: false, failed: true, error: 'Kaspi ответил HTTP 429' })
    getPendingCount.mockResolvedValue({ count: 0, sessionExpired: false, failed: true })
    const res = await GET(req())
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/Kaspi не отдал/)
  })

  it('a dead session marks the connection expired', async () => {
    listPendingProducts.mockResolvedValue({ products: [], hasMore: false, sessionExpired: true, failed: true })
    getPendingCount.mockResolvedValue({ count: 0, sessionExpired: true, failed: true })
    const res = await GET(req())
    expect(res.status).toBe(502)
    expect((await res.json()).sessionExpired).toBe(true)
    expect(markSessionExpired).toHaveBeenCalledWith('c1')
  })

  it('hasMore comes from the count: exactly 5 cards means NO next page (the old length===5 guess opened an empty one)', async () => {
    listPendingProducts.mockResolvedValue({ products: five, hasMore: true, sessionExpired: false, failed: false })
    getPendingCount.mockResolvedValue({ count: 5, sessionExpired: false, failed: false })
    const body = await (await GET(req('page=1'))).json()
    expect(body.hasMore).toBe(false)
    expect(body.count).toBe(5)
  })

  it('hasMore is true when the count is larger than what has been paged', async () => {
    listPendingProducts.mockResolvedValue({ products: five, hasMore: true, sessionExpired: false, failed: false })
    getPendingCount.mockResolvedValue({ count: 12, sessionExpired: false, failed: false })
    expect((await (await GET(req('page=2'))).json()).hasMore).toBe(true)
    expect((await (await GET(req('page=3'))).json()).hasMore).toBe(false)
  })

  it('a failed counter alone keeps the list and reports count:null (unknown, not 0)', async () => {
    listPendingProducts.mockResolvedValue({ products: five, hasMore: true, sessionExpired: false, failed: false })
    getPendingCount.mockResolvedValue({ count: 0, sessionExpired: false, failed: true })
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.count).toBeNull()
    expect(body.products).toHaveLength(5)
    expect(body.hasMore).toBe(true)
  })
})
