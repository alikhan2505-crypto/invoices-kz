import { describe, it, expect, beforeEach } from 'vitest'
import { hookSecretOk, throttled, resetThrottle } from './hooksGuard'

describe('hookSecretOk', () => {
  it('fails closed while no secret is configured: nobody gets in, even with a header (audit 14.11)', () => {
    expect(hookSecretOk(new Headers(), undefined)).toBe(false)
    expect(hookSecretOk(new Headers(), '')).toBe(false)
    expect(hookSecretOk(new Headers({ 'x-internal-secret': 'anything' }), undefined)).toBe(false)
    expect(hookSecretOk(new Headers({ 'x-internal-secret': '' }), '')).toBe(false)
  })

  it('requires a matching x-internal-secret once configured', () => {
    expect(hookSecretOk(new Headers({ 'x-internal-secret': 's3cret' }), 's3cret')).toBe(true)
    expect(hookSecretOk(new Headers({ 'x-internal-secret': 'wrong!' }), 's3cret')).toBe(false)
    expect(hookSecretOk(new Headers({ 'x-internal-secret': 's3cre' }), 's3cret')).toBe(false)
    expect(hookSecretOk(new Headers(), 's3cret')).toBe(false)
  })
})

describe('throttled', () => {
  beforeEach(() => resetThrottle())

  it('passes the first call and blocks repeats inside the window', () => {
    expect(throttled('k', 60_000, 1_000)).toBe(false)
    expect(throttled('k', 60_000, 30_000)).toBe(true)
    expect(throttled('k', 60_000, 61_001)).toBe(false)
  })

  it('keeps keys independent', () => {
    expect(throttled('a', 60_000, 1_000)).toBe(false)
    expect(throttled('b', 60_000, 1_100)).toBe(false)
  })
})
