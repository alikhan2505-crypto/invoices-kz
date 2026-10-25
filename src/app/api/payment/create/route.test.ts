import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Маршрут выпускает настоящую Kaspi-операцию и удерживает деньги с кошелька,
// поэтому тут всё внешнее подменено: Supabase, Kaspi, расчёт баланса. Проверяем,
// что сервер принимает ровно допустимую сумму и ничего не трогает при отказе.

const h = vi.hoisted(() => ({
  user: { id: 'u1', email: 'u1@example.com' } as { id: string; email: string } | null,
  recentCount: 0,
  pending: [] as Array<Record<string, unknown>>,
  inserts: [] as Array<Record<string, unknown>>,
  balance: 1164,
  walletAvailable: true,
  holdResult: { ok: true, paymentRequestId: 'pr1', balance: 0 } as Record<string, unknown>,
  settleResult: 'closed' as string,
}))

vi.mock('@supabase/supabase-js', () => {
  const chain = () => {
    let isRate = false
    const q: Record<string, unknown> = {
      select: () => q,
      eq: () => q,
      gte: () => { isRate = true; return q },
      insert: async (row: Record<string, unknown>) => { h.inserts.push(row); return { error: null } },
      then: (resolve: (v: unknown) => void) =>
        resolve(isRate ? { count: h.recentCount, error: null } : { data: h.pending, error: null }),
    }
    return q
  }
  const client = {
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from: () => chain(),
  }
  return { createClient: () => client }
})

vi.mock('@/lib/kaspiPay/connection', () => ({ loadPlatformConnection: async () => ({ id: 'conn' }) }))
vi.mock('@/lib/kaspiPay/client', () => ({
  createPayment: vi.fn(async () => ({ operationId: 'op-1', paymentLink: 'https://pay.kaspi.kz/qr', expiresAt: '2026-10-25T10:05:00.000Z' })),
}))
vi.mock('@/lib/kaspiPay/settlePlanPayment', () => ({
  checkAndSettlePlanPayment: vi.fn(async () => h.settleResult),
  refundDeadPlanWalletHolds: vi.fn(async () => undefined),
}))
vi.mock('@/lib/plans/walletPlanPayment', async () => {
  const pa = await import('@/lib/plans/planActivation')
  const pricing = await import('@/lib/plans/pricing')
  return {
    quoteWalletPlanPayment: vi.fn(async (_u: string, plan: 'pro' | 'basic', period: 'monthly' | 'annual') => {
      const price = pricing.getPlanAmount(plan, period)
      const b = pa.walletChoiceBounds(price, h.balance)
      return {
        available: h.walletAvailable, balance: h.balance, split: pa.splitPlanPayment(price, h.balance),
        price, maxPartial: b.maxPartial, canPayFull: b.canPayFull,
      }
    }),
    startPlanPaymentWithWalletHold: vi.fn(async () => h.holdResult),
  }
})

import { NextRequest } from 'next/server'
import { POST } from './route'
import { createPayment } from '@/lib/kaspiPay/client'
import { checkAndSettlePlanPayment, refundDeadPlanWalletHolds } from '@/lib/kaspiPay/settlePlanPayment'
import { quoteWalletPlanPayment, startPlanPaymentWithWalletHold } from '@/lib/plans/walletPlanPayment'

function req(body: Record<string, unknown>, token: string | null = 'tok') {
  return new NextRequest('http://localhost/api/payment/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ userId: 'u1', plan: 'pro', period: 'monthly', ...body }),
  })
}

beforeEach(() => {
  h.user = { id: 'u1', email: 'u1@example.com' }
  h.recentCount = 0
  h.pending = []
  h.inserts = []
  h.balance = 1164
  h.walletAvailable = true
  h.holdResult = { ok: true, paymentRequestId: 'pr1', balance: 0 }
  h.settleResult = 'closed'
  vi.mocked(createPayment).mockClear()
  vi.mocked(checkAndSettlePlanPayment).mockClear()
  vi.mocked(refundDeadPlanWalletHolds).mockClear()
  vi.mocked(quoteWalletPlanPayment).mockClear()
  vi.mocked(startPlanPaymentWithWalletHold).mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.restoreAllMocks() })

