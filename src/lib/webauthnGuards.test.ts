import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  cleanupExpiredChallengesIfDue, resetWebauthnGuards, webauthnClientKey, tooManyAttempts,
  CHALLENGE_CLEANUP_MIN_GAP_MS,
} from './webauthnGuards'
import { CHALLENGE_TTL_MS } from './webauthn'

const T0 = Date.parse('2026-11-03T10:00:00Z')

function fakeClient(opts: { error?: { message: string }; throws?: boolean } = {}) {
  const calls: Array<{ table: string; col: string; val: string }> = []
  const client = {
    from(table: string) {
      return {
        delete() {
          return {
            lt(col: string, val: string) {
              calls.push({ table, col, val })
              if (opts.throws) return Promise.reject(new Error('network down'))
              return Promise.resolve({ error: opts.error ?? null })
            },
          }
        },
      }
    },
  }
  return { client: client as any, calls }
}

beforeEach(() => {
  resetWebauthnGuards()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('cleanupExpiredChallengesIfDue', () => {
  it('deletes only challenges older than the TTL', async () => {
    const { client, calls } = fakeClient()
    expect(await cleanupExpiredChallengesIfDue(client, T0)).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0].table).toBe('webauthn_challenges')
    expect(calls[0].col).toBe('created_at')
    expect(calls[0].val).toBe(new Date(T0 - CHALLENGE_TTL_MS).toISOString())
  })

  it('does not run again inside the gap, however many calls come in', async () => {
    const { client, calls } = fakeClient()
    await cleanupExpiredChallengesIfDue(client, T0)
    for (let i = 1; i <= 50; i++) {
      expect(await cleanupExpiredChallengesIfDue(client, T0 + i * 100)).toBe(false)
    }
    expect(calls).toHaveLength(1)
  })

  it('runs again once the gap has passed', async () => {
    const { client, calls } = fakeClient()
    await cleanupExpiredChallengesIfDue(client, T0)
    expect(await cleanupExpiredChallengesIfDue(client, T0 + CHALLENGE_CLEANUP_MIN_GAP_MS - 1)).toBe(false)
    expect(await cleanupExpiredChallengesIfDue(client, T0 + CHALLENGE_CLEANUP_MIN_GAP_MS)).toBe(true)
    expect(calls).toHaveLength(2)
  })

  it('a failing or throwing cleanup never breaks the caller', async () => {
    const a = fakeClient({ error: { message: 'boom' } })
    await expect(cleanupExpiredChallengesIfDue(a.client, T0)).resolves.toBe(true)
    resetWebauthnGuards()
    const b = fakeClient({ throws: true })
    await expect(cleanupExpiredChallengesIfDue(b.client, T0)).resolves.toBe(true)
  })

  it('claims the slot before the delete finishes, so parallel requests do not all clean up', async () => {
    const { client, calls } = fakeClient()
    const results = await Promise.all(Array.from({ length: 10 }, () => cleanupExpiredChallengesIfDue(client, T0)))
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(calls).toHaveLength(1)
  })
})

describe('webauthnClientKey', () => {
  it('uses the first x-forwarded-for address', () => {
    expect(webauthnClientKey(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7')
  })
  it('collapses an IPv6 privacy-extension tail to the /64', () => {
    const a = webauthnClientKey(new Headers({ 'x-forwarded-for': '2001:db8:1:2:aaaa:bbbb:cccc:dddd' }))
    const b = webauthnClientKey(new Headers({ 'x-forwarded-for': '2001:db8:1:2:1111:2222:3333:4444' }))
    expect(a).toBe(b)
  })
})

describe('tooManyAttempts', () => {
  it('is a 429 with Retry-After and a generic message', async () => {
    const r = tooManyAttempts()
    expect(r.status).toBe(429)
    expect(r.headers.get('Retry-After')).toBe('60')
    expect((await r.json()).error).toMatch(/too many/i)
  })
})
