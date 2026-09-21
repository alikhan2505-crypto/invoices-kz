import { describe, it, expect } from 'vitest'
import { chunkForCookie, parseCookieHeader, createSharedSessionStorage, sharedCookieDomain } from './sharedSessionStorage'

// A tiny cookie jar that honours Max-Age=0 deletion like a browser.
function makeJar() {
  const store = new Map<string, string>()
  return {
    store,
    get: () => Array.from(store.entries()).map(([k, v]) => `${k}=${v}`).join('; '),
    set: (cookie: string) => {
      const [pair, ...attrs] = cookie.split(';').map((s) => s.trim())
      const i = pair.indexOf('=')
      const name = pair.slice(0, i)
      const value = pair.slice(i + 1)
      const expired = attrs.some((a) => /^Max-Age=0$/i.test(a))
      if (expired) store.delete(name)
      else store.set(name, value)
    },
  }
}
function makeLocal(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial))
  return { m, getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}
const KEY = 'sb-x-auth-token'
const session = JSON.stringify({ access_token: 'a'.repeat(1400), refresh_token: 'r'.repeat(40), user: { email: 'ы@x.kz', meta: 'ю'.repeat(400) } })

describe('chunkForCookie', () => {
  it('keeps every piece under the encoded limit and reassembles losslessly', () => {
    const chunks = chunkForCookie(session, 3000)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(encodeURIComponent(c).length).toBeLessThanOrEqual(3000)
    expect(chunks.join('')).toBe(session)
  })
  it('does not split a surrogate pair', () => {
    const v = '😀'.repeat(50)
    expect(chunkForCookie(v, 40).join('')).toBe(v)
  })
})

describe('parseCookieHeader', () => {
  it('decodes values and skips garbage', () => {
    expect(parseCookieHeader('a=1; b=%D1%8B; c=%E0%A4%A; =x')).toEqual({ a: '1', b: 'ы' })
  })
})

describe('shared session storage', () => {
  const build = (local = makeLocal(), jar = makeJar()) => ({ jar, local, s: createSharedSessionStorage({ jar, local, domain: '.invoices.kz', secure: true }) })

  it('round-trips a long session through chunked cookies and localStorage', () => {
    const { s, jar, local } = build()
    s.setItem(KEY, session)
    expect(s.getItem(KEY)).toBe(session)
    expect(jar.store.get(`${KEY}.n`)).toBe(String(chunkForCookie(session).length))
    expect(local.getItem(KEY)).toBe(session)
  })

  it('a second host with only the cookie is signed in (the point of the feature)', () => {
    const a = build()
    a.s.setItem(KEY, session)
    const b = createSharedSessionStorage({ jar: a.jar, local: makeLocal(), domain: '.invoices.kz', secure: true })
    expect(b.getItem(KEY)).toBe(session)
  })

  it('adopts an existing localStorage-only session on rollout instead of logging the user out', () => {
    const { s, jar } = build(makeLocal({ [KEY]: session }))
    expect(s.getItem(KEY)).toBe(session)
    expect(jar.store.has(`${KEY}.n`)).toBe(true)
  })

  it('sign-out on another host propagates: cookie gone + marker set drops the stale local copy', () => {
    const { s, jar, local } = build()
    s.setItem(KEY, session)
    // another subdomain signs out: removes the shared cookie but not this origin's localStorage
    createSharedSessionStorage({ jar, local: makeLocal(), domain: '.invoices.kz', secure: true }).removeItem(KEY)
    expect(s.getItem(KEY)).toBeNull()
    expect(local.getItem(KEY)).toBeNull()
  })

  it('removeItem clears both stores', () => {
    const { s, jar, local } = build()
    s.setItem(KEY, session)
    s.removeItem(KEY)
    expect(jar.store.size).toBe(0)
    expect(local.getItem(KEY)).toBeNull()
  })

  it('shrinking a session removes the leftover chunks', () => {
    const { s, jar } = build()
    s.setItem(KEY, session)
    s.setItem(KEY, 'short')
    expect(jar.store.get(`${KEY}.n`)).toBe('1')
    expect(Array.from(jar.store.keys()).filter((k) => k.startsWith(`${KEY}.`) && k !== `${KEY}.n`)).toEqual([`${KEY}.0`])
  })

  it('torn cookie (a chunk missing) reads as no session, not a corrupt one', () => {
    const { s, jar } = build()
    s.setItem(KEY, session)
    jar.store.delete(`${KEY}.1`)
    // falls back to localStorage (marker set -> dropped), never returns half a token
    expect(s.getItem(KEY)).not.toBe(session.slice(0, 100))
  })

  it('blocked cookies behave like plain localStorage (no marker, session survives)', () => {
    const local = makeLocal()
    const deadJar = { get: () => '', set: () => {} }
    const s = createSharedSessionStorage({ jar: deadJar, local, secure: true })
    s.setItem(KEY, session)
    expect(s.getItem(KEY)).toBe(session)
  })
})

describe('sharedCookieDomain', () => {
  it('only the production host family shares a cookie', () => {
    expect(sharedCookieDomain('invoices.kz')).toBe('.invoices.kz')
    expect(sharedCookieDomain('kaspi.invoices.kz')).toBe('.invoices.kz')
    expect(sharedCookieDomain('localhost')).toBeUndefined()
    expect(sharedCookieDomain('invoices-kz-git-x.vercel.app')).toBeUndefined()
    expect(sharedCookieDomain('evilinvoices.kz')).toBeUndefined()
  })
})
