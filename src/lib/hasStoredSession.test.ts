import { afterEach, describe, expect, it, vi } from 'vitest'
import { mightHaveStoredSession } from './hasStoredSession'

function fakeLocalStorage(keys: string[]) {
  return { length: keys.length, key: (i: number) => keys[i] ?? null }
}

afterEach(() => vi.unstubAllGlobals())

describe('mightHaveStoredSession', () => {
  it('finds the supabase localStorage key', () => {
    vi.stubGlobal('localStorage', fakeLocalStorage(['theme', 'sb-abcdef-auth-token']))
    vi.stubGlobal('document', { cookie: '' })
    expect(mightHaveStoredSession()).toBe(true)
  })

  it('finds the shared-session cookie, chunked (.0) and counted (.n)', () => {
    vi.stubGlobal('localStorage', fakeLocalStorage(['theme']))
    vi.stubGlobal('document', { cookie: 'a=1; sb-abcdef-auth-token.n=1; sb-abcdef-auth-token.0=xyz' })
    expect(mightHaveStoredSession()).toBe(true)
    vi.stubGlobal('document', { cookie: 'sb-abcdef-auth-token.0=xyz' })
    expect(mightHaveStoredSession()).toBe(true)
  })

  it('is false for an anonymous browser', () => {
    vi.stubGlobal('localStorage', fakeLocalStorage(['theme', 'lang', 'my_products']))
    vi.stubGlobal('document', { cookie: 'a=1; _ga=2' })
    expect(mightHaveStoredSession()).toBe(false)
  })

  it('does not take look-alike names for a session', () => {
    vi.stubGlobal('localStorage', fakeLocalStorage(['xsb-abc-auth-token', 'sb-auth-token']))
    vi.stubGlobal('document', { cookie: 'xsb-abc-auth-token=1' })
    expect(mightHaveStoredSession()).toBe(false)
  })

  it('survives blocked localStorage and still reads cookies', () => {
    vi.stubGlobal('localStorage', { get length(): number { throw new Error('denied') }, key: () => null })
    vi.stubGlobal('document', { cookie: 'sb-abc-auth-token.n=1' })
    expect(mightHaveStoredSession()).toBe(true)
  })

  it('is false when both storages throw', () => {
    vi.stubGlobal('localStorage', { get length(): number { throw new Error('denied') }, key: () => null })
    vi.stubGlobal('document', { get cookie(): string { throw new Error('denied') } })
    expect(mightHaveStoredSession()).toBe(false)
  })
})
