import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.hoisted(() => { process.env.KASPI_SHOP_ENCRYPTION_KEY = '11'.repeat(32) })

const { getUser, submitOtpSpy, listMerchants, getMerchantInfo, finalizeConnection } = vi.hoisted(() => ({
  getUser: vi.fn(),
  submitOtpSpy: vi.fn(),
  listMerchants: vi.fn(),
  getMerchantInfo: vi.fn(),
  finalizeConnection: vi.fn(),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { getUser } }) }))
vi.mock('@/lib/kaspiShop/planGate', () => ({ kaspiShopPlanGate: vi.fn(async () => null) }))
vi.mock('@/lib/kaspiShop/cabinetAuth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/kaspiShop/cabinetAuth')>('@/lib/kaspiShop/cabinetAuth')
  return { ...actual, submitOtp: (...a: unknown[]) => submitOtpSpy(...a) }
})
vi.mock('@/lib/kaspiShop/cabinetApi', () => ({
  listMerchants: (...a: unknown[]) => listMerchants(...a),
  getMerchantInfo: (...a: unknown[]) => getMerchantInfo(...a),
}))
vi.mock('@/lib/kaspiShop/finalizeConnection', () => ({ finalizeConnection: (...a: unknown[]) => finalizeConnection(...a) }))
vi.mock('@/lib/kaspiShop/connection', () => ({ listConnections: vi.fn(async () => []) }))

import { POST } from './route'
import { isResumeToken, kaspiFetchTuning } from '@/lib/kaspiShop/cabinetAuth'
import { openConnectToken, sealConnectToken } from '@/lib/kaspiShop/connectTokens'

const plainOtpToken = Buffer.from(JSON.stringify([['MS_AUTH_SSO', 'sso']])).toString('base64')
// Токены в запросах приходят зашифрованными (connectTokens.ts), к Kaspi уходят расшифрованными.
const sealOtp = (t: string, user = 'u1') => sealConnectToken(user, 'otp', t)
const resumeToken = Buffer.from(JSON.stringify({ v: 1, verified: true, jar: [['MS_AUTH_SSO', 'sso']] })).toString('base64')

