import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  inserts: [] as any[],
  deletes: [] as string[],
  insertError: null as null | { message: string },
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      return {
        delete() {
          return { lt(_col: string, val: string) { h.deletes.push(`${table}:${val}`); return Promise.resolve({ error: null }) } }
        },
        insert(row: any) {
          h.inserts.push(row)
          return {
            select() {
              return { single: () => Promise.resolve(h.insertError
                ? { data: null, error: h.insertError }
                : { data: { id: `challenge-${h.inserts.length}` }, error: null }) }
            },
          }
        },
      }
    },
  }),
}))
vi.mock('@simplewebauthn/server', () => ({
  generateAuthenticationOptions: vi.fn(async () => ({ challenge: 'c-' + Math.random().toString(36).slice(2), rpId: 'invoices.kz' })),
}))

import { POST } from './route'
import { resetWebauthnGuards, LOGIN_OPTIONS_PER_IP_PER_MIN, CHALLENGE_CLEANUP_MIN_GAP_MS } from '@/lib/webauthnGuards'

function req(ip = '203.0.113.5') {
  return new Request('https://invoices.kz/api/webauthn/login-options', { method: 'POST', headers: { 'x-forwarded-for': ip } }) as any
}

beforeEach(() => {
  h.inserts.length = 0
  h.deletes.length = 0
  h.insertError = null
  resetWebauthnGuards()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-03T10:00:00Z'))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.useRealTimers())

describe('POST /api/webauthn/login-options', () => {
  it('returns options and a challengeId, and stores exactly one authentication challenge', async () => {
    const r = await POST(req())
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.options.challenge).toBeTruthy()
    expect(body.challengeId).toBe('challenge-1')
    expect(h.inserts).toHaveLength(1)
    expect(h.inserts[0]).toMatchObject({ type: 'authentication', challenge: body.options.challenge })
  })

  it('stops a flood from one IP: nothing is written to the database past the limit', async () => {
    const codes: number[] = []
    for (let i = 0; i < LOGIN_OPTIONS_PER_IP_PER_MIN + 10; i++) codes.push((await POST(req())).status)
    expect(codes.filter(c => c === 200)).toHaveLength(LOGIN_OPTIONS_PER_IP_PER_MIN)
    expect(codes.filter(c => c === 429)).toHaveLength(10)
    // главное: 429 приходит ДО записи -- строк ровно столько, сколько пропущено
    expect(h.inserts).toHaveLength(LOGIN_OPTIONS_PER_IP_PER_MIN)
  })

  it('answers 429 with Retry-After and a message the login page can show', async () => {
    for (let i = 0; i < LOGIN_OPTIONS_PER_IP_PER_MIN; i++) await POST(req())
    const r = await POST(req())
    expect(r.status).toBe(429)
    expect(r.headers.get('Retry-After')).toBe('60')
    expect(typeof (await r.json()).error).toBe('string')
  })

  it('does not block a different IP, and frees the first one after the window', async () => {
    for (let i = 0; i < LOGIN_OPTIONS_PER_IP_PER_MIN + 1; i++) await POST(req())
    expect((await POST(req('198.51.100.9'))).status).toBe(200)
    vi.setSystemTime(Date.now() + 61_000)
    expect((await POST(req())).status).toBe(200)
  })

  it('sweeps expired challenges once per interval, not on every call', async () => {
    for (let i = 0; i < LOGIN_OPTIONS_PER_IP_PER_MIN; i++) await POST(req(`192.0.2.${i + 1}`))
    expect(h.inserts).toHaveLength(LOGIN_OPTIONS_PER_IP_PER_MIN)
    expect(h.deletes).toHaveLength(1)
    expect(h.deletes[0]).toMatch(/^webauthn_challenges:/)

    vi.setSystemTime(Date.now() + CHALLENGE_CLEANUP_MIN_GAP_MS + 1)
    await POST(req('192.0.2.200'))
    expect(h.deletes).toHaveLength(2)
  })

  it('still answers 500 when the challenge cannot be stored', async () => {
    h.insertError = { message: 'db down' }
    const r = await POST(req())
    expect(r.status).toBe(500)
    expect((await r.json()).error).toBe('Failed to start login')
  })
})
