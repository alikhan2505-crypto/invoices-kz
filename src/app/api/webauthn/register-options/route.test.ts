import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  inserts: [] as any[],
  deletes: [] as string[],
  users: new Map<string, { id: string }>([['tok-a', { id: 'user-a' }], ['tok-b', { id: 'user-b' }]]),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async (token: string) => ({ data: { user: h.users.get(token) ?? null }, error: null }) },
    from(table: string) {
      const b: any = {
        select() { return b },
        eq() { return b },
        single: async () => ({ data: table === 'profiles' ? { email: 'a@example.com' } : null, error: null }),
        delete() { return { lt(_c: string, v: string) { h.deletes.push(v); return Promise.resolve({ error: null }) } } },
        insert(row: any) {
          h.inserts.push(row)
          return { select: () => ({ single: async () => ({ data: { id: `ch-${h.inserts.length}` }, error: null }) }) }
        },
        then(res: any, rej: any) { return Promise.resolve({ data: [], error: null }).then(res, rej) },
      }
      return b
    },
  }),
}))
vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn(async () => ({ challenge: 'reg-challenge' })),
}))

import { POST } from './route'
import { resetWebauthnGuards, REGISTER_OPTIONS_PER_USER_PER_MIN } from '@/lib/webauthnGuards'

function req(token?: string) {
  return new Request('https://invoices.kz/api/webauthn/register-options', {
    method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {},
  }) as any
}

beforeEach(() => {
  h.inserts.length = 0
  h.deletes.length = 0
  resetWebauthnGuards()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-03T10:00:00Z'))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.useRealTimers())

describe('POST /api/webauthn/register-options', () => {
  it('still requires a signed-in user and writes nothing without one', async () => {
    expect((await POST(req())).status).toBe(401)
    expect((await POST(req('bad-token'))).status).toBe(401)
    expect(h.inserts).toHaveLength(0)
  })

  it('returns options and a challengeId for a signed-in user', async () => {
    const r = await POST(req('tok-a'))
    expect(r.status).toBe(200)
    expect((await r.json()).challengeId).toBe('ch-1')
    expect(h.inserts[0]).toMatchObject({ user_id: 'user-a', type: 'registration' })
  })

  it('limits one account per minute and writes nothing past the limit', async () => {
    const codes: number[] = []
    for (let i = 0; i < REGISTER_OPTIONS_PER_USER_PER_MIN + 5; i++) codes.push((await POST(req('tok-a'))).status)
    expect(codes.filter(c => c === 200)).toHaveLength(REGISTER_OPTIONS_PER_USER_PER_MIN)
    expect(codes.filter(c => c === 429)).toHaveLength(5)
    expect(h.inserts).toHaveLength(REGISTER_OPTIONS_PER_USER_PER_MIN)
  })

  it('does not block another account, and frees the first after the window', async () => {
    for (let i = 0; i < REGISTER_OPTIONS_PER_USER_PER_MIN + 1; i++) await POST(req('tok-a'))
    expect((await POST(req('tok-b'))).status).toBe(200)
    vi.setSystemTime(Date.now() + 61_000)
    expect((await POST(req('tok-a'))).status).toBe(200)
  })

  it('sweeps expired challenges once per interval instead of on every call', async () => {
    for (let i = 0; i < REGISTER_OPTIONS_PER_USER_PER_MIN; i++) await POST(req('tok-a'))
    await POST(req('tok-b'))
    expect(h.inserts).toHaveLength(REGISTER_OPTIONS_PER_USER_PER_MIN + 1)
    expect(h.deletes).toHaveLength(1)
  })
})
