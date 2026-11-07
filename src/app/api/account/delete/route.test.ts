import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSecDb, type SecDb } from '@/lib/kaspiShop/secDb.testkit'

const { state, getUser, deleteUser } = vi.hoisted(() => ({
  state: { db: null as unknown as SecDb },
  getUser: vi.fn(),
  deleteUser: vi.fn(),
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser, admin: { deleteUser } },
    from: (t: string) => state.db.client.from(t),
  }),
}))
vi.mock('@/lib/kaspiShop/sessionExpiredNotice', () => ({
  notifySessionExpired: vi.fn(), resetSessionExpiredNotices: vi.fn(),
}))

import { POST } from './route'

function req(body: unknown = { confirmText: 'INVOICES.KZ' }) {
  return new Request('http://localhost/api/account/delete', {
    method: 'POST',
    headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest
}

const SECRET = 'enc-secret'
function seed(profileExtra: Record<string, any> = {}): SecDb {
  return makeSecDb({
    profiles: [{ id: 'u1', company_name: 'Acme', email: 'a@b.kz', bin_iin: null, created_at: '2026-01-01T00:00:00Z', deleted_at: null, is_admin: false, ...profileExtra }],
    kaspi_shop_connections: [
      { id: 'c1', user_id: 'u1', merchant_id: 'm1', session_cookies: SECRET, api_token_enc: SECRET, session_status: 'active', status: 'active', paused: false, storefront_published: true },
      { id: 'c2', user_id: 'u1', merchant_id: 'm2', session_cookies: SECRET, api_token_enc: null, session_status: 'active', status: 'active', paused: false, storefront_published: false },
      { id: 'c9', user_id: 'u9', merchant_id: 'm9', session_cookies: SECRET, api_token_enc: SECRET, session_status: 'active', status: 'active', paused: false, storefront_published: true },
    ],
    kaspi_shop_tracked_products: [{ id: 'p1', connection_id: 'c1' }, { id: 'p9', connection_id: 'c9' }],
    kaspi_shop_product_city_prices: [{ id: 'x1', tracked_product_id: 'p1' }],
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => '' })))
  process.env.INTERNAL_API_SECRET = 'x'
  state.db = seed()
  getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.kz' } } })
  deleteUser.mockResolvedValue({ error: null })
})

describe('POST /api/account/delete: Kaspi session (K47)', () => {
  it('removes every Kaspi connection of the user (cookies, token, products) before reporting success, and leaves other sellers alone', async () => {
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    const t = state.db.tables
    expect(t.kaspi_shop_connections.filter(r => r.user_id === 'u1')).toHaveLength(0)
    expect(t.kaspi_shop_connections.map(r => r.id)).toEqual(['c9'])
    expect(t.kaspi_shop_connections[0].session_cookies).toBe(SECRET)
    expect(t.kaspi_shop_tracked_products.map(r => r.id)).toEqual(['p9'])
    expect(t.kaspi_shop_product_city_prices).toHaveLength(0)
    expect(deleteUser).toHaveBeenCalledWith('u1')
  })

  it('the secrets are wiped before the auth user is deleted', async () => {
    deleteUser.mockImplementation(async () => {
      const mine = state.db.tables.kaspi_shop_connections.filter(r => r.user_id === 'u1')
      expect(mine.every(r => r.session_cookies === null && r.api_token_enc === null)).toBe(true)
      return { error: null }
    })
    expect((await POST(req())).status).toBe(200)
    expect(deleteUser).toHaveBeenCalledTimes(1)
  })

  it('does NOT delete the account (500, retryable) when the Kaspi secrets cannot be wiped', async () => {
    state.db.fail.add('kaspi_shop_connections:update')
    const res = await POST(req())
    // stopBackgroundActivity тоже пишет в эту таблицу, но его сбой не блокирует; блокирует затирание секретов.
    expect(res.status).toBe(500)
    expect((await res.json()).code).toBe('kaspi_purge_failed')
    expect(deleteUser).not.toHaveBeenCalled()
    expect(state.db.tables.profiles[0].deleted_at).toBeNull()
  })

  it('the retry path (profile already flagged deleted) purges Kaspi too', async () => {
    state.db = seed({ deleted_at: '2026-11-01T00:00:00Z' })
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(state.db.tables.kaspi_shop_connections.filter(r => r.user_id === 'u1')).toHaveLength(0)
    expect(deleteUser).toHaveBeenCalledWith('u1')
  })

  it('the retry path refuses to finish while Kaspi secrets remain', async () => {
    state.db = seed({ deleted_at: '2026-11-01T00:00:00Z' })
    state.db.fail.add('kaspi_shop_connections:update')
    const res = await POST(req())
    expect(res.status).toBe(500)
    expect(deleteUser).not.toHaveBeenCalled()
  })

  it('succeeds for a user who never connected Kaspi', async () => {
    state.db.tables.kaspi_shop_connections = state.db.tables.kaspi_shop_connections.filter(r => r.user_id !== 'u1')
    expect((await POST(req())).status).toBe(200)
    expect(deleteUser).toHaveBeenCalled()
  })

  it('still demands the confirmation phrase and refuses admins before touching Kaspi data', async () => {
    expect((await POST(req({ confirmText: 'nope' }))).status).toBe(400)
    state.db = seed({ is_admin: true })
    expect((await POST(req())).status).toBe(403)
    expect(state.db.tables.kaspi_shop_connections.filter(r => r.user_id === 'u1')).toHaveLength(2)
    expect(state.db.tables.kaspi_shop_connections.find(r => r.id === 'c1')!.session_cookies).toBe(SECRET)
  })
})
