import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  /** id челленджа -> строка; delete().maybeSingle() забирает её (RETURNING). */
  challenges: new Map<string, { challenge: string; created_at: string }>(),
  creds: new Map<string, any>(),
  dbCalls: [] as string[],
  verify: vi.fn(),
  authEmail: 'owner@example.com' as string | null,
  linkUserId: 'user-1',
  generateLink: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      h.dbCalls.push(table)
      const q: any = { op: 'select', filters: {} as Record<string, any> }
      const b: any = {
        select() { return b },
        delete() { q.op = 'delete'; return b },
        update() { q.op = 'update'; return b },
        eq(col: string, val: any) { q.filters[col] = val; return b },
        async maybeSingle() {
          if (table === 'webauthn_challenges' && q.op === 'delete') {
            const row = h.challenges.get(q.filters.id)
            h.challenges.delete(q.filters.id)
            return { data: row ?? null, error: null }
          }
          return { data: null, error: null }
        },
        async single() {
          if (table === 'webauthn_credentials') {
            const row = h.creds.get(q.filters.credential_id)
            return row ? { data: row, error: null } : { data: null, error: { message: 'no rows' } }
          }
          return { data: null, error: { message: 'no rows' } }
        },
        then(res: any, rej: any) { return Promise.resolve({ data: null, error: null }).then(res, rej) },
      }
      return b
    },
    auth: {
      admin: {
        getUserById: async () => (h.authEmail
          ? { data: { user: { email: h.authEmail } }, error: null }
          : { data: { user: null }, error: { message: 'x' } }),
        generateLink: h.generateLink,
      },
    },
  }),
}))
vi.mock('@simplewebauthn/server', () => ({ verifyAuthenticationResponse: (...a: any[]) => h.verify(...a) }))

import { POST } from './route'
import { resetWebauthnGuards, LOGIN_VERIFY_PER_IP_PER_MIN } from '@/lib/webauthnGuards'
import { CHALLENGE_TTL_MS } from '@/lib/webauthn'

const NOW = Date.parse('2026-11-03T10:00:00Z')
const CID = '11111111-1111-4111-8111-111111111111'

function req(body: unknown, ip = '203.0.113.5', raw?: string) {
  return new Request('https://invoices.kz/api/webauthn/login-verify', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip, 'content-type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  }) as any
}
const goodBody = (over: Record<string, unknown> = {}) => ({ challengeId: CID, response: { id: 'cred-abc', type: 'public-key' }, ...over })

function seedChallenge(ageMs = 1000, id = CID) {
  h.challenges.set(id, { challenge: 'expected-challenge', created_at: new Date(NOW - ageMs).toISOString() })
}
function seedCred() {
  h.creds.set('cred-abc', { id: 'row-1', user_id: 'user-1', public_key: Buffer.from('pk').toString('base64url'), counter: 3, transports: null })
}

beforeEach(() => {
  h.challenges.clear()
  h.creds.clear()
  h.dbCalls.length = 0
  h.authEmail = 'owner@example.com'
  h.linkUserId = 'user-1'
  h.verify.mockReset()
  h.verify.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 4 } })
  h.generateLink.mockReset()
  h.generateLink.mockImplementation(async () => ({
    data: { user: { id: h.linkUserId }, properties: { hashed_token: 'hash-xyz' } }, error: null,
  }))
  resetWebauthnGuards()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.useRealTimers())

describe('POST /api/webauthn/login-verify -- success path stays the same', () => {
  it('returns the tokenHash for a valid assertion', async () => {
    seedChallenge(); seedCred()
    const r = await POST(req(goodBody()))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ tokenHash: 'hash-xyz' })
    expect(h.verify).toHaveBeenCalledTimes(1)
    expect(h.verify.mock.calls[0][0].expectedChallenge).toBe('expected-challenge')
  })

  it('does not hand out a session when the magic link belongs to another user', async () => {
    seedChallenge(); seedCred()
    h.linkUserId = 'someone-else'
    const r = await POST(req(goodBody()))
    expect(r.status).toBe(500)
    expect(JSON.stringify(await r.json())).not.toContain('hash-xyz')
  })
})

describe('POST /api/webauthn/login-verify -- input handling', () => {
  it.each([
    ['broken JSON', undefined, '{nope'],
    ['empty body', undefined, ''],
    ['JSON null', null, undefined],
    ['missing challengeId', { response: { id: 'cred-abc' } }, undefined],
    ['numeric challengeId', goodBody({ challengeId: 5 }), undefined],
    ['object challengeId', goodBody({ challengeId: { $ne: '' } }), undefined],
    ['object response.id', goodBody({ response: { id: { a: 1 } } }), undefined],
    ['missing response', { challengeId: CID }, undefined],
  ])('answers 400 Missing params for %s without touching the database', async (_name, body, raw) => {
    const r = await POST(req(body, '203.0.113.5', raw))
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe('Missing params')
    expect(h.dbCalls).toHaveLength(0)
    expect(h.verify).not.toHaveBeenCalled()
  })
})

