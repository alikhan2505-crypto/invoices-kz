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

import { connectErrorMessage, type ConnectErrorCode, type ConnectStep } from './connectMessages'

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

// `error` results are backwards compatible: `message` is still always present
// (now a friendly Russian sentence that never contains a URL or OAuth
// parameter). New optional fields:
//   code        -- stable machine code (ConnectErrorCode), for localisation
//   detail      -- underlying network cause (ECONNRESET, ETIMEDOUT, TIMEOUT...)
//   resumeToken -- present only when Kaspi ALREADY accepted the one-time SMS
//                  code and only the redirect-hop walk failed; passing it back
//                  to submitOtp() (no code) re-walks the hops without
//                  re-posting the spent code.
export type LoginResult =
  | { status: 'otp_required'; otpToken: string }
  | { status: 'success'; sessionCookies: string }
  | { status: 'error'; message: string; code?: ConnectErrorCode; detail?: string; resumeToken?: string }

// ---------------------------------------------------------------------------
// Resilient fetch to Kaspi. 'fetch failed' is undici's generic connection-level
// failure (reset / timeout / TLS / DNS) from the serverless function to Kaspi;
// it is transient, so connection-level failures are retried a couple of times
// with a short backoff. An HTTP response of ANY status is never retried.
// ---------------------------------------------------------------------------
export const KASPI_FETCH_TIMEOUT_MS = 15_000
export const KASPI_FETCH_MAX_ATTEMPTS = 3
const KASPI_FETCH_BACKOFF_MS = [300, 900]

// Mutable only so unit tests can run with tiny timeouts/no waiting.
export const kaspiFetchTuning = { timeoutMs: KASPI_FETCH_TIMEOUT_MS, backoffMs: KASPI_FETCH_BACKOFF_MS }

export class KaspiNetworkError extends Error {
  causeCode?: string
  attempts: number
  constructor(causeCode: string | undefined, attempts: number, cause: unknown) {
    // Deliberately generic: the underlying message can embed the request URL.
    super('kaspi_unreachable')
    this.name = 'KaspiNetworkError'
    this.causeCode = causeCode
    this.attempts = attempts
    this.cause = cause
  }
}

const NETWORK_CAUSE_CODE = /^(E(CONN|TIMEDOUT|NOTFOUND|AI_|PIPE|NETUNREACH|HOSTUNREACH|HOSTDOWN)|UND_ERR_|ERR_SSL|CERT_|ERR_TLS)/

function errorCauseCode(err: any): string | undefined {
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return 'TIMEOUT'
  const c = err?.cause
  const code = c?.code ?? c?.errors?.[0]?.code ?? err?.code
  return typeof code === 'string' ? code : undefined
}

function isConnectionError(err: any): boolean {
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return true
  if (err instanceof TypeError && err.message === 'fetch failed') return true
  const code = errorCauseCode(err)
  return !!code && NETWORK_CAUSE_CODE.test(code)
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

// Throws KaspiNetworkError (never a raw undici error) when no HTTP response
// could be obtained. `retry: false` = exactly one attempt (still with timeout).
async function kaspiFetch(url: string, init: RequestInit = {}, opts: { retry?: boolean } = {}): Promise<Response> {
  const maxAttempts = opts.retry === false ? 1 : KASPI_FETCH_MAX_ATTEMPTS
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(kaspiFetchTuning.timeoutMs) })
    } catch (err) {
      lastErr = err
      // Not a connection-level failure (e.g. a programming error such as an
      // invalid URL): surface it unchanged instead of masking it as an outage.
      if (!isConnectionError(err)) throw err
      if (attempt === maxAttempts) {
        throw new KaspiNetworkError(errorCauseCode(err), attempt, err)
      }
      const wait = kaspiFetchTuning.backoffMs[attempt - 1] ?? kaspiFetchTuning.backoffMs[kaspiFetchTuning.backoffMs.length - 1] ?? 0
      if (wait > 0) await sleep(wait)
    }
  }
  throw new KaspiNetworkError(errorCauseCode(lastErr), maxAttempts, lastErr)
}

// Generic bounded retry for idempotent Kaspi reads that do not go through
// kaspiFetch (the callers own their fetch). Same rules: only connection-level
// failures are retried; anything else is rethrown unchanged.
export async function withConnectionRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= KASPI_FETCH_MAX_ATTEMPTS; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (err instanceof KaspiNetworkError) throw err
      if (!isConnectionError(err)) throw err
      if (attempt === KASPI_FETCH_MAX_ATTEMPTS) throw new KaspiNetworkError(errorCauseCode(err), attempt, err)
      const wait = kaspiFetchTuning.backoffMs[attempt - 1] ?? kaspiFetchTuning.backoffMs[kaspiFetchTuning.backoffMs.length - 1] ?? 0
      if (wait > 0) await sleep(wait)
    }
  }
  throw new KaspiNetworkError(errorCauseCode(lastErr), KASPI_FETCH_MAX_ATTEMPTS, lastErr)
}

