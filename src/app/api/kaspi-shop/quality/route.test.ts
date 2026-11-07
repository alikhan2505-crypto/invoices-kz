import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Маршруты Качества: сбой Kaspi это 502 с причиной, а не 200 с пустыми данными (аудит K35).
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key'
})

const h = vi.hoisted(() => ({
  overview: { overview: null as any, sessionExpired: false, failed: undefined as boolean | undefined, error: undefined as string | undefined },
  categories: { categories: [] as any[], total: 0, sessionExpired: false, failed: undefined as boolean | undefined, error: undefined as string | undefined },
  catArgs: [] as any[],
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) } }),
}))
vi.mock('@/lib/kaspiShop/planGate', () => ({ kaspiShopPlanGate: async () => null }))
vi.mock('@/lib/kaspiShop/connection', () => ({
  loadConnection: async () => ({ id: 'c1', sessionCookies: 'ck', merchantId: 'm1' }),
  markSessionExpired: async () => {},
}))
vi.mock('@/lib/kaspiShop/quality', async () => {
  const actual = await vi.importActual<typeof import('@/lib/kaspiShop/quality')>('@/lib/kaspiShop/quality')
  return {
    ...actual,
    getQualityOverview: async () => h.overview,
    getQualityCategories: async (...args: any[]) => { h.catArgs = args; return h.categories },
  }
})

import { GET as overviewGET } from './overview/route'
import { GET as categoriesGET } from './categories/route'

const req = (url: string) => new NextRequest(`http://localhost${url}`, { headers: { authorization: 'Bearer t' } })

beforeEach(() => {
  h.overview = { overview: null, sessionExpired: false, failed: undefined, error: undefined }
  h.categories = { categories: [], total: 0, sessionExpired: false, failed: undefined, error: undefined }
})

describe('GET /api/kaspi-shop/quality/overview', () => {
  it('сбой Kaspi это 502 с причиной', async () => {
    h.overview = { overview: null, sessionExpired: false, failed: true, error: 'Kaspi ответил HTTP 500' }
    const res = await overviewGET(req('/api/kaspi-shop/quality/overview'))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/HTTP 500/)
  })

  it('успех отдаёт overview', async () => {
    h.overview = { overview: { ordersCount: 3 }, sessionExpired: false, failed: undefined, error: undefined }
    const res = await overviewGET(req('/api/kaspi-shop/quality/overview'))
    expect(res.status).toBe(200)
    expect((await res.json()).overview.ordersCount).toBe(3)
  })
})

describe('GET /api/kaspi-shop/quality/categories', () => {
  it('сбой Kaspi это 502, а не «Категорий пока нет»', async () => {
    h.categories = { categories: [], total: 0, sessionExpired: false, failed: true, error: 'Kaspi не ответил вовремя' }
    const res = await categoriesGET(req('/api/kaspi-shop/quality/categories?tab=rating&page=0'))
    expect(res.status).toBe(502)
  })

  it('страница уходит в Kaspi, total возвращается для «Показать ещё»', async () => {
    h.categories = { categories: [{ categoryCode: 'a' }], total: 25, sessionExpired: false, failed: undefined, error: undefined }
    const res = await categoriesGET(req('/api/kaspi-shop/quality/categories?tab=returns&page=2'))
    expect(res.status).toBe(200)
    expect(h.catArgs[3]).toBe(2)
    expect((await res.json()).total).toBe(25)
  })

  it('мусорный номер страницы это 400', async () => {
    for (const bad of ['-1', '2.5', 'x']) {
      const res = await categoriesGET(req(`/api/kaspi-shop/quality/categories?tab=rating&page=${bad}`))
      expect(res.status).toBe(400)
    }
  })
})
