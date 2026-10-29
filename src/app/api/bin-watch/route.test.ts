import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({ db: null as any, gateOpen: false, counters: new Map<string, number>() }))

vi.mock('@supabase/supabase-js', () => ({ createClient: () => new Proxy({}, { get: (_t, p) => h.db.client[p] }) }))
vi.mock('@/lib/binLookupServer', () => ({
  performBinLookup: vi.fn(async () => ({ found: false, unavailable: true })),
}))
vi.mock('@/lib/toolQuota', async importOriginal => {
  const real = await importOriginal<typeof import('@/lib/toolQuota')>()
  return {
    ...real,
    registryLoadToday: async () => 0,
    readCounter: async (_s: unknown, key: string) => ({ ok: true as const, used: h.counters.get(key) ?? 0 }),
    claimCounterSlot: async (_s: unknown, key: string, used: number) => {
      h.counters.set(key, used + 1)
      return 'claimed' as const
    },
  }
})
vi.mock('@/lib/binWatch/config', async importOriginal => {
  const real = await importOriginal<typeof import('@/lib/binWatch/config')>()
  return { ...real, canUseBinWatch: (a: boolean | null | undefined) => (h.gateOpen ? true : a === true) }
})

import { makeFakeWatchDb } from '@/lib/binWatch/fakeSupabase.testkit'
import { GET, POST, DELETE } from './route'

const ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const OTHER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const TOKENS: Record<string, string> = { 'tok-admin': ADMIN, 'tok-user': USER, 'tok-other': OTHER }

function freshDb() {
  const db = makeFakeWatchDb({
    profiles: [
      { id: ADMIN, is_admin: true, plan: 'free' },
      { id: USER, is_admin: false, plan: 'free' },
      { id: OTHER, is_admin: false, plan: 'pro', plan_expires_at: '2099-01-01T00:00:00' },
    ],
  })
  ;(db.client as any).auth = {
    getUser: async (token: string) => (TOKENS[token]
      ? { data: { user: { id: TOKENS[token] } }, error: null }
      : { data: { user: null }, error: { message: 'bad jwt' } }),
  }
  return db
}

