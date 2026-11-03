import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { makeFakeDb } from '@/lib/fakeDb.testkit'
import { COUNTER_TABLE } from '@/lib/toolQuota'
import { resetInvoicePushMemory } from '@/lib/kaspiPay/invoicePushLimits'
import { PHONE_HOURLY_LIMIT, IP_HOURLY_LIMIT } from '@/lib/kaspiPay/phonePushLimits'

const h = vi.hoisted(() => ({
  db: null as any,
  create: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (table: string) => h.db.client.from(table) }),
}))
vi.mock('@/lib/kaspiPay/invoicePayment', () => ({ createPhonePaymentForInvoice: h.create }))

import { POST } from './route'

const PHONE = '+7 777 123 45 67'
const phoneN = (i: number) => `+7 700 000 00 ${String(i).padStart(2, '0')}`

// Много публичных ссылок на разные счета -- то самое «владелец пачки токенов».
const invoices = Array.from({ length: 30 }, (_, i) => ({
  id: `inv${i}`, user_id: 'owner1', amount: 5000, status: 'sent', public_token: `tok${i}`,
}))

const call = (body: unknown, ip: string | null = '203.0.113.5') =>
  POST(new NextRequest('http://localhost/api/kaspi/invoice-payment-phone', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: ip ? { 'x-forwarded-for': ip } : {},
  }))

beforeEach(() => {
  resetInvoicePushMemory()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  h.db = makeFakeDb({ invoices: invoices.map(i => ({ ...i })) })
  h.create.mockReset()
  h.create.mockResolvedValue({ ok: true, payment: { id: 'p1' } })
})

