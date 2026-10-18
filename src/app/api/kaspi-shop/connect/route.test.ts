import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getUser, startPhoneLogin } = vi.hoisted(() => ({ getUser: vi.fn(), startPhoneLogin: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { getUser } }) }))
vi.mock('@/lib/kaspiShop/planGate', () => ({ kaspiShopPlanGate: vi.fn(async () => null) }))
vi.mock('@/lib/kaspiShop/cabinetAuth', () => ({ startPhoneLogin: (...a: unknown[]) => startPhoneLogin(...a) }))

import { POST } from './route'

function req(body: unknown) {
  return new Request('http://localhost/api/kaspi-shop/connect', {
    method: 'POST',
    headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest
}

describe('POST /api/kaspi-shop/connect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  })

  it('maps kaspi_unreachable to 502 with code and detail, no URL in the message', async () => {
    startPhoneLogin.mockResolvedValue({
      status: 'error', code: 'kaspi_unreachable', detail: 'ECONNRESET',
      message: 'Kaspi не ответил. Попробуйте ещё раз через минуту.',
    })
    const res = await POST(req({ phone: '7000000000' }))
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body).toMatchObject({ code: 'kaspi_unreachable', detail: 'ECONNRESET' })
    expect(body.error).not.toContain('https://')
  })

  it('keeps 400 for other login errors', async () => {
    startPhoneLogin.mockResolvedValue({ status: 'error', code: 'phone_rejected', message: 'Kaspi отклонил номер телефона (HTTP 400)' })
    const res = await POST(req({ phone: '7000000000' }))
    expect(res.status).toBe(400)
  })

  it('returns the otpToken on success', async () => {
    startPhoneLogin.mockResolvedValue({ status: 'otp_required', otpToken: 'tok' })
    const res = await POST(req({ phone: '7000000000' }))
    expect(await res.json()).toEqual({ status: 'otp_required', otpToken: 'tok' })
  })
})