const req = (method: string, token: string | null, opts: { body?: unknown; qs?: string } = {}) =>
  new NextRequest(`http://localhost/api/bin-watch${opts.qs ?? ''}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })

beforeEach(() => { h.db = freshDb(); h.gateOpen = false; h.counters.clear() })

describe('вход и админ-гейт', () => {
  it('без токена и с поддельным токеном - 401', async () => {
    expect((await GET(req('GET', null))).status).toBe(401)
    expect((await GET(req('GET', 'forged'))).status).toBe(401)
    expect((await POST(req('POST', null, { body: { bin: '123456789012' } }))).status).toBe(401)
    expect((await DELETE(req('DELETE', null, { qs: `?id=${OTHER}` }))).status).toBe(401)
  })

  it('пока гейт закрыт, обычному пользователю - 403 admin_only на чтение и добавление', async () => {
    const g = await GET(req('GET', 'tok-user'))
    expect(g.status).toBe(403)
    expect((await g.json()).error).toBe('admin_only')
    const p = await POST(req('POST', 'tok-user', { body: { bin: '123456789012' } }))
    expect(p.status).toBe(403)
    expect(h.db.tables.bin_watch ?? []).toHaveLength(0)
  })

  it('админ добавляет и видит список', async () => {
    const p = await POST(req('POST', 'tok-admin', { body: { bin: '123456789012' } }))
    expect(p.status).toBe(200)
    expect(await p.json()).toMatchObject({ ok: true, status: 'added', limit: 50, count: 1 })
    const g = await (await GET(req('GET', 'tok-admin'))).json()
    expect(g.items).toHaveLength(1)
    expect(g.limit).toBe(50)
  })
})

describe('лимиты через API', () => {
  it('Free (гейт открыт): 5 БИН, шестой - 403 limit; повтор существующего лимит не тратит', async () => {
    h.gateOpen = true
    for (let i = 0; i < 5; i++) {
      expect((await POST(req('POST', 'tok-user', { body: { bin: String(100000000000 + i) } }))).status).toBe(200)
    }
    const sixth = await POST(req('POST', 'tok-user', { body: { bin: '100000000099' } }))
    expect(sixth.status).toBe(403)
    expect(await sixth.json()).toMatchObject({ error: 'limit', limit: 5 })
    const again = await POST(req('POST', 'tok-user', { body: { bin: '100000000002' } }))
    expect(again.status).toBe(200)
    expect((await again.json()).status).toBe('already')
  })

  it('Про: пределы шире (на шестом не отказывает)', async () => {
    h.gateOpen = true
    for (let i = 0; i < 6; i++) {
      expect((await POST(req('POST', 'tok-other', { body: { bin: String(100000000000 + i) } }))).status).toBe(200)
    }
  })

  it('невалидный БИН - 400, в базу ничего не пишется', async () => {
    const r = await POST(req('POST', 'tok-admin', { body: { bin: '12345' } }))
    expect(r.status).toBe(400)
    expect(h.db.tables.bin_watch ?? []).toHaveLength(0)
  })
})

describe('чужие данные', () => {
  it('user_id из тела запроса игнорируется: строка пишется на владельца токена', async () => {
    await POST(req('POST', 'tok-admin', { body: { bin: '123456789012', user_id: USER, userId: USER } }))
    expect(h.db.tables.bin_watch).toHaveLength(1)
    expect(h.db.tables.bin_watch[0].user_id).toBe(ADMIN)
  })

  it('чужие строки в списке не видны, служебные поля не отдаются', async () => {
    h.db.tables.bin_watch = [
      { id: 'a1', user_id: ADMIN, bin: '111111111111', name: 'Мой', baseline: { taxDebt: true }, last_result: null, pending_changes: ['taxDebt'], created_at: '2026-10-29T00:00:00Z' },
      { id: 'b1', user_id: USER, bin: '222222222222', name: 'Чужой', baseline: null, last_result: null, pending_changes: [], created_at: '2026-10-29T00:00:00Z' },
    ]
    const body = await (await GET(req('GET', 'tok-admin'))).json()
    expect(body.items.map((i: any) => i.bin)).toEqual(['111111111111'])
    const keys = Object.keys(body.items[0])
    expect(keys).not.toContain('user_id')
    expect(keys).not.toContain('baseline')
    expect(keys).not.toContain('pending_changes')
  })

  it('удалить чужую строку нельзя (404), свою можно, даже когда гейт закрыт', async () => {
    const mine = '11111111-1111-4111-8111-111111111111'
    const theirs = '22222222-2222-4222-8222-222222222222'
    h.db.tables.bin_watch = [
      { id: mine, user_id: USER, bin: '111111111111', pending_changes: [] },
      { id: theirs, user_id: ADMIN, bin: '222222222222', pending_changes: [] },
    ]
    const foreign = await DELETE(req('DELETE', 'tok-user', { qs: `?id=${theirs}` }))
    expect(foreign.status).toBe(404)
    expect(h.db.tables.bin_watch).toHaveLength(2)
    const own = await DELETE(req('DELETE', 'tok-user', { qs: `?id=${mine}` }))
    expect(own.status).toBe(200)
    expect(h.db.tables.bin_watch.map((r: any) => r.id)).toEqual([theirs])
  })

  it('кривой id - 400', async () => {
    expect((await DELETE(req('DELETE', 'tok-admin', { qs: '?id=1%20or%201=1' }))).status).toBe(400)
  })

  it('удалённый аккаунт - 403', async () => {
    h.db.tables.profiles.find((p: any) => p.id === ADMIN).deleted_at = '2026-10-01T00:00:00Z'
    expect((await GET(req('GET', 'tok-admin'))).status).toBe(403)
  })
})

describe('до применения SQL', () => {
  it('таблицы нет - 503 not_ready, а не 500', async () => {
    h.db.missing.add('bin_watch')
    const g = await GET(req('GET', 'tok-admin'))
    expect(g.status).toBe(503)
    expect((await g.json()).error).toBe('not_ready')
    expect((await POST(req('POST', 'tok-admin', { body: { bin: '123456789012' } }))).status).toBe(503)
  })
})

