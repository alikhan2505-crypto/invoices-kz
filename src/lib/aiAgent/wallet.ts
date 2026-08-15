import { createClient } from '@supabase/supabase-js'
import { loadPlatformConnection } from '@/lib/kaspiPay/connection'
import { checkStatus } from '@/lib/kaspiPay/client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const AI_AGENT_CREDIT_PRICE_TENGE = 5

// Real Claude Haiku 4.5 pricing (confirmed live at platform.claude.com/docs,
// 2026-08-15): $1/MTok input, $5/MTok output. generateAiReply's typical
// call (~600 input tokens including the prompt template and up to 5 prior
// DM exchanges, ~150 output tokens averaged across short public-comment
// replies capped near 12 words and fuller 2-3 sentence DM replies) costs
// roughly (600 * $1 + 150 * $5) / 1,000,000 = $0.00135 -- at an
// approximate 500 tenge/$1 (this codebase has no live FX source to pull an
// exact rate from), about 0.14 credits of real cost. Rounded up to a
// clean, easy-to-communicate 1 credit per AI-generated reply, comfortably
// covering the real cost with margin -- template matches stay free, same
// as the single-tenant bot's templates never touching the Anthropic API.
export const AI_AGENT_CREDITS_PER_AI_REPLY = 1

export async function getAiAgentWalletBalance(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('ai_agent_wallet')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`ai_agent_wallet lookup failed for user ${userId}: ${error.message}`)
  return Number(data?.balance ?? 0)
}

export async function debitAiAgentWallet(userId: string, credits: number, note: string): Promise<number> {
  const { data, error } = await supabase.rpc('debit_ai_agent_wallet_balance', { p_user_id: userId, p_amount: credits })
  if (error) throw new Error(`ai_agent_wallet debit failed for user ${userId}: ${error.message}`)

  const { data: wallet } = await supabase.from('ai_agent_wallet').select('id').eq('user_id', userId).single()
  const { error: ledgerError } = await supabase.from('ai_agent_wallet_ledger').insert({
    wallet_id: wallet?.id,
    user_id: userId,
    amount: -credits,
    type: 'reply_debit',
    note,
  })
  if (ledgerError) console.error('ai_agent_wallet_ledger insert failed after reply debit for user', userId, ':', ledgerError.message)
  return data as number
}

export async function creditAiAgentWallet(userId: string, credits: number, note: string): Promise<number> {
  const { data, error } = await supabase.rpc('debit_ai_agent_wallet_balance', { p_user_id: userId, p_amount: -credits })
  if (error) throw new Error(`ai_agent_wallet credit failed for user ${userId}: ${error.message}`)

  const { data: wallet } = await supabase.from('ai_agent_wallet').select('id').eq('user_id', userId).single()
  const { error: ledgerError } = await supabase.from('ai_agent_wallet_ledger').insert({
    wallet_id: wallet?.id,
    user_id: userId,
    amount: credits,
    type: 'topup',
    note,
  })
  if (ledgerError) console.error('ai_agent_wallet_ledger insert failed after topup credit for user', userId, ':', ledgerError.message)
  return data as number
}

export interface AiAgentWalletTopupRow {
  id: string
  user_id: string
  credits: number
  kaspi_operation_id: string
  status: string
  expires_at?: string | null
}

function isPastExpiry(row: AiAgentWalletTopupRow): boolean {
  return !!row.expires_at && new Date(row.expires_at) <= new Date()
}

// Mirrors checkAndSettleKaspiShopWalletTopup's shape exactly (paid/not_paid/expired), retargeted at ai_agent_wallet.
export async function checkAndSettleAiAgentWalletTopup(row: AiAgentWalletTopupRow): Promise<'paid' | 'not_paid' | 'expired'> {
  const connection = await loadPlatformConnection()
  if (!connection) return 'not_paid'

  const result = await checkStatus(connection, row.kaspi_operation_id)
  if (result.status !== 'paid') {
    const expiredOnKaspi = result.status === 'expired'
    if (expiredOnKaspi || isPastExpiry(row)) {
      const { data } = await supabase
        .from('ai_agent_wallet_topups')
        .update({ status: 'expired' })
        .eq('id', row.id)
        .eq('status', 'pending')
        .select('id')
      if (data && data.length > 0) return 'expired'
    }
    return 'not_paid'
  }

  const { data: claimed, error: claimError } = await supabase
    .from('ai_agent_wallet_topups')
    .update({ status: 'paid' })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('id')
  if (claimError) throw new Error(`failed to claim paid ai_agent_wallet_topups row: ${claimError.message}`)
  if (!claimed || claimed.length === 0) return 'paid'

  try {
    await creditAiAgentWallet(row.user_id, row.credits, `Пополнение: топап ${row.id}`)
  } catch (e: any) {
    console.error('CRITICAL: ai_agent_wallet_topups', row.id, 'for user', row.user_id, 'confirmed paid on Kaspi but credit failed:', e.message)
  }
  return 'paid'
}