// Server-side diagnostics only: step name + cause, never the URL, cookies,
// tokens or the SMS code.
export function logNetworkFailure(step: string, err: KaspiNetworkError) {
  const cause: any = err.cause
  console.error(
    `[kaspi-login] ${step} unreachable: attempts=${err.attempts} code=${err.causeCode ?? 'none'} ` +
      `name=${cause?.name ?? 'unknown'} msg=${String(cause?.message ?? '').slice(0, 120)} ` +
      `causeMsg=${String(cause?.cause?.message ?? '').slice(0, 160)}`,
  )
}

export function unreachableResult(step: ConnectStep, err: KaspiNetworkError, resumeToken?: string): LoginResult {
  const resumable = !!resumeToken
  return {
    status: 'error',
    code: 'kaspi_unreachable',
    message: connectErrorMessage('ru', 'kaspi_unreachable', { step, resumable })!,
    ...(err.causeCode ? { detail: err.causeCode } : {}),
    ...(resumeToken ? { resumeToken } : {}),
  }
}

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
    // Single attempt with a timeout: it is non-fatal anyway, and retrying it
    // would only delay the SMS step when Kaspi is unreachable.
    const pageRes = await kaspiFetch(`${IDMC_BASE}/login`, {}, { retry: false })
    mergeJar(jar, parseSetCookies(pageRes))
  } catch {
    // Non-fatal -- proceed without page-load cookies if this fails.
  }

  // The phone POST is what SENDS the SMS: a timeout is applied, but it is
  // deliberately NOT retried -- a duplicate SMS is worse than asking the
  // seller to press the button again.
  let res: Response
  try {
    res = await kaspiFetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieHeader(jar) },
      body: JSON.stringify({ _ph: phone }),
    }, { retry: false })
  } catch (err) {
    if (err instanceof KaspiNetworkError) {
      logNetworkFailure('phone_post', err)
      return unreachableResult('phone', err)
    }
    throw err
  }
  if (!res.ok) {
    return { status: 'error', code: 'phone_rejected', message: `Kaspi отклонил номер телефона (HTTP ${res.status})` }
  }
  mergeJar(jar, parseSetCookies(res))

  // otpToken carries the accumulated cookie jar (base64 JSON) to submitOtp
  // -- this crosses our own API boundary (connect route -> otp route), so
  // it needs to survive a round trip through the browser, not just stay
  // in server memory.
  const otpToken = Buffer.from(JSON.stringify(Array.from(jar.entries()))).toString('base64')
  return { status: 'otp_required', otpToken }
}

// ---------------------------------------------------------------------------
// Tokens that cross our own API boundary (browser <-> connect/otp route).
//   otpToken    = base64(JSON [[name, value], ...])  -- phone accepted, SMS sent
//   resumeToken = base64(JSON { v: 1, verified: true, jar: [[name, value], ...] })
//                 -- the SMS code was ACCEPTED by Kaspi; only the redirect-hop
//                 walk is left. It holds nothing but the Kaspi cookies the
//                 user's own login flow already produced (same sensitivity as
//                 otpToken), is only ever sent back to kaspi.kz hosts
//                 (isTrustedKaspiHost), and a forged one can at best yield a
//                 session for cookies the forger already owns.
// ---------------------------------------------------------------------------
type DecodedToken = { kind: 'otp' | 'resume'; jar: CookieJar }

const COOKIE_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]{1,128}$/
// eslint-disable-next-line no-control-regex
const COOKIE_VALUE_BAD_RE = /[\u0000-\u001f\u007f;]/

function toJar(entries: unknown): CookieJar | null {
  if (!Array.isArray(entries) || entries.length > 100) return null
  const jar: CookieJar = new Map()
  for (const e of entries) {
    if (!Array.isArray(e) || e.length !== 2) return null
    const [name, value] = e
    if (typeof name !== 'string' || typeof value !== 'string') return null
    if (!COOKIE_NAME_RE.test(name) || value.length > 8192 || COOKIE_VALUE_BAD_RE.test(value)) return null
    jar.set(name, value)
  }
  return jar
}

function decodeToken(token: string): DecodedToken | null {
  try {
    const parsed = JSON.parse(Buffer.from(token, 'base64').toString('utf8'))
    if (Array.isArray(parsed)) {
      const jar = toJar(parsed)
      return jar ? { kind: 'otp', jar } : null
    }
    if (parsed && typeof parsed === 'object' && parsed.v === 1 && parsed.verified === true) {
      const jar = toJar(parsed.jar)
      return jar ? { kind: 'resume', jar } : null
    }
    return null
  } catch {
    return null
  }
}

