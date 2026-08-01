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
}

// Parallel to checkAndSettleKaspiPayment, but for invoices.kz's OWN
// subscription payments: settles against the admin's platform connection
// instead of the paying customer's, and activates a plan instead of marking
// an invoice paid. Ported from the old /api/payment/webhook's bonus-days
// carry-over logic rather than dropping it.
export async function checkAndSettlePlanPayment(row: PlanPaymentRow): Promise<'paid' | 'not_paid'> {
  const connection = await loadPlatformConnection()
  if (!connection) return 'not_paid'

  const result = await checkStatus(connection, row.qr_operation_id)
  if (result.status !== 'paid') return 'not_paid'

  const { data: claimed, error: claimError } = await supabase
    .from('payment_requests')
    .update({ status: 'paid', activated_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('id')
  if (claimError) throw new Error(`failed to claim paid plan payment: ${claimError.message}`)
  if (!claimed || claimed.length === 0) return 'paid' // already settled by another caller

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

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

  await supabase.from('profiles').update({ plan: row.plan, plan_expires_at: expiresAt.toISOString() }).eq('id', row.user_id)

  return 'paid'
}
