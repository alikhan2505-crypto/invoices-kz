import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Разбор кривого тела публичного роута (аудит 02.11.2026, раздел 4). Лимиты и
// push живут в route.test.ts; здесь подменены, чтобы проверить только вход.
const h = vi.hoisted(() => ({
  lookups: [] as unknown[],
  create: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: (_c: string, token: unknown) => {
          h.lookups.push(token)
          return { maybeSingle: async () => ({ data: token === 'tok' ? { id: 'inv1', user_id: 'u1', amount: 5000, status: 'sent' } : null, error: null }) }
        },
      }),
    }),
  }),
}))
vi.mock('@/lib/kaspiPay/invoicePushLimits', () => ({
  claimInvoicePushSlots: async () => ({ ok: true, release: async () => {} }),
}))
vi.mock('@/lib/kaspiPay/invoicePayment', () => ({ createPhonePaymentForInvoice: h.create }))

import { POST } from './route'

const call = (raw: string) => POST(new NextRequest('http://localhost/api/kaspi/invoice-payment-phone', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: raw,
}))

beforeEach(() => {
  h.lookups = []
  h.create.mockReset()
  h.create.mockResolvedValue({ ok: true, payment: { id: 'p1' } })
})

describe('POST /api/kaspi/invoice-payment-phone: кривой ввод', () => {
  it('тело не JSON, пустое или не объект: 400 token required, база и Kaspi не затронуты', async () => {
    for (const raw of ['not json', '', 'null', '[]', '"x"', '123']) {
      const res = await call(raw)
      expect(res.status, raw).toBe(400)
      expect(await res.json()).toEqual({ error: 'token required' })
    }
    expect(h.lookups).toHaveLength(0)
    expect(h.create).not.toHaveBeenCalled()
  })

  it('token не строка (число, объект, массив): 400, в запрос к базе он не попадает', async () => {
    for (const raw of ['{"token":123}', '{"token":{"$ne":1}}', '{"token":["tok"]}', '{"token":null}', '{"token":""}']) {
      expect((await call(raw)).status, raw).toBe(400)
    }
    expect(h.lookups).toHaveLength(0)
  })

  it('корректное тело работает как раньше', async () => {
    const res = await call(JSON.stringify({ token: 'tok', phone: '+7 777 123 45 67' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(h.lookups).toEqual(['tok'])
  })

  it('телефон не строки (число, объект) не роняет роут: передаётся дальше, решает createPhonePaymentForInvoice', async () => {
    h.create.mockResolvedValue({ ok: false, reason: 'invalid_phone' })
    const res = await call(JSON.stringify({ token: 'tok', phone: { a: 1 } }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_phone' })
  })
})
