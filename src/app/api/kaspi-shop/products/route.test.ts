import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// PATCH/POST /api/kaspi-shop/products: серверная проверка денежных полей
// (аудит Kaspi 06.11.2026, K7/K16).
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
vi.mock('@/lib/kaspiShop/connection', () => ({ loadConnection: async () => ({ id: 'c1', paused: false }) }))
vi.mock('@/lib/kaspiShop/checkCycle', () => ({
  isCheckDue: () => true,
  isSessionActive: (s: string | null | undefined) => s == null || s === 'active',
}))

import { db, resetDb } from '@/lib/kaspiShop/routeDb.testkit'
import { GET, PATCH, POST } from './route'

const P1 = '3f2b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6b'
const P_OTHER = '9a1b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6c'

function req(method: 'PATCH' | 'POST', body: unknown) {
  return new NextRequest('http://localhost/api/kaspi-shop/products', {
    method,
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  resetDb()
  db.tables.kaspi_shop_tracked_products = [
    { id: P1, user_id: 'u1', stock_count: 3, floor_price: 1000, max_price: 5000, own_current_price: 2000 },
    { id: P_OTHER, user_id: 'someone-else', stock_count: 1, floor_price: 100, max_price: null, own_current_price: 200 },
  ]
})

const stored = () => db.tables.kaspi_shop_tracked_products.find(r => r.id === P1)!
const updates = () => db.writes.filter(w => w.table === 'kaspi_shop_tracked_products' && w.op === 'update')

describe('PATCH /api/kaspi-shop/products', () => {
  it.each([
    ['floor 0', { floor_price: 0 }],
    ['floor null', { floor_price: null }],
    ['floor empty string', { floor_price: '' }],
    ['floor negative', { floor_price: -50 }],
    ['floor text', { floor_price: 'abc' }],
    ['step negative', { undercut_step: -100 }],
    ['step null', { undercut_step: null }],
    ['frequency 1 minute', { check_frequency_minutes: 1 }],
    ['frequency fractional', { check_frequency_minutes: 7.5 }],
    ['unknown strategy', { demping_strategy: 'chaos' }],
    ['max below the STORED floor', { max_price: 900 }],
    ['floor above the STORED max', { floor_price: 6000 }],
    ['enabled as text', { enabled: 'yes' }],
  ])('%s: 400 and nothing is written', async (_name, patch) => {
    const res = await PATCH(req('PATCH', { id: P1, ...patch }))
    expect(res.status).toBe(400)
    expect(updates()).toHaveLength(0)
    expect(stored()).toMatchObject({ floor_price: 1000, max_price: 5000 })
  })

  it('a valid floor/max/step/strategy/frequency patch is saved as clean numbers', async () => {
    const res = await PATCH(req('PATCH', { id: P1, floor_price: '1200', max_price: 4000, undercut_step: 50, demping_strategy: 'be_second', check_frequency_minutes: 30 }))
    expect(res.status).toBe(200)
    expect(stored()).toMatchObject({ floor_price: 1200, max_price: 4000, undercut_step: 50, demping_strategy: 'be_second', check_frequency_minutes: 30 })
  })

  it('a lone max above the stored floor is accepted, a lone max null clears it', async () => {
    expect((await PATCH(req('PATCH', { id: P1, max_price: 7000 }))).status).toBe(200)
    expect(stored().max_price).toBe(7000)
    expect((await PATCH(req('PATCH', { id: P1, max_price: null }))).status).toBe(200)
    expect(stored().max_price).toBeNull()
  })

  it('floor more than 3x the current price: 400 with code floor_far_above_price and the numbers, nothing written', async () => {
    const res = await PATCH(req('PATCH', { id: P1, floor_price: 60000, max_price: null }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toMatchObject({ code: 'floor_far_above_price', field: 'floor_price', floorPrice: 60000, ownPrice: 2000, factor: 3 })
    expect(typeof json.error).toBe('string')
    expect(updates()).toHaveLength(0)
    expect(stored()).toMatchObject({ floor_price: 1000, max_price: 5000 })
  })

  it('the same floor with confirmFloor: true is saved, and confirmFloor itself is not written', async () => {
    const res = await PATCH(req('PATCH', { id: P1, floor_price: 60000, max_price: null, confirmFloor: true }))
    expect(res.status).toBe(200)
    expect(stored().floor_price).toBe(60000)
    expect('confirmFloor' in stored()).toBe(false)
  })

  it('max far below the current price: same code, field max_price', async () => {
    const res = await PATCH(req('PATCH', { id: P1, floor_price: 100, max_price: 600 }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'floor_far_above_price', field: 'max_price', maxPrice: 600, ownPrice: 2000 })
  })

  it('an ordinary validation error carries no floor_far code', async () => {
    const res = await PATCH(req('PATCH', { id: P1, floor_price: 0 }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBeUndefined()
  })

  it('unknown keys such as user_id or own_current_price are not written', async () => {
    const res = await PATCH(req('PATCH', { id: P1, floor_price: 1100, user_id: 'attacker', own_current_price: 1 }))
    expect(res.status).toBe(200)
    expect(stored()).toMatchObject({ user_id: 'u1', own_current_price: 2000, floor_price: 1100 })
  })

  it("another seller's product is 404 and untouched", async () => {
    const res = await PATCH(req('PATCH', { id: P_OTHER, floor_price: 5 }))
    expect(res.status).toBe(404)
    expect(updates()).toHaveLength(0)
  })

  it('a non-uuid id is 400 before the database is asked', async () => {
    expect((await PATCH(req('PATCH', { id: 'abc', floor_price: 700 }))).status).toBe(400)
  })

  it('a JSON null body is 400, not a crash', async () => {
    expect((await PATCH(req('PATCH', 'null'))).status).toBe(400)
  })

  it('401 without a valid token', async () => {
    db.userId = null
    expect((await PATCH(req('PATCH', { id: P1, floor_price: 700 }))).status).toBe(401)
  })
})

describe('POST /api/kaspi-shop/products', () => {
  const body = { kaspiSku: 's1', productName: 'Тест', brand: 'B', storeId: 'PP1', ownCurrentPrice: 1500, floorPrice: 1000, undercutStep: 100 }

  it('inserts validated numbers with the default frequency 60 (hourly)', async () => {
    const res = await POST(req('POST', { ...body, floorPrice: '1000' }))
    expect(res.status).toBe(200)
    const inserted = db.writes.find(w => w.table === 'kaspi_shop_tracked_products' && w.op === 'insert')!.payload!
    expect(inserted).toMatchObject({ floor_price: 1000, own_current_price: 1500, undercut_step: 100, check_frequency_minutes: 60, stock_count: 0, user_id: 'u1' })
  })

  it.each([
    ['floor 0', { floorPrice: 0 }],
    ['floor text', { floorPrice: 'abc' }],
    ['step negative', { undercutStep: -5 }],
    ['step text', { undercutStep: 'x' }],
    ['own price text', { ownCurrentPrice: 'x' }],
    ['own price 0', { ownCurrentPrice: 0 }],
    ['frequency 2', { checkFrequencyMinutes: 2 }],
    ['stock negative', { stockCount: -1 }],
  ])('%s: 400 and nothing inserted', async (_name, extra) => {
    const res = await POST(req('POST', { ...body, ...extra }))
    expect(res.status).toBe(400)
    expect(db.writes.filter(w => w.op === 'insert')).toHaveLength(0)
  })

  it('a JSON null body is 400', async () => {
    expect((await POST(req('POST', 'null'))).status).toBe(400)
  })
})

// «Активных» на странице «Демпинг»: только включённые товары, которые в продаже
// (null у старых строк = в продаже). Снятый с продажи бот не проверяет, считать его
// работающим было бы неправдой (аудит 07.11.2026).
describe('GET /api/kaspi-shop/products: stats.activeCount', () => {
  function get() {
    return GET(new NextRequest('http://localhost/api/kaspi-shop/products', { headers: { authorization: 'Bearer t' } }))
  }
  const row = (id: string, over: Record<string, unknown>) => ({ id, user_id: 'u1', connection_id: 'c1', enabled: true, held_at_floor: false, last_checked_at: null, check_frequency_minutes: 60, ...over })

  it('counts enabled products on sale only: off-sale and disabled ones are not active, null counts as on sale', async () => {
    db.tables.kaspi_shop_connections = [{ id: 'c1', session_status: 'active' }]
    db.tables.kaspi_shop_tracked_products = [
      row('a', { available_for_sale: true }),
      row('b', { available_for_sale: null }),
      row('c', {}),
      row('d', { available_for_sale: false }),
      row('e', { enabled: false, available_for_sale: true }),
    ]
    const json = await (await get()).json()
    expect(json.stats.totalRules).toBe(5)
    expect(json.stats.activeCount).toBe(3)
    // «Готовы применить» считает тех же активных, и карточки не расходятся
    expect(json.stats.readyToApply).toBe(3)
  })

  it('all enabled products off sale: zero active', async () => {
    db.tables.kaspi_shop_connections = [{ id: 'c1', session_status: 'active' }]
    db.tables.kaspi_shop_tracked_products = [row('a', { available_for_sale: false }), row('b', { available_for_sale: false })]
    expect((await (await get()).json()).stats.activeCount).toBe(0)
  })
})

// Строка на карточке «цена изменена … (750 → 600 ₸)»: последнее изменение берётся из журнала
// проверок (P13, 13.11.2026). Сбой журнала не ломает список товаров.
describe('GET /api/kaspi-shop/products: последнее изменение цены', () => {
  function get() {
    return GET(new NextRequest('http://localhost/api/kaspi-shop/products', { headers: { authorization: 'Bearer t' } }))
  }
  const row = (id: string) => ({ id, user_id: 'u1', connection_id: 'c1', enabled: true, held_at_floor: false, last_checked_at: null, check_frequency_minutes: 60 })

  beforeEach(() => {
    db.tables.kaspi_shop_connections = [{ id: 'c1', session_status: 'active' }]
    db.tables.kaspi_shop_tracked_products = [row('a'), row('b'), row('c')]
  })

  it('кладёт в товар самое свежее изменение; без изменений поля нет; чужие и не-«updated» строки не берутся', async () => {
    db.tables.kaspi_shop_price_checks = [
      { id: 1, tracked_product_id: 'a', action: 'updated', checked_at: '2026-11-10T10:00:00.000Z', own_price_before: 800, own_price_after: 750 },
      { id: 2, tracked_product_id: 'a', action: 'updated', checked_at: '2026-11-12T10:00:00.000Z', own_price_before: 750, own_price_after: 600 },
      { id: 3, tracked_product_id: 'a', action: 'no_change', checked_at: '2026-11-13T10:00:00.000Z', own_price_before: 600, own_price_after: 600 },
      { id: 4, tracked_product_id: 'b', action: 'held_at_floor', checked_at: '2026-11-13T09:00:00.000Z', own_price_before: 600, own_price_after: 600 },
      { id: 5, tracked_product_id: 'zzz', action: 'updated', checked_at: '2026-11-13T09:00:00.000Z', own_price_before: 1, own_price_after: 2 },
    ]
    const json = await (await get()).json()
    const byId = Object.fromEntries(json.products.map((p: any) => [p.id, p]))
    expect(byId.a).toMatchObject({ last_price_change_at: '2026-11-12T10:00:00.000Z', last_price_change_from: 750, last_price_change_to: 600 })
    expect(byId.b.last_price_change_at).toBeUndefined()
    expect(byId.c.last_price_change_at).toBeUndefined()
  })

  it('журнал проверок недоступен: список товаров всё равно отдаётся, просто без изменений цены', async () => {
    db.failTables.add('kaspi_shop_price_checks')
    const res = await get()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.products).toHaveLength(3)
    expect(json.products[0].last_price_change_at).toBeUndefined()
  })
})
