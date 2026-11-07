import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// GET /api/kaspi-shop/finance: период «с даты» считается по суткам Алматы (аудит K37),
// ответ несёт upstreamFailed как есть (K35), подключение даёт ключ кэша (K38).
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key'
})

const h = vi.hoisted(() => ({
  args: [] as any[],
  summary: { totalRevenue: 0, upstreamFailed: false, sessionExpired: false } as any,
  expired: vi.fn(async (..._a: any[]) => {}),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) } }),
}))
vi.mock('@/lib/kaspiShop/planGate', () => ({ kaspiShopPlanGate: async () => null }))
vi.mock('@/lib/kaspiShop/connection', () => ({
  loadConnection: async () => ({ id: 'conn-7', sessionCookies: 'ck', merchantId: 'm1' }),
  markSessionExpired: (...a: any[]) => h.expired(...a),
}))
vi.mock('@/lib/kaspiShop/finance', () => ({
  computeFinanceSummary: async (...args: any[]) => { h.args = args; return h.summary },
}))

import { GET } from './route'

const call = (qs: string) => GET(new NextRequest(`http://localhost/api/kaspi-shop/finance${qs}`, { headers: { authorization: 'Bearer t' } }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-06T10:00:00Z')) // 15:00 по Алматы
  h.summary = { totalRevenue: 0, upstreamFailed: false, sessionExpired: false }
  h.expired.mockClear()
})

describe('GET /api/kaspi-shop/finance', () => {
  it('since=2026-11-01 передаёт границу ровно 00:00 по Алматы и число суток, а не скользящие 24 часа', async () => {
    const res = await call('?since=2026-11-01')
    expect(res.status).toBe(200)
    const [, , days, , opts] = h.args
    expect(days).toBe(6)
    expect(new Date(opts.windowStartMs).toISOString()).toBe('2026-10-31T19:00:00.000Z')
    expect(opts.cacheKey).toBe('conn-7')
  })

  it('пресет days=30 границу не задаёт (её считает расчёт по суткам Алматы), ключ кэша передаётся', async () => {
    await call('?days=30')
    const [, , days, , opts] = h.args
    expect(days).toBe(30)
    expect(opts.windowStartMs).toBeUndefined()
    expect(opts.cacheKey).toBe('conn-7')
  })

  it('кривая, будущая и слишком старая дата это 400', async () => {
    for (const bad of ['x', '2026-11-07', '2025-01-01', '2026-02-31']) {
      const res = await call(`?since=${bad}`)
      expect(res.status).toBe(400)
    }
  })

  it('сбой Kaspi приходит на страницу флагом upstreamFailed (ответ 200, страница рисует баннер)', async () => {
    h.summary = { totalRevenue: 0, upstreamFailed: true, sessionExpired: false }
    const res = await call('?days=7')
    expect(res.status).toBe(200)
    expect((await res.json()).upstreamFailed).toBe(true)
  })

  it('мёртвая сессия помечает подключение', async () => {
    h.summary = { totalRevenue: 0, upstreamFailed: false, sessionExpired: true }
    await call('?days=7')
    expect(h.expired).toHaveBeenCalledWith('conn-7')
  })
})
