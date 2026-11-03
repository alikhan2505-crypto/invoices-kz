import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'crypto'
import { parseMetaSignedRequest } from './metaSignedRequest'
import { removeMetaConnections } from './metaDataRemoval'

const SECRET = 'ig-app-secret'
const OTHER = 'wa-app-secret'

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
function signed(payload: Record<string, unknown>, secret = SECRET) {
  const p = b64url(JSON.stringify(payload))
  const sig = b64url(createHmac('sha256', secret).update(p).digest())
  return `${sig}.${p}`
}
const GOOD = { algorithm: 'HMAC-SHA256', user_id: '17841400000000001', issued_at: 1793700000 }

describe('parseMetaSignedRequest', () => {
  it('accepts a request signed with any of the configured app secrets', () => {
    expect(parseMetaSignedRequest(signed(GOOD), [SECRET, OTHER])).toMatchObject({ userId: '17841400000000001' })
    expect(parseMetaSignedRequest(signed(GOOD, OTHER), [SECRET, OTHER])).toMatchObject({ userId: '17841400000000001' })
    expect(parseMetaSignedRequest(signed(GOOD), [undefined, SECRET])).not.toBeNull()
  })

  it('accepts a numeric user_id and the algorithm in any case', () => {
    expect(parseMetaSignedRequest(signed({ ...GOOD, user_id: 123456 }), [SECRET])?.userId).toBe('123456')
    expect(parseMetaSignedRequest(signed({ ...GOOD, algorithm: 'hmac-sha256' }), [SECRET])).not.toBeNull()
  })

  it('rejects a forged signature, a tampered payload, no secrets at all, and unknown algorithms', () => {
    expect(parseMetaSignedRequest(signed(GOOD, 'attacker-secret'), [SECRET, OTHER])).toBeNull()
    const [sig] = signed(GOOD).split('.')
    expect(parseMetaSignedRequest(`${sig}.${b64url(JSON.stringify({ ...GOOD, user_id: '999' }))}`, [SECRET])).toBeNull()
    expect(parseMetaSignedRequest(signed(GOOD), [])).toBeNull()
    expect(parseMetaSignedRequest(signed(GOOD), [undefined, ''])).toBeNull()
    expect(parseMetaSignedRequest(signed({ ...GOOD, algorithm: 'none' }), [SECRET])).toBeNull()
  })

  it('rejects malformed input and non-numeric user ids', () => {
    for (const bad of [null, undefined, 42, '', 'abc', 'a.b.c', '.', 'sig.', '.payload', 'x'.repeat(5000)]) {
      expect(parseMetaSignedRequest(bad, [SECRET])).toBeNull()
    }
    expect(parseMetaSignedRequest(signed({ ...GOOD, user_id: '1; drop table' }), [SECRET])).toBeNull()
    expect(parseMetaSignedRequest(signed({ ...GOOD, user_id: undefined }), [SECRET])).toBeNull()
    expect(parseMetaSignedRequest(`${b64url('x')}.${b64url('not json')}`, [SECRET])).toBeNull()
  })
})

describe('removeMetaConnections', () => {
  const calls: Array<Record<string, unknown>> = []
  let deleteResult: { data: Array<{ id: string }> | null; error: { message: string } | null }
  const fake = () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = { table }
      const b = {
        delete() { q.op = 'delete'; return b },
        in(col: string, vals: string[]) { q.in = [col, vals]; return b },
        eq(col: string, val: string) { q.eq = [col, val]; return b },
        select: async () => { calls.push(q); return deleteResult },
      }
      return b
    },
  }) as never

  beforeEach(() => {
    calls.length = 0
    deleteResult = { data: [{ id: 'c1' }], error: null }
    process.env.INSTAGRAM_APP_SECRET = SECRET
    process.env.WHATSAPP_APP_SECRET = OTHER
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => { vi.restoreAllMocks() })

  const form = (signedRequest: string | null) => new URLSearchParams(signedRequest === null ? {} : { signed_request: signedRequest })

  it('deletes only the instagram/whatsapp connections of the signed user id', async () => {
    const r = await removeMetaConnections(fake(), form(signed(GOOD)))
    expect(r).toEqual({ ok: true, removed: 1, userId: '17841400000000001' })
    expect(calls).toEqual([{ table: 'ai_agent_channel_connections', op: 'delete', in: ['channel', ['instagram', 'whatsapp']], eq: ['external_account_id', '17841400000000001'] }])
  })

  it('an unsigned or wrongly signed request deletes nothing', async () => {
    expect(await removeMetaConnections(fake(), form(null))).toEqual({ ok: false, removed: 0, userId: null })
    expect(await removeMetaConnections(fake(), form(signed(GOOD, 'attacker')))).toEqual({ ok: false, removed: 0, userId: null })
    expect(calls).toHaveLength(0)
  })

  it('a database failure is reported as not ok, with the user id kept for the caller', async () => {
    deleteResult = { data: null, error: { message: 'boom' } }
    expect(await removeMetaConnections(fake(), form(signed(GOOD)))).toEqual({ ok: false, removed: 0, userId: '17841400000000001' })
  })

  it('a user without connections is still a success (nothing to remove)', async () => {
    deleteResult = { data: [], error: null }
    expect(await removeMetaConnections(fake(), form(signed(GOOD)))).toEqual({ ok: true, removed: 0, userId: '17841400000000001' })
  })
})
