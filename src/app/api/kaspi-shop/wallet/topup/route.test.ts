import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Сумма пополнения кошелька (аудит 14.11.2026): только целые тенге от минимума до
// потолка. Дробные и огромные суммы не должны доходить до Kaspi.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key'
})

const h = vi.hoisted(() => ({ createPayment: vi.fn() }))

vi.mock('@supabase/supabase-js', () => {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    gte: () => Promise.resolve({ count: 0, error: null }),
    insert: () => chain,
    single: async () => ({ data: { id: 'topup-1' }, error: null }),
  }
  return { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) }, from: () => chain }) }
})
vi.mock('@/lib/kaspiPay/connection', () => ({ loadPlatformConnection: async () => ({ id: 'platform' }) }))
vi.mock('@/lib/kaspiPay/client', () => ({ createPayment: h.createPayment }))

import { POST } from './route'

const call = (body: unknown, raw = false) => POST(new NextRequest('http://localhost/api/kaspi-shop/wallet/topup', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
  body: raw ? (body as string) : JSON.stringify(body),
}))

beforeEach(() => {
  h.createPayment.mockReset()
  h.createPayment.mockResolvedValue({ operationId: 'op1', qrToken: 'qr', paymentLink: 'https://pay', expiresAt: '2026-11-14T20:00:00Z' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/kaspi-shop/wallet/topup: сумма', () => {
  it('нормальная целая сумма проходит и уходит в Kaspi как есть', async () => {
    const res = await call({ amountTenge: 1500 })
    expect(res.status).toBe(200)
    expect(h.createPayment).toHaveBeenCalledTimes(1)
    expect(h.createPayment.mock.calls[0][1].amount).toBe(1500)
  })

  it('граница: минимум 500 и потолок 1 000 000 проходят', async () => {
    expect((await call({ amountTenge: 500 })).status).toBe(200)
    expect((await call({ amountTenge: 1_000_000 })).status).toBe(200)
  })

  it('дробная, ниже минимума, выше потолка, не число, нет тела: 400, Kaspi не зовём', async () => {
    for (const body of [{ amountTenge: 500.7 }, { amountTenge: 499 }, { amountTenge: 1_000_001 }, { amountTenge: 1e12 }, { amountTenge: '1500' }, { amountTenge: null }, { amountTenge: -1000 }, {}]) {
      expect((await call(body)).status).toBe(400)
    }
    expect((await call('not json', true)).status).toBe(400)
    expect(h.createPayment).not.toHaveBeenCalled()
  })
})
