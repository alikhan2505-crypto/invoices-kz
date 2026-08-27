import { describe, it, expect } from 'vitest'
import { decodeWbToken } from './token'

// A JWT's middle segment is base64url(JSON payload) -- no signing key needed
// to build one for this pure-decode test, only a well-formed 3-part shape.
function fakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.fakesignature`
}

describe('decodeWbToken', () => {
  it('extracts the exp claim as an ISO string and keeps the full payload', () => {
    const expUnixSeconds = 1893456000 // 2030-01-01T00:00:00Z
    const token = fakeJwt({ exp: expUnixSeconds, sid: 'abc123', s: 106 })
    const result = decodeWbToken(token)
    expect(result).not.toBeNull()
    expect(result!.expiresAt).toBe(new Date(expUnixSeconds * 1000).toISOString())
    expect(result!.claims).toEqual({ exp: expUnixSeconds, sid: 'abc123', s: 106 })
  })

  it('returns null for a token that is not 3 dot-separated segments', () => {
    expect(decodeWbToken('not-a-jwt')).toBeNull()
    expect(decodeWbToken('only.two')).toBeNull()
  })

  it('returns null when the middle segment is not valid base64url JSON', () => {
    expect(decodeWbToken('aaa.not-json-at-all.bbb')).toBeNull()
  })

  it('returns null when the payload has no exp claim', () => {
    const token = fakeJwt({ sid: 'abc123' })
    expect(decodeWbToken(token)).toBeNull()
  })
})
