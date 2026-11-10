import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSecDb, type SecDb } from './secDb.testkit'

const { state, notifySessionExpired, resetSessionExpiredNotices, refreshSessionSilently, probeSession } = vi.hoisted(() => ({
  state: { db: null as unknown as SecDb },
  notifySessionExpired: vi.fn(async () => ({ status: 'sent', telegram: true })),
  resetSessionExpiredNotices: vi.fn(async () => {}),
  refreshSessionSilently: vi.fn(),
  probeSession: vi.fn(),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t: string) => state.db.client.from(t) }) }))
vi.mock('@/lib/kaspiShop/sessionExpiredNotice', () => ({ notifySessionExpired, resetSessionExpiredNotices }))
vi.mock('@/lib/kaspiShop/cabinetAuth', () => ({ refreshSessionSilently, probeSession }))

import { markSessionExpired, purgeKaspiConnectionsForUser, saveConnection, refreshStoredSession } from './connection'
import { encryptAtRest, decryptAtRest } from '@/lib/kaspiPay/crypto'

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

  it('a real SMS reconnect stamps the session timestamp used by the silent refresh schedule', async () => {
    await saveConnection({ userId: 'u1', sessionCookies: 'cookie=1', merchantId: 'm1', companyName: 'Shop One' })
    const upsert = state.db.writes.filter(w => w.op === 'upsert').pop()!
    expect(typeof upsert.payload!.session_refreshed_at).toBe('string')
  })
})