describe('POST /api/payment/create: chosen wallet amount', () => {
  it('splits the price exactly as the user chose: wallet part held, Kaspi asked for the rest', async () => {
    const res = await POST(req({ walletAmount: 500 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ kaspi_amount: 5490, wallet_amount: 500, ext_tran_id: 'op-1' })
    expect(vi.mocked(createPayment).mock.calls[0][1]).toMatchObject({ amount: 5490 })
    expect(vi.mocked(startPlanPaymentWithWalletHold).mock.calls[0][0]).toMatchObject({ walletPart: 500, plan: 'pro', period: 'monthly', operationId: 'op-1' })
  })

  it('a user may take less than the maximum (balance 1164, picks 300)', async () => {
    const res = await POST(req({ walletAmount: 300 }))
    expect(await res.json()).toMatchObject({ kaspi_amount: 5690, wallet_amount: 300 })
  })

  it('takes the whole balance when asked for exactly that', async () => {
    const res = await POST(req({ walletAmount: 1164 }))
    expect(await res.json()).toMatchObject({ kaspi_amount: 4826, wallet_amount: 1164 })
  })

  it('a rich wallet can still choose a partial amount (no wallet_covers_full for an explicit amount)', async () => {
    h.balance = 20000
    const res = await POST(req({ walletAmount: 2000 }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ kaspi_amount: 3990, wallet_amount: 2000 })
  })

  it('uses the annual price for annual', async () => {
    const res = await POST(req({ walletAmount: 1000, period: 'annual' }))
    expect(await res.json()).toMatchObject({ kaspi_amount: 58900, wallet_amount: 1000 })
  })

  it('ignores any amount sent by the client: the price comes from PLAN_PRICES', async () => {
    const res = await POST(req({ walletAmount: 500, amount: 1, kaspi_amount: 1, price: 1 }))
    expect(await res.json()).toMatchObject({ kaspi_amount: 5490 })
  })

  it('walletAmount 0 is Kaspi only: full price, no hold, no wallet lookup', async () => {
    const res = await POST(req({ walletAmount: 0 }))
    expect(await res.json()).toMatchObject({ kaspi_amount: 5990, wallet_amount: 0 })
    expect(vi.mocked(startPlanPaymentWithWalletHold)).not.toHaveBeenCalled()
    expect(vi.mocked(quoteWalletPlanPayment)).not.toHaveBeenCalled()
    expect(h.inserts[0]).toMatchObject({ amount: 5990, status: 'pending' })
    expect(h.inserts[0]).not.toHaveProperty('wallet_amount')
  })

  it('no wallet fields at all is Kaspi only, as before', async () => {
    const res = await POST(req({}))
    expect(await res.json()).toMatchObject({ kaspi_amount: 5990, wallet_amount: 0 })
    expect(vi.mocked(quoteWalletPlanPayment)).not.toHaveBeenCalled()
  })
})

describe('POST /api/payment/create: rejected amounts touch nothing', () => {
  async function expectUntouched(res: Response, status: number, error: string) {
    expect(res.status).toBe(status)
    expect((await res.json()).error).toBe(error)
    expect(vi.mocked(createPayment)).not.toHaveBeenCalled()
    expect(vi.mocked(startPlanPaymentWithWalletHold)).not.toHaveBeenCalled()
    expect(h.inserts).toHaveLength(0)
  }

  it('more than the balance: 409 wallet_changed with the current maximum, never clamped', async () => {
    const res = await POST(req({ walletAmount: 1165 }))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'wallet_changed', reason: 'too_much', max: 1164, can_pay_full: false })
    expect(vi.mocked(createPayment)).not.toHaveBeenCalled()
    expect(vi.mocked(startPlanPaymentWithWalletHold)).not.toHaveBeenCalled()
  })

  it('balance dropped after the user looked: old amount is refused, not silently reduced', async () => {
    h.balance = 400
    const res = await POST(req({ walletAmount: 1000 }))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'wallet_changed', max: 400 })
    expect(vi.mocked(createPayment)).not.toHaveBeenCalled()
  })

  it('leaves less than the Kaspi minimum: refused', async () => {
    h.balance = 20000
    for (const w of [5891, 5950, 5989]) {
      const res = await POST(req({ walletAmount: w }))
      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({ error: 'wallet_changed', reason: 'remainder_too_small', max: 5890, can_pay_full: true })
    }
    expect(vi.mocked(createPayment)).not.toHaveBeenCalled()
  })

  it('the full price is not handled here: 409 wallet_use_full_endpoint, no Kaspi operation', async () => {
    h.balance = 20000
    const res = await POST(req({ walletAmount: 5990 }))
    await expectUntouched(res, 409, 'wallet_use_full_endpoint')
  })

  it('above the price: refused', async () => {
    h.balance = 20000
    const res = await POST(req({ walletAmount: 6000 }))
    expect(res.status).toBe(409)
    expect(vi.mocked(createPayment)).not.toHaveBeenCalled()
  })

  it('wallet unavailable: 503', async () => {
    h.walletAvailable = false
    const res = await POST(req({ walletAmount: 500 }))
    await expectUntouched(res, 503, 'wallet_unavailable')
  })

  it('malformed amounts: 400 before anything is looked at (not even Kaspi pending rows)', async () => {
    h.pending = [{ id: 'old', user_id: 'u1' }]
    for (const bad of ['500', '', -1, 0.5, 500.5, true, [], {}, 1e21]) {
      vi.mocked(checkAndSettlePlanPayment).mockClear()
      const res = await POST(req({ walletAmount: bad }))
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('invalid_wallet_amount')
      expect(vi.mocked(checkAndSettlePlanPayment)).not.toHaveBeenCalled()
    }
    expect(vi.mocked(createPayment)).not.toHaveBeenCalled()
    expect(vi.mocked(quoteWalletPlanPayment)).not.toHaveBeenCalled()
  })

  it('hold fails because the balance moved between the check and the hold: 409 wallet_changed', async () => {
    h.holdResult = { ok: false, error: 'insufficient_funds' }
    const res = await POST(req({ walletAmount: 1000 }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('wallet_changed')
    // Нет строки, QR не показан; закрытые ранее удержания возвращаются в finally.
    expect(vi.mocked(refundDeadPlanWalletHolds)).toHaveBeenCalledWith('u1')
  })

  it('unauthenticated or someone else: 401, nothing minted', async () => {
    expect((await POST(req({ walletAmount: 500 }, null))).status).toBe(401)
    h.user = { id: 'other', email: 'o@example.com' }
    expect((await POST(req({ walletAmount: 500 }))).status).toBe(401)
    expect(vi.mocked(createPayment)).not.toHaveBeenCalled()
  })

  it('rate limit still applies: 429', async () => {
    h.recentCount = 5
    const res = await POST(req({ walletAmount: 500 }))
    await expectUntouched(res, 429, 'rate_limited')
  })
})

