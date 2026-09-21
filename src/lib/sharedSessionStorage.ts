// Storage adapter for the Supabase browser client that keeps the login session
// in a cookie shared across *.invoices.kz, so signing in once on invoices.kz
// also signs you in on kaspi.invoices.kz, api.invoices.kz, ... (stage 2 of the
// product split, founder 21.09.2026).
//
// The default supabase-js storage is localStorage, which is per-origin: each
// subdomain would ask for a fresh login. This adapter:
//   - writes the session to BOTH a domain cookie and localStorage (dual write:
//     if cookies are blocked, behaviour is exactly what it was before),
//   - reads the cookie first (the shared source of truth), then falls back to
//     localStorage so nobody who is already signed in gets logged out on
//     rollout (their session is adopted into the cookie on first read),
//   - propagates sign-out: once a browser has written the shared cookie, a
//     missing cookie means "signed out somewhere else", so a leftover
//     localStorage copy is dropped instead of silently signing back in.
//
// Pure of window/document: everything is injected, so it is unit-tested with
// fakes. Off unless NEXT_PUBLIC_SHARED_SESSION=1 (see src/lib/supabase.ts).

export type CookieJar = {
  get(): string // like document.cookie: "a=1; b=2"
  set(cookie: string): void // like assigning document.cookie
}

export type SharedSessionOptions = {
  jar: CookieJar
  local: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
  // ".invoices.kz" in production; undefined on localhost / preview hosts, where
  // a host-only cookie is the right thing.
  domain?: string
  secure: boolean
  maxAgeSeconds?: number
}

// Well under the ~4 KB per-cookie limit even after a few attributes.
const MAX_ENCODED_CHUNK = 3000
const SEEN_KEY = '__shared_session_seen'

// Split so every piece is at most `max` characters AFTER encodeURIComponent
// (a JSON session inflates ~3x once quotes become %22) and never cut inside an
// escape sequence -- iterating by code point keeps surrogate pairs whole.
export function chunkForCookie(value: string, max = MAX_ENCODED_CHUNK): string[] {
  const chunks: string[] = []
  let current = ''
  let currentLen = 0
  for (const ch of value) {
    const len = encodeURIComponent(ch).length
    if (currentLen + len > max && current) {
      chunks.push(current)
      current = ''
      currentLen = 0
    }
    current += ch
    currentLen += len
  }
  if (current) chunks.push(current)
  return chunks
}

export function parseCookieHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    const name = part.slice(0, i).trim()
    if (!name) continue
    try {
      out[name] = decodeURIComponent(part.slice(i + 1).trim())
    } catch {
      // A value someone else wrote badly: skip it rather than throw.
    }
  }
  return out
}

export function createSharedSessionStorage(opts: SharedSessionOptions) {
  const maxAge = opts.maxAgeSeconds ?? 60 * 60 * 24 * 365
  const attrs = (age: number) =>
    `; Path=/; Max-Age=${age}; SameSite=Lax${opts.domain ? `; Domain=${opts.domain}` : ''}${opts.secure ? '; Secure' : ''}`
  const put = (name: string, value: string) => opts.jar.set(`${name}=${encodeURIComponent(value)}${attrs(maxAge)}`)
  const drop = (name: string) => opts.jar.set(`${name}=${attrs(0)}`)

  function readCookie(key: string): string | null {
    const all = parseCookieHeader(opts.jar.get())
    const n = Number(all[`${key}.n`])
    if (!Number.isInteger(n) || n < 1) return null
    let out = ''
    for (let i = 0; i < n; i++) {
      const part = all[`${key}.${i}`]
      // A missing piece means a torn write; a half session is worse than none.
      if (part === undefined) return null
      out += part
    }
    return out
  }

  function writeCookie(key: string, value: string) {
    const prev = Number(parseCookieHeader(opts.jar.get())[`${key}.n`]) || 0
    const chunks = chunkForCookie(value)
    chunks.forEach((c, i) => put(`${key}.${i}`, c))
    put(`${key}.n`, String(chunks.length))
    for (let i = chunks.length; i < prev; i++) drop(`${key}.${i}`)
  }

  function clearCookie(key: string) {
    const n = Number(parseCookieHeader(opts.jar.get())[`${key}.n`]) || 0
    for (let i = 0; i < n; i++) drop(`${key}.${i}`)
    drop(`${key}.n`)
  }

  const seen = () => { try { return opts.local?.getItem(SEEN_KEY) === '1' } catch { return false } }
  const markSeen = () => { try { opts.local?.setItem(SEEN_KEY, '1') } catch { /* private mode */ } }

  return {
    getItem(key: string): string | null {
      const shared = readCookie(key)
      if (shared !== null) return shared
      let legacy: string | null = null
      try { legacy = opts.local?.getItem(key) ?? null } catch { legacy = null }
      if (legacy === null) return null
      if (seen()) {
        // This browser used the shared cookie before, and it is gone: the
        // session was ended on another subdomain. Drop the stale copy.
        try { opts.local?.removeItem(key) } catch { /* ignore */ }
        return null
      }
      // Rollout: an already signed-in user with only a localStorage session.
      writeCookie(key, legacy)
      if (readCookie(key) === legacy) markSeen()
      return legacy
    },
    setItem(key: string, value: string): void {
      try { opts.local?.setItem(key, value) } catch { /* private mode */ }
      writeCookie(key, value)
      // Only trust the shared cookie (and the sign-out propagation above) once
      // it is provably readable back; blocked cookies keep the old behaviour.
      if (readCookie(key) === value) markSeen()
    },
    removeItem(key: string): void {
      try { opts.local?.removeItem(key) } catch { /* ignore */ }
      clearCookie(key)
    },
  }
}

// Production host check kept here so it is testable too.
export function sharedCookieDomain(hostname: string): string | undefined {
  return hostname === 'invoices.kz' || hostname.endsWith('.invoices.kz') ? '.invoices.kz' : undefined
}
