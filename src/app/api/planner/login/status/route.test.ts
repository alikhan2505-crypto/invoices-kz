import { describe, it, expect, vi, beforeEach } from 'vitest'

// Минимальный in-memory двойник Supabase для planner_sessions / salon_sites:
// достаточно eq/gt-фильтров, select/delete и maybeSingle.
const h = vi.hoisted(() => ({
  sessions: [] as Array<Record<string, unknown>>,
  sites: [] as Array<Record<string, unknown>>,
}))

function builder(table: string) {
  const filters: Array<(r: Record<string, unknown>) => boolean> = []
  let op: 'select' | 'delete' = 'select'
  const rows = () => (table === 'planner_sessions' ? h.sessions : h.sites)
  const api = {
    select() { return api },
    delete() { op = 'delete'; return api },
    eq(col: string, val: unknown) { filters.push((r) => r[col] === val); return api },
    gt(col: string, val: unknown) { filters.push((r) => String(r[col]) > String(val)); return api },
    async maybeSingle() {
      const list = rows()
      const hit = list.find((r) => filters.every((f) => f(r)))
      if (!hit) return { data: null, error: null }
      if (op === 'delete') list.splice(list.indexOf(hit), 1)
      return { data: hit, error: null }
    },
  }
  return api
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t: string) => builder(t) }) }))
vi.mock('@/lib/plannerSession', () => ({ signPlannerCookie: () => 'signed-cookie' }))

import { GET } from './route'

const FUTURE = () => new Date(Date.now() + 60_000).toISOString()
const PAST = () => new Date(Date.now() - 60_000).toISOString()
const call = (code: string) => GET({ nextUrl: new URL(`https://invoices.kz/api/planner/login/status?code=${code}`) } as any)

beforeEach(() => {
  h.sessions.length = 0
  h.sites.length = 0
  h.sites.push({ id: 'site-1', slug: 'salon' })
})

describe('GET /api/planner/login/status', () => {
  it('pending code answers pending, no cookie', async () => {
    h.sessions.push({ code: 'c1', status: 'pending', site_id: 'site-1', owner_profile_id: null, expires_at: FUTURE() })
    const r = await call('c1')
    expect((await r.json()).status).toBe('pending')
    expect(r.headers.get('set-cookie')).toBeNull()
  })

  it('confirmed code sets the cookie once, then the row is gone', async () => {
    h.sessions.push({ code: 'c2', status: 'confirmed', site_id: 'site-1', owner_profile_id: 'owner-1', expires_at: FUTURE() })
    const first = await call('c2')
    expect((await first.json()).status).toBe('confirmed')
    expect(first.headers.get('set-cookie')).toContain('signed-cookie')
    expect(h.sessions).toHaveLength(0)

    const replay = await call('c2')
    expect((await replay.json()).status).toBe('expired')
    expect(replay.headers.get('set-cookie')).toBeNull()
  })

  it('a confirmed but expired code never mints a cookie', async () => {
    h.sessions.push({ code: 'c3', status: 'confirmed', site_id: 'site-1', owner_profile_id: 'owner-1', expires_at: PAST() })
    const r = await call('c3')
    expect((await r.json()).status).toBe('expired')
    expect(r.headers.get('set-cookie')).toBeNull()
  })

  it('unknown or empty code gives expired / 400', async () => {
    expect((await (await call('nope')).json()).status).toBe('expired')
    expect((await call('')).status).toBe(400)
  })
})
