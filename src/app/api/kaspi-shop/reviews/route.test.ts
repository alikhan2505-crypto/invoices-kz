import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// /api/kaspi-shop/reviews: запуск обновления не чаще раза в окно и без параллельных
// запусков, «уже идёт» вместо повторной отправки в GitHub (аудит K42); заголовочные
// числа из total_count и avg_rating карточек (K40).
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key'
})

vi.mock('@supabase/supabase-js', async () => {
  const { createFakeClient } = await import('@/lib/kaspiShop/routeDb.testkit')
  return { createClient: () => createFakeClient() }
})
vi.mock('@/lib/kaspiShop/planGate', () => ({ kaspiShopPlanGate: async () => null }))
vi.mock('@/lib/kaspiShop/connection', () => ({ loadConnection: async () => ({ id: 'c1' }) }))

import { db, resetDb } from '@/lib/kaspiShop/routeDb.testkit'
import { GET, POST } from './route'

const fetchMock = vi.fn()
const auth = { authorization: 'Bearer t' }
const post = () => POST(new NextRequest('http://localhost/api/kaspi-shop/reviews', { method: 'POST', headers: auth }))
const get = (qs = '') => GET(new NextRequest(`http://localhost/api/kaspi-shop/reviews${qs}`, { headers: auth }))
const rev = (rating: number) => ({ rating, text: '', authorName: null, date: null })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-06T10:03:30Z')) // окно 10:00-10:10
  resetDb()
  process.env.KASPI_SHOP_GITHUB_PAT = 'pat'
  db.tables.kaspi_shop_tracked_products = [
    { id: 'p1', connection_id: 'c1', product_name: 'Товар 1', kaspi_master_sku: 'SKU1' },
    { id: 'p1dup', connection_id: 'c1', product_name: 'Товар 1', kaspi_master_sku: 'SKU1' }, // дубль после переподключения
    { id: 'p2', connection_id: 'c1', product_name: 'Товар 2', kaspi_master_sku: 'SKU2' },
    { id: 'p3', connection_id: 'c1', product_name: 'Без SKU', kaspi_master_sku: null },
  ]
  db.tables.kaspi_shop_product_reviews = []
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, status: 204, text: async () => '' })
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('POST /api/kaspi-shop/reviews', () => {
  it('первый запуск уходит в GitHub один раз: по одному запросу на master SKU, без дублей и без товаров без SKU', async () => {
    const res = await post()
    expect(res.status).toBe(202)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true, dispatchedCount: 2, skippedCount: 1 })
    expect(json.since).toBe('2026-11-06T10:03:30.000Z')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const sent = JSON.parse(JSON.parse(fetchMock.mock.calls[0][1].body).inputs.products)
    expect(sent.map((p: any) => p.masterSku).sort()).toEqual(['SKU1', 'SKU2'])
  })

  it('повторное нажатие в окне не отправляет второй запуск, а отвечает «уже идёт» с временем начала', async () => {
    await post()
    fetchMock.mockClear()
    const res = await post()
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBeTruthy()
    const json = await res.json()
    expect(json.alreadyRunning).toBe(true)
    expect(json.error).toMatch(/уже идёт/)
    expect(json.since).toBe('2026-11-06T10:00:00.000Z')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('цикл запросов не размножает запуски: на десять нажатий один запуск в GitHub', async () => {
    for (let i = 0; i < 10; i++) await post()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('если прошлый запуск уже закончился (все товары обновлены), ответ честный: «уже обновлены», а не «идёт»', async () => {
    await post()
    db.tables.kaspi_shop_product_reviews = [
      { tracked_product_id: 'p1', reviews: [], fetched_at: '2026-11-06T10:05:00Z' },
      { tracked_product_id: 'p2', reviews: [], fetched_at: '2026-11-06T10:06:00Z' },
    ]
    const res = await post()
    expect(res.status).toBe(429)
    const json = await res.json()
    expect(json.alreadyRunning).toBe(false)
    expect(json.error).toMatch(/уже обновлены/)
  })

  it('после окна запускать можно снова', async () => {
    await post()
    vi.setSystemTime(new Date('2026-11-06T10:25:00Z'))
    const res = await post()
    expect(res.status).toBe(202)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('GitHub отказал: слот возвращается, повторить можно сразу', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'boom' })
    const first = await post()
    expect(first.status).toBe(502)
    const second = await post()
    expect(second.status).toBe(202)
  })

  it('без токена GitHub слот не занимается', async () => {
    delete process.env.KASPI_SHOP_GITHUB_PAT
    const res = await post()
    expect(res.status).toBe(500)
    process.env.KASPI_SHOP_GITHUB_PAT = 'pat'
    expect((await post()).status).toBe(202)
  })

  it('счётчик лимита не читается: не запускаем (запуск ходит в Kaspi), 503', async () => {
    db.failTables.add('tool_kontragent_checks')
    const res = await post()
    expect(res.status).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('GET /api/kaspi-shop/reviews', () => {
  it('K40: catalog берёт total_count и avg_rating карточек, а не размер загруженной выборки', async () => {
    db.tables.kaspi_shop_product_reviews = [
      { tracked_product_id: 'p1', reviews: [rev(5), rev(2)], fetch_error: null, fetched_at: '2026-11-06T09:00:00Z', avg_rating: 4.8, total_count: 245 },
      { tracked_product_id: 'p2', reviews: [rev(4)], fetch_error: null, fetched_at: '2026-11-06T09:00:00Z', avg_rating: '4.0', total_count: '5' },
    ]
    const json = await (await get()).json()
    expect(json.stats.total).toBe(3) // загруженная выборка
    expect(json.catalog.totalCount).toBe(250)
    expect(json.catalog.avgRating).toBe(4.8) // (4.8*245 + 4*5) / 250 = 4.784 -> 4.8
    expect(json.refresh).toBeNull()
  })

  it('K42: с since прогресс считается по товарам, обновлённым запуском', async () => {
    db.tables.kaspi_shop_product_reviews = [
      { tracked_product_id: 'p1', reviews: [], fetch_error: null, fetched_at: '2026-11-06T10:05:00Z' },
      { tracked_product_id: 'p2', reviews: [], fetch_error: null, fetched_at: '2026-11-06T08:00:00Z' },
    ]
    const json = await (await get('?since=2026-11-06T10:03:30.000Z')).json()
    expect(json.refresh).toEqual({ expected: 2, updated: 1 })
  })

  it('дубль строки одного SKU не удваивает отзывы', async () => {
    db.tables.kaspi_shop_product_reviews = [
      { tracked_product_id: 'p1', reviews: [rev(5)], fetch_error: null, fetched_at: '2026-11-01T09:00:00Z', total_count: 10, avg_rating: 5 },
      { tracked_product_id: 'p1dup', reviews: [rev(5)], fetch_error: null, fetched_at: '2026-11-06T09:00:00Z', total_count: 12, avg_rating: 5 },
    ]
    const json = await (await get()).json()
    expect(json.reviews).toHaveLength(1)
    expect(json.catalog.totalCount).toBe(12)
  })
})
