import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Публичный статус платежа: поле stage (waiting/scanning/failed/paid/expired)
// нужно странице оплаты клиента API (Qutty kun), чтобы вовремя менять QR;
// поле status для старых интеграций остаётся pending/paid/expired.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'
})
const h = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  outcome: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const b: any = {
        select: () => b,
        eq: () => b,
        maybeSingle: async () => ({ data: h.row, error: null }),
      }
      return b
    },
  }),
}))
vi.mock('@/lib/kaspiPay/connection', () => ({
  loadConnectionByApiToken: async () => ({ connection: {}, userId: 'u1', defaultWebhookUrl: null }),
}))
vi.mock('@/lib/kaspiPay/settlePayment', () => ({ checkAndSettleKaspiPayment: h.outcome }))

import { GET } from './route'

const call = () => GET(new NextRequest('http://localhost/api/kaspi/pay/status?operation_id=op1', {
  headers: { authorization: 'Bearer tok' },
}))
const row = (status: string) => ({ id: 'r1', user_id: 'u1', order_id: 'QK-1', amount: 3000, kaspi_operation_id: 'op1', status })

beforeEach(() => {
  h.outcome.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /api/kaspi/pay/status: stage', () => {
  it.each([
    ['not_paid', 'pending', 'waiting'],
    ['scanning', 'pending', 'scanning'],
    ['failed', 'pending', 'failed'],
    ['paid', 'paid', 'paid'],
    ['expired', 'expired', 'expired'],
    ['no_connection', 'pending', 'waiting'],
  ])('живая проверка %s: status=%s, stage=%s', async (outcome, status, stage) => {
    h.row = row('pending')
    h.outcome.mockResolvedValue(outcome)
    const body = await (await call()).json()
    expect(body.status).toBe(status)
    expect(body.stage).toBe(stage)
    expect(body.paid).toBe(status === 'paid')
  })

  it('уже закрытая строка в базе: Kaspi не спрашиваем, stage совпадает со status', async () => {
    h.row = row('paid')
    expect((await (await call()).json()).stage).toBe('paid')
    h.row = row('expired')
    expect((await (await call()).json()).stage).toBe('expired')
    expect(h.outcome).not.toHaveBeenCalled()
  })

  it('сбой живой проверки: последний известный статус, stage waiting', async () => {
    h.row = row('pending')
    h.outcome.mockRejectedValue(new Error('kaspi down'))
    const body = await (await call()).json()
    expect(body.status).toBe('pending')
    expect(body.stage).toBe('waiting')
  })
})
