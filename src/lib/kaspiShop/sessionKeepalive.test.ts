import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSecDb, type SecDb } from './secDb.testkit'

// Продление сессий кабинета Kaspi заранее (10.11.2026): кого берём и что при этом не
// трогаем. База и Kaspi подменены: настоящих запросов нет.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'
})

const h = vi.hoisted(() => ({
  db: null as unknown as SecDb,
  calls: [] as Array<{ id: string; trigger: string }>,
  outcome: { outcome: 'refreshed', sessionCookies: 'x' } as any,
  throwFor: new Set<string>(),
  deniedOwners: new Set<string>(),
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t: string) => h.db.client.from(t) }) }))
vi.mock('./connection', () => ({
  SESSION_REFRESH_AFTER_MS: 5 * 3_600_000,
  SESSION_REFRESH_RETRY_MS: 60 * 60_000,
  refreshStoredSession: async (id: string, trigger: string) => {
    h.calls.push({ id, trigger })
    if (h.throwFor.has(id)) throw new Error('db down')
    return h.outcome
  },
}))

vi.mock('./planGate', () => ({
  loadOwnerPlanProfiles: async (ids: (string | null)[]) => new Map(ids.filter(Boolean).map(id => [id as string, { ok: !h.deniedOwners.has(id as string) }])),
  filterByOwnerAccess: (items: any[], ownerOf: (i: any) => string | null, profiles: Map<string, any>) =>
    items.filter(i => profiles.get(ownerOf(i) as string)?.ok),
}))

import { refreshAgingSessions, selectConnectionsToRefresh, KEEPALIVE_MAX_PER_TICK, KEEPALIVE_ENABLED, type KeepaliveRow } from './sessionKeepalive'

const NOW = Date.parse('2026-11-10T12:00:00.000Z')
const ago = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString()
const row = (over: Partial<KeepaliveRow> & { id: string }): KeepaliveRow => ({
  session_status: 'active', paused: false, session_refreshed_at: ago(6), session_refresh_attempt_at: null, ...over,
})

describe('selectConnectionsToRefresh', () => {
  it('takes only live, unpaused sessions older than 5 hours', () => {
    const rows = [
      row({ id: 'old' }),
      row({ id: 'fresh', session_refreshed_at: ago(2) }),
      row({ id: 'just-at-limit', session_refreshed_at: ago(5) }),
      row({ id: 'expired', session_status: 'session_expired' }),
      row({ id: 'paused', paused: true }),
    ]
    expect(selectConnectionsToRefresh(rows, NOW).sort()).toEqual(['just-at-limit', 'old'])
  })

  it('a row with no timestamp is due (age unknown), an empty status counts as active', () => {
    expect(selectConnectionsToRefresh([row({ id: 'a', session_refreshed_at: null, session_status: null })], NOW)).toEqual(['a'])
  })

  it('a recent attempt (success or failure) holds the next one back for an hour', () => {
    const rows = [
      row({ id: 'tried-20m-ago', session_refresh_attempt_at: ago(1 / 3) }),
      row({ id: 'tried-61m-ago', session_refresh_attempt_at: ago(61 / 60) }),
    ]
    expect(selectConnectionsToRefresh(rows, NOW)).toEqual(['tried-61m-ago'])
  })

  it('oldest first, and never more than the per-tick limit', () => {
    const rows = [
      row({ id: 'b', session_refreshed_at: ago(8) }),
      row({ id: 'a', session_refreshed_at: null }),
      row({ id: 'c', session_refreshed_at: ago(7) }),
      row({ id: 'd', session_refreshed_at: ago(6) }),
    ]
    expect(KEEPALIVE_MAX_PER_TICK).toBe(3)
    expect(selectConnectionsToRefresh(rows, NOW)).toEqual(['a', 'b', 'c'])
    expect(selectConnectionsToRefresh(rows, NOW, 1)).toEqual(['a'])
    expect(selectConnectionsToRefresh(rows, NOW, 0)).toEqual([])
  })
})

