import { describe, expect, it } from 'vitest'
import { bodyTooLarge, looksLikeJwt, makeRateLimiter } from './server'

describe('track endpoint guards', () => {
  it('bodyTooLarge reads Content-Length only', () => {
    const req = (len?: string) => new Request('https://invoices.kz/api/track/visit', {
      method: 'POST', body: 'x', headers: len ? { 'content-length': len } : {},
    })
    expect(bodyTooLarge(req('100'), 2048)).toBe(false)
    expect(bodyTooLarge(req('5000000'), 2048)).toBe(true)
    expect(bodyTooLarge(req('garbage'), 2048)).toBe(false)
  })

  it('looksLikeJwt', () => {
    const jwt = `${'a'.repeat(36)}.${'b'.repeat(400)}.${'c'.repeat(43)}`
    expect(looksLikeJwt(jwt)).toBe(true)
    expect(looksLikeJwt('hello')).toBe(false)
    expect(looksLikeJwt('a.b.c')).toBe(false)
    expect(looksLikeJwt(`${'a'.repeat(20)}.${'b'.repeat(5000)}.${'c'.repeat(20)}`)).toBe(false)
    expect(looksLikeJwt(undefined)).toBe(false)
  })

  it('makeRateLimiter: per-IP sliding window, separate instances', () => {
    const a = makeRateLimiter(2, 1000)
    const b = makeRateLimiter(2, 1000)
    expect([a('1', 0), a('1', 10), a('1', 20)]).toEqual([false, false, true])
    expect(a('2', 20)).toBe(false)
    expect(b('1', 20)).toBe(false)
    expect(a('1', 1500)).toBe(false)
  })
})