describe('POST /api/kaspi/invoice-payment-phone', () => {
  it('pushes as before for a normal payer: 200 {ok:true}, invoice row and raw phone passed through', async () => {
    const res = await call({ token: 'tok0', phone: PHONE })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(h.create).toHaveBeenCalledWith(
      { id: 'inv0', user_id: 'owner1', amount: 5000, status: 'sent', public_token: 'tok0' },
      PHONE,
    )
  })

  it('answers 400 for a missing token and 404 for an unknown one, without touching any limit counter', async () => {
    expect((await call({ phone: PHONE })).status).toBe(400)
    const res = await call({ token: 'nope', phone: PHONE })
    expect(res.status).toBe(404)
    expect(h.create).not.toHaveBeenCalled()
    expect(h.db.tables[COUNTER_TABLE] ?? []).toHaveLength(0)
  })

  it('stops pushes to ONE number across many invoice tokens and IPs: 429 + Retry-After, and Kaspi is never reached', async () => {
    for (let i = 0; i < PHONE_HOURLY_LIMIT; i++) {
      expect((await call({ token: `tok${i}`, phone: PHONE }, `198.51.100.${i}`)).status).toBe(200)
    }
    h.create.mockClear()
    const res = await call({ token: 'tok10', phone: '8 777 123 45 67' }, '198.51.100.99')
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toBe('rate_limited')
    expect(body.message).toBe('Слишком много запросов, попробуйте позже')
    expect(body.retry_after).toBeGreaterThanOrEqual(1)
    expect(body.retry_after).toBeLessThanOrEqual(3600)
    expect(res.headers.get('Retry-After')).toBe(String(body.retry_after))
    expect(h.create).not.toHaveBeenCalled()
  })

  it('stops pushes from ONE IP to many numbers: the IP_HOURLY_LIMIT+1-th request is 429, another IP is fine', async () => {
    for (let i = 0; i < IP_HOURLY_LIMIT; i++) {
      expect((await call({ token: `tok${i}`, phone: phoneN(i) }, '192.0.2.77')).status).toBe(200)
    }
    h.create.mockClear()
    const res = await call({ token: 'tok20', phone: phoneN(40) }, '192.0.2.77')
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toMatch(/^\d+$/)
    expect(h.create).not.toHaveBeenCalled()
    expect((await call({ token: 'tok20', phone: phoneN(40) }, '192.0.2.78')).status).toBe(200)
  })

  it('limits survive a cold instance: the DB counters, not just memory, block the extra push', async () => {
    for (let i = 0; i < PHONE_HOURLY_LIMIT; i++) await call({ token: `tok${i}`, phone: PHONE }, `198.51.100.${i}`)
    resetInvoicePushMemory()
    expect((await call({ token: 'tok9', phone: PHONE }, '198.51.100.50')).status).toBe(429)
  })

  it('keeps the existing status mapping for outcomes where no push left, and does not burn the NUMBER limit on them', async () => {
    const cases: Array<[string, number]> = [
      ['invalid_phone', 400], ['closed', 502], ['already_paid', 409],
      ['no_connection', 502], ['insufficient_balance', 502],
    ]
    for (const [reason, status] of cases) {
      resetInvoicePushMemory()
      h.db = makeFakeDb({ invoices: invoices.map(i => ({ ...i })) })
      h.create.mockResolvedValue({ ok: false, reason })
      // Втрое больше лимита на номер: будь слот потрачен, четвёртый запрос ушёл бы в 429.
      for (let i = 0; i < PHONE_HOURLY_LIMIT * 3; i++) {
        expect((await call({ token: 'tok0', phone: PHONE })).status, `${reason} #${i}`).toBe(status)
      }
      // И после них настоящий push проходит.
      h.create.mockResolvedValue({ ok: true, payment: { id: 'p1' } })
      expect((await call({ token: 'tok0', phone: PHONE })).status, `${reason} then ok`).toBe(200)
    }
  })

  it('per-invoice cap keeps answering 429 {error:"rate_limited"} and now carries Retry-After, without burning the number', async () => {
    h.create.mockResolvedValue({ ok: false, reason: 'rate_limited' })
    for (let i = 0; i < PHONE_HOURLY_LIMIT * 3; i++) {
      const res = await call({ token: 'tok0', phone: PHONE })
      expect(res.status).toBe(429)
      expect(await res.json()).toEqual({ error: 'rate_limited' })
      expect(res.headers.get('Retry-After')).toBe('3600')
    }
    // Номер при этом не израсходован: другой счёт дальше пушит как обычно (адрес заплатил 9 слотов из 10).
    h.create.mockResolvedValue({ ok: true, payment: { id: 'p1' } })
    expect((await call({ token: 'tok1', phone: PHONE })).status).toBe(200)
  })

  it('requests that never reach a push still cost the caller IP: a loop on a capped invoice or an empty wallet runs into 429', async () => {
    for (const reason of ['rate_limited', 'insufficient_balance', 'no_connection']) {
      resetInvoicePushMemory()
      h.db = makeFakeDb({ invoices: invoices.map(i => ({ ...i })) })
      h.create.mockReset()
      h.create.mockResolvedValue({ ok: false, reason })
      for (let i = 0; i < IP_HOURLY_LIMIT; i++) {
        await call({ token: `tok${i}`, phone: phoneN(i) }, '203.0.113.200')
      }
      h.create.mockClear()
      const res = await call({ token: 'tok25', phone: phoneN(50) }, '203.0.113.200')
      expect(res.status, reason).toBe(429)
      expect(h.create, reason).not.toHaveBeenCalled()
    }
  })

  it('a Kaspi-side failure DOES count against the number (failed attempts are attempts)', async () => {
    h.create.mockResolvedValue({ ok: false, reason: 'error' })
    for (let i = 0; i < PHONE_HOURLY_LIMIT; i++) {
      expect((await call({ token: `tok${i}`, phone: PHONE }, `198.51.100.${i}`)).status).toBe(502)
    }
    h.create.mockClear()
    expect((await call({ token: 'tok9', phone: PHONE }, '198.51.100.60')).status).toBe(429)
    expect(h.create).not.toHaveBeenCalled()
  })

  it('an exception before the push gives the slot back and still surfaces as an error', async () => {
    h.create.mockRejectedValueOnce(new Error('wallet lookup down'))
    await expect(call({ token: 'tok0', phone: PHONE })).rejects.toThrow('wallet lookup down')
    // Слот возвращён: на номер теперь доступны все PHONE_HOURLY_LIMIT push, а не на один меньше.
    for (let i = 0; i < PHONE_HOURLY_LIMIT; i++) {
      expect((await call({ token: `tok${i}`, phone: PHONE }, `198.51.100.${i}`)).status).toBe(200)
    }
    expect((await call({ token: 'tok9', phone: PHONE }, '198.51.100.70')).status).toBe(429)
  })

  it('a phone that is not a number is passed on untouched: no counter is read or written', async () => {
    h.create.mockResolvedValue({ ok: false, reason: 'invalid_phone' })
    for (const phone of ['abc', '', null, undefined, 12345]) {
      expect((await call({ token: 'tok0', phone })).status).toBe(400)
    }
    expect(h.db.tables[COUNTER_TABLE] ?? []).toHaveLength(0)
  })

  it('does not stop a payer when the counter table is down (the per-invoice cap and instance memory remain)', async () => {
    h.db.failTable = COUNTER_TABLE
    expect((await call({ token: 'tok0', phone: PHONE })).status).toBe(200)
    expect(h.create).toHaveBeenCalledTimes(1)
  })

  it('a request without a resolvable IP is still limited per number', async () => {
    for (let i = 0; i < PHONE_HOURLY_LIMIT; i++) {
      expect((await call({ token: `tok${i}`, phone: PHONE }, null)).status).toBe(200)
    }
    expect((await call({ token: 'tok9', phone: PHONE }, null)).status).toBe(429)
  })
})
