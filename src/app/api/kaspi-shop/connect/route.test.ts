import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSecDb } from '@/lib/kaspiShop/secDb.testkit'

const { getUser, startPhoneLogin, state } = vi.hoisted(() => ({
  getUser: vi.fn(),
  startPhoneLogin: vi.fn(),
  state: { db: null as any },
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser }, from: (t: string) => state.db.client.from(t) }),
}))
vi.mock('@/lib/kaspiShop/planGate', () => ({ kaspiShopPlanGate: vi.fn(async () => null) }))
vi.mock('@/lib/kaspiShop/cabinetAuth', () => ({ startPhoneLogin: (...a: unknown[]) => startPhoneLogin(...a) }))

import { POST } from './route'
import { COUNTER_TABLE } from '@/lib/toolQuota'
import { USER_HOURLY_LIMIT, PHONE_HOURLY_LIMIT, IP_HOURLY_LIMIT } from '@/lib/kaspiShop/connectSmsLimits'

function req(body: unknown, ip = '10.0.0.1', raw?: string) {
  return new Request('http://localhost/api/kaspi-shop/connect', {
    method: 'POST',
    headers: { authorization: 'Bearer tok', 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: raw ?? JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest
}

describe('POST /api/kaspi-shop/connect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    state.db = makeSecDb()
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    startPhoneLogin.mockResolvedValue({ status: 'otp_required', otpToken: 'tok' })
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
    const res = await POST(req({ phone: '7000000000' }))
    expect(await res.json()).toEqual({ status: 'otp_required', otpToken: 'tok' })
  })

  describe('K48: phone validation (nothing reaches Kaspi, no slot is spent)', () => {
    it.each([
      ['an object', { phone: { $ne: 1 } }],
      ['a number', { phone: 77771234567 }],
      ['an array', { phone: ['+7 777 123 45 67'] }],
      ['null', { phone: null }],
      ['a boolean', { phone: true }],
    ])('rejects %s', async (_name, body) => {
      const res = await POST(req(body))
      expect(res.status).toBe(400)
      expect(startPhoneLogin).not.toHaveBeenCalled()
      expect(state.db.tables[COUNTER_TABLE] ?? []).toHaveLength(0)
    })

    it.each(['+7 777 123 45 67 8', '+7 777 123 45 678 9', '8 777 123 45 67 89'])(
      'rejects a number with more than eleven digits instead of silently truncating it: %j', async phone => {
        const res = await POST(req({ phone }))
        expect(res.status).toBe(400)
        expect((await res.json()).code).toBe('phone_invalid')
        expect(startPhoneLogin).not.toHaveBeenCalled()
        expect(state.db.tables[COUNTER_TABLE] ?? []).toHaveLength(0)
      })

    it.each(['', '   ', '777', '+7 777 123', 'not a phone', '+7 777 123 45 67 89 12 34 56 78 90 12 34 56 78 90 12 34'])(
      'rejects the string %j', async phone => {
        const res = await POST(req({ phone }))
        expect(res.status).toBe(400)
        expect(startPhoneLogin).not.toHaveBeenCalled()
      })

    it('rejects a missing body field and a JSON null body', async () => {
      expect((await POST(req({}))).status).toBe(400)
      expect((await POST(req(null))).status).toBe(400)
      expect(startPhoneLogin).not.toHaveBeenCalled()
    })

    it('rejects malformed JSON', async () => {
      expect((await POST(req(null, '10.0.0.1', '{oops'))).status).toBe(400)
    })

    it('forwards to Kaspi the normalized "+7 777 123 45 67" form, whatever was typed', async () => {
      for (const typed of ['+7 777 123 45 67', '87771234567', '7771234567', '+7 (777) 123-45-67']) {
        await POST(req({ phone: typed }, `10.1.0.${Math.floor(Math.random() * 200)}`))
        expect(startPhoneLogin).toHaveBeenLastCalledWith('+7 777 123 45 67')
        state.db = makeSecDb()
      }
    })

    it('answers 401 without a session before touching limits or Kaspi', async () => {
      getUser.mockResolvedValue({ data: { user: null } })
      const res = await POST(req({ phone: '+7 777 123 45 67' }))
      expect(res.status).toBe(401)
      expect(startPhoneLogin).not.toHaveBeenCalled()
    })
  })

  describe('K48: rate limits answer 429 with retry info and a Russian message', () => {
    it(`per user: the ${USER_HOURLY_LIMIT + 1}th request in an hour is refused`, async () => {
      for (let i = 0; i < USER_HOURLY_LIMIT; i++) {
        const ok = await POST(req({ phone: `+7 777 000 00 0${i}` }, `10.2.0.${i}`))
        expect(ok.status).toBe(200)
      }
      const res = await POST(req({ phone: '+7 777 000 00 09' }, '10.2.0.99'))
      expect(res.status).toBe(429)
      const body = await res.json()
      expect(body).toMatchObject({ code: 'rate_limited', scope: 'user' })
      expect(body.retryAfterSec).toBeGreaterThan(0)
      expect(res.headers.get('Retry-After')).toBe(String(body.retryAfterSec))
      expect(body.error).toMatch(/Слишком много SMS-запросов/)
      expect(body.error).toMatch(/мин\./)
      expect(startPhoneLogin).toHaveBeenCalledTimes(USER_HOURLY_LIMIT)
    })

    it(`per phone: the ${PHONE_HOURLY_LIMIT + 1}th SMS to one number is refused even from other users and IPs`, async () => {
      for (let i = 0; i < PHONE_HOURLY_LIMIT; i++) {
        getUser.mockResolvedValue({ data: { user: { id: `user${i}` } } })
        expect((await POST(req({ phone: '+7 777 123 45 67' }, `10.3.0.${i}`))).status).toBe(200)
      }
      getUser.mockResolvedValue({ data: { user: { id: 'victim-attacker' } } })
      const res = await POST(req({ phone: '8 777 123 45 67' }, '10.3.0.99'))
      expect(res.status).toBe(429)
      expect(await res.json()).toMatchObject({ code: 'rate_limited', scope: 'phone' })
      expect(startPhoneLogin).toHaveBeenCalledTimes(PHONE_HOURLY_LIMIT)
    })

    it(`per IP: the ${IP_HOURLY_LIMIT + 1}th request from one address is refused even with new users and phones`, async () => {
      for (let i = 0; i < IP_HOURLY_LIMIT; i++) {
        getUser.mockResolvedValue({ data: { user: { id: `user${i}` } } })
        expect((await POST(req({ phone: `+7 701 000 00 ${String(i).padStart(2, '0')}` }, '10.4.0.1'))).status).toBe(200)
      }
      getUser.mockResolvedValue({ data: { user: { id: 'fresh' } } })
      const res = await POST(req({ phone: '+7 702 000 00 01' }, '10.4.0.1'))
      expect(res.status).toBe(429)
      expect(await res.json()).toMatchObject({ code: 'rate_limited', scope: 'ip' })
    })

    it('the slot is consumed even when Kaspi refuses the number', async () => {
      startPhoneLogin.mockResolvedValue({ status: 'error', code: 'phone_rejected', message: 'Kaspi отклонил номер телефона (HTTP 400)' })
      for (let i = 0; i < PHONE_HOURLY_LIMIT; i++) {
        expect((await POST(req({ phone: '+7 777 555 44 33' }, `10.5.0.${i}`))).status).toBe(400)
      }
      expect((await POST(req({ phone: '+7 777 555 44 33' }, '10.5.0.99'))).status).toBe(429)
      expect(startPhoneLogin).toHaveBeenCalledTimes(PHONE_HOURLY_LIMIT)
    })

    it('gives the user, phone and IP slots back when Kaspi was unreachable (nothing was sent)', async () => {
      startPhoneLogin.mockResolvedValue({
        status: 'error', code: 'kaspi_unreachable', detail: 'ECONNRESET', message: 'Kaspi не ответил. Попробуйте ещё раз через минуту.',
      })
      // Больше попыток, чем лимит на номер: каждая заканчивается «Kaspi недоступен», слоты возвращаются.
      for (let i = 0; i < PHONE_HOURLY_LIMIT + 2; i++) {
        expect((await POST(req({ phone: '+7 777 666 55 44' }, '10.6.0.1'))).status).toBe(502)
      }
      expect(startPhoneLogin).toHaveBeenCalledTimes(PHONE_HOURLY_LIMIT + 2)
      const spent = (state.db.tables[COUNTER_TABLE] ?? []).reduce((sum: number, r: any) => sum + r.count, 0)
      expect(spent).toBe(0)
      // И после этого обычная попытка проходит.
      startPhoneLogin.mockResolvedValue({ status: 'otp_required', otpToken: 'tok' })
      expect((await POST(req({ phone: '+7 777 666 55 44' }, '10.6.0.1'))).status).toBe(200)
    })

    it('keeps the slots when Kaspi refused the number (the SMS may have gone out)', async () => {
      startPhoneLogin.mockResolvedValue({ status: 'error', code: 'phone_rejected', message: 'Kaspi отклонил номер телефона (HTTP 400)' })
      expect((await POST(req({ phone: '+7 777 777 11 22' }, '10.7.0.1'))).status).toBe(400)
      const spent = (state.db.tables[COUNTER_TABLE] ?? []).reduce((sum: number, r: any) => sum + r.count, 0)
      expect(spent).toBe(3) // пользователь, номер, IP
    })

    it('answers 503 and sends nothing when the limit counter is unavailable', async () => {
      state.db.fail.add(COUNTER_TABLE)
      const res = await POST(req({ phone: '+7 777 123 45 67' }))
      expect(res.status).toBe(503)
      expect((await res.json()).code).toBe('limit_unavailable')
      expect(startPhoneLogin).not.toHaveBeenCalled()
    })
  })
})
