import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
const insert = vi.fn()
const exemptLookup = vi.fn()
const balanceLookup = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: (...args: unknown[]) => rpc(...args),
    from: (table: string) => ({
      insert: (...args: unknown[]) => insert(...args),
      select: () => ({
        eq: (column: string) => ({
          maybeSingle: () => exemptLookup(table, column),
          single: () => balanceLookup(table, column),
        }),
      }),
    }),
  }),
}))

import { computeCommission, COMMISSION_RATE, debitWallet, debitWalletForCommission, walletCoversCommission } from './wallet'

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
    exemptLookup.mockReset()
    exemptLookup.mockResolvedValue({ data: { commission_exempt: false }, error: null })
  })

  it('still uses the unguarded RPC: the money already moved, so it may dip below zero', async () => {
    rpc.mockResolvedValue({ data: -3, error: null })
    const balance = await debitWalletForCommission('u1', 1000, null, 'n')
    expect(rpc).toHaveBeenCalledWith('debit_wallet_balance', { p_user_id: 'u1', p_amount: 20 })
    expect(balance).toBe(-3)
  })
})

describe('commission exemption (commission_exempt)', () => {
  beforeEach(() => {
    rpc.mockReset()
    insert.mockReset()
    exemptLookup.mockReset()
    balanceLookup.mockReset()
  })

  it('an exempt connection is not debited and gets no ledger row', async () => {
    exemptLookup.mockResolvedValue({ data: { commission_exempt: true }, error: null })
    const result = await debitWalletForCommission('u1', 1000, null, 'n')
    expect(result).toBeNull()
    expect(exemptLookup).toHaveBeenCalledWith('kaspi_connections', 'user_id')
    expect(rpc).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })

  it('an exempt connection passes the mint gate even with a negative balance', async () => {
    exemptLookup.mockResolvedValue({ data: { commission_exempt: true }, error: null })
    balanceLookup.mockResolvedValue({ data: { kaspi_wallet_balance: -500 }, error: null })
    expect(await walletCoversCommission('u1', 100000)).toBe(true)
  })

  it('a normal connection still needs the balance to cover 2%', async () => {
    exemptLookup.mockResolvedValue({ data: { commission_exempt: false }, error: null })
    balanceLookup.mockResolvedValue({ data: { kaspi_wallet_balance: 19 }, error: null })
    expect(await walletCoversCommission('u1', 1000)).toBe(false)
    balanceLookup.mockResolvedValue({ data: { kaspi_wallet_balance: 20 }, error: null })
    expect(await walletCoversCommission('u1', 1000)).toBe(true)
  })

  it('no active connection row means no exemption', async () => {
    exemptLookup.mockResolvedValue({ data: null, error: null })
    balanceLookup.mockResolvedValue({ data: { kaspi_wallet_balance: 0 }, error: null })
    expect(await walletCoversCommission('u1', 1000)).toBe(false)
  })

  it('a lookup error throws instead of silently granting or denying', async () => {
    exemptLookup.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(walletCoversCommission('u1', 1000)).rejects.toThrow(/boom/)
  })
})
