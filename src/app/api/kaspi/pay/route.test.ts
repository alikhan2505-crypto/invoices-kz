import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Вход публичного платёжного API (по токену интеграции): кривое тело даёт 400, а
// сбои Kaspi и базы не показывают вызывающему текст ошибки (аудит 02.11.2026, раздел 4).
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'
})
const h = vi.hoisted(() => ({
  insertError: null as { message: string } | null,
  inserted: [] as Record<string, unknown>[],
  connection: vi.fn(),
  createPayment: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const b: any = {
        select: () => b,
        eq: () => b,
        gte: () => b,
        insert: async (row: Record<string, unknown>) => { h.inserted.push(row); return { error: h.insertError } },
        // await на select(...).eq().gte(): счётчик заявок за минуту.
        then: (res: any, rej: any) => Promise.resolve({ count: 0, error: null }).then(res, rej),
      }
      return b
    },
  }),
}))
vi.mock('@/lib/kaspiPay/connection', () => ({ loadConnectionByApiToken: h.connection }))
vi.mock('@/lib/kaspiPay/client', () => ({ createPayment: h.createPayment }))
vi.mock('@/lib/kaspiPay/wallet', () => ({ getWalletBalance: async () => 100000, computeCommission: () => 20 }))

import { POST } from './route'

const call = (body: unknown, auth: string | null = 'Bearer tok') => POST(new NextRequest('http://localhost/api/kaspi/pay', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
  body: typeof body === 'string' ? body : JSON.stringify(body),
}))
const good = { amount: 1000, order_id: 'ord-1' }

beforeEach(() => {
  h.insertError = null
  h.inserted = []
  h.connection.mockReset()
  h.connection.mockResolvedValue({ connection: {}, userId: 'u1', defaultWebhookUrl: null })
  h.createPayment.mockReset()
  h.createPayment.mockResolvedValue({ operationId: 'op1', qrToken: 'qr1', paymentLink: 'https://pay.kaspi.kz/x', expiresAt: '2026-11-03T12:00:00Z' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/kaspi/pay', () => {
  it('без токена: 401, до разбора тела дело не доходит', async () => {
    expect((await call(good, null)).status).toBe(401)
    expect(h.connection).not.toHaveBeenCalled()
  })

  it('кривое тело (не JSON, пустое, не объект): 400, Kaspi не вызывается', async () => {
    for (const raw of ['not json', '', 'null', '[]', '"x"', '123']) {
      const res = await call(raw)
      expect(res.status, raw).toBe(400)
      expect(await res.json()).toEqual({ error: 'amount and order_id required' })
    }
    expect(h.createPayment).not.toHaveBeenCalled()
    expect(h.inserted).toHaveLength(0)
  })

  it('поля не тех типов или пустые: 400, Kaspi не вызывается', async () => {
    const bad = [
      { amount: '1000', order_id: 'o' },
      { amount: -5, order_id: 'o' },
      { amount: 0, order_id: 'o' },
      { amount: 1000 },
      { amount: 1000, order_id: '' },
      { amount: 1000, order_id: { a: 1 } },
      { amount: 1000, order_id: ['o'] },
      { amount: 1000, order_id: true },
    ]
    for (const body of bad) expect((await call(body)).status, JSON.stringify(body)).toBe(400)
    expect(h.createPayment).not.toHaveBeenCalled()
  })

  it('callback_url не строка: 400; null и отсутствие допустимы', async () => {
    for (const cb of [123, { u: 'x' }, ['x'], true]) {
      const res = await call({ ...good, callback_url: cb })
      expect(res.status, JSON.stringify(cb)).toBe(400)
    }
    expect(h.createPayment).not.toHaveBeenCalled()
    expect((await call({ ...good, callback_url: null })).status).toBe(200)
    expect((await call(good)).status).toBe(200)
    expect((await call({ ...good, callback_url: 'https://shop.kz/hook' })).status).toBe(200)
    expect(h.inserted.map(r => r.callback_url)).toEqual([null, null, 'https://shop.kz/hook'])
  })

  it('корректный запрос работает как раньше, order_id числом тоже', async () => {
    const res = await call({ amount: 1000, order_id: 42 })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ qr_token: 'qr1', payment_link: 'https://pay.kaspi.kz/x', operation_id: 'op1', expire_date: '2026-11-03T12:00:00Z' })
    // Kaspi и колонка order_id принимают строку: число от клиента приводится, а не уходит как есть.
    expect(h.createPayment).toHaveBeenCalledWith({}, { amount: 1000, orderId: '42' })
    expect(h.inserted[0].order_id).toBe('42')
  })

  it('callback_url заведомо небезопасной формы: 400 unsafe_callback_url, Kaspi не вызывается', async () => {
    const unsafe = [
      'http://localhost/hook',
      'http://127.0.0.1:3000/hook',
      'http://169.254.169.254/latest/meta-data',
      'http://10.0.0.5/hook',
      'ftp://shop.kz/hook',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'https://user:pass@shop.kz/hook',
      'not a url',
    ]
    for (const callback_url of unsafe) {
      const res = await call({ ...good, callback_url })
      expect(res.status, callback_url).toBe(400)
      expect(await res.json(), callback_url).toEqual({ error: 'unsafe_callback_url' })
    }
    expect(h.createPayment).not.toHaveBeenCalled()
    expect(h.inserted).toHaveLength(0)
  })

  it('сбой Kaspi: 502 kaspi_unavailable, текст ошибки (адреса, ответ Kaspi) не уходит наружу', async () => {
    h.createPayment.mockRejectedValue(new Error('Kaspi 500 https://api.kaspi.kz/pay token=SECRET123'))
    const res = await call(good)
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'kaspi_unavailable' })
  })

  it('платёж создан, но запись не сохранилась: 502 tracking_failed без текста ошибки базы', async () => {
    h.insertError = { message: 'null value in column "kaspi_operation_id" of relation "kaspi_payment_requests"' }
    const res = await call(good)
    expect(res.status).toBe(502)
    const text = JSON.stringify(await res.json())
    expect(text).toBe('{"error":"tracking_failed"}')
    expect(text).not.toContain('kaspi_payment_requests')
  })
})
