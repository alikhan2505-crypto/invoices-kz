import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
const insert = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: (...args: unknown[]) => rpc(...args),
    from: () => ({ insert: (...args: unknown[]) => insert(...args) }),
  }),
}))

import { computeCommission, COMMISSION_RATE, debitWallet, debitWalletForCommission } from './wallet'

describe('computeCommission', () => {
  it('is 2% of the amount', () => {
    expect(COMMISSION_RATE).toBe(0.02)
    expect(computeCommission(1000)).toBe(20)
  })

  it('rounds to the nearest tenge', () => {
    expect(computeCommission(999)).toBe(20)   // 19.98 -> 20
    expect(computeCommission(101)).toBe(2)    // 2.02 -> 2
    expect(computeCommission(175)).toBe(4)    // 3.5 -> 4
  })

  it('is zero for a zero amount', () => {
    expect(computeCommission(0)).toBe(0)
  })
})

describe('debitWallet (guarded spend)', () => {
  beforeEach(() => {
    rpc.mockReset()
    insert.mockReset()
    insert.mockResolvedValue({ error: null })
  })

  it('calls the guarded RPC and writes the ledger row with the new balance', async () => {
    rpc.mockResolvedValue({ data: 45, error: null })
    const balance = await debitWallet('u1', 5, 'ai_agent_reply', 'ИИ-ответ')
    expect(rpc).toHaveBeenCalledWith('debit_wallet_balance_guarded', { p_user_id: 'u1', p_amount: 5 })
    expect(balance).toBe(45)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u1', type: 'ai_agent_reply', amount: -5, balance_after: 45 }))
  })

  it('throws and writes nothing when the balance does not cover the spend (RPC returns NULL)', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    await expect(debitWallet('u1', 5, 'kaspi_shop_check', 'x')).rejects.toThrow(/insufficient funds/)
    expect(insert).not.toHaveBeenCalled()
  })

  it('throws on an RPC error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(debitWallet('u1', 5, 'ai_agent_reply', 'x')).rejects.toThrow(/boom/)
    expect(insert).not.toHaveBeenCalled()
  })
})

describe('debitWalletForCommission (unguarded by design)', () => {
  beforeEach(() => {
    rpc.mockReset()
    insert.mockReset()
    insert.mockResolvedValue({ error: null })
  })

  it('still uses the unguarded RPC: the money already moved, so it may dip below zero', async () => {
    rpc.mockResolvedValue({ data: -3, error: null })
    const balance = await debitWalletForCommission('u1', 1000, null, 'n')
    expect(rpc).toHaveBeenCalledWith('debit_wallet_balance', { p_user_id: 'u1', p_amount: 20 })
    expect(balance).toBe(-3)
  })
})
