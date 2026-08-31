import { createClient } from '@supabase/supabase-js'
import { loadPlatformConnection } from './connection'
import { checkStatus } from './client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface PlanPaymentRow {
  id: string
  user_id: string
  plan: string
  amount: number
  qr_operation_id: string
  created_at?: string
  billing_period?: string
}

// payment_requests has no expires_at column (unlike kaspi_payment_requests/
// kaspi_wallet_topups) -- a Kaspi QR itself expires within minutes, so a
// row still 'pending' a full day after creation is safe to treat as dead
// rather than sweeping it forever on every future daily cron run.
const PLAN_PAYMENT_STALE_MS = 24 * 60 * 60 * 1000

async function tryExpirePlanPayment(row: PlanPaymentRow): Promise<boolean> {
  const { data, error } = await supabase
    .from('payment_requests')
    .update({ status: 'expired' })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('id')
  if (error) {
    console.error('Plan payment: failed to expire', row.id, error.message)
    return false
  }
  return !!(data && data.length > 0)
}

// Parallel to checkAndSettleKaspiPayment, but for invoices.kz's OWN
// subscription payments: settles against the admin's platform connection
// instead of the paying customer's, and activates a plan instead of marking
// an invoice paid. Ported from the old /api/payment/webhook's bonus-days
// carry-over logic rather than dropping it.
export async function checkAndSettlePlanPayment(row: PlanPaymentRow): Promise<'paid' | 'not_paid' | 'expired'> {
  const connection = await loadPlatformConnection()
  if (!connection) return 'not_paid'

  const result = await checkStatus(connection, row.qr_operation_id)
  if (result.status !== 'paid') {
    const expiredOnKaspi = result.status === 'expired'
    const isStale = !!row.created_at && (Date.now() - new Date(row.created_at).getTime()) > PLAN_PAYMENT_STALE_MS
    if ((expiredOnKaspi || isStale) && (await tryExpirePlanPayment(row))) return 'expired'
    return 'not_paid'
  }

  const { data: claimed, error: claimError } = await supabase
    .from('payment_requests')
    .update({ status: 'paid', activated_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('id')
  if (claimError) throw new Error(`failed to claim paid plan payment: ${claimError.message}`)
  if (!claimed || claimed.length === 0) return 'paid' // already settled by another caller

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + (row.billing_period === 'annual' ? 365 : 30))

  const { data: profile } = await supabase
    .from('profiles')
    .select('bonus_expires_at')
    .eq('id', row.user_id)
    .single()
  if (profile?.bonus_expires_at) {
    const bonusEnd = new Date(profile.bonus_expires_at)
    if (bonusEnd > new Date()) {
      const bonusDays = Math.ceil((bonusEnd.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
      expiresAt.setDate(expiresAt.getDate() + bonusDays)
    }
  }

  // The payment_requests row is already claimed 'paid' at this point -- if
  // this update fails, the customer paid, the row says 'paid', but the plan
  // never activates and nothing would ever retry (the cron only sweeps
  // 'pending' rows). Logged loudly for manual reconciliation rather than
  // silently discarding the failure.
  const { error: planError } = await supabase
    .from('profiles')
    .update({ plan: row.plan, plan_expires_at: expiresAt.toISOString() })
    .eq('id', row.user_id)
  if (planError) console.error('CRITICAL: plan payment', row.id, 'for user', row.user_id, 'confirmed paid but plan activation failed:', planError.message)

  // Notification to admin on successful plan payment settlement. The admin uses
  // this to notice payments in real time. Best-effort: a notification failure
  // must not affect billing.
  try {
    const { data: prof } = await supabase.from('profiles').select('company_name').eq('id', row.user_id).single()
    const planLabel = row.plan === 'pro' ? 'Pro' : row.plan === 'basic' ? 'Basic' : row.plan
    const periodLabel = row.billing_period === 'annual' ? ' (год)' : ''
    await fetch('https://invoices.kz/api/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET! },
      body: JSON.stringify({
        message: `💳 <b>Оплата!</b>\n👤 ${prof?.company_name || row.user_id}\n📦 ${planLabel} ${row.amount.toLocaleString('ru-KZ')} ₸${periodLabel}\n📅 до ${expiresAt.toLocaleDateString('ru-KZ')}`,
      }),
    })
  } catch (e: any) {
    console.error('Plan payment Telegram notification failed for', row.user_id, ':', e.message)
  }

  return 'paid'
}
