import { createClient } from '@supabase/supabase-js'
import { loadPlatformConnection } from '@/lib/kaspiPay/connection'
import { checkStatus } from '@/lib/kaspiPay/client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const KASPI_SHOP_CREDIT_PRICE_TENGE = 5

export async function getKaspiShopWalletBalance(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('kaspi_shop_wallet')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`kaspi_shop_wallet lookup failed for user ${userId}: ${error.message}`)
  return Number(data?.balance ?? 0)
}

// Atomic via debit_kaspi_shop_wallet_balance (Task 1) -- two concurrent check
// cycles for the same user can't both read a stale balance and both debit.
// Going negative is an accepted outcome here (mirrors Kaspi Pay's own
// debitWalletForCommission) -- gating happens by checking the balance BEFORE
// scheduling a check (see runPriceCheck below), not by refusing this debit.
export async function debitKaspiShopWallet(userId: string, credits: number, note: string): Promise<number> {
  const { data, error } = await supabase.rpc('debit_kaspi_shop_wallet_balance', { p_user_id: userId, p_amount: credits })
  if (error) throw new Error(`kaspi_shop_wallet debit failed for user ${userId}: ${error.message}`)

  const { data: wallet } = await supabase.from('kaspi_shop_wallet').select('id').eq('user_id', userId).single()
  const { error: ledgerError } = await supabase.from('kaspi_shop_wallet_ledger').insert({
    wallet_id: wallet?.id,
    user_id: userId,
    amount: -credits,
    type: 'check_debit',
    note,
  })
  if (ledgerError) console.error('kaspi_shop_wallet_ledger insert failed after check debit for user', userId, ':', ledgerError.message)
  return data as number
}

export async function creditKaspiShopWallet(userId: string, credits: number, note: string): Promise<number> {
  const { data, error } = await supabase.rpc('debit_kaspi_shop_wallet_balance', { p_user_id: userId, p_amount: -credits })
  if (error) throw new Error(`kaspi_shop_wallet credit failed for user ${userId}: ${error.message}`)

  const { data: wallet } = await supabase.from('kaspi_shop_wallet').select('id').eq('user_id', userId).single()
  const { error: ledgerError } = await supabase.from('kaspi_shop_wallet_ledger').insert({
    wallet_id: wallet?.id,
    user_id: userId,
    amount: credits,
    type: 'topup',
    note,
  })
  if (ledgerError) console.error('kaspi_shop_wallet_ledger insert failed after topup credit for user', userId, ':', ledgerError.message)
  return data as number
}

export interface KaspiShopWalletTopupRow {
  id: string
  user_id: string
  credits: number
  kaspi_operation_id: string
  status: string
  expires_at?: string | null
}

function isPastExpiry(row: KaspiShopWalletTopupRow): boolean {
  return !!row.expires_at && new Date(row.expires_at) <= new Date()
}

// Mirrors checkAndSettleWalletTopup's shape (paid/not_paid/expired) from
// Kaspi Pay Cashier's own wallet.ts, adapted to credit kaspi_shop_wallet
// instead -- fully separate table, fully separate ledger, same underlying
// Kaspi payment-status-check mechanism.
export async function checkAndSettleKaspiShopWalletTopup(row: KaspiShopWalletTopupRow): Promise<'paid' | 'not_paid' | 'expired'> {
  const connection = await loadPlatformConnection()
  if (!connection) return 'not_paid'

  const result = await checkStatus(connection, row.kaspi_operation_id)
  if (result.status !== 'paid') {
    const expiredOnKaspi = result.status === 'expired'
    if (expiredOnKaspi || isPastExpiry(row)) {
      const { data } = await supabase
        .from('kaspi_shop_wallet_topups')
        .update({ status: 'expired' })
        .eq('id', row.id)
        .eq('status', 'pending')
        .select('id')
      if (data && data.length > 0) return 'expired'
    }
    return 'not_paid'
  }

  const { data: claimed, error: claimError } = await supabase
    .from('kaspi_shop_wallet_topups')
    .update({ status: 'paid' })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('id')
  if (claimError) throw new Error(`failed to claim paid kaspi_shop_wallet_topups row: ${claimError.message}`)
  if (!claimed || claimed.length === 0) return 'paid' // already settled by another caller

  try {
    await creditKaspiShopWallet(row.user_id, row.credits, `Пополнение: топап ${row.id}`)
  } catch (e: any) {
    console.error('CRITICAL: kaspi_shop_wallet_topups', row.id, 'for user', row.user_id, 'confirmed paid on Kaspi but credit failed:', e.message)
  }
  return 'paid'
}
