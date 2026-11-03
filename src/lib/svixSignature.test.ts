import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { verifySvixSignature } from './svixSignature'

const SECRET_BYTES = Buffer.from('0123456789abcdef0123456789abcdef')
const SECRET = `whsec_${SECRET_BYTES.toString('base64')}`
const NOW = Date.UTC(2026, 10, 3, 12, 0, 0)
const TS = String(Math.floor(NOW / 1000))
const BODY = '{"type":"email.received","data":{"email_id":"e1"}}'

const sign = (id: string, ts: string, body: string, key: Buffer = SECRET_BYTES) =>
  createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64')

const headers = (over: Record<string, string> = {}) =>
  new Headers({ 'svix-id': 'msg_1', 'svix-timestamp': TS, 'svix-signature': `v1,${sign('msg_1', TS, BODY)}`, ...over })

describe('verifySvixSignature', () => {
  it('accepts a correctly signed body', () => {
    expect(verifySvixSignature(headers(), BODY, SECRET, NOW)).toBe(true)
  })

  it('accepts the secret without the whsec_ prefix', () => {
    expect(verifySvixSignature(headers(), BODY, SECRET_BYTES.toString('base64'), NOW)).toBe(true)
  })

  it('accepts when one of several signatures matches (key rotation)', () => {
    const h = headers({ 'svix-signature': `v1,${sign('msg_1', TS, BODY, Buffer.from('other-key'))} v1,${sign('msg_1', TS, BODY)}` })
    expect(verifySvixSignature(h, BODY, SECRET, NOW)).toBe(true)
  })

  it('rejects a changed body, id or timestamp', () => {
    expect(verifySvixSignature(headers(), BODY + ' ', SECRET, NOW)).toBe(false)
    expect(verifySvixSignature(headers({ 'svix-id': 'msg_2' }), BODY, SECRET, NOW)).toBe(false)
    expect(verifySvixSignature(headers({ 'svix-timestamp': String(Number(TS) + 1) }), BODY, SECRET, NOW)).toBe(false)
  })

  it('rejects a signature made with another key and unknown signature versions', () => {
    const h = headers({ 'svix-signature': `v1,${sign('msg_1', TS, BODY, Buffer.from('other-key'))}` })
    expect(verifySvixSignature(h, BODY, SECRET, NOW)).toBe(false)
    const v2 = headers({ 'svix-signature': `v2,${sign('msg_1', TS, BODY)}` })
    expect(verifySvixSignature(v2, BODY, SECRET, NOW)).toBe(false)
  })

  it('rejects a replay outside the 5 minute window, in both directions', () => {
    const old = String(Number(TS) - 301)
    expect(verifySvixSignature(headers({ 'svix-timestamp': old, 'svix-signature': `v1,${sign('msg_1', old, BODY)}` }), BODY, SECRET, NOW)).toBe(false)
    const future = String(Number(TS) + 301)
    expect(verifySvixSignature(headers({ 'svix-timestamp': future, 'svix-signature': `v1,${sign('msg_1', future, BODY)}` }), BODY, SECRET, NOW)).toBe(false)
    const edge = String(Number(TS) - 299)
    expect(verifySvixSignature(headers({ 'svix-timestamp': edge, 'svix-signature': `v1,${sign('msg_1', edge, BODY)}` }), BODY, SECRET, NOW)).toBe(true)
  })

  it('rejects missing headers, a bad timestamp, garbage signatures and an empty secret', () => {
    expect(verifySvixSignature(new Headers(), BODY, SECRET, NOW)).toBe(false)
    expect(verifySvixSignature(headers({ 'svix-timestamp': 'abc' }), BODY, SECRET, NOW)).toBe(false)
    expect(verifySvixSignature(headers({ 'svix-signature': 'v1,' }), BODY, SECRET, NOW)).toBe(false)
    expect(verifySvixSignature(headers({ 'svix-signature': 'garbage' }), BODY, SECRET, NOW)).toBe(false)
    expect(verifySvixSignature(headers(), BODY, '', NOW)).toBe(false)
    expect(verifySvixSignature(headers(), BODY, 'whsec_', NOW)).toBe(false)
  })
})
