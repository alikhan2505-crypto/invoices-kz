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
// The hop from { redirectUrl: "/" } to mc-session/mc-sid was live-traced via
// the browser's own network log 2026-08-13 (see MC_URL's comment below for
// the confirmed OAuth2 Authorization Code + PKCE chain) after an earlier
// guess-based reconstruction (a single GET of kaspi.kz/mc/) failed live
// twice. isSessionValid() remains the way to confirm a session actually
// works before trusting it in production.

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

// jar is a flat, unscoped cookie map (unlike a browser's per-domain jar), so
// nothing stops us from attaching it to whatever host a redirect happens to
// point at. Kaspi's own redirect chain should never leave kaspi.kz, so this
// is a belt-and-suspenders check against ever sending session cookies to an
// unexpected host if a hop's Location header is malformed or points off-site.
function isTrustedKaspiHost(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return host === 'kaspi.kz' || host.endsWith('.kaspi.kz')
  } catch {
    return false
  }
}

export type LoginResult =
  | { status: 'otp_required'; otpToken: string }
  | { status: 'success'; sessionCookies: string }
  | { status: 'error'; message: string }

const IDMC_BASE = 'https://idmc.shop.kaspi.kz'
const LOGIN_URL = `${IDMC_BASE}/api/p/login`
// Live-traced 2026-08-13 (real network capture, not a guess this time): after
// OTP success the real app does NOT navigate straight to kaspi.kz/mc/ -- it
// kicks off a full OAuth2 Authorization Code + PKCE flow:
//   GET https://mc.shop.kaspi.kz/oauth2/authorization/1?redirectUrl=... [302]
//   -> GET https://idmc.shop.kaspi.kz/oauth2/authorize?...&code_challenge=...&code_challenge_method=S256 [302]
//      (idmc silently approves via its own already-logged-in session -- SSO,
//      no re-prompt -- and redirects back with an authorization code)
//   -> GET https://mc.shop.kaspi.kz/login/oauth2/code/1?code=...&state=... [302]
//      (mc's backend exchanges the code server-side against idmc's token
//      endpoint -- invisible to us -- and THIS is the hop that actually sets
//      mc-session/mc-sid via Set-Cookie)
//   -> GET https://kaspi.kz/mc/ [now authenticated]
// The previous version of this module started the walk at kaspi.kz/mc/
// directly and never triggered this chain at all, which is why it
// consistently failed live. Starting at the real OAuth kickoff URL is what
// the walk-the-redirect-chain logic below was actually missing.
const MC_URL = 'https://mc.shop.kaspi.kz/oauth2/authorization/1?redirectUrl=' + encodeURIComponent('https://kaspi.kz/mc/')

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

  // Walk the real OAuth2 redirect chain by hand (see MC_URL's comment) --
  // fetch()'s automatic redirect-following would hide every intermediate
  // response's Set-Cookie header, and mc-session/mc-sid are minted partway
  // through (the login/oauth2/code/1 hop), not on the first or last one.
  let nextUrl = MC_URL
  for (let hop = 0; hop < 10; hop++) {
    if (!isTrustedKaspiHost(nextUrl)) {
      return { status: 'error', message: `redirect chain left kaspi.kz (${nextUrl}) -- aborted` }
    }
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
