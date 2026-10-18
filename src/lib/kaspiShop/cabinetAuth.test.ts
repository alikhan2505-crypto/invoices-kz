import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  startPhoneLogin,
  submitOtp,
  isResumeToken,
  kaspiFetchTuning,
  KASPI_FETCH_TIMEOUT_MS,
  KASPI_FETCH_MAX_ATTEMPTS,
  withConnectionRetry,
  resumeTokenFromSession,
} from './cabinetAuth'

// All traffic is mocked: nothing here ever reaches Kaspi or sends an SMS.

const LOGIN_URL = 'https://idmc.shop.kaspi.kz/api/p/login'

function otpTokenFor(entries: [string, string][] = [['MS_AUTH_SSO', 'sso1']]) {
  return Buffer.from(JSON.stringify(entries)).toString('base64')
}

function fetchFailed(code = 'ECONNRESET') {
  const err: any = new TypeError('fetch failed')
  err.cause = Object.assign(new Error('read ECONNRESET'), { code })
  return err
}

function resp(status: number, opts: { location?: string; cookies?: string[]; body?: string } = {}) {
  const headers = new Headers()
  if (opts.location) headers.set('location', opts.location)
  for (const c of opts.cookies ?? []) headers.append('set-cookie', c)
  return new Response(opts.body ?? null, { status, headers })
}

// idmc authorize hop -> mc code hop (mints mc-session/mc-sid) -> final page
function happyHops() {
  return [
    resp(302, { location: 'https://idmc.shop.kaspi.kz/oauth2/authorize?state=S&code_challenge=C' }),
    resp(302, { location: 'https://mc.shop.kaspi.kz/login/oauth2/code/1?code=X&state=S' }),
    resp(302, { location: 'https://kaspi.kz/mc/', cookies: ['mc-session=abc; Path=/', 'mc-sid=def; Path=/'] }),
    resp(200),
  ]
}

let fetchMock: ReturnType<typeof vi.fn>
const realTuning = { ...kaspiFetchTuning }

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  kaspiFetchTuning.backoffMs = [0, 0]
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  kaspiFetchTuning.timeoutMs = realTuning.timeoutMs
  kaspiFetchTuning.backoffMs = realTuning.backoffMs
})

describe('constants', () => {
  it('uses a 15s per-request timeout and 3 attempts', () => {
    expect(KASPI_FETCH_TIMEOUT_MS).toBe(15_000)
    expect(KASPI_FETCH_MAX_ATTEMPTS).toBe(3)
    expect(realTuning.backoffMs).toEqual([300, 900])
  })
})

