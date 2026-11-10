import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { makeSecDb, type SecDb } from '@/lib/kaspiShop/secDb.testkit'

// POST /api/kaspi-shop/session/refresh: тихое продление сессии активного магазина без SMS.
// Ответ только исход, без cookies и без деталей Kaspi (10.11.2026).
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key'
})

const h = vi.hoisted(() => ({
  db: null as unknown as SecDb,
  user: { id: 'u1' } as { id: string } | null,
  gate: null as null | { status: number },
  outcome: { outcome: 'refreshed', sessionCookies: 'secret-cookie' } as any,
  throws: false,
  calls: [] as Array<{ id: string; trigger: string }>,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from: (t: string) => h.db.client.from(t),
  }),
}))
vi.mock('@/lib/kaspiShop/planGate', () => ({
  kaspiShopPlanGate: async () => (h.gate ? NextResponse.json({ error: 'pro' }, { status: h.gate.status }) : null),
}))
vi.mock('@/lib/kaspiShop/connection', () => ({
  refreshStoredSession: async (id: string, trigger: string) => {
    h.calls.push({ id, trigger })
    if (h.throws) throw new Error('db down')
    return h.outcome
  },
}))

import { POST } from './route'

function call(token: string | null = 't') {
  return POST(new NextRequest('http://localhost/api/kaspi-shop/session/refresh', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  }))
}

beforeEach(() => {
  h.user = { id: 'u1' }
  h.gate = null
  h.outcome = { outcome: 'refreshed', sessionCookies: 'secret-cookie' }
  h.throws = false
  h.calls = []
  h.db = makeSecDb({
    kaspi_shop_connections: [
      { id: 'active-1', user_id: 'u1', is_active: true, session_refresh_attempt_at: null },
      { id: 'other-store', user_id: 'u1', is_active: false, session_refresh_attempt_at: null },
      { id: 'foreign', user_id: 'u2', is_active: true, session_refresh_attempt_at: null },
    ],
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/kaspi-shop/session/refresh', () => {
  it('refreshes the ACTIVE store of the caller only, tagged as a user attempt, and never returns cookies', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ status: 'refreshed' })
    expect(JSON.stringify(body)).not.toContain('secret-cookie')
    expect(h.calls).toEqual([{ id: 'active-1', trigger: 'user' }])
  })

  it('no token or an unknown user: 401, nothing tried', async () => {
    expect((await call(null)).status).toBe(401)
    h.user = null
    expect((await call()).status).toBe(401)
    expect(h.calls).toEqual([])
  })

  it('the Pro gate answer is passed through untouched', async () => {
    h.gate = { status: 403 }
    expect((await call()).status).toBe(403)
    expect(h.calls).toEqual([])
  })

  it('no active store: needs_sms, nothing tried', async () => {
    h.db.tables.kaspi_shop_connections = []
    expect(await (await call()).json()).toEqual({ status: 'needs_sms' })
    expect(h.calls).toEqual([])
  })

  it('single sign-on dead or any hard failure: needs_sms (ordinary SMS login follows)', async () => {
    h.outcome = { outcome: 'sso_expired', detail: 'no_session_issued' }
    expect(await (await call()).json()).toEqual({ status: 'needs_sms' })
    h.outcome = { outcome: 'error', detail: 'decrypt_failed' }
    expect(await (await call()).json()).toEqual({ status: 'needs_sms' })
  })

  it('Kaspi unreachable or a newer session already saved: busy, not "SMS needed"', async () => {
    h.outcome = { outcome: 'unreachable', detail: 'ETIMEDOUT' }
    expect(await (await call()).json()).toEqual({ status: 'busy' })
    h.outcome = { outcome: 'skipped_newer' }
    expect(await (await call()).json()).toEqual({ status: 'busy' })
  })

  it('an attempt less than a minute ago: busy, Kaspi is not asked again', async () => {
    h.db.tables.kaspi_shop_connections[0].session_refresh_attempt_at = new Date(Date.now() - 20_000).toISOString()
    expect(await (await call()).json()).toEqual({ status: 'busy' })
    expect(h.calls).toEqual([])
    h.db.tables.kaspi_shop_connections[0].session_refresh_attempt_at = new Date(Date.now() - 90_000).toISOString()
    expect(await (await call()).json()).toEqual({ status: 'refreshed' })
  })

  it('a failing store lookup or refresh is a 500 with a friendly message, no internals', async () => {
    h.db.fail.add('kaspi_shop_connections:select')
    const lookup = await call()
    expect(lookup.status).toBe(500)
    h.db.fail.clear()
    h.throws = true
    const failed = await call()
    expect(failed.status).toBe(500)
    expect(JSON.stringify(await failed.json())).not.toContain('db down')
  })
})
