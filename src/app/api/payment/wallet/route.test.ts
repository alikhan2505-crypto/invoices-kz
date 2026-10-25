import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({ user: { id: 'u1', email: 'u1@example.com' } as { id: string; email: string } | null }))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
}))
vi.mock('@/lib/plans/walletPlanPayment', async () => {
  const pa = await import('@/lib/plans/planActivation')
  return {
    quoteWalletPlanPayment: vi.fn(async (_u: string, _plan: string, _period: string) => {
      const price = 5990
      const b = pa.walletChoiceBounds(price, 1164)
      return { available: true, balance: 1164, split: pa.splitPlanPayment(price, 1164), price, maxPartial: b.maxPartial, canPayFull: b.canPayFull }
    }),
    payPlanFullyFromWallet: vi.fn(async () => ({ ok: true, balance: 0, expiresAt: '2026-11-25T00:00:00.000Z' })),
  }
})

import { NextRequest } from 'next/server'
import { GET, POST } from './route'
import { payPlanFullyFromWallet } from '@/lib/plans/walletPlanPayment'

const post = (body: Record<string, unknown>) =>
  new NextRequest('http://localhost/api/payment/wallet', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer tok' },
    body: JSON.stringify(body),
  })

beforeEach(() => {
  h.user = { id: 'u1', email: 'u1@example.com' }
  vi.mocked(payPlanFullyFromWallet).mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.restoreAllMocks() })

describe('GET /api/payment/wallet', () => {
  it('returns the server-side bounds the chooser is built from', async () => {
    const res = await GET(new NextRequest('http://localhost/api/payment/wallet?plan=pro&period=monthly', { headers: { authorization: 'Bearer tok' } }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ available: true, balance: 1164, price: 5990, maxPartial: 1164, canPayFull: false })
  })
})

describe('POST /api/payment/wallet: pay the whole price from the wallet', () => {
  it('works without expectedAmount (old clients)', async () => {
    const res = await POST(post({ plan: 'pro', period: 'monthly' }))
    expect(res.status).toBe(200)
    expect(vi.mocked(payPlanFullyFromWallet)).toHaveBeenCalledTimes(1)
  })

  it('works when the price the user saw matches', async () => {
    const res = await POST(post({ plan: 'pro', period: 'monthly', expectedAmount: 5990 }))
    expect(res.status).toBe(200)
    expect(vi.mocked(payPlanFullyFromWallet)).toHaveBeenCalledTimes(1)
  })

  it('refuses to charge when the price differs from what the user saw: 409 price_changed', async () => {
    for (const expectedAmount of [5000, 59900, 0]) {
      const res = await POST(post({ plan: 'pro', period: 'monthly', expectedAmount }))
      expect(res.status).toBe(409)
      expect((await res.json()).error).toBe('price_changed')
    }
    expect(vi.mocked(payPlanFullyFromWallet)).not.toHaveBeenCalled()
  })

  it('annual price is checked against the annual price', async () => {
    expect((await POST(post({ plan: 'pro', period: 'annual', expectedAmount: 5990 }))).status).toBe(409)
    expect((await POST(post({ plan: 'pro', period: 'annual', expectedAmount: 59900 }))).status).toBe(200)
  })

  it('malformed expectedAmount: 400, nothing charged', async () => {
    for (const expectedAmount of ['5990', 5990.5, true, {}]) {
      const res = await POST(post({ plan: 'pro', period: 'monthly', expectedAmount }))
      expect(res.status).toBe(400)
    }
    expect(vi.mocked(payPlanFullyFromWallet)).not.toHaveBeenCalled()
  })

  it('the charged amount never depends on the client: only plan and period reach the payer', async () => {
    await POST(post({ plan: 'pro', period: 'monthly', expectedAmount: 5990, amount: 1, walletAmount: 1 }))
    const args = vi.mocked(payPlanFullyFromWallet).mock.calls[0]
    expect(args[1]).toBe('pro')
    expect(args[2]).toBe('monthly')
    expect(args).toHaveLength(3)
  })

  it('unauthenticated: 401', async () => {
    h.user = null
    expect((await POST(post({ plan: 'pro' }))).status).toBe(401)
  })
})
