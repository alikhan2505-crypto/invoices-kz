import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { db, resetDb, createFakeClient } from '@/lib/kaspiShop/routeDb.testkit'

// offer-stocks GET: остаток живёт только в строке каталога; оборванный список или сбой details
// это 502 с сообщением, а не пустые поля остатка (их сохранение стёрло бы остаток, K22/K23).
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key'
})

const h = vi.hoisted(() => ({
  catalog: vi.fn(),
  details: vi.fn(),
  points: vi.fn(),
  expired: vi.fn(async (..._a: any[]) => {}),
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: () => createFakeClient() }))
vi.mock('@/lib/kaspiShop/planGate', () => ({ kaspiShopPlanGate: async () => null }))
vi.mock('@/lib/kaspiShop/connection', () => ({
  loadConnection: async () => ({ id: 'c1', sessionCookies: 'ck', merchantId: 'm1' }),
  markSessionExpired: (...a: any[]) => h.expired(...a),
}))
vi.mock('@/lib/kaspiShop/cabinetApi', () => ({
  listCatalogWithStatus: (...a: any[]) => h.catalog(...a),
  fetchOffersDetailsChecked: (...a: any[]) => h.details(...a),
  extractOfferPointInfo: (details: any) => (details.points || []).map((p: any) => ({ storeCode: p, cityId: 'c1', price: 1000, stockCount: null, available: 'yes' })),
}))
vi.mock('@/lib/kaspiShop/cabinetPricePush', () => ({ savePointStockPrice: vi.fn() }))
vi.mock('@/lib/kaspiShop/merchantPoints', () => ({ getCachedMerchantPoints: (...a: any[]) => h.points(...a) }))

import { GET } from './route'

const listOffer = (sku: string, stock: number) => ({
  sku, masterSku: null, title: sku, brandCode: null, brandName: null, masterCategory: null, minPrice: 1000,
  allCityPrices: {}, points: ['PP1'], availabilities: [{ storeId: 'm1_PP1', stockCount: stock, available: 'yes' }],
})
const complete = (...o: any[]) => ({ offers: o, sessionExpired: false, complete: true, failed: false })
const failedList = (error: string, ...o: any[]) => ({ offers: o, sessionExpired: false, complete: false, failed: true, error })
const okDetails = () => ({ items: [{ sku: 'A', title: 'Товар A', minPrice: 1000, points: ['PP1'] }], okSkus: new Set(['A']), ok: true, sessionExpired: false })

const get = () => GET(new NextRequest('http://localhost/api/kaspi-shop/offer-stocks?sku=A', { headers: { authorization: 'Bearer t' } }))

beforeEach(() => {
  resetDb()
  vi.clearAllMocks()
  db.tables.kaspi_shop_connections = [{ id: 'c1', city_lookup_cache: { c1: 'Алматы' } }]
  h.details.mockResolvedValue(okDetails())
  h.points.mockResolvedValue([])
})

describe('GET offer-stocks', () => {
  it('товар найден в полном списке: остаток точки подставлен', async () => {
    h.catalog.mockImplementation(async (_c: string, _m: string, available: boolean) => available ? complete(listOffer('A', 7)) : complete())
    const res = await get()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.entries[0].stockCount).toBe(7)
    expect(body.entries[0].cityName).toBe('Алматы')
  })

  it('товар только в снятых: остаток берётся оттуда', async () => {
    h.catalog.mockImplementation(async (_c: string, _m: string, available: boolean) => available ? complete() : complete(listOffer('A', 4)))
    const body = await (await get()).json()
    expect(body.entries[0].stockCount).toBe(4)
  })

  it('оба списка оборваны и товара нет: 502, а не 200 с пустым остатком', async () => {
    h.catalog.mockResolvedValue(failedList('Kaspi ответил HTTP 500'))
    const res = await get()
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toContain('Не удалось получить остатки')
    expect(body.entries).toBeUndefined()
  })

  it('список «в продаже» оборван, товар нашёлся в нём: ответ 200 с остатком', async () => {
    h.catalog.mockImplementation(async (_c: string, _m: string, available: boolean) => available ? failedList('обрыв', listOffer('A', 9)) : complete())
    const res = await get()
    expect(res.status).toBe(200)
    expect((await res.json()).entries[0].stockCount).toBe(9)
  })

  it('«в продаже» оборван, «сняты» полный и товара нет: 502 (его могли не дочитать в первом)', async () => {
    h.catalog.mockImplementation(async (_c: string, _m: string, available: boolean) => available ? failedList('обрыв') : complete())
    expect((await get()).status).toBe(502)
  })

  it('товара нет в обоих ПОЛНЫХ списках: карточка отдаётся без остатка (как раньше)', async () => {
    h.catalog.mockResolvedValue(complete())
    const res = await get()
    expect(res.status).toBe(200)
    expect((await res.json()).entries[0].stockCount).toBeNull()
  })

  it('истёкшая сессия при чтении списка: 400 с sessionExpired и отметкой соединения', async () => {
    h.catalog.mockResolvedValue({ offers: [], sessionExpired: true, complete: false, failed: true, error: 'Сессия кабинета Kaspi истекла' })
    const res = await get()
    expect(res.status).toBe(400)
    expect((await res.json()).sessionExpired).toBe(true)
    expect(h.expired).toHaveBeenCalledWith('c1')
  })

  it('details: сбой Kaspi это 502 с причиной', async () => {
    h.details.mockResolvedValue({ items: [], okSkus: new Set(), ok: false, sessionExpired: false, error: 'Kaspi ответил HTTP 500' })
    const res = await get()
    expect(res.status).toBe(502)
    expect((await res.json()).error).toContain('HTTP 500')
  })

  it('details: истёкшая сессия это 400 с sessionExpired', async () => {
    h.details.mockResolvedValue({ items: [], okSkus: new Set(), ok: false, sessionExpired: true, error: 'Сессия кабинета Kaspi истекла' })
    const res = await get()
    expect(res.status).toBe(400)
    expect(h.expired).toHaveBeenCalledWith('c1')
  })
})
