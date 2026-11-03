import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Публичный прайс-лист для краулера Kaspi: мусорный сегмент пути - 404 (не 500),
// сбой базы - 503 без текста ошибки (аудит 02.11.2026, раздел 4).
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'
})
const CONN = '3f2b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6b'
const h = vi.hoisted(() => ({
  load: vi.fn(),
  access: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const b: any = {
        select: () => b,
        eq: () => b,
        then: (res: any, rej: any) => Promise.resolve({
          data: [{ kaspi_sku: 'SKU-1', product_name: 'Чехол', brand: 'Acme', store_id: 'st1', stock_count: 3, own_current_price: 2500 }],
          error: null,
        }).then(res, rej),
      }
      return b
    },
  }),
}))
vi.mock('@/lib/kaspiShop/connection', () => ({ loadConnectionById: h.load }))
vi.mock('@/lib/kaspiShop/planGate', () => ({ ownerHasKaspiShopAccess: h.access }))

import { GET } from './route'

const call = (id: string) => GET(new NextRequest('http://localhost/api/kaspi-shop/pricelist/x'), { params: Promise.resolve({ connectionId: id }) })

beforeEach(() => {
  h.load.mockReset()
  h.load.mockResolvedValue({ id: CONN, userId: 'u1', status: 'active', companyName: 'Shop', merchantId: 'm1' })
  h.access.mockReset()
  h.access.mockResolvedValue(true)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /api/kaspi-shop/pricelist/[connectionId]', () => {
  it('мусорный сегмент пути (не uuid): 404, база не вызывается', async () => {
    for (const id of ['abc', '1', 'not-a-uuid', CONN.replace(/-/g, ''), "x' or '1'='1"]) {
      const res = await call(id)
      expect(res.status, id).toBe(404)
      expect(await res.text()).toBe('Not found')
    }
    expect(h.load).not.toHaveBeenCalled()
  })

  it('сбой базы при чтении подключения: 503 Temporarily unavailable, текст ошибки не уходит наружу, детали в логе', async () => {
    h.load.mockRejectedValue(new Error('kaspi_shop_connections lookup failed for connection x: permission denied for table kaspi_shop_connections'))
    const res = await call(CONN)
    expect(res.status).toBe(503)
    expect(await res.text()).toBe('Temporarily unavailable')
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('pricelist'), CONN, expect.anything(), expect.stringContaining('kaspi_shop_connections'),
    )
  })

  it('неизвестное и неактивное подключение: 404 как раньше', async () => {
    h.load.mockResolvedValue(null)
    expect((await call(CONN)).status).toBe(404)
    h.load.mockResolvedValue({ id: CONN, userId: 'u1', status: 'paused', companyName: 'Shop', merchantId: 'm1' })
    expect((await call(CONN)).status).toBe(404)
  })

  it('владелец без доступа: 404; сбой чтения тарифа: 503 (прежнее поведение)', async () => {
    h.access.mockResolvedValue(false)
    expect((await call(CONN)).status).toBe(404)
    h.access.mockRejectedValue(new Error('boom'))
    expect((await call(CONN)).status).toBe(503)
  })

  it('действующее подключение отдаёт XML с товаром как раньше', async () => {
    const res = await call(CONN)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/xml')
    const xml = await res.text()
    expect(xml).toContain('SKU-1')
    expect(xml).toContain('<price>2500</price>')
  })
})