describe('POST /api/webauthn/login-verify -- failures do not leak details', () => {
  it('replaces a thrown library message with a generic one', async () => {
    seedChallenge(); seedCred()
    h.verify.mockRejectedValue(new Error('Unexpected authentication response origin "https://evil.example", expected ["https://invoices.kz"] / challenge expected-challenge'))
    const r = await POST(req(goodBody()))
    expect(r.status).toBe(400)
    const text = JSON.stringify(await r.json())
    expect(text).toBe('{"error":"Verification failed"}')
    expect(text).not.toContain('invoices.kz')
    expect(text).not.toContain('expected-challenge')
    expect(console.error).toHaveBeenCalled()
  })

  it('an unknown or expired challenge gets the same generic expiry answer', async () => {
    const unknown = await POST(req(goodBody()))
    expect(unknown.status).toBe(400)
    expect((await unknown.json()).error).toBe('Challenge expired, try again')

    seedChallenge(CHALLENGE_TTL_MS + 1000); seedCred()
    const expired = await POST(req(goodBody()))
    expect(expired.status).toBe(400)
    expect((await expired.json()).error).toBe('Challenge expired, try again')
    expect(h.verify).not.toHaveBeenCalled()
  })

  it('an unknown passkey is a plain 400', async () => {
    seedChallenge()
    const r = await POST(req(goodBody()))
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe('Unknown passkey')
  })
})

describe('POST /api/webauthn/login-verify -- the challenge is single use', () => {
  it('a replayed response with the same challenge is refused after a success', async () => {
    seedChallenge(); seedCred()
    expect((await POST(req(goodBody()))).status).toBe(200)
    const replay = await POST(req(goodBody()))
    expect(replay.status).toBe(400)
    expect((await replay.json()).error).toBe('Challenge expired, try again')
    expect(h.verify).toHaveBeenCalledTimes(1)
  })

  it('a failed verification burns the challenge too: no second attempt at the same one', async () => {
    seedChallenge(); seedCred()
    h.verify.mockRejectedValueOnce(new Error('bad signature'))
    expect((await POST(req(goodBody()))).status).toBe(400)
    const retry = await POST(req(goodBody()))
    expect(retry.status).toBe(400)
    expect((await retry.json()).error).toBe('Challenge expired, try again')
    expect(h.verify).toHaveBeenCalledTimes(1)
  })

  it('an unverified (but not thrown) result also burns it', async () => {
    seedChallenge(); seedCred()
    h.verify.mockResolvedValueOnce({ verified: false })
    expect((await POST(req(goodBody()))).status).toBe(400)
    expect(h.challenges.has(CID)).toBe(false)
  })

  it('an unknown passkey burns the challenge as well', async () => {
    seedChallenge()
    await POST(req(goodBody()))
    expect(h.challenges.has(CID)).toBe(false)
  })

  it('parallel requests with one challenge: only one gets to verify', async () => {
    seedChallenge(); seedCred()
    const results = await Promise.all([POST(req(goodBody())), POST(req(goodBody())), POST(req(goodBody()))])
    expect(results.filter(r => r.status === 200)).toHaveLength(1)
    expect(h.verify).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/webauthn/login-verify -- per-IP limit', () => {
  it('refuses past the limit before any database access, and not for other IPs', async () => {
    for (let i = 0; i < LOGIN_VERIFY_PER_IP_PER_MIN; i++) await POST(req(goodBody()))
    h.dbCalls.length = 0
    const blocked = await POST(req(goodBody()))
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('Retry-After')).toBe('60')
    expect(h.dbCalls).toHaveLength(0)

    seedChallenge(); seedCred()
    expect((await POST(req(goodBody(), '198.51.100.9'))).status).toBe(200)
  })

  it('opens again after the window', async () => {
    for (let i = 0; i < LOGIN_VERIFY_PER_IP_PER_MIN + 1; i++) await POST(req(goodBody()))
    vi.setSystemTime(NOW + 61_000)
    seedChallenge(0); seedCred() // выдан в NOW, к этому моменту ему 61 с -- в пределах TTL
    expect((await POST(req(goodBody()))).status).toBe(200)
  })
})