function encodeResumeToken(jar: CookieJar): string {
  return Buffer.from(JSON.stringify({ v: 1, verified: true, jar: Array.from(jar.entries()) })).toString('base64')
}

// Resume token built from an already-issued session ("k=v; k=v" cookie
// header, as returned by submitOtp). Used when the code was accepted AND the
// session was issued, but a later server-side Kaspi call (merchant lookup)
// failed on the network: the client retries without a new SMS code.
export function resumeTokenFromSession(sessionCookies: string): string | undefined {
  const jar: CookieJar = new Map()
  for (const part of sessionCookies.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    jar.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim())
  }
  return toJar(Array.from(jar.entries())) ? encodeResumeToken(jar) : undefined
}

// True when the token is a resume token (SMS code already accepted), so the
// caller does not need to supply a code.
export function isResumeToken(token: unknown): boolean {
  return typeof token === 'string' && decodeToken(token)?.kind === 'resume'
}

// Walk the real OAuth2 redirect chain by hand (see MC_URL's comment) --
// fetch()'s automatic redirect-following would hide every intermediate
// response's Set-Cookie header, and mc-session/mc-sid are minted partway
// through (the login/oauth2/code/1 hop), not on the first or last one.
// Every hop is an idempotent GET, so each is retried on connection failures.
async function walkSessionRedirects(jar: CookieJar): Promise<{ ok: true } | { ok: false; offSite: true } | { ok: false; error: KaspiNetworkError }> {
  let nextUrl = MC_URL
  for (let hop = 0; hop < 10; hop++) {
    if (!isTrustedKaspiHost(nextUrl)) return { ok: false, offSite: true }
    let hopRes: Response
    try {
      hopRes = await kaspiFetch(nextUrl, { headers: { cookie: cookieHeader(jar) }, redirect: 'manual' })
    } catch (err) {
      if (err instanceof KaspiNetworkError) return { ok: false, error: err }
      throw err
    }
    mergeJar(jar, parseSetCookies(hopRes))
    if (hopRes.status < 300 || hopRes.status >= 400) break
    const location = hopRes.headers.get('location')
    if (!location) break
    nextUrl = new URL(location, nextUrl).toString()
  }
  return { ok: true }
}

// `code` may be omitted ONLY when otpToken is a resume token (see above): the
// spent one-time code is not re-posted, only the redirect hops are re-walked.
export async function submitOtp(otpToken: string, code?: string): Promise<LoginResult> {
  const decoded = decodeToken(otpToken)
  if (!decoded) return { status: 'error', code: 'invalid_token', message: 'otpToken недействителен' }
  const jar = decoded.jar

  if (decoded.kind === 'otp') {
    if (!code) return { status: 'error', code: 'code_required', message: 'Введите код из SMS' }
    // Retrying on a connection-level failure is safe: if the first request
    // reached Kaspi and only the response was lost, the retry gets a normal
    // "wrong/used code" HTTP answer -- the same state as not retrying. An
    // HTTP response of any status is never retried.
    let res: Response
    try {
      res = await kaspiFetch(LOGIN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: cookieHeader(jar) },
        body: JSON.stringify({ _c: code }),
      })
    } catch (err) {
      if (err instanceof KaspiNetworkError) {
        logNetworkFailure('otp_post', err)
        return unreachableResult('otp', err)
      }
      throw err
    }
    if (!res.ok) {
      return { status: 'error', code: 'otp_rejected', message: `Kaspi отклонил код из SMS (HTTP ${res.status})` }
    }
    mergeJar(jar, parseSetCookies(res))
  }

  // From here on Kaspi has accepted the code. Snapshot the jar BEFORE the walk
  // so any later failure can be resumed without a new SMS.
  const resumeToken = encodeResumeToken(jar)

  const walk = await walkSessionRedirects(jar)
  if (!walk.ok) {
    if ('offSite' in walk) {
      return { status: 'error', code: 'redirect_off_site', message: 'Kaspi вернул неожиданный адрес перехода — вход прерван' }
    }
    logNetworkFailure('redirect_walk', walk.error)
    return unreachableResult('otp', walk.error, resumeToken)
  }

  const sessionCookies = cookieHeader(jar)
  if (!jar.has('mc-session') || !jar.has('mc-sid')) {
    console.error('[kaspi-login] redirect_walk finished without mc-session/mc-sid')
    return {
      status: 'error',
      code: 'session_not_issued',
      message: connectErrorMessage('ru', 'session_not_issued', { step: 'otp', resumable: true })!,
      resumeToken,
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