// Тихое продление сессии кабинета без SMS (10.11.2026).
describe('refreshStoredSession', () => {
  const KEY = 'a'.repeat(64)
  const OLD = 'MS_AUTH_SSO=sso1; mc-session=old; mc-sid=oldsid'
  const NEW = 'MS_AUTH_SSO=sso1; mc-session=NEW; mc-sid=NEWSID'
  const row = () => state.db.tables.kaspi_shop_connections.find(r => r.id === 'c9')!
  const logs = () => state.db.tables.kaspi_shop_session_refresh_log ?? []

  beforeEach(() => {
    state.db.tables.kaspi_shop_connections.push({
      id: 'c9', user_id: 'u9', merchant_id: 'm9', company_name: 'Refresh Shop', session_cookies: encryptAtRest(OLD, KEY),
      api_token_enc: null, session_status: 'active', status: 'active', paused: false, is_active: true,
      session_refreshed_at: '2026-11-09T08:44:00.000Z', session_refresh_attempt_at: null,
    })
    refreshSessionSilently.mockReset()
    probeSession.mockReset()
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  it('success: new cookies saved encrypted, status active, timestamps set, one journal row with cookie lifetimes', async () => {
    refreshSessionSilently.mockResolvedValue({ status: 'refreshed', sessionCookies: NEW, notes: ['mc-session:max-age=43200'] })

    const r = await refreshStoredSession('c9', 'cron')

    expect(r).toEqual({ outcome: 'refreshed', sessionCookies: NEW })
    expect(refreshSessionSilently).toHaveBeenCalledWith(OLD)
    expect(decryptAtRest(row().session_cookies, KEY).toString('utf8')).toBe(NEW)
    expect(row().session_status).toBe('active')
    expect(row().session_refreshed_at).not.toBe('2026-11-09T08:44:00.000Z')
    expect(row().session_refresh_attempt_at).toBeTruthy()
    expect(logs()).toHaveLength(1)
    expect(logs()[0]).toMatchObject({ connection_id: 'c9', trigger: 'cron', outcome: 'refreshed', cookie_lifetimes: 'mc-session:max-age=43200' })
    expect(typeof logs()[0].session_age_hours).toBe('number')
    expect(resetSessionExpiredNotices).not.toHaveBeenCalled()
    expect(JSON.stringify(logs())).not.toContain('NEWSID')
  })

  it('a session that was already marked expired comes back to life and the outage notice allowance resets', async () => {
    row().session_status = 'session_expired'
    refreshSessionSilently.mockResolvedValue({ status: 'refreshed', sessionCookies: NEW, notes: [] })

    await refreshStoredSession('c9', 'user')

    expect(row().session_status).toBe('active')
    expect(resetSessionExpiredNotices).toHaveBeenCalledWith(expect.anything(), 'u9')
  })

  it('single sign-on dead on a cron attempt and the old session is dead too: marked expired right away (seller notified)', async () => {
    refreshSessionSilently.mockResolvedValue({ status: 'sso_expired', reason: 'no_session_issued', notes: [] })
    probeSession.mockResolvedValue('invalid')

    const r = await refreshStoredSession('c9', 'cron')

    expect(r).toEqual({ outcome: 'sso_expired', detail: 'no_session_issued' })
    expect(row().session_status).toBe('session_expired')
    expect(notifySessionExpired).toHaveBeenCalledWith(expect.anything(), 'u9', ['Refresh Shop'])
    expect(decryptAtRest(row().session_cookies, KEY).toString('utf8')).toBe(OLD)
    expect(logs()[0]).toMatchObject({ outcome: 'sso_expired', detail: 'no_session_issued' })
  })

  it('single sign-on dead but the old session still works: nothing is marked, the old cookies stay', async () => {
    refreshSessionSilently.mockResolvedValue({ status: 'sso_expired', reason: 'no_session_issued', notes: [] })
    probeSession.mockResolvedValue('valid')

    await refreshStoredSession('c9', 'cron')

    expect(row().session_status).toBe('active')
    expect(notifySessionExpired).not.toHaveBeenCalled()
  })

  it('single sign-on dead but the old session probe is only unknown (Kaspi hiccup): no false alarm to the seller', async () => {
    refreshSessionSilently.mockResolvedValue({ status: 'sso_expired', reason: 'no_session_issued', notes: [] })
    probeSession.mockResolvedValue('unknown')

    await refreshStoredSession('c9', 'cron')

    expect(row().session_status).toBe('active')
    expect(notifySessionExpired).not.toHaveBeenCalled()
  })

  it('on a push-triggered attempt the caller owns the expired mark: this function does not mark or probe', async () => {
    refreshSessionSilently.mockResolvedValue({ status: 'sso_expired', reason: 'session_rejected', notes: [] })

    const r = await refreshStoredSession('c9', 'push')

    expect(r.outcome).toBe('sso_expired')
    expect(probeSession).not.toHaveBeenCalled()
    expect(row().session_status).toBe('active')
    expect(notifySessionExpired).not.toHaveBeenCalled()
  })

  it('Kaspi unreachable: nothing changes except the attempt stamp (so cron backs off), journal says unreachable', async () => {
    refreshSessionSilently.mockResolvedValue({ status: 'unreachable', detail: 'ETIMEDOUT', notes: [] })

    const r = await refreshStoredSession('c9', 'cron')

    expect(r).toEqual({ outcome: 'unreachable', detail: 'ETIMEDOUT' })
    expect(decryptAtRest(row().session_cookies, KEY).toString('utf8')).toBe(OLD)
    expect(row().session_status).toBe('active')
    expect(row().session_refresh_attempt_at).toBeTruthy()
    expect(probeSession).not.toHaveBeenCalled()
  })

  it('a newer session saved while the attempt ran (SMS reconnect) is never overwritten', async () => {
    refreshSessionSilently.mockImplementation(async () => {
      row().session_cookies = encryptAtRest('MS_AUTH_SSO=fromsms; mc-session=SMS; mc-sid=SMS', KEY)
      row().session_refreshed_at = '2026-11-10T07:00:00.000Z'
      return { status: 'refreshed', sessionCookies: NEW, notes: [] }
    })

    const r = await refreshStoredSession('c9', 'cron')

    // Вызывающему отдаётся чужая свежая сессия: на ней можно повторить операцию.
    expect(r).toEqual({ outcome: 'skipped_newer', sessionCookies: 'MS_AUTH_SSO=fromsms; mc-session=SMS; mc-sid=SMS' })
    expect(decryptAtRest(row().session_cookies, KEY).toString('utf8')).toContain('fromsms')
    expect(row().session_refreshed_at).toBe('2026-11-10T07:00:00.000Z')
  })

  it('cookies wiped by account deletion while the attempt ran are never restored', async () => {
    refreshSessionSilently.mockImplementation(async () => {
      row().session_cookies = null
      row().session_status = 'session_expired'
      return { status: 'refreshed', sessionCookies: NEW, notes: [] }
    })

    const r = await refreshStoredSession('c9', 'cron')

    expect(r).toEqual({ outcome: 'skipped_newer' })
    expect(row().session_cookies).toBeNull()
    expect(row().session_status).toBe('session_expired')
  })

  it('an old row without a refresh timestamp gets its first one (compare against null)', async () => {
    row().session_refreshed_at = null
    refreshSessionSilently.mockResolvedValue({ status: 'refreshed', sessionCookies: NEW, notes: [] })

    const r = await refreshStoredSession('c9', 'cron')

    expect(r.outcome).toBe('refreshed')
    expect(row().session_refreshed_at).toBeTruthy()
    expect(logs()[0].session_age_hours).toBeNull()
  })

  it('no stored cookies, unreadable cookies and unknown connection: nothing is tried', async () => {
    row().session_cookies = null
    expect(await refreshStoredSession('c9', 'cron')).toEqual({ outcome: 'no_session' })
    row().session_cookies = 'garbage-not-encrypted'
    expect(await refreshStoredSession('c9', 'cron')).toEqual({ outcome: 'error', detail: 'decrypt_failed' })
    expect(await refreshStoredSession('missing', 'cron')).toEqual({ outcome: 'error', detail: 'connection_not_found' })
    expect(refreshSessionSilently).not.toHaveBeenCalled()
  })

  it('a failing journal insert does not break the refresh', async () => {
    state.db.fail.add('kaspi_shop_session_refresh_log:insert')
    refreshSessionSilently.mockResolvedValue({ status: 'refreshed', sessionCookies: NEW, notes: [] })

    const r = await refreshStoredSession('c9', 'cron')

    expect(r.outcome).toBe('refreshed')
    expect(decryptAtRest(row().session_cookies, KEY).toString('utf8')).toBe(NEW)
  })
})
