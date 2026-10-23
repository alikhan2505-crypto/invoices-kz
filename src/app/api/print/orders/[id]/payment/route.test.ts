import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { PRINT_PAYMENT_REQUESTS_PER_MINUTE, resetPaymentRequestHits } from '@/lib/printShop/rateLimit'

const h = vi.hoisted(() => ({
  order: null as any,
  getOrCreate: vi.fn(),
  settle: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const chain: any = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: h.order }) }
      return chain
    },
  }),
}))
vi.mock('@/lib/printShop/orderPayment', () => ({ getOrCreateKaspiPaymentForPrintOrder: h.getOrCreate }))
vi.mock('@/lib/kaspiPay/settlePayment', () => ({ checkAndSettleKaspiPayment: h.settle }))

import { GET } from './route'

const call = (ip: string) =>
  GET(new NextRequest('http://localhost/api/print/orders/o1/payment', { headers: { 'x-forwarded-for': ip } }), { params: Promise.resolve({ id: 'o1' }) })

beforeEach(() => {
  resetPaymentRequestHits()
  h.order = { id: 'o1', price: 3500, status: 'pending', created_at: '2026-10-24T10:00:00Z' }
  h.getOrCreate.mockReset()
  h.settle.mockReset()
  h.getOrCreate.mockResolvedValue({ qr_token: 'qr', payment_link: 'link', status: 'pending' })
  h.settle.mockResolvedValue('pending')
})

describe('GET /api/print/orders/[id]/payment', () => {
  it('returns the payment in the same shape as before and passes created_at and the client ip to the minting helper', async () => {
    const res = await call('203.0.113.5')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ payment: { qr_token: 'qr', payment_link: 'link', status: 'pending' } })
    expect(h.getOrCreate).toHaveBeenCalledWith(
      { id: 'o1', price: 3500, status: 'pending', created_at: '2026-10-24T10:00:00Z' },
      { ip: '203.0.113.5' },
    )
  })

  it('answers {payment: null} for an unknown order', async () => {
    h.order = null
    expect(await (await call('203.0.113.5')).json()).toEqual({ payment: null })
    expect(h.getOrCreate).not.toHaveBeenCalled()
  })

  it('throttles a flood from one IP with a 429 that still has payment: null, never reaching Kaspi', async () => {
    for (let i = 0; i < PRINT_PAYMENT_REQUESTS_PER_MINUTE; i++) expect((await call('198.51.100.7')).status).toBe(200)
    h.getOrCreate.mockClear()
    const res = await call('198.51.100.7')
    expect(res.status).toBe(429)
    expect((await res.json()).payment).toBeNull()
    expect(h.getOrCreate).not.toHaveBeenCalled()
    expect((await call('198.51.100.8')).status).toBe(200)
  })
})
