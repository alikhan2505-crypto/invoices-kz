import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// POST /api/kaspi-shop/apply-now (аудит Kaspi 06.11.2026, K14): запуск проверки
// раньше сброса, серверный лимит раз в 10 минут, число товаров в ответе. С 07.11.2026
// проверка бесплатна (5 ₸ только за изменение цены ботом): стоимости в ответе нет.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key'
})

const h = vi.hoisted(() => ({ balance: 100, balanceThrows: false, paused: false }))

vi.mock('@supabase/supabase-js', async () => {
  const { createFakeClient } = await import('@/lib/kaspiShop/routeDb.testkit')
  return { createClient: () => createFakeClient() }
})
vi.mock('@/lib/kaspiShop/planGate', () => ({ kaspiShopPlanGate: async () => null }))
vi.mock('@/lib/kaspiShop/connection', () => ({ loadConnection: async () => ({ id: 'c1', paused: h.paused }) }))
vi.mock('@/lib/kaspiShop/wallet', () => ({
  KASPI_SHOP_CREDIT_PRICE_TENGE: 5,
  getKaspiShopWalletBalance: async () => {
    if (h.balanceThrows) throw new Error('down')
    return h.balance
  },
}))
vi.mock('@/lib/kaspiShop/checkCycle', () => ({
  isSessionActive: (s: string | null | undefined) => s == null || s === 'active',
}))

import { db, resetDb } from '@/lib/kaspiShop/routeDb.testkit'
import { POST } from './route'

const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'
const P3 = '33333333-3333-4333-8333-333333333333'

const fetchMock = vi.fn()
// Снимок last_checked_at в момент, когда ушёл запрос на запуск workflow.
let lastCheckedAtAtDispatch: Array<unknown> = []