describe('submitOtp retries', () => {
  it('retries the code POST on a connection failure, then succeeds', async () => {
    fetchMock
      .mockRejectedValueOnce(fetchFailed())
      .mockResolvedValueOnce(resp(200, { cookies: ['MS_AUTH_SSO=sso2; Path=/'] }))
    for (const r of happyHops()) fetchMock.mockResolvedValueOnce(r)

    const result = await submitOtp(otpTokenFor(), '123456')
    expect(result.status).toBe('success')
    const posts = fetchMock.mock.calls.filter(c => c[0] === LOGIN_URL)
    expect(posts).toHaveLength(2)
    // the timeout signal is attached to every request
    expect(posts[0][1].signal).toBeInstanceOf(AbortSignal)
  })

  it('does not retry on an HTTP 4xx from the code POST', async () => {
    fetchMock.mockResolvedValueOnce(resp(400))
    const result = await submitOtp(otpTokenFor(), '000000')
    expect(result).toMatchObject({ status: 'error', code: 'otp_rejected' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not retry on an HTTP 5xx from the code POST', async () => {
    fetchMock.mockResolvedValueOnce(resp(503))
    const result = await submitOtp(otpTokenFor(), '000000')
    expect(result).toMatchObject({ status: 'error', code: 'otp_rejected' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('gives up after 3 attempts on the code POST: not resumable, friendly, with cause code', async () => {
    fetchMock.mockRejectedValue(fetchFailed('ETIMEDOUT'))
    const result = await submitOtp(otpTokenFor(), '123456')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(result.status).toBe('error')
    if (result.status !== 'error') return
    expect(result.code).toBe('kaspi_unreachable')
    expect(result.detail).toBe('ETIMEDOUT')
    expect(result.resumeToken).toBeUndefined()
    expect(result.message).toContain('запросите новый')
    expect(result.message).not.toContain('https://')
  })

  it('treats a timeout (AbortSignal.timeout) as a retryable connection failure', async () => {
    kaspiFetchTuning.timeoutMs = 15
    // A fetch that never answers on its own and only rejects when aborted.
    fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_res, rej) => {
      init.signal!.addEventListener('abort', () => rej(init.signal!.reason))
    }))
    const result = await submitOtp(otpTokenFor(), '123456')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(result).toMatchObject({ status: 'error', code: 'kaspi_unreachable', detail: 'TIMEOUT' })
  })

  it('does not retry or mask a non-network error (e.g. a programming TypeError): rethrown unchanged', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to parse URL'))
    await expect(submitOtp(otpTokenFor(), '123456')).rejects.toThrow('Failed to parse URL')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('the retried code POST resends the identical cookie and body', async () => {
    fetchMock
      .mockRejectedValueOnce(fetchFailed())
      .mockRejectedValueOnce(fetchFailed('ETIMEDOUT'))
      .mockResolvedValueOnce(resp(200))
    for (const r of happyHops()) fetchMock.mockResolvedValueOnce(r)
    await submitOtp(otpTokenFor(), '123456')
    const posts = fetchMock.mock.calls.filter(c => c[0] === LOGIN_URL)
    expect(posts).toHaveLength(3)
    for (const p of posts) {
      expect(p[1].body).toBe(JSON.stringify({ _c: '123456' }))
      expect(p[1].headers.cookie).toBe('MS_AUTH_SSO=sso1')
      expect(p[1].method).toBe('POST')
    }
  })
})

describe('submitOtp resumable step', () => {
  async function failHopsAfterAcceptedCode() {
    fetchMock.mockResolvedValueOnce(resp(200, { cookies: ['MS_AUTH_SSO=sso2; Path=/'] }))
    // The first hop's connection keeps failing (3 attempts).
    fetchMock.mockRejectedValue(fetchFailed('UND_ERR_CONNECT_TIMEOUT'))
    return submitOtp(otpTokenFor(), '123456')
  }

  it('returns a resumable error with a token when the hop walk fails after the code was accepted', async () => {
    const result = await failHopsAfterAcceptedCode()
    expect(result.status).toBe('error')
    if (result.status !== 'error') return
    expect(result.code).toBe('kaspi_unreachable')
    expect(result.detail).toBe('UND_ERR_CONNECT_TIMEOUT')
    expect(result.resumeToken).toBeTruthy()
    expect(isResumeToken(result.resumeToken)).toBe(true)
    expect(result.message).toContain('уже принят')
    expect(result.message).not.toContain('https://')
    expect(result.message).not.toContain('oauth')
    // 1 code POST + 3 attempts at the first hop
    expect(fetchMock).toHaveBeenCalledTimes(4)
    // the token carries the cookies from the accepted POST
    const decoded = JSON.parse(Buffer.from(result.resumeToken!, 'base64').toString('utf8'))
    expect(decoded.verified).toBe(true)
    expect(Object.fromEntries(decoded.jar).MS_AUTH_SSO).toBe('sso2')
  })

  it('resume with the token skips the code POST and completes', async () => {
    const failed = await failHopsAfterAcceptedCode()
    if (failed.status !== 'error') throw new Error('setup')
    fetchMock.mockReset()
    for (const r of happyHops()) fetchMock.mockResolvedValueOnce(r)

    const result = await submitOtp(failed.resumeToken!)
    expect(result.status).toBe('success')
    expect(fetchMock.mock.calls.some(c => c[0] === LOGIN_URL)).toBe(false)
    // the resumed walk still sends the accepted cookies, only to kaspi.kz hosts
    for (const c of fetchMock.mock.calls) {
      expect(new URL(c[0]).hostname.endsWith('kaspi.kz')).toBe(true)
    }
    expect(fetchMock.mock.calls[0][1].headers.cookie).toContain('MS_AUTH_SSO=sso2')
    if (result.status === 'success') expect(result.sessionCookies).toContain('mc-session=abc')
  })

  it('resume ignores a code if one is passed along with the resume token', async () => {
    const failed = await failHopsAfterAcceptedCode()
    if (failed.status !== 'error') throw new Error('setup')
    fetchMock.mockReset()
    for (const r of happyHops()) fetchMock.mockResolvedValueOnce(r)
    const result = await submitOtp(failed.resumeToken!, '123456')
    expect(result.status).toBe('success')
    expect(fetchMock.mock.calls.some(c => c[0] === LOGIN_URL)).toBe(false)
  })

  it('a missing mc-session/mc-sid after an accepted code is also resumable', async () => {
    fetchMock.mockResolvedValueOnce(resp(200))
    fetchMock.mockResolvedValue(resp(200)) // hop answers 200 with no cookies
    const result = await submitOtp(otpTokenFor(), '123456')
    expect(result).toMatchObject({ status: 'error', code: 'session_not_issued' })
    if (result.status === 'error') {
      expect(isResumeToken(result.resumeToken)).toBe(true)
      expect(result.message).not.toContain('https://')
    }
  })

  it('refuses to walk off kaspi.kz and leaks no URL', async () => {
    fetchMock.mockResolvedValueOnce(resp(200))
    fetchMock.mockResolvedValueOnce(resp(302, { location: 'https://evil.example.com/steal?state=S' }))
    const result = await submitOtp(otpTokenFor(), '123456')
    expect(result).toMatchObject({ status: 'error', code: 'redirect_off_site' })
    if (result.status === 'error') expect(result.message).not.toContain('https://')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('hop walk: an HTTP 5xx / 4xx on a hop is never retried', async () => {
    for (const status of [503, 403]) {
      fetchMock.mockReset()
      fetchMock.mockResolvedValueOnce(resp(200))
      fetchMock.mockResolvedValue(resp(status))
      const result = await submitOtp(otpTokenFor(), '123456')
      // 1 code POST + exactly 1 hop request, no retries
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(result).toMatchObject({ status: 'error', code: 'session_not_issued' })
    }
  })

  it('hop walk: retries a connection failure on one hop then proceeds', async () => {
    fetchMock.mockResolvedValueOnce(resp(200))
    const hops = happyHops()
    fetchMock.mockResolvedValueOnce(hops[0])
    fetchMock.mockRejectedValueOnce(fetchFailed())
    fetchMock.mockResolvedValueOnce(hops[1])
    fetchMock.mockResolvedValueOnce(hops[2])
    fetchMock.mockResolvedValueOnce(hops[3])
    const result = await submitOtp(otpTokenFor(), '123456')
    expect(result.status).toBe('success')
  })
})

describe('withConnectionRetry / resumeTokenFromSession', () => {
  it('retries connection errors, rethrows others, never retries a returned value', async () => {
    const ok = vi.fn().mockRejectedValueOnce(fetchFailed()).mockResolvedValueOnce('fine')
    await expect(withConnectionRetry(ok)).resolves.toBe('fine')
    expect(ok).toHaveBeenCalledTimes(2)

    const bad = vi.fn().mockRejectedValue(new Error('boom'))
    await expect(withConnectionRetry(bad)).rejects.toThrow('boom')
    expect(bad).toHaveBeenCalledTimes(1)

    const dead = vi.fn().mockRejectedValue(fetchFailed('ECONNRESET'))
    await expect(withConnectionRetry(dead)).rejects.toMatchObject({ message: 'kaspi_unreachable', causeCode: 'ECONNRESET' })
    expect(dead).toHaveBeenCalledTimes(3)
  })

  it('builds a valid resume token from an issued session cookie header', () => {
    const token = resumeTokenFromSession('mc-session=abc; mc-sid=d=ef; MS_AUTH_SSO=sso')!
    expect(isResumeToken(token)).toBe(true)
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'))
    expect(Object.fromEntries(decoded.jar)).toMatchObject({ 'mc-session': 'abc', 'mc-sid': 'd=ef' })
  })
})

describe('tokens', () => {
  it('a plain otpToken is not a resume token and needs a code', async () => {
    expect(isResumeToken(otpTokenFor())).toBe(false)
    const result = await submitOtp(otpTokenFor())
    expect(result).toMatchObject({ status: 'error', code: 'code_required' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects garbage and tampered tokens', async () => {
    expect(isResumeToken('%%%')).toBe(false)
    expect(isResumeToken(undefined)).toBe(false)
    const injected = Buffer.from(JSON.stringify({ v: 1, verified: true, jar: [['a', 'b\r\nx-evil: 1']] })).toString('base64')
    expect(isResumeToken(injected)).toBe(false)
    const result = await submitOtp(injected)
    expect(result).toMatchObject({ status: 'error', code: 'invalid_token' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('startPhoneLogin', () => {
  it('does NOT retry the phone POST (a duplicate SMS is worse) and returns a friendly error', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://idmc.shop.kaspi.kz/login') return resp(200, { cookies: ['MS_AUTH_SSO=s; Path=/'] })
      throw fetchFailed('ECONNRESET')
    })
    const result = await startPhoneLogin('+77001112233')
    expect(fetchMock.mock.calls.filter(c => c[0] === LOGIN_URL)).toHaveLength(1)
    expect(result).toMatchObject({ status: 'error', code: 'kaspi_unreachable', detail: 'ECONNRESET' })
    if (result.status === 'error') {
      expect(result.resumeToken).toBeUndefined()
      expect(result.message).not.toContain('https://')
    }
  })

  it('returns an otpToken on success', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === 'https://idmc.shop.kaspi.kz/login' ? resp(200, { cookies: ['MS_AUTH_SSO=s; Path=/'] }) : resp(200, { cookies: ['X=1; Path=/'] }),
    )
    const result = await startPhoneLogin('+77001112233')
    expect(result.status).toBe('otp_required')
    if (result.status === 'otp_required') expect(isResumeToken(result.otpToken)).toBe(false)
  })
})
