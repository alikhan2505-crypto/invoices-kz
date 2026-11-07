import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { db, resetDb, createFakeClient } from '@/lib/kaspiShop/routeDb.testkit'

// removed-products: короткий или оборванный список каталога это 502 с сообщением, а не
// «Все товары в продаже» и не 404 «не найден среди товаров в продаже» (аудит Kaspi K22).
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key'
})

const h = vi.hoisted(() => ({
  catalog: vi.fn(),
  details: vi.fn(),
  expired: vi.fn(async (..._a: any[]) => {}),
  restore: vi.fn(),
  remove: vi.fn(),
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
  extractOfferPointInfo: () => [],
  totalStock: () => 3,
}))
vi.mock('@/lib/kaspiShop/cabinetPricePush', () => ({
  restoreOfferToSale: (...a: any[]) => h.restore(...a),
  removeOfferFromSale: (...a: any[]) => h.remove(...a),
}))

import { GET, POST } from './route'

const offer = (sku: string) => ({
  sku, masterSku: `M-${sku}`, title: `Товар ${sku}`, brandCode: null, brandName: null, masterCategory: null,
  minPrice: 1000, allCityPrices: { c1: { price: 1000 } }, points: ['PP1'], availabilities: [],
})
const complete = (...skus: string[]) => ({ offers: skus.map(offer), sessionExpired: false, complete: true, failed: false })
const failedList = (error: string, ...skus: string[]) => ({ offers: skus.map(offer), sessionExpired: false, complete: false, failed: true, error })

const get = () => GET(new NextRequest('http://localhost/api/kaspi-shop/removed-products', { headers: { authorization: 'Bearer t' } }))
const post = (body: any) => POST(new NextRequest('http://localhost/api/kaspi-shop/removed-products', {
  method: 'POST', headers: { authorization: 'Bearer t', 'content-type': 'application/json' }, body: JSON.stringify(body),
}))

beforeEach(() => {
  resetDb()
  vi.clearAllMocks()
  db.tables.kaspi_shop_tracked_products = [{ id: 't1', connection_id: 'c1', kaspi_master_sku: 'M-A', available_for_sale: true }]
  db.tables.kaspi_shop_connections = [{ id: 'c1', city_lookup_cache: {} }]
  h.details.mockResolvedValue({ items: [], okSkus: new Set(), ok: true, sessionExpired: false })
  h.restore.mockResolvedValue({ success: true })
  h.remove.mockResolvedValue({ success: true })
})

