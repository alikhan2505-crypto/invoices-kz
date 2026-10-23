import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PRINT_PAYMENT_GLOBAL_HOURLY_LIMIT, PRINT_PAYMENT_IP_HOURLY_LIMIT, PRINT_ORDER_PAYABLE_MS } from './rateLimit'

const h = vi.hoisted(() => ({
  rows: {} as Record<string, number>,
  counterFail: false,
  existing: null as any,
  recentMints: 0,
  createPayment: vi.fn(),
  balance: 100_000,
  connection: { id: 'conn' } as any,
  inserts: [] as any[],
}))

vi.mock('@supabase/supabase-js', async () => {
  const { fakeCounters } = await import('./__testutils__/fakeCounters')
  return {
    createClient: () => ({
      from: (table: string) => {
        if (table !== 'kaspi_payment_requests') return (fakeCounters(h.rows, { failRead: h.counterFail }) as any).from(table)
        // Любая цепочка select/eq/order/limit/gte; конец — maybeSingle, await или insert().select().single().
        const chain: any = {
          select: () => chain, eq: () => chain, order: () => chain, limit: () => chain, gte: () => chain,
          maybeSingle: async () => ({ data: h.existing, error: null }),
          then: (resolve: (r: unknown) => void) => resolve({ count: h.recentMints, error: null }),
          insert: (row: any) => {
            h.inserts.push(row)
            return { select: () => ({ single: async () => ({ data: { id: 'pr-1', ...row }, error: null }) }) }
          },
        }
        return chain
      },
    }),
  }
})
vi.mock('@/lib/kaspiPay/connection', () => ({ loadConnectionByUserId: async () => h.connection }))
vi.mock('@/lib/kaspiPay/client', () => ({ createPayment: h.createPayment }))
vi.mock('@/lib/kaspiPay/wallet', () => ({ getWalletBalance: async () => h.balance, computeCommission: () => 10 }))
vi.mock('./ownerAccount', () => ({ getPrintShopOwnerUserId: () => 'owner-1' }))

import { getOrCreateKaspiPaymentForPrintOrder } from './orderPayment'

const fresh = () => new Date(Date.now() - 60_000).toISOString()
const order = (over: Record<string, unknown> = {}) => ({ id: 'o1', price: 3500, status: 'pending', created_at: fresh(), ...over })

beforeEach(() => {
  for (const k of Object.keys(h.rows)) delete h.rows[k]
  h.counterFail = false
  h.existing = null
  h.recentMints = 0
  h.balance = 100_000
  h.connection = { id: 'conn' }
  h.inserts.length = 0
  h.createPayment.mockReset()
  h.createPayment.mockResolvedValue({ operationId: 'op', qrToken: 'qr', paymentLink: 'link', expiresAt: new Date(Date.now() + 600_000).toISOString() })
})

describe('getOrCreateKaspiPaymentForPrintOrder', () => {
  it('mints a payment for a fresh pending order (happy path unchanged)', async () => {
    const p = await getOrCreateKaspiPaymentForPrintOrder(order(), { ip: '203.0.113.5' })
    expect(p?.qr_token).toBe('qr')
    expect(h.createPayment).toHaveBeenCalledTimes(1)
    expect(h.inserts).toHaveLength(1)
  })

  it('keeps serving an already-minted pending payment without new limits or Kaspi calls', async () => {
    h.existing = { id: 'pr-0', status: 'pending', qr_token: 'old', expires_at: new Date(Date.now() + 60_000).toISOString() }
    // даже для «старого» заказа: уже выпущенный платёж отдаётся как раньше
    const p = await getOrCreateKaspiPaymentForPrintOrder(order({ created_at: new Date(Date.now() - 5 * PRINT_ORDER_PAYABLE_MS).toISOString() }), { ip: '203.0.113.5' })
    expect(p?.qr_token).toBe('old')
    expect(h.createPayment).not.toHaveBeenCalled()
    expect(Object.keys(h.rows)).toHaveLength(0)
  })

  it('does not mint for paid/failed orders, stale orders or orders without a date', async () => {
    expect(await getOrCreateKaspiPaymentForPrintOrder(order({ status: 'paid' }), { ip: 'x' })).toBeNull()
    expect(await getOrCreateKaspiPaymentForPrintOrder(order({ status: 'failed' }), { ip: 'x' })).toBeNull()
    expect(await getOrCreateKaspiPaymentForPrintOrder(order({ status: 'cancelled' }), { ip: 'x' })).toBeNull()
    expect(await getOrCreateKaspiPaymentForPrintOrder(order({ created_at: new Date(Date.now() - PRINT_ORDER_PAYABLE_MS - 60_000).toISOString() }), { ip: 'x' })).toBeNull()
    expect(await getOrCreateKaspiPaymentForPrintOrder(order({ created_at: null }), { ip: 'x' })).toBeNull()
    expect(h.createPayment).not.toHaveBeenCalled()
  })

  it(`stops one IP after ${PRINT_PAYMENT_IP_HOURLY_LIMIT} new payments an hour, other IPs unaffected`, async () => {
    for (let i = 0; i < PRINT_PAYMENT_IP_HOURLY_LIMIT; i++) {
      expect(await getOrCreateKaspiPaymentForPrintOrder(order({ id: `o${i}` }), { ip: '203.0.113.5' })).not.toBeNull()
    }
    h.createPayment.mockClear()
    expect(await getOrCreateKaspiPaymentForPrintOrder(order({ id: 'oX' }), { ip: '203.0.113.5' })).toBeNull()
    expect(h.createPayment).not.toHaveBeenCalled()
    expect(await getOrCreateKaspiPaymentForPrintOrder(order({ id: 'oY' }), { ip: '203.0.113.99' })).not.toBeNull()
  })

  it(`caps the whole shop at ${PRINT_PAYMENT_GLOBAL_HOURLY_LIMIT} new payments an hour across IPs`, async () => {
    for (let i = 0; i < PRINT_PAYMENT_GLOBAL_HOURLY_LIMIT; i++) {
      expect(await getOrCreateKaspiPaymentForPrintOrder(order({ id: `o${i}` }), { ip: `10.0.${Math.floor(i / 5)}.${i % 5}` })).not.toBeNull()
    }
    h.createPayment.mockClear()
    expect(await getOrCreateKaspiPaymentForPrintOrder(order({ id: 'oZ' }), { ip: '10.9.9.9' })).toBeNull()
    expect(h.createPayment).not.toHaveBeenCalled()
  })

  it('does not spend limit slots when Kaspi itself fails', async () => {
    h.createPayment.mockRejectedValue(new Error('kaspi down'))
    for (let i = 0; i < PRINT_PAYMENT_IP_HOURLY_LIMIT + 3; i++) {
      await expect(getOrCreateKaspiPaymentForPrintOrder(order(), { ip: '203.0.113.5' })).rejects.toThrow('kaspi down')
    }
    h.createPayment.mockResolvedValue({ operationId: 'op', qrToken: 'qr', paymentLink: 'link', expiresAt: new Date(Date.now() + 600_000).toISOString() })
    expect(await getOrCreateKaspiPaymentForPrintOrder(order(), { ip: '203.0.113.5' })).not.toBeNull()
  })

  it('fails closed when the limit counter is unreadable', async () => {
    h.counterFail = true
    expect(await getOrCreateKaspiPaymentForPrintOrder(order(), { ip: '203.0.113.5' })).toBeNull()
    expect(h.createPayment).not.toHaveBeenCalled()
  })
})
