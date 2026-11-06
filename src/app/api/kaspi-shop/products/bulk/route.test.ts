import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// POST /api/kaspi-shop/products/bulk: одна общая настройка на товары с разными
// ценами (аудит Kaspi 06.11.2026, K7/K18).
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

import { db, resetDb } from '@/lib/kaspiShop/routeDb.testkit'
import { POST } from './route'

const CHEAP = '11111111-1111-4111-8111-111111111111'
const MID = '22222222-2222-4222-8222-222222222222'
const DEAR = '33333333-3333-4333-8333-333333333333'
const OTHERS = '44444444-4444-4444-8444-444444444444'

const settings = { floorPrice: 5000, maxPrice: null, undercutStep: 100, dempingStrategy: 'undercut_leader', checkFrequencyMinutes: 15 }

function call(body: unknown) {
  return POST(new NextRequest('http://localhost/api/kaspi-shop/products/bulk', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify(body),
  }))
}
const row = (id: string) => db.tables.kaspi_shop_tracked_products.find(r => r.id === id)!
const writes = () => db.writes.filter(w => w.table === 'kaspi_shop_tracked_products')

beforeEach(() => {
  resetDb()
  const base = { enabled: false, floor_price: 1, max_price: null }
  db.tables.kaspi_shop_tracked_products = [
    { id: CHEAP, user_id: 'u1', product_name: 'Дешёвый', own_current_price: 800, ...base },
    { id: MID, user_id: 'u1', product_name: 'Средний', own_current_price: 5000, ...base },
    { id: DEAR, user_id: 'u1', product_name: 'Дорогой', own_current_price: 30000, ...base },
    { id: OTHERS, user_id: 'someone-else', product_name: 'Чужой', own_current_price: 9000, ...base },
  ]
})

describe('POST /api/kaspi-shop/products/bulk', () => {
  it('floor 5000 for items priced 800 and 30000: the 800 item is skipped, reported and NOT enabled (K18)', async () => {
    const res = await call({ productIds: [CHEAP, DEAR], ...settings })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.updated).toBe(1)
    expect(json.skipped).toEqual([{ id: CHEAP, name: 'Дешёвый', ownPrice: 800, reason: 'floor_above_price' }])
    expect(row(DEAR)).toMatchObject({ enabled: true, floor_price: 5000 })
    expect(row(CHEAP)).toMatchObject({ enabled: false, floor_price: 1 })
  })

  it('a max below an item price skips that item', async () => {
    const res = await call({ productIds: [MID, DEAR], ...settings, floorPrice: 1000, maxPrice: 6000 })
    const json = await res.json()
    expect(json.updated).toBe(1)
    expect(json.skipped).toEqual([{ id: DEAR, name: 'Дорогой', ownPrice: 30000, reason: 'max_below_price' }])
    expect(row(DEAR).enabled).toBe(false)
    expect(row(MID)).toMatchObject({ enabled: true, max_price: 6000 })
  })

  it('when no item fits the answer is 400 with the skipped list and nothing is written', async () => {
    const res = await call({ productIds: [CHEAP], ...settings })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.skipped).toHaveLength(1)
    expect(writes().filter(w => w.op === 'update')).toHaveLength(0)
  })

  it("another seller's id is never touched and is not reported as skipped", async () => {
    const res = await call({ productIds: [MID, OTHERS], ...settings })
    const json = await res.json()
    expect(json.updated).toBe(1)
    expect(json.skipped).toEqual([])
    expect(row(OTHERS)).toMatchObject({ enabled: false, floor_price: 1 })
  })

  it.each([
    ['floor 0', { floorPrice: 0 }],
    ['floor empty', { floorPrice: '' }],
    ['floor text', { floorPrice: 'abc' }],
    ['max equal to floor', { maxPrice: 5000 }],
    ['max below floor', { maxPrice: 100 }],
    ['negative step', { undercutStep: -1 }],
    ['unknown strategy', { dempingStrategy: 'chaos' }],
    ['frequency 0', { checkFrequencyMinutes: 0 }],
    ['frequency fractional', { checkFrequencyMinutes: 12.5 }],
  ])('%s: 400 and no rows touched', async (_name, extra) => {
    const res = await call({ productIds: [MID], ...settings, ...extra })
    expect(res.status).toBe(400)
    expect(writes().filter(w => w.op === 'update')).toHaveLength(0)
  })

  it('ids that are not uuids are 400', async () => {
    expect((await call({ productIds: ['abc'], ...settings })).status).toBe(400)
  })

  it('more than 100 ids is 400', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
    expect((await call({ productIds: ids, ...settings })).status).toBe(400)
  })

  it('a JSON null body is 400, not a crash', async () => {
    const res = await POST(new NextRequest('http://localhost/api/kaspi-shop/products/bulk', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer t' }, body: 'null',
    }))
    expect(res.status).toBe(400)
  })
})