describe('POST /api/payment/create: retries and double clicks', () => {
  it('an older pending row is closed with its wallet hold deferred when a wallet part is chosen', async () => {
    h.pending = [{ id: 'old', user_id: 'u1', plan: 'pro', amount: 5990, qr_operation_id: 'old-op', created_at: 'x', billing_period: 'monthly' }]
    await POST(req({ walletAmount: 500 }))
    expect(vi.mocked(checkAndSettlePlanPayment).mock.calls[0][1]).toEqual({ force: true, deferWalletRefund: true })
    // Новое удержание забрало старое себе: возвращать в finally нечего.
    expect(vi.mocked(refundDeadPlanWalletHolds)).not.toHaveBeenCalled()
  })

  it('with walletAmount 0 the old hold is refunded immediately (no deferral)', async () => {
    h.pending = [{ id: 'old', user_id: 'u1' }]
    await POST(req({ walletAmount: 0 }))
    expect(vi.mocked(checkAndSettlePlanPayment).mock.calls[0][1]).toEqual({ force: true, deferWalletRefund: false })
    expect(vi.mocked(refundDeadPlanWalletHolds)).not.toHaveBeenCalled()
  })

  it('a rejected retry returns the deferred hold of the old row instead of leaving it locked', async () => {
    h.pending = [{ id: 'old', user_id: 'u1' }]
    await POST(req({ walletAmount: 999999 }))
    expect(vi.mocked(refundDeadPlanWalletHolds)).toHaveBeenCalledWith('u1')
  })

  it('a pending row that turns out to be paid: 409 already_paid, no second charge', async () => {
    h.pending = [{ id: 'old', user_id: 'u1' }]
    h.settleResult = 'paid'
    const res = await POST(req({ walletAmount: 500 }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('already_paid')
    expect(vi.mocked(createPayment)).not.toHaveBeenCalled()
    expect(vi.mocked(startPlanPaymentWithWalletHold)).not.toHaveBeenCalled()
  })

  it('repeating the same choice (QR reissue) produces the same split from a fresh quote', async () => {
    const first = await (await POST(req({ walletAmount: 700 }))).json()
    const second = await (await POST(req({ walletAmount: 700 }))).json()
    expect(second.wallet_amount).toBe(first.wallet_amount)
    expect(second.kaspi_amount).toBe(first.kaspi_amount)
  })
})

describe('POST /api/payment/create: legacy useWallet body (cached old page)', () => {
  it('useWallet:true still means the maximum partial amount', async () => {
    const res = await POST(req({ useWallet: true }))
    expect(await res.json()).toMatchObject({ wallet_amount: 1164, kaspi_amount: 4826 })
  })

  it('useWallet:true with a balance that covers the price still answers wallet_covers_full', async () => {
    h.balance = 20000
    const res = await POST(req({ useWallet: true }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('wallet_covers_full')
  })

  it('an explicit walletAmount wins over useWallet', async () => {
    const res = await POST(req({ useWallet: true, walletAmount: 200 }))
    expect(await res.json()).toMatchObject({ wallet_amount: 200, kaspi_amount: 5790 })
  })
})
