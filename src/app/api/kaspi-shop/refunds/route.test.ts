import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Маршруты Возвратов: сбой Kaspi это 502 с причиной, а не 200 с пустым списком
// (аудит K35), номер страницы проверяется (K30).
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key'
})

const h = vi.hoisted(() => ({
  list: { refunds: [] as any[], total: 0, sessionExpired: false, failed: false as boolean | undefined, error: undefined as string | undefined },
  counts: { counts: [] as any[], sessionExpired: false, failed: false as boolean | undefined, error: undefined as string | undefined },
  detail: { detail: null as any, sessionExpired: false, failed: false as boolean | undefined, error: undefined as string | undefined },
  expired: vi.fn(async (..._a: any[]) => {}),
  listArgs: [] as any[],
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) } }),
}))
vi.mock('@/lib/kaspiShop/planGate', () => ({ kaspiShopPlanGate: async () => null }))
vi.mock('@/lib/kaspiShop/connection', () => ({
  loadConnection: async () => ({ id: 'c1', sessionCookies: 'ck', merchantId: 'm1' }),
  markSessionExpired: (...a: any[]) => h.expired(...a),
}))
vi.mock('@/lib/kaspiShop/refunds', async () => {
  const actual = await vi.importActual<typeof import('@/lib/kaspiShop/refunds')>('@/lib/kaspiShop/refunds')
  return {
    ...actual,
    listRefunds: async (...args: any[]) => { h.listArgs = args; return h.list },
    getRefundCounts: async () => h.counts,
    getRefundDetails: async () => h.detail,
  }
})

import { GET as listGET } from './route'
import { GET as countsGET } from './counts/route'
import { GET as detailGET } from './[refundId]/route'

const req = (url: string) => new NextRequest(`http://localhost${url}`, { headers: { authorization: 'Bearer t' } })

beforeEach(() => {
  h.list = { refunds: [], total: 0, sessionExpired: false, failed: false, error: undefined }
  h.counts = { counts: [], sessionExpired: false, failed: false, error: undefined }
  h.detail = { detail: null, sessionExpired: false, failed: false, error: undefined }
  h.expired.mockClear()
})

describe('GET /api/kaspi-shop/refunds', () => {
  it('сбой Kaspi это 502 с причиной, а не 200 с пустым списком', async () => {
    h.list = { refunds: [], total: 0, sessionExpired: false, failed: true, error: 'Kaspi ответил HTTP 500' }
    const res = await listGET(req('/api/kaspi-shop/refunds?tab=NEW&page=0'))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/HTTP 500/)
  })

  it('честный пустой ответ остаётся 200 с total', async () => {
    const res = await listGET(req('/api/kaspi-shop/refunds?tab=NEW'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ refunds: [], total: 0 })
  })

  it('мёртвая сессия по-прежнему 400 и помечает подключение', async () => {
    h.list = { refunds: [], total: 0, sessionExpired: true, failed: true, error: 'x' }
    const res = await listGET(req('/api/kaspi-shop/refunds?tab=NEW'))
    expect(res.status).toBe(400)
    expect(h.expired).toHaveBeenCalledWith('c1')
  })

  it('номер страницы доходит до Kaspi как целое число, мусор и отрицательное это 400', async () => {
    await listGET(req('/api/kaspi-shop/refunds?tab=CLOSED&page=3'))
    expect(h.listArgs[3]).toBe(3)
    for (const bad of ['-1', '1.5', 'abc']) {
      const res = await listGET(req(`/api/kaspi-shop/refunds?tab=NEW&page=${bad}`))
      expect(res.status).toBe(400)
    }
  })
})

describe('GET /api/kaspi-shop/refunds/counts', () => {
  it('сбой Kaspi это 502, а не «счётчики пусты»', async () => {
    h.counts = { counts: [], sessionExpired: false, failed: true, error: 'Kaspi не ответил вовремя' }
    const res = await countsGET(req('/api/kaspi-shop/refunds/counts'))
    expect(res.status).toBe(502)
  })

  it('успех отдаёт counts', async () => {
    h.counts = { counts: [{ tab: 'NEW', tabTitle: 'Новые', total: 2 }], sessionExpired: false, failed: false, error: undefined }
    const res = await countsGET(req('/api/kaspi-shop/refunds/counts'))
    expect(res.status).toBe(200)
    expect((await res.json()).counts).toHaveLength(1)
  })
})

describe('GET /api/kaspi-shop/refunds/[refundId]', () => {
  const call = () => detailGET(req('/api/kaspi-shop/refunds/r1?applicationNumber=1-1'), { params: Promise.resolve({ refundId: 'r1' }) })

  it('сбой запроса это 502, а не «Заявка не найдена»', async () => {
    h.detail = { detail: null, sessionExpired: false, failed: true, error: 'Kaspi ответил HTTP 503' }
    expect((await call()).status).toBe(502)
  })

  it('«не найдена» (404) только когда Kaspi ответил без заявки', async () => {
    expect((await call()).status).toBe(404)
  })
})
