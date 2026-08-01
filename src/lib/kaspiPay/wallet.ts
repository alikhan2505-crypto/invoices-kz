import { createClient } from '@supabase/supabase-js'
import { loadPlatformConnection } from './connection'
import { checkStatus } from './client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const COMMISSION_RATE = 0.05

export function computeCommission(amount: number): number {
  return Math.round(amount * COMMISSION_RATE)
}

export async function getWalletBalance(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('profiles')
    .select('kaspi_wallet_balance')
    .eq('id', userId)
    .single()
  if (error) throw new Error(`wallet balance lookup failed for user ${userId}: ${error.message}`)
  return Number(data?.kaspi_wallet_balance ?? 0)
}

// A credit is commutative (two concurrent top-ups adding to the same
// balance arrive at the correct sum regardless of order), so it doesn't
// strictly need the same atomicity guard the debit path does -- but reusing
// debit_wallet_balance with a negative amount is simplest: one Postgres
// function, one call site pattern, still safe either way.
export async function creditWallet(userId: string, amount: number, topupId: string): Promise<void> {
  const { data, error } = await supabase.rpc('debit_wallet_balance', { p_user_id: userId, p_amount: -amount })
  if (error) throw new Error(`wallet credit failed for user ${userId}: ${error.message}`)
  // The balance mutation above already succeeded — a failed ledger insert
  // here would leave a real balance change with no audit trail, so it's
  // logged loudly rather than silently swallowed (the credit itself must
  // not be rolled back for this: the customer's money already moved).
  const { error: ledgerError } = await supabase.from('wallet_ledger').insert({
    user_id: userId,
    type: 'topup',
    amount,
    balance_after: data,
    kaspi_wallet_topup_id: topupId,
  })
  if (ledgerError) console.error('wallet_ledger insert failed after topup credit for user', userId, ':', ledgerError.message)
}

// The only balance mutation that MUST be atomic: two settlements racing
// against a balance that can only cover one must not both succeed. The
// Postgres function does the check-free debit in one statement; going
// negative here is an accepted outcome (see Global Constraints — gating
// happens at mint time, not here), not a bug to guard against.
export async function debitWalletForCommission(userId: string, amount: number, kaspiPaymentRequestId: string): Promise<number> {
  const commission = computeCommission(amount)
  const { data, error } = await supabase.rpc('debit_wallet_balance', { p_user_id: userId, p_amount: commission })
  if (error) throw new Error(`wallet commission debit failed for user ${userId}: ${error.message}`)
  // Same reasoning as creditWallet's ledger insert: the debit already
  // happened, so a failed insert here is an audit-trail gap, not something
  // that should un-debit a commission the platform is legitimately owed.
  const { error: ledgerError } = await supabase.from('wallet_ledger').insert({
    user_id: userId,
    type: 'commission',
    amount: -commission,
    balance_after: data,
    kaspi_payment_request_id: kaspiPaymentRequestId,
  })
  if (ledgerError) console.error('wallet_ledger insert failed after commission debit for user', userId, ':', ledgerError.message)
  return data as number
}

export interface WalletTopupRow {
  id: string
  user_id: string
  amount: number
  kaspi_operation_id: string
  status: string
}

export async function checkAndSettleWalletTopup(row: WalletTopupRow): Promise<'paid' | 'not_paid'> {
  const connection = await loadPlatformConnection()
  if (!connection) return 'not_paid'

  const result = await checkStatus(connection, row.kaspi_operation_id)
  if (result.status !== 'paid') return 'not_paid'

  const { data: claimed, error: claimError } = await supabase
    .from('kaspi_wallet_topups')
    .update({ status: 'paid' })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('id')
  if (claimError) throw new Error(`failed to claim paid topup: ${claimError.message}`)
  if (!claimed || claimed.length === 0) return 'paid' // already settled by another caller

  await creditWallet(row.user_id, row.amount, row.id)
  return 'paid'
}
