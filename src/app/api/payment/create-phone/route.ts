import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadPlatformConnection } from '@/lib/kaspiPay/connection'
import { createInvoiceByPhone } from '@/lib/kaspiPay/client'
import { getPlanAmount, type BillingPeriod } from '@/lib/plans/pricing'
import { checkAndSettlePlanPayment, type PlanPaymentRow } from '@/lib/kaspiPay/settlePlanPayment'

const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Same shared-platform-connection reasoning as create/route.ts -- counted
// against the same payment_requests table, so the two routes share one
// combined limit against abuse of the one connection all billing depends on.
const PLAN_PAYMENT_RATE_LIMIT = 5
const PLAN_PAYMENT_RATE_WINDOW_MS = 60_000

export async function POST(req: NextRequest) {
  try {
    const { userId, plan, phone, period } = await req.json()
    if (!userId || !plan || !phone || (plan !== 'pro' && plan !== 'basic')) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 })
    }
    if (period !== undefined && period !== null && period !== 'monthly' && period !== 'annual') {
      return NextResponse.json({ error: 'Invalid period' }, { status: 400 })
    }
    const billingPeriod: BillingPeriod = period === 'annual' ? 'annual' : 'monthly'

    const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
    const { data: { user } } = accessToken
      ? await supabaseAuth.auth.getUser(accessToken)
      : { data: { user: null } }
    if (!user || user.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { count: recentCount, error: rateError } = await supabase
      .from('payment_requests')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - PLAN_PAYMENT_RATE_WINDOW_MS).toISOString())
    if (rateError) console.error('Phone payment: rate-limit count failed, allowing request:', rateError.message)
    else if ((recentCount ?? 0) >= PLAN_PAYMENT_RATE_LIMIT) {
      console.error('Phone payment: rate limit hit for user', userId, `— ${recentCount} requests in the last minute`)
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }

    // A customer with any still-unresolved pending request (from either this
    // route or the QR-based create/route.ts) used to hard-block here, then
    // (in the previous version of this route) got auto-superseded to
    // 'expired' once settled -- but both settlement sweepers (the daily cron
    // and /api/payment/status) only ever process 'pending' rows, so expiring
    // a QR the customer goes on to pay in the Kaspi app afterward would
    // silently drop that charge: money taken, plan never activated, nothing
    // left to retry it. So instead: settle each pending row first
    // (checkAndSettlePlanPayment activates the plan and claims the row
    // 'paid' as a side effect, same as the daily cron does) so a payment
    // that already completed is never silently dropped, then just proceed
    // to create the phone invoice -- any pending QR row(s) left over are
    // deliberately left alive rather than expired. Both the QR and the new
    // phone invoice stay independently settleable, and if the customer ends
    // up paying both, checkAndSettlePlanPayment's renewal-stacking logic in
    // settlePlanPayment.ts adds them on top of each other correctly instead
    // of one silently losing out.
    const { data: pendingRows, error: pendingError } = await supabase
      .from('payment_requests')
      .select('id, user_id, plan, amount, qr_operation_id, created_at, billing_period')
      .eq('user_id', userId)
      .eq('status', 'pending')
    if (pendingError) {
      console.error('Phone payment: pending-check failed, allowing request:', pendingError.message)
    } else if (pendingRows && pendingRows.length > 0) {
      for (const row of pendingRows as PlanPaymentRow[]) {
        try {
          const result = await checkAndSettlePlanPayment(row)
          if (result === 'paid') {
            // The plan just activated from the pending QR -- treat this as a
            // successful outcome for the caller, not a failure to retry.
            return NextResponse.json({ error: 'already_paid' }, { status: 409 })
          }
        } catch (e: any) {
          // Same as the cron's per-row handling -- a throwing settle check
          // (e.g. a degraded, non-throwing-turned-thrown Kaspi response) must
          // never be fatal to this request. The row stays 'pending' and gets
          // picked up by the next cron/status-poll sweep.
          console.error('Phone payment: settle check failed for pending row', row.id, '— leaving it pending for the next sweep:', e.message)
        }
      }
    }

    const connection = await loadPlatformConnection()
    if (!connection) return NextResponse.json({ error: 'Platform Kaspi connection not set up' }, { status: 500 })

    const amount = getPlanAmount(plan, billingPeriod)
    const comment = billingPeriod === 'annual'
      ? (plan === 'pro' ? 'INVOICES.KZ Pro тариф (год)' : 'INVOICES.KZ Basic тариф (год)')
      : (plan === 'pro' ? 'INVOICES.KZ Pro тариф' : 'INVOICES.KZ Basic тариф')
    const invoice = await createInvoiceByPhone(connection, { phoneNumber: phone, amount, comment })

    const { error: insertError } = await supabase.from('payment_requests').insert({
      user_id: userId,
      email: user.email,
      plan,
      amount,
      billing_period: billingPeriod,
      status: 'pending',
      order_id: invoice.operationId,
      qr_operation_id: invoice.operationId,
    })
    if (insertError) {
      console.error('Plan phone-payment created but failed to persist — operation', invoice.operationId, ':', insertError.message)
      return NextResponse.json({ error: 'tracking_failed' }, { status: 502 })
    }

    return NextResponse.json({ payment_id: invoice.operationId, status: 'pending' })
  } catch (e: any) {
    console.error('Phone payment error:', e)
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
