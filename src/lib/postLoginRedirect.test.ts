import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  POST_LOGIN_REDIRECT_KEY, consumePostLoginRedirect, postLoginRedirectFromSearch, setPostLoginRedirect,
} from './postLoginRedirect'
import { STORED_INTENT_TTL_MS } from './storedIntent'

function makeLocal() {
  const m = new Map<string, string>()
  return {
    m,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
  }
}

describe('postLoginRedirectFromSearch', () => {
  it('accepts allowlisted product cabinets', () => {
    expect(postLoginRedirectFromSearch('?next=/kaspi-shop')).toBe('/kaspi-shop')
    expect(postLoginRedirectFromSearch('?ref=x&next=/ai-agent')).toBe('/ai-agent')
  })
  it('sends the waybills limit CTA (anonymous visitor) to /upgrade after login, utm params around next', () => {
    expect(postLoginRedirectFromSearch('?next=/upgrade&utm_source=tools&utm_medium=limit&utm_campaign=waybills')).toBe('/upgrade')
  })
  it('drops anything else (no open redirect)', () => {
    expect(postLoginRedirectFromSearch('?next=https://evil.com')).toBeNull()
    expect(postLoginRedirectFromSearch('?next=//evil.com')).toBeNull()
    expect(postLoginRedirectFromSearch('?next=/admin')).toBeNull()
    expect(postLoginRedirectFromSearch('')).toBeNull()
  })
})

describe('stored postLoginRedirect expires after 30 minutes', () => {
  let store: ReturnType<typeof makeLocal>
  const T0 = Date.UTC(2026, 9, 15, 9, 0, 0)
  beforeEach(() => { store = makeLocal(); vi.stubGlobal('localStorage', store) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('fresh entry is returned once, then gone', () => {
    setPostLoginRedirect('/kaspi-shop', T0)
    expect(consumePostLoginRedirect(T0 + 60_000)).toBe('/kaspi-shop')
    expect(store.m.has(POST_LOGIN_REDIRECT_KEY)).toBe(false)
    expect(consumePostLoginRedirect(T0 + 61_000)).toBeNull()
  })

  it('exactly at the TTL still counts; one ms later it does not, and it is removed', () => {
    setPostLoginRedirect('/upgrade', T0)
    expect(consumePostLoginRedirect(T0 + STORED_INTENT_TTL_MS)).toBe('/upgrade')
    setPostLoginRedirect('/upgrade', T0)
    expect(consumePostLoginRedirect(T0 + STORED_INTENT_TTL_MS + 1)).toBeNull()
    expect(store.m.has(POST_LOGIN_REDIRECT_KEY)).toBe(false)
  })

  it('a days-old /upgrade (the 15.10 dead end) is ignored', () => {
    setPostLoginRedirect('/upgrade', T0 - 3 * 24 * 3600_000)
    expect(consumePostLoginRedirect(T0)).toBeNull()
  })

  it('legacy bare-path entry (no timestamp) is stale and removed', () => {
    store.setItem(POST_LOGIN_REDIRECT_KEY, '/upgrade')
    expect(consumePostLoginRedirect(T0)).toBeNull()
    expect(store.m.has(POST_LOGIN_REDIRECT_KEY)).toBe(false)
  })

  it('garbage is removed and yields null', () => {
    const garbage = ['{', 'null', '[]', '{"path":"/upgrade"}', '{"path":"/upgrade","at":"now"}', JSON.stringify({ path: '/upgrade', at: T0 + 3600_000 })]
    for (const raw of garbage) {
      store.setItem(POST_LOGIN_REDIRECT_KEY, raw)
      expect(consumePostLoginRedirect(T0)).toBeNull()
      expect(store.m.has(POST_LOGIN_REDIRECT_KEY)).toBe(false)
    }
  })

  it('re-validates the allowlist on read', () => {
    store.setItem(POST_LOGIN_REDIRECT_KEY, JSON.stringify({ path: 'https://evil.com', at: T0 }))
    expect(consumePostLoginRedirect(T0)).toBeNull()
    store.setItem(POST_LOGIN_REDIRECT_KEY, JSON.stringify({ path: '/admin', at: T0 }))
    expect(consumePostLoginRedirect(T0)).toBeNull()
  })

  it('storage that throws never breaks the caller', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => {},
    })
    expect(() => setPostLoginRedirect('/kaspi-shop', T0)).not.toThrow()
    expect(consumePostLoginRedirect(T0)).toBeNull()
  })
})
