import { describe, it, expect, vi, beforeEach } from 'vitest'

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

const plainOtpToken = Buffer.from(JSON.stringify([['MS_AUTH_SSO', 'sso']])).toString('base64')
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
    const res = await POST(req({ otpToken: plainOtpToken }))
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
    const res = await POST(req({ otpToken: resumeToken, isReconnect: true }))
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
    const res = await POST(req({ otpToken: plainOtpToken, code: '123456' }))
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body).toMatchObject({ code: 'kaspi_unreachable', detail: 'ECONNRESET', resumable: true, resumeToken })
    expect(body.error).not.toContain('https://')
  })

  it('a connection failure AFTER the accepted code (merchant lookup) returns a resumable 502, not a 500', async () => {
    submitOtpSpy.mockResolvedValue({ status: 'success', sessionCookies: 'mc-session=a; mc-sid=b' })
    const err: any = new TypeError('fetch failed')
    err.cause = Object.assign(new Error('x'), { code: 'ECONNRESET' })
    listMerchants.mockRejectedValue(err)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(req({ otpToken: plainOtpToken, code: '123456' }))
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body).toMatchObject({ code: 'kaspi_unreachable', detail: 'ECONNRESET', resumable: true })
    expect(isResumeToken(body.resumeToken)).toBe(true)
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
    const res = await POST(req({ otpToken: plainOtpToken, code: '123456' }))
    expect(res.status).toBe(200)
    expect(listMerchants).toHaveBeenCalledTimes(2)
  })

  it('non-resumable errors keep 400 and resumable=false', async () => {
    submitOtpSpy.mockResolvedValue({ status: 'error', code: 'otp_rejected', message: 'Kaspi отклонил код из SMS (HTTP 400)' })
    const res = await POST(req({ otpToken: plainOtpToken, code: '000000' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'otp_rejected', resumable: false })
  })
})