function call(body: unknown = {}) {
  return POST(new NextRequest('http://localhost/api/kaspi-shop/apply-now', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify(body),
  }))
}
const products = () => db.tables.kaspi_shop_tracked_products

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-06T10:03:30Z')) // середина 10-минутного окна
  resetDb()
  h.balance = 100
  h.balanceThrows = false
  h.paused = false
  process.env.KASPI_SHOP_GITHUB_PAT = 'pat'
  db.tables.kaspi_shop_connections = [{ id: 'c1', session_status: 'active' }]
  const stamp = '2026-11-06T09:00:00Z'
  db.tables.kaspi_shop_tracked_products = [
    { id: P1, connection_id: 'c1', enabled: true, available_for_sale: true, last_checked_at: stamp },
    { id: P2, connection_id: 'c1', enabled: true, available_for_sale: true, last_checked_at: stamp },
    { id: P3, connection_id: 'c1', enabled: true, available_for_sale: false, last_checked_at: stamp },
  ]
  lastCheckedAtAtDispatch = []
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () => {
    lastCheckedAtAtDispatch = products().map(p => p.last_checked_at)
    return { ok: true, status: 204 }
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('POST /api/kaspi-shop/apply-now', () => {
  it('dispatches first, resets last_checked_at only afterwards, answers with the product count and NO cost (off-sale products are not counted)', async () => {
    const res = await call()
    expect(res.status).toBe(202)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true, count: 2, queued: 2 })
    // проверка бесплатна: ни стоимости, ни «хватит на N проверок» в ответе нет
    expect(json).not.toHaveProperty('cost')
    expect(json).not.toHaveProperty('affordable')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // в момент запуска сброса ещё не было
    expect(lastCheckedAtAtDispatch.every(v => v === '2026-11-06T09:00:00Z')).toBe(true)
    // после запуска -- сброшены у двух проверяемых, у снятого с продажи нет
    expect(products().find(p => p.id === P1)!.last_checked_at).toBeNull()
    expect(products().find(p => p.id === P2)!.last_checked_at).toBeNull()
    expect(products().find(p => p.id === P3)!.last_checked_at).toBe('2026-11-06T09:00:00Z')
  })

  it('a missing GitHub token fails BEFORE touching the database, and does not burn the cooldown', async () => {
    delete process.env.KASPI_SHOP_GITHUB_PAT
    const res = await call()
    expect(res.status).toBe(500)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(products().every(p => p.last_checked_at === '2026-11-06T09:00:00Z')).toBe(true)
    expect(db.writes).toHaveLength(0)

    process.env.KASPI_SHOP_GITHUB_PAT = 'pat'
    expect((await call()).status).toBe(202)
  })

  it('a refused dispatch (GitHub 5xx) leaves last_checked_at alone and gives the cooldown slot back', async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 503 }))
    const res = await call()
    expect(res.status).toBe(502)
    expect(products().every(p => p.last_checked_at === '2026-11-06T09:00:00Z')).toBe(true)
    // слот возвращён: повтор сразу проходит
    expect((await call()).status).toBe(202)
  })

  it('a dispatch that throws is handled the same way', async () => {
    fetchMock.mockImplementationOnce(async () => { throw new Error('network') })
    expect((await call()).status).toBe(502)
    expect(products().every(p => p.last_checked_at === '2026-11-06T09:00:00Z')).toBe(true)
  })

  it('a second press within 10 minutes is 429 with Retry-After and costs nothing', async () => {
    expect((await call()).status).toBe(202)
    const again = await call()
    expect(again.status).toBe(429)
    expect(Number(again.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(Number(again.headers.get('retry-after'))).toBeLessThanOrEqual(600)
    const json = await again.json()
    expect(json.retryAfterSeconds).toBeGreaterThan(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('after the window has passed a new run is allowed', async () => {
    expect((await call()).status).toBe(202)
    vi.setSystemTime(new Date('2026-11-06T10:10:01Z'))
    expect((await call()).status).toBe(202)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('the cooldown is per user: another seller is not blocked', async () => {
    expect((await call()).status).toBe(202)
    db.userId = 'u2'
    db.tables.kaspi_shop_tracked_products = [{ id: P1, connection_id: 'c1', enabled: true, available_for_sale: true, last_checked_at: 'x' }]
    expect((await call()).status).toBe(202)
  })

  it('a broken counter does not run a paid check', async () => {
    db.failTables.add('tool_kontragent_checks')
    const res = await call()
    expect(res.status).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(products().every(p => p.last_checked_at === '2026-11-06T09:00:00Z')).toBe(true)
  })

  it('a dead cabinet session: 400, nothing is queued', async () => {
    db.tables.kaspi_shop_connections = [{ id: 'c1', session_status: 'session_expired' }]
    const res = await call()
    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a wallet below 5 tenge: 400 in the new model words, nothing is queued (the bot cannot pay for a price change)', async () => {
    h.balance = 4
    const res = await call()
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Баланс меньше 5 ₸')
    expect(json.error).toContain('бот не сможет менять цены')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a wallet of exactly 5 tenge may run; the run does not cost anything by itself', async () => {
    h.balance = 5
    const res = await call()
    expect(res.status).toBe(202)
    expect(await res.json()).not.toHaveProperty('cost')
  })

  it('a wallet read failure is a 500, nothing is queued', async () => {
    h.balanceThrows = true
    expect((await call()).status).toBe(500)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a paused bot cannot be applied', async () => {
    h.paused = true
    expect((await call()).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('no enabled products: 400', async () => {
    db.tables.kaspi_shop_tracked_products = []
    expect((await call()).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a single product run reports 1 product, no cost, and has its own cooldown key', async () => {
    const res = await call({ productId: P1 })
    expect(res.status).toBe(202)
    const json = await res.json()
    expect(json).toMatchObject({ count: 1 })
    expect(json).not.toHaveProperty('cost')
    expect(products().find(p => p.id === P2)!.last_checked_at).toBe('2026-11-06T09:00:00Z')
    // the whole-store run is a different key, not blocked by the single run
    expect((await call()).status).toBe(202)
  })

  it('a productId that is not a uuid is 400', async () => {
    expect((await call({ productId: 'abc' })).status).toBe(400)
  })
})
