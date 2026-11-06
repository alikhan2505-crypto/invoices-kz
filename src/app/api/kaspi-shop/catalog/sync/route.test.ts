import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { getUser, loadConnection, markSessionExpired, importCatalogProducts } = vi.hoisted(() => ({
  getUser: vi.fn(), loadConnection: vi.fn(), markSessionExpired: vi.fn(), importCatalogProducts: vi.fn(),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { getUser } }) }))
vi.mock('@/lib/kaspiShop/planGate', () => ({ kaspiShopPlanGate: vi.fn(async () => null) }))
vi.mock('@/lib/kaspiShop/connection', () => ({
  loadConnection: (...a: unknown[]) => loadConnection(...a),
  markSessionExpired: (...a: unknown[]) => markSessionExpired(...a),
}))
vi.mock('@/lib/kaspiShop/finalizeConnection', () => ({ importCatalogProducts: (...a: unknown[]) => importCatalogProducts(...a) }))

import { POST } from './route'

const req = () => new NextRequest('http://localhost/api/kaspi-shop/catalog/sync', { method: 'POST', headers: { authorization: 'Bearer tok' } })
const result = (over: Record<string, unknown>) => ({ imported: 0, total: 0, skipped: 0, complete: true, sessionExpired: false, pointCitiesPartial: false, ...over })

describe('POST /api/kaspi-shop/catalog/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    loadConnection.mockResolvedValue({ id: 'c1', sessionCookies: 'cookie', merchantId: 'm' })
  })

  it('a Kaspi failure is an error, NOT {ok:true, imported:0} ("Каталог обновлён: 0") (K22)', async () => {
    importCatalogProducts.mockResolvedValue(result({ complete: false, error: 'Kaspi ответил HTTP 429' }))
    const res = await POST(req())
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.ok).toBeUndefined()
    expect(body.error).toMatch(/Каталог не обновлён/)
  })

  it('a partial import states how much was updated and asks to repeat', async () => {
    importCatalogProducts.mockResolvedValue(result({ imported: 100, total: 100, complete: false, error: 'Kaspi ответил HTTP 500' }))
    const res = await POST(req())
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toMatch(/Обновлено 100 из 100/)
    expect(body.partial).toBe(true)
  })

  it('a dead session marks the connection expired', async () => {
    importCatalogProducts.mockResolvedValue(result({ complete: false, sessionExpired: true }))
    const res = await POST(req())
    expect(res.status).toBe(502)
    expect((await res.json()).sessionExpired).toBe(true)
    expect(markSessionExpired).toHaveBeenCalledWith('c1')
  })

  it('a clean full import is ok with the real count', async () => {
    importCatalogProducts.mockResolvedValue(result({ imported: 212, total: 212 }))
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, imported: 212, total: 212 })
  })
})
