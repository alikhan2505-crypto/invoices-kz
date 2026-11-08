import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// POST /api/hooks/kaspi-check-dispatch: запускает workflow проверки цен только когда есть
// что проверять, не чаще раза за окно, и честно сообщает о сбое GitHub.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'
})

const h = vi.hoisted(() => ({
  due: [] as unknown[],
  dueError: null as null | string,
  claim: { ok: true, slotKey: 'slot-1', since: 'x' } as any,
  claimCalls: 0,
  released: [] as string[],
  githubStatus: 204,
  githubThrows: false,
  fetchCalls: [] as Array<{ url: string; init: any }>,
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/kaspiShop/checkCycle', () => ({
  getDueTrackedProducts: async () => {
    if (h.dueError) throw new Error(h.dueError)
    return h.due
  },
}))
vi.mock('@/lib/kaspiShop/dispatchGuard', () => ({
  claimDispatchSlot: async () => {
    h.claimCalls += 1
    return h.claim
  },
  releaseDispatchSlot: async (_s: unknown, key: string) => {
    h.released.push(key)
  },
}))

import { POST } from './route'
import { resetThrottle } from '@/lib/hooksGuard'

function call(headers: Record<string, string> = {}) {
  return POST(new NextRequest('http://localhost/api/hooks/kaspi-check-dispatch', { method: 'POST', headers }))
}

beforeEach(() => {
  resetThrottle()
  delete process.env.HOOKS_PG_NET_SECRET
  process.env.KASPI_SHOP_GITHUB_PAT = 'gh-token'
  h.due = [{ id: 'p1' }]
  h.dueError = null
  h.claim = { ok: true, slotKey: 'slot-1', since: 'x' }
  h.claimCalls = 0
  h.released = []
  h.githubStatus = 204
  h.githubThrows = false
  h.fetchCalls = []
  vi.stubGlobal('fetch', async (url: string, init: any) => {
    h.fetchCalls.push({ url, init })
    if (h.githubThrows) throw new Error('network down')
    return { status: h.githubStatus }
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/hooks/kaspi-check-dispatch', () => {
  it('nothing due: no dispatch, no slot taken', async () => {
    h.due = []
    const res = await call()
    expect(await res.json()).toEqual({ ok: true, due: 0, dispatched: false })
    expect(h.fetchCalls).toHaveLength(0)
    expect(h.claimCalls).toBe(0)
  })

  it('something due: dispatches the price-check workflow on main with the token', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, due: 1, dispatched: true })
    expect(h.fetchCalls).toHaveLength(1)
    expect(h.fetchCalls[0].url).toBe('https://api.github.com/repos/alikhan2505-crypto/invoices-kz/actions/workflows/kaspi-shop-price-check.yml/dispatches')
    expect(h.fetchCalls[0].init.headers.Authorization).toBe('Bearer gh-token')
    expect(JSON.parse(h.fetchCalls[0].init.body)).toEqual({ ref: 'main' })
  })

  it('a recent dispatch holds the slot: no second run', async () => {
    h.claim = { ok: false, reason: 'running', retryAfterSeconds: 120, since: 'x' }
    const res = await call()
    expect(await res.json()).toEqual({ ok: true, due: 1, dispatched: false, reason: 'recent' })
    expect(h.fetchCalls).toHaveLength(0)
  })

  it('an unreadable slot counter does not dispatch (503)', async () => {
    h.claim = { ok: false, reason: 'error' }
    expect((await call()).status).toBe(503)
    expect(h.fetchCalls).toHaveLength(0)
  })

  it('GitHub refuses: 502, the slot is given back so the next tick retries, no token echoed', async () => {
    h.githubStatus = 401
    const res = await call()
    expect(res.status).toBe(502)
    expect(JSON.stringify(await res.json())).not.toContain('gh-token')
    expect(h.released).toEqual(['slot-1'])
  })

  it('a dispatch that throws is a 502 and gives the slot back', async () => {
    h.githubThrows = true
    expect((await call()).status).toBe(502)
    expect(h.released).toEqual(['slot-1'])
  })

  it('missing token: loud 500, nothing dispatched, no slot taken', async () => {
    delete process.env.KASPI_SHOP_GITHUB_PAT
    expect((await call()).status).toBe(500)
    expect(h.claimCalls).toBe(0)
    expect(h.fetchCalls).toHaveLength(0)
  })

  it('a failing due query is a 500, not a silent "nothing to do"', async () => {
    h.dueError = 'due tracked products lookup failed: boom'
    expect((await call()).status).toBe(500)
    expect(h.fetchCalls).toHaveLength(0)
  })

  it('with a secret configured the header is required', async () => {
    process.env.HOOKS_PG_NET_SECRET = 's3cret'
    expect((await call()).status).toBe(401)
    expect((await call({ 'x-internal-secret': 'wrong' })).status).toBe(401)
    expect((await call({ 'x-internal-secret': 's3cret' })).status).toBe(200)
  })

  it('a second call within a minute on the same instance is skipped', async () => {
    await call()
    const second = await call()
    expect(await second.json()).toEqual({ ok: true, throttled: true })
    expect(h.fetchCalls).toHaveLength(1)
  })
})
