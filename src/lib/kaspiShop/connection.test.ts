import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSecDb, type SecDb } from './secDb.testkit'

const { state, notifySessionExpired, resetSessionExpiredNotices } = vi.hoisted(() => ({
  state: { db: null as unknown as SecDb },
  notifySessionExpired: vi.fn(async () => ({ status: 'sent', telegram: true })),
  resetSessionExpiredNotices: vi.fn(async () => {}),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t: string) => state.db.client.from(t) }) }))
vi.mock('@/lib/kaspiShop/sessionExpiredNotice', () => ({ notifySessionExpired, resetSessionExpiredNotices }))

import { markSessionExpired, purgeKaspiConnectionsForUser, saveConnection } from './connection'

const SECRET = 'enc-secret'
function seed(): SecDb {
  return makeSecDb({
    kaspi_shop_connections: [
      { id: 'c1', user_id: 'u1', merchant_id: 'm1', company_name: 'Shop One', session_cookies: SECRET, api_token_enc: SECRET, session_status: 'active', status: 'active', paused: false, is_active: true },
      { id: 'c2', user_id: 'u1', merchant_id: 'm2', company_name: 'Shop Two', session_cookies: SECRET, api_token_enc: null, session_status: 'active', status: 'active', paused: false, is_active: false },
      { id: 'c3', user_id: 'u2', merchant_id: 'm3', company_name: 'Other seller', session_cookies: SECRET, api_token_enc: SECRET, session_status: 'active', status: 'active', paused: false, is_active: true },
    ],
    kaspi_shop_tracked_products: [
      { id: 'p1', connection_id: 'c1' }, { id: 'p2', connection_id: 'c1' }, { id: 'p3', connection_id: 'c2' }, { id: 'p4', connection_id: 'c3' },
    ],
    kaspi_shop_product_city_prices: [
      { id: 'x1', tracked_product_id: 'p1' }, { id: 'x2', tracked_product_id: 'p3' }, { id: 'x3', tracked_product_id: 'p4' },
    ],
    wallet_ledger: [{ id: 'w1', user_id: 'u1', amount: -50 }],
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  state.db = seed()
  process.env.KASPI_SHOP_ENCRYPTION_KEY = 'a'.repeat(64)
})

describe('purgeKaspiConnectionsForUser (K47)', () => {
  it('removes every connection of the user with its products and city prices, and nothing of another seller', async () => {
    const res = await purgeKaspiConnectionsForUser('u1')
    expect(res).toEqual({ ok: true, connections: 2, rowsRemoved: true })
    const t = state.db.tables
    expect(t.kaspi_shop_connections.map(r => r.id)).toEqual(['c3'])
    expect(t.kaspi_shop_tracked_products.map(r => r.id)).toEqual(['p4'])
    expect(t.kaspi_shop_product_city_prices.map(r => r.id)).toEqual(['x3'])
  })

  it('wipes the secrets BEFORE deleting anything (so a failed delete cannot leave a live session)', async () => {
    const order = state.db.writes
    await purgeKaspiConnectionsForUser('u1')
    const wipe = order.findIndex(w => w.table === 'kaspi_shop_connections' && w.op === 'update')
    const firstDelete = order.findIndex(w => w.op === 'delete')
    expect(wipe).toBeGreaterThanOrEqual(0)
    expect(order[wipe].payload).toEqual({
      session_cookies: null, api_token_enc: null, session_status: 'session_expired', status: 'error', paused: true,
    })
    expect(wipe).toBeLessThan(firstDelete)
  })

  it('when row deletion fails the secrets are still gone and the caller is told rows remain', async () => {
    state.db.fail.add('kaspi_shop_tracked_products:delete')
    const res = await purgeKaspiConnectionsForUser('u1')
    expect(res).toEqual({ ok: true, connections: 2, rowsRemoved: false })
    const mine = state.db.tables.kaspi_shop_connections.filter(r => r.user_id === 'u1')
    expect(mine).toHaveLength(2)
    for (const row of mine) {
      expect(row.session_cookies).toBeNull()
      expect(row.api_token_enc).toBeNull()
      expect(row.session_status).toBe('session_expired')
      expect(row.status).toBe('error')
    }
    // Чужой продавец не тронут.
    expect(state.db.tables.kaspi_shop_connections.find(r => r.id === 'c3')!.session_cookies).toBe(SECRET)
  })

  it('reports failure (caller must NOT delete the account) when the secrets cannot be wiped', async () => {
    state.db.fail.add('kaspi_shop_connections:update')
    const res = await purgeKaspiConnectionsForUser('u1')
    expect(res.ok).toBe(false)
    expect(state.db.tables.kaspi_shop_tracked_products).toHaveLength(4)
  })

  it('reports failure when the connections cannot even be listed', async () => {
    state.db.fail.add('kaspi_shop_connections:select')
    expect((await purgeKaspiConnectionsForUser('u1')).ok).toBe(false)
  })

  it('is a no-op for a user without Kaspi', async () => {
    expect(await purgeKaspiConnectionsForUser('nobody')).toEqual({ ok: true, connections: 0, rowsRemoved: true })
    expect(state.db.writes).toHaveLength(0)
  })

  it('handles more products than one query chunk', async () => {
    state.db.tables.kaspi_shop_tracked_products = Array.from({ length: 250 }, (_, i) => ({ id: `big${i}`, connection_id: 'c1' }))
    state.db.tables.kaspi_shop_product_city_prices = Array.from({ length: 250 }, (_, i) => ({ id: `bp${i}`, tracked_product_id: `big${i}` }))
    const res = await purgeKaspiConnectionsForUser('u1')
    expect(res).toMatchObject({ ok: true, rowsRemoved: true })
    expect(state.db.tables.kaspi_shop_tracked_products).toHaveLength(0)
    expect(state.db.tables.kaspi_shop_product_city_prices).toHaveLength(0)
  })

  it('never touches the financial ledger', async () => {
    await purgeKaspiConnectionsForUser('u1')
    expect(state.db.tables.wallet_ledger).toHaveLength(1)
    expect(state.db.writes.some(w => w.table === 'wallet_ledger')).toBe(false)
  })
})

describe('markSessionExpired (K45)', () => {
  it('marks the connection and notifies its owner with the store name', async () => {
    await markSessionExpired('c1')
    expect(state.db.tables.kaspi_shop_connections.find(r => r.id === 'c1')!.session_status).toBe('session_expired')
    expect(notifySessionExpired).toHaveBeenCalledTimes(1)
    expect(notifySessionExpired).toHaveBeenCalledWith(expect.anything(), 'u1', ['Shop One'])
  })

  it('still throws when the status cannot be written, and sends nothing', async () => {
    state.db.fail.add('kaspi_shop_connections:update')
    await expect(markSessionExpired('c1')).rejects.toThrow(/markSessionExpired failed/)
    expect(notifySessionExpired).not.toHaveBeenCalled()
  })

  it('does not notify for an unknown connection id', async () => {
    await markSessionExpired('missing')
    expect(notifySessionExpired).not.toHaveBeenCalled()
  })
})

describe('saveConnection (K45 episode reset)', () => {
  it('a successful reconnect with a session resets the outage notice allowance', async () => {
    await saveConnection({ userId: 'u1', sessionCookies: 'cookie=1', merchantId: 'm1', companyName: 'Shop One' })
    expect(resetSessionExpiredNotices).toHaveBeenCalledWith(expect.anything(), 'u1')
  })

  it('a save without session cookies does not reset it', async () => {
    await saveConnection({ userId: 'u1', apiToken: 'tok', merchantId: 'm1', companyName: 'Shop One' })
    expect(resetSessionExpiredNotices).not.toHaveBeenCalled()
  })
})
