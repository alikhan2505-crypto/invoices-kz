// Login flow captured live 2026-08-13 against a real Kaspi Магазин seller
// account (see docs/superpowers/specs/2026-08-12-kaspi-cabinet-api-
// findings.md for the exact captured request/response bodies). Phone-based
// login only -- the cabinet's "Email" tab was never tested and may use a
// different (password-based) flow; not implemented here until confirmed
// the same way, live, against a real account.
//
// Both login steps are the SAME endpoint, correlated via the MS_AUTH_SSO
// cookie idmc.shop.kaspi.kz sets after step 1:
//   POST https://idmc.shop.kaspi.kz/api/p/login  { "_ph": "{phone}" }   -> sends SMS
//   POST https://idmc.shop.kaspi.kz/api/p/login  { "_c": "{code}" }     -> { redirectUrl: "/" }
//
// UNVERIFIED PIECE: what was captured stops at the { redirectUrl: "/" }
// response -- the browser then does a full-page cross-origin navigation to
// kaspi.kz/mc/, which is where mc-session/mc-sid (the cookies every later
// cabinet API call actually needs) get set, and that hop was never directly
// observed (a full page navigation isn't visible to the XHR/fetch
// interceptor technique that caught everything else). This module's best
// reconstruction is to carry every cookie collected so far into a GET of
// https://kaspi.kz/mc/ and hope the backend recognizes the session by
// value regardless of the browser's own cookie-domain scoping (which
// wouldn't apply here anyway -- this is a server-side request, not a
// browser one). isSessionValid() is exactly the way to confirm whether
// that reconstruction actually works before trusting it in production.

type CookieJar = Map<string, string>

function parseSetCookies(res: Response): CookieJar {
  const jar: CookieJar = new Map()
  // Node's fetch exposes multiple Set-Cookie headers via getSetCookie()
  // when available; fall back to a single header read otherwise.
  const raw: string[] = typeof (res.headers as any).getSetCookie === 'function'
    ? (res.headers as any).getSetCookie()
    : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie') as string] : [])
  for (const line of raw) {
    const [pair] = line.split(';')
    const eq = pair.indexOf('=')
    if (eq === -1) continue
    jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
  }
  return jar
}

function cookieHeader(jar: CookieJar): string {
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ')
}

function mergeJar(into: CookieJar, from: CookieJar) {
  for (const [k, v] of from) into.set(k, v)
}

export type LoginResult =
  | { status: 'otp_required'; otpToken: string }
  | { status: 'success'; sessionCookies: string }
  | { status: 'error'; message: string }

const IDMC_BASE = 'https://idmc.shop.kaspi.kz'
const LOGIN_URL = `${IDMC_BASE}/api/p/login`
const MC_URL = 'https://kaspi.kz/mc/'

export async function startPhoneLogin(phone: string): Promise<LoginResult> {
  const jar: CookieJar = new Map()

  // A real browser has already collected whatever cookies the login page
  // itself sets on load, before the seller ever submits the phone number.
  try {
    const pageRes = await fetch(`${IDMC_BASE}/login`)
    mergeJar(jar, parseSetCookies(pageRes))
  } catch {
    // Non-fatal -- proceed without page-load cookies if this fails.
  }

  let res: Response
  try {
    res = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieHeader(jar) },
      body: JSON.stringify({ _ph: phone }),
    })
  } catch (err: any) {
    return { status: 'error', message: `network error: ${err.message}` }
  }
  if (!res.ok) {
    return { status: 'error', message: `Kaspi отклонил номер телефона (HTTP ${res.status})` }
  }
  mergeJar(jar, parseSetCookies(res))

  // otpToken carries the accumulated cookie jar (base64 JSON) to submitOtp
  // -- this crosses our own API boundary (connect route -> otp route), so
  // it needs to survive a round trip through the browser, not just stay
  // in server memory.
  const otpToken = Buffer.from(JSON.stringify(Array.from(jar.entries()))).toString('base64')
  return { status: 'otp_required', otpToken }
}

export async function submitOtp(otpToken: string, code: string): Promise<LoginResult> {
  let jar: CookieJar
  try {
    jar = new Map(JSON.parse(Buffer.from(otpToken, 'base64').toString('utf8')))
  } catch {
    return { status: 'error', message: 'otpToken недействителен' }
  }

  let res: Response
  try {
    res = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieHeader(jar) },
      body: JSON.stringify({ _c: code }),
    })
  } catch (err: any) {
    return { status: 'error', message: `network error: ${err.message}` }
  }
  if (!res.ok) {
    return { status: 'error', message: `Kaspi отклонил код из SMS (HTTP ${res.status})` }
  }
  mergeJar(jar, parseSetCookies(res))

  // Follow the SPA's own next step: a GET of kaspi.kz/mc/ carrying
  // everything collected so far. Confirmed live 2026-08-13 that a single
  // request here is NOT enough -- the real browser flow is a redirect
  // chain, and fetch()'s automatic redirect-following hides every
  // intermediate response's Set-Cookie header from us (a real Fetch API
  // limitation, not a bug we can work around by reading res.headers after
  // the fact). So this walks the chain by hand, merging cookies at each
  // hop, since the session may be minted partway through rather than on
  // the first or last response.
  let nextUrl = MC_URL
  for (let hop = 0; hop < 10; hop++) {
    let hopRes: Response
    try {
      hopRes = await fetch(nextUrl, { headers: { cookie: cookieHeader(jar) }, redirect: 'manual' })
    } catch (err: any) {
      return { status: 'error', message: `network error reaching ${nextUrl}: ${err.message}` }
    }
    mergeJar(jar, parseSetCookies(hopRes))
    if (hopRes.status < 300 || hopRes.status >= 400) break
    const location = hopRes.headers.get('location')
    if (!location) break
    nextUrl = new URL(location, nextUrl).toString()
  }

  const sessionCookies = cookieHeader(jar)
  if (!jar.has('mc-session') || !jar.has('mc-sid')) {
    return {
      status: 'error',
      message: 'Вход подтверждён Kaspi, но не удалось получить сессию кабинета (mc-session/mc-sid) — нужна проверка вживую',
    }
  }
  return { status: 'success', sessionCookies }
}

// Makes one lightweight authenticated call (the same getMerchant query
// confirmed live 2026-08-12) and checks whether Kaspi still accepts the
// session, rather than assuming it's valid indefinitely.
export async function isSessionValid(sessionCookies: string): Promise<boolean> {
  try {
    // A deliberately smaller query than the real getMerchant (confirmed
    // live 2026-08-12, which needs a merchantId this function doesn't
    // have) -- just enough to tell whether the session is still accepted.
    const res = await fetch('https://mc.shop.kaspi.kz/mc/facade/graphql?opName=checkSession', {
      method: 'POST',
      headers: {
        'x-auth-version': '3',
        'content-type': 'application/json',
        'origin': 'https://kaspi.kz',
        'referer': 'https://kaspi.kz/',
        'cookie': sessionCookies,
      },
      body: JSON.stringify({
        operationName: 'checkSession',
        variables: {},
        query: 'query checkSession { session { user { id } } }',
      }),
    })
    if (!res.ok) return false
    const data = await res.json().catch(() => null)
    return !!data?.data?.session?.user?.id
  } catch {
    return false
  }
}