function req(body: unknown) {
  return new Request('http://localhost/api/kaspi-shop/connect/otp', {
    method: 'POST',
    headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest
}

describe('POST /api/kaspi-shop/connect/otp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  })

  it('rejects a normal otpToken without a code (400) and never calls Kaspi', async () => {
    const res = await POST(req({ otpToken: sealOtp(plainOtpToken) }))
    expect(res.status).toBe(400)
    expect(submitOtpSpy).not.toHaveBeenCalled()
  })

  it('rejects a missing otpToken', async () => {
    const res = await POST(req({ code: '123456' }))
    expect(res.status).toBe(400)
    expect(submitOtpSpy).not.toHaveBeenCalled()
  })

  it('accepts a resume token without a code and passes no code on', async () => {
    submitOtpSpy.mockResolvedValue({ status: 'success', sessionCookies: 'mc-session=a; mc-sid=b' })
    listMerchants.mockResolvedValue([{ uid: 'm1' }])
    getMerchantInfo.mockResolvedValue({ name: 'Shop' })
    finalizeConnection.mockResolvedValue({ importedProducts: 3 })
    const res = await POST(req({ otpToken: sealOtp(resumeToken), isReconnect: true }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'connected', companyName: 'Shop' })
    expect(submitOtpSpy).toHaveBeenCalledWith(resumeToken, undefined)
  })

  it('returns the resumable error contract with 502 when Kaspi is unreachable after an accepted code', async () => {
    submitOtpSpy.mockResolvedValue({
      status: 'error',
      code: 'kaspi_unreachable',
      detail: 'ECONNRESET',
      message: 'Kaspi не ответил. Код из SMS уже принят — нажмите «Повторить», новый код не нужен.',
      resumeToken,
    })
    const res = await POST(req({ otpToken: sealOtp(plainOtpToken), code: '123456' }))
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body).toMatchObject({ code: 'kaspi_unreachable', detail: 'ECONNRESET', resumable: true })
    expect(openConnectToken('u1', 'otp', body.resumeToken)).toBe(resumeToken)
    expect(body.error).not.toContain('https://')
  })

  it('a connection failure AFTER the accepted code (merchant lookup) returns a resumable 502, not a 500', async () => {
    submitOtpSpy.mockResolvedValue({ status: 'success', sessionCookies: 'mc-session=a; mc-sid=b' })
    const err: any = new TypeError('fetch failed')
    err.cause = Object.assign(new Error('x'), { code: 'ECONNRESET' })
    listMerchants.mockRejectedValue(err)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(req({ otpToken: sealOtp(plainOtpToken), code: '123456' }))
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body).toMatchObject({ code: 'kaspi_unreachable', detail: 'ECONNRESET', resumable: true })
    expect(isResumeToken(openConnectToken('u1', 'otp', body.resumeToken))).toBe(true)
    expect(body.error).not.toContain('https://')
    expect(finalizeConnection).not.toHaveBeenCalled()
  })

  it('a transient merchant-lookup failure is retried and then succeeds', async () => {
    submitOtpSpy.mockResolvedValue({ status: 'success', sessionCookies: 'mc-session=a; mc-sid=b' })
    const err: any = new TypeError('fetch failed')
    listMerchants.mockRejectedValueOnce(err).mockResolvedValue([{ uid: 'm1' }])
    getMerchantInfo.mockResolvedValue({ name: 'Shop' })
    finalizeConnection.mockResolvedValue({ importedProducts: 1 })
    kaspiFetchTuning.backoffMs = [0, 0]
    const res = await POST(req({ otpToken: sealOtp(plainOtpToken), code: '123456' }))
    expect(res.status).toBe(200)
    expect(listMerchants).toHaveBeenCalledTimes(2)
  })

  it('non-resumable errors keep 400 and resumable=false', async () => {
    submitOtpSpy.mockResolvedValue({ status: 'error', code: 'otp_rejected', message: 'Kaspi отклонил код из SMS (HTTP 400)' })
    const res = await POST(req({ otpToken: sealOtp(plainOtpToken), code: '000000' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'otp_rejected', resumable: false })
  })

  it('чужой, просроченный, подделанный и открытый (без шифрования) токены отклоняются без обращения к Kaspi', async () => {
    const foreign = sealOtp(plainOtpToken, 'u2') // выдан другому человеку
    const expired = sealConnectToken('u1', 'otp', plainOtpToken, Date.now() - 16 * 60_000)
    const wrongKind = sealConnectToken('u1', 'session', plainOtpToken)
    for (const otpToken of [foreign, expired, wrongKind, plainOtpToken, 'not-a-token', foreign.slice(0, -4) + 'AAAA']) {
      const res = await POST(req({ otpToken, code: '123456' }))
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ code: 'invalid_token' })
    }
    expect(submitOtpSpy).not.toHaveBeenCalled()
  })

  it('несколько магазинов на номере: sessionToken зашифрован и привязан к человеку (куки Kaspi в нём не читаются)', async () => {
    submitOtpSpy.mockResolvedValue({ status: 'success', sessionCookies: 'mc-session=secret-a; mc-sid=secret-b' })
    listMerchants.mockResolvedValue([{ uid: 'm1' }, { uid: 'm2' }])
    getMerchantInfo.mockResolvedValue({ name: 'Shop' })
    const res = await POST(req({ otpToken: sealOtp(plainOtpToken), code: '123456' }))
    const body = await res.json()
    expect(body.status).toBe('merchant_required')
    expect(Buffer.from(body.sessionToken, 'base64').toString('utf8')).not.toContain('secret-a')
    expect(openConnectToken('u1', 'session', body.sessionToken)).toBe('mc-session=secret-a; mc-sid=secret-b')
    expect(openConnectToken('u2', 'session', body.sessionToken)).toBeNull()
  })
})
