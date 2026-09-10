import { describe, it, expect } from 'vitest'
import { normalizeEmail, looksLikeEmail, verdictFromStatus } from './emailDeliverability'

describe('normalizeEmail', () => {
  it('trims and lower-cases', () => {
    expect(normalizeEmail('  Alikhan.Abilbayev@JDC.kz ')).toBe('alikhan.abilbayev@jdc.kz')
  })
  it('survives empty input', () => {
    expect(normalizeEmail(null)).toBe('')
    expect(normalizeEmail(undefined)).toBe('')
  })
})

describe('looksLikeEmail', () => {
  it('accepts ordinary addresses', () => {
    expect(looksLikeEmail('alikhan2505@gmail.com')).toBe(true)
    expect(looksLikeEmail('alikhan2505+aitest@gmail.com')).toBe(true)
    expect(looksLikeEmail('  ЖК@почта.рф  ')).toBe(true)
  })
  it('rejects what is plainly not an address', () => {
    expect(looksLikeEmail('alikhan2505')).toBe(false)
    expect(looksLikeEmail('a@b')).toBe(false)
    expect(looksLikeEmail('two addresses@a.kz b@c.kz')).toBe(false)
    expect(looksLikeEmail('')).toBe(false)
    expect(looksLikeEmail(null)).toBe(false)
  })
  it('rejects an absurdly long address', () => {
    expect(looksLikeEmail('a'.repeat(250) + '@b.kz')).toBe(false)
  })
})

describe('verdictFromStatus', () => {
  it('reads Resend"s two definite answers', () => {
    expect(verdictFromStatus(200)).toBe('undeliverable')
    expect(verdictFromStatus(404)).toBe('deliverable')
  })

  it('treats every other answer as unknown', () => {
    // A suppression check that is down must not become a second way to be
    // locked out, so anything ambiguous has to let the user through.
    for (const status of [401, 429, 500, 503, 0]) {
      expect(verdictFromStatus(status), String(status)).toBe('unknown')
    }
  })
})
