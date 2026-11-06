import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// K12 (аудит Kaspi 2026-11-06): сбой базы в /wallet не должен превращаться ни в
// необработанное исключение без тела, ни в «connected: false» (по нему страница
// Демпинг показывает подключённому продавцу окно «Подключите Kaspi Магазин»).
const h = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  balance: vi.fn(),
  connection: { data: null as any, error: null as any },
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from: () => {
      const q: any = { select: () => q, eq: () => q, maybeSingle: async () => h.connection }
      return q
    },
  }),
}))
vi.mock('@/lib/kaspiShop/wallet', () => ({ getKaspiShopWalletBalance: h.balance }))

import { GET } from './route'

const req = (token: string | null = 'tok') =>
  new NextRequest('http://localhost/api/kaspi-shop/wallet', { headers: token ? { authorization: `Bearer ${token}` } : {} })

beforeEach(() => {
  h.user = { id: 'u1' }
  h.balance.mockReset().mockResolvedValue(1234)
  h.connection = { data: { paused: false, session_status: 'active', company_name: 'Магазин', tracked_city_codes: ['1'], city_lookup_cache: {} }, error: null }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /api/kaspi-shop/wallet', () => {
  it('без токена: 401', async () => {
    h.user = null
    expect((await GET(req(null))).status).toBe(401)
  })

  it('нормальный ответ', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ balance: 1234, connected: true, paused: false, sessionStatus: 'active', companyName: 'Магазин', trackedCityCodes: ['1'] })
  })

  it('нет активного подключения: connected false (это честный ответ)', async () => {
    h.connection = { data: null, error: null }
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect((await res.json()).connected).toBe(false)
  })

  it('ошибка чтения баланса: честный 500 с JSON, а не исключение', async () => {
    h.balance.mockRejectedValue(new Error('db timeout'))
    const res = await GET(req())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toContain('Не удалось загрузить')
    expect(JSON.stringify(body)).not.toContain('db timeout')
  })

  it('ошибка запроса подключения: 500, а не connected:false', async () => {
    h.connection = { data: null, error: { message: 'permission denied' } }
    const res = await GET(req())
    expect(res.status).toBe(500)
    expect((await res.json()).connected).toBeUndefined()
  })
})
