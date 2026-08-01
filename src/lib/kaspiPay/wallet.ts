import { createClient } from '@supabase/supabase-js'

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
  await supabase.from('wallet_ledger').insert({
    user_id: userId,
    type: 'topup',
    amount,
    balance_after: data,
    kaspi_wallet_topup_id: topupId,
  })
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
  await supabase.from('wallet_ledger').insert({
    user_id: userId,
    type: 'commission',
    amount: -commission,
    balance_after: data,
    kaspi_payment_request_id: kaspiPaymentRequestId,
  })
  return data as number
}
