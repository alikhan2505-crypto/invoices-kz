import { createClient } from '@supabase/supabase-js'
import { loadPlatformConnection } from './connection'
import { checkStatus } from './client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const COMMISSION_RATE = 0.02

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
export async function debitWalletForCommission(userId: string, amount: number, kaspiPaymentRequestId: string | null, note?: string): Promise<number> {
  const commission = computeCommission(amount)
  const { data, error } = await supabase.rpc('debit_wallet_balance', { p_user_id: userId, p_amount: commission })
  if (error) throw new Error(`wallet commission debit failed for user ${userId}: ${error.message}`)
  // Unlike creditWallet's ledger insert, this one is NOT allowed to fail
  // silently: Kaspi history sync's alreadyCharged() guard (and the pending-
  // match confirm route's own copy of it) both key off this exact row's
  // existence to decide whether a commission was already charged for a
  // given Kaspi operation. A swallowed failure here would leave the balance
  // debited with no record of it, so a crash-recovery retry sees "not yet
  // charged" and debits a second time -- throwing surfaces the failure to
  // the caller (which already treats a failed debit as best-effort/logged,
  // never as a reason to un-confirm the underlying payment) instead of
  // silently creating that gap.
  const { error: ledgerError } = await supabase.from('wallet_ledger').insert({
    user_id: userId,
    type: 'commission',
    amount: -commission,
    balance_after: data,
    kaspi_payment_request_id: kaspiPaymentRequestId,
    note: note ?? null,
  })
  if (ledgerError) throw new Error(`wallet_ledger insert failed after commission debit for user ${userId}: ${ledgerError.message}`)
  return data as number
}

// Generic unified-wallet debit for non-commission spend categories
// (Kaspi Shop price checks, AI-agent replies). Same atomic RPC + loud
// ledger-failure contract as debitWalletForCommission.
export async function debitWallet(
  userId: string,
  amountTenge: number,
  type: 'kaspi_shop_check' | 'ai_agent_reply',
  note: string
): Promise<number> {
  const { data, error } = await supabase.rpc('debit_wallet_balance', { p_user_id: userId, p_amount: amountTenge })
  if (error) throw new Error(`wallet debit (${type}) failed for user ${userId}: ${error.message}`)
  const { error: ledgerError } = await supabase.from('wallet_ledger').insert({
    user_id: userId,
    type,
    amount: -amountTenge,
    balance_after: data,
    note,
  })
  if (ledgerError) console.error(`wallet_ledger insert failed after ${type} debit for user`, userId, ':', ledgerError.message)
  return data as number
}

export interface WalletTopupRow {
  id: string
  user_id: string
  amount: number
  kaspi_operation_id: string
  status: string
  expires_at?: string | null
}

function isPastExpiry(row: WalletTopupRow): boolean {
  return !!row.expires_at && new Date(row.expires_at) <= new Date()
}

async function tryTerminateTopup(row: WalletTopupRow, status: 'expired' | 'failed'): Promise<boolean> {
  const { data, error } = await supabase
    .from('kaspi_wallet_topups')
    .update({ status })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('id')
  if (error) {
    console.error(`Wallet topup: failed to mark ${status}`, row.id, error.message)
    return false
  }
  return !!(data && data.length > 0)
}

// Mirrors checkAndSettleKaspiPayment's shape (paid/not_paid/expired) so a
// row that's dead on Kaspi's side (QR expired unpaid) doesn't accumulate
// forever in the cron's pending sweep -- without this, every abandoned
// top-up attempt cost one Kaspi round-trip on every single daily run,
// indefinitely. 'scanning' is additive (checkStatus's 'Wait' status) so the
// caller-facing page can show "customer is confirming" instead of a generic
// pending state; every existing `!== 'paid'` / `=== 'expired'` check on the
// return value here is unaffected since 'scanning' falls under neither.
// 'failed' is likewise additive and distinct from 'expired': it covers a
// scanned-then-cancelled/rejected/insufficient-funds attempt (Kaspi's
// CancelledByUser/NotConfirmedByUser/InsufficientFunds/etc, see
// checkStatus's QR_FAILED set) -- previously this fell through to
// 'not_paid' and the row just sat 'pending' forever showing a QR that was
// already dead on Kaspi's side (the founder's exact repro: cancel a scan,
// the page falls back to "QR готов" instead of ever refreshing it).
export async function checkAndSettleWalletTopup(
  row: WalletTopupRow,
  opts: { force?: boolean } = {}
): Promise<'paid' | 'not_paid' | 'expired' | 'scanning' | 'failed'> {
  const connection = await loadPlatformConnection()
  if (!connection) return 'not_paid'

  const result = await checkStatus(connection, row.kaspi_operation_id)
  if (result.status === 'scanning') return 'scanning'
  if (result.status === 'failed') {
    if (await tryTerminateTopup(row, 'failed')) return 'failed'
    return 'not_paid'
  }
  if (result.status !== 'paid') {
    // force=true is the caller deciding NOT to wait for Kaspi's own
    // ExpireDate (still ~5 min away) or isPastExpiry's local clock -- used
    // when the caller is abandoning this specific attempt on its own
    // timeline (the /kaspi-api page's 60s idle-refresh) and wants the row
    // settled now instead of sitting 'pending' until the next daily cron
    // sweep finally notices it's stale.
    const expiredOnKaspi = result.status === 'expired'
    if ((opts.force || expiredOnKaspi || isPastExpiry(row)) && (await tryTerminateTopup(row, 'expired'))) return 'expired'
    return 'not_paid'
  }

  const { data: claimed, error: claimError } = await supabase
    .from('kaspi_wallet_topups')
    .update({ status: 'paid' })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('id')
  if (claimError) throw new Error(`failed to claim paid topup: ${claimError.message}`)
  if (!claimed || claimed.length === 0) return 'paid' // already settled by another caller

  // The row is now claimed 'paid', and the cron only ever sweeps 'pending'
  // rows -- if creditWallet itself throws (a transient Supabase error), this
  // customer's money is confirmed on Kaspi's side but would never reach
  // their balance and nothing would ever retry. Logged loudly for manual
  // reconciliation rather than silently losing the credit; still reports
  // 'paid' since the Kaspi-side payment genuinely is.
  try {
    await creditWallet(row.user_id, row.amount, row.id)
  } catch (e: any) {
    console.error('CRITICAL: wallet topup', row.id, 'for user', row.user_id, 'confirmed paid on Kaspi but credit failed:', e.message)
  }
  return 'paid'
}