describe('refreshAgingSessions', () => {
  function seed(rows: Array<Record<string, any>>, products: Array<Record<string, any>>) {
    h.db = makeSecDb({ kaspi_shop_connections: rows, kaspi_shop_tracked_products: products })
  }
  const conn = (id: string, over: Record<string, any> = {}) => ({
    id, user_id: `owner-of-${id}`, session_status: 'active', paused: false, session_refreshed_at: ago(6), session_refresh_attempt_at: null, ...over,
  })

  beforeEach(() => {
    h.calls = []
    h.outcome = { outcome: 'refreshed', sessionCookies: 'x' }
    h.throwFor = new Set()
    h.deniedOwners = new Set()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('only connections with an enabled product are refreshed (nobody else gets extra logins), tagged as cron', async () => {
    seed(
      [conn('with-product'), conn('only-disabled'), conn('no-products')],
      [{ id: 'p1', connection_id: 'with-product', enabled: true }, { id: 'p2', connection_id: 'only-disabled', enabled: false }],
    )
    const r = await refreshAgingSessions(NOW, true)
    expect(h.calls).toEqual([{ id: 'with-product', trigger: 'cron' }])
    expect(r).toEqual({ attempted: 1, refreshed: 1 })
  })

  it('counts only real refreshes: a refused attempt is attempted but not refreshed', async () => {
    seed([conn('c1')], [{ id: 'p1', connection_id: 'c1', enabled: true }])
    h.outcome = { outcome: 'sso_expired', detail: 'no_session_issued' }
    expect(await refreshAgingSessions(NOW, true)).toEqual({ attempted: 1, refreshed: 0 })
  })

  it('experiment 14.11: by default the keepalive is off, nothing is attempted', async () => {
    expect(KEEPALIVE_ENABLED).toBe(false)
    seed([conn('c1')], [{ id: 'p1', connection_id: 'c1', enabled: true }])
    expect(await refreshAgingSessions(NOW)).toEqual({ attempted: 0, refreshed: 0 })
    expect(h.calls).toEqual([])
  })

  it('no enabled products anywhere: no connection lookup beyond the products, nothing attempted', async () => {
    seed([conn('c1')], [])
    expect(await refreshAgingSessions(NOW, true)).toEqual({ attempted: 0, refreshed: 0 })
    expect(h.calls).toEqual([])
  })

  it('one connection failing does not stop the next one', async () => {
    seed(
      [conn('bad', { session_refreshed_at: ago(9) }), conn('good', { session_refreshed_at: ago(7) })],
      [{ id: 'p1', connection_id: 'bad', enabled: true }, { id: 'p2', connection_id: 'good', enabled: true }],
    )
    h.throwFor.add('bad')
    const r = await refreshAgingSessions(NOW, true)
    expect(h.calls.map(c => c.id)).toEqual(['bad', 'good'])
    expect(r).toEqual({ attempted: 2, refreshed: 1 })
  })

  it('owners without Pro access are skipped: no cabinet logins and no alarms for a bot they cannot use', async () => {
    seed(
      [conn('pro'), conn('lapsed')],
      [{ id: 'p1', connection_id: 'pro', enabled: true }, { id: 'p2', connection_id: 'lapsed', enabled: true }],
    )
    h.deniedOwners.add('owner-of-lapsed')
    const r = await refreshAgingSessions(NOW, true)
    expect(h.calls.map(c => c.id)).toEqual(['pro'])
    expect(r).toEqual({ attempted: 1, refreshed: 1 })
  })

  it('a failing lookup is loud (throws), not a silent "nothing to do"', async () => {
    seed([conn('c1')], [{ id: 'p1', connection_id: 'c1', enabled: true }])
    h.db.fail.add('kaspi_shop_tracked_products:select')
    await expect(refreshAgingSessions(NOW, true)).rejects.toThrow(/keepalive tracked products lookup failed/)
  })
})