describe('GET removed-products', () => {
  it('оба списка полные: active и removed как раньше', async () => {
    h.catalog.mockImplementation(async (_c: string, _m: string, available: boolean) => available ? complete('A') : complete('B'))
    const res = await get()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.active.map((o: any) => o.sku)).toEqual(['A'])
    expect(body.removed.map((o: any) => o.sku)).toEqual(['B'])
    expect(body.citiesIncomplete).toBe(false)
  })

  it('полный пустой список «в продаже» это честный 200 с пустым active', async () => {
    h.catalog.mockImplementation(async (_c: string, _m: string, available: boolean) => available ? complete() : complete('B'))
    const res = await get()
    expect(res.status).toBe(200)
    expect((await res.json()).active).toEqual([])
  })

  it('сбой списка «в продаже»: 502 с сообщением, а не пустой active, и никаких записей в базу', async () => {
    h.catalog.mockImplementation(async (_c: string, _m: string, available: boolean) => available ? failedList('Kaspi ответил HTTP 500') : complete('B'))
    const res = await get()
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toContain('Kaspi не отдал полный список')
    expect(body.error).toContain('HTTP 500')
    expect(body.active).toBeUndefined()
    expect(db.writes).toEqual([])
  })

  it('короткий список (обрыв на второй странице): 502, флаги available_for_sale не трогаем', async () => {
    h.catalog.mockImplementation(async (_c: string, _m: string, available: boolean) => available ? complete('A') : failedList('таймаут', 'B'))
    const res = await get()
    expect(res.status).toBe(502)
    expect(db.writes).toEqual([])
    expect(db.tables.kaspi_shop_tracked_products[0].available_for_sale).toBe(true)
  })

  it('complete=false без failed тоже не читается как полный список', async () => {
    h.catalog.mockImplementation(async () => ({ offers: [], sessionExpired: false, complete: false, failed: false }))
    expect((await get()).status).toBe(502)
  })

  it('истёкшая сессия: 400 с sessionExpired и отметкой соединения', async () => {
    h.catalog.mockImplementation(async () => ({ offers: [], sessionExpired: true, complete: false, failed: true, error: 'Сессия кабинета Kaspi истекла' }))
    const res = await get()
    expect(res.status).toBe(400)
    expect((await res.json()).sessionExpired).toBe(true)
    expect(h.expired).toHaveBeenCalledWith('c1')
  })

  it('сбой details не роняет страницу, но помечен citiesIncomplete', async () => {
    h.catalog.mockImplementation(async (_c: string, _m: string, available: boolean) => available ? complete('A') : complete())
    h.details.mockResolvedValue({ items: [], okSkus: new Set(), ok: false, sessionExpired: false, error: 'HTTP 500' })
    const res = await get()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.active).toHaveLength(1)
    expect(body.citiesIncomplete).toBe(true)
  })

  it('401/403 только от details при двух ответивших списках: списки остаются, citiesIncomplete, соединение НЕ помечается истёкшим', async () => {
    h.catalog.mockImplementation(async (_c: string, _m: string, available: boolean) => available ? complete('A') : complete('B'))
    h.details.mockResolvedValue({ items: [], okSkus: new Set(), ok: false, sessionExpired: true })
    const res = await get()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.active).toHaveLength(1)
    expect(body.removed).toHaveLength(1)
    expect(body.citiesIncomplete).toBe(true)
    expect(body.sessionExpired).toBeUndefined()
    expect(h.expired).not.toHaveBeenCalled()
  })
})

describe('POST removed-products', () => {
  it('товар найден в полном списке: действие выполняется', async () => {
    h.catalog.mockResolvedValue(complete('A'))
    const res = await post({ sku: 'A', action: 'remove' })
    expect(res.status).toBe(200)
    expect(h.remove).toHaveBeenCalled()
  })

  it('нет такого товара в ПОЛНОМ списке: честный 404', async () => {
    h.catalog.mockResolvedValue(complete('B'))
    const res = await post({ sku: 'A', action: 'remove' })
    expect(res.status).toBe(404)
    expect((await res.json()).error).toContain('не найден среди товаров в продаже')
    expect(h.remove).not.toHaveBeenCalled()
  })

  it('список оборван и товара в нём нет: 502, а не «не найден», и Kaspi не трогаем', async () => {
    h.catalog.mockResolvedValue(failedList('Kaspi ответил HTTP 500', 'B'))
    const res = await post({ sku: 'A', action: 'restore' })
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toContain('Не удалось получить список товаров')
    expect(body.error).not.toContain('не найден')
    expect(h.restore).not.toHaveBeenCalled()
  })

  it('список оборван, но товар в нём уже найден: действие выполняется (строка товара полная)', async () => {
    h.catalog.mockResolvedValue(failedList('обрыв на следующей странице', 'A'))
    const res = await post({ sku: 'A', action: 'remove' })
    expect(res.status).toBe(200)
    expect(h.remove).toHaveBeenCalled()
  })

  it('истёкшая сессия при чтении списка: 400 с sessionExpired и отметкой соединения', async () => {
    h.catalog.mockResolvedValue({ offers: [], sessionExpired: true, complete: false, failed: true, error: 'Сессия кабинета Kaspi истекла' })
    const res = await post({ sku: 'A', action: 'remove' })
    expect(res.status).toBe(400)
    expect((await res.json()).sessionExpired).toBe(true)
    expect(h.expired).toHaveBeenCalledWith('c1')
    expect(h.remove).not.toHaveBeenCalled()
  })
})
