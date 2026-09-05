import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadPlatformConnection } from '@/lib/kaspiPay/connection'
import { createPayment } from '@/lib/kaspiPay/client'
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

// This route hits the single shared platform Kaspi connection (not a
// per-customer one) -- unbounded calls from one user could get the one
// connection every customer's billing depends on flagged by Kaspi.
const PLAN_PAYMENT_RATE_LIMIT = 5
const PLAN_PAYMENT_RATE_WINDOW_MS = 60_000

export async function POST(req: NextRequest) {
  try {
    const { userId, plan, period } = await req.json()
    if (!userId || !plan || (plan !== 'pro' && plan !== 'basic')) {
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
    if (rateError) console.error('Payment create: rate-limit count failed, allowing request:', rateError.message)
    else if ((recentCount ?? 0) >= PLAN_PAYMENT_RATE_LIMIT) {
      console.error('Payment create: rate limit hit for user', userId, `— ${recentCount} requests in the last minute`)
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }

    // Same reasoning as create-phone/route.ts's identical check: the rate
    // limit above only stops rapid spam, not a customer creating a second
    // real Kaspi operation a minute or more later because the first one's
    // confirmation wasn't obviously visible. Blocks on ANY pending request
    // regardless of which route created it (both write the same table).
    //
    // A Kaspi QR dies after ~5 minutes, but the row it left behind stays
    // 'pending' until the daily 04:00 cron sweeps it. That combination locked
    // a customer out of paying for up to 24 hours: the QR they were looking
    // at was already dead, and every retry answered 409 already_pending. So
    // settle the pending rows against Kaspi FIRST -- checkAndSettlePlanPayment
    // marks anything Kaspi reports as expired -- and only refuse when a
    // genuinely live payment is still waiting to be paid.
    const { data: pendingRows, error: pendingError } = await supabase
      .from('payment_requests')
      .select('id, user_id, plan, amount, qr_operation_id, created_at, billing_period')
      .eq('user_id', userId)
      .eq('status', 'pending')
    if (pendingError) console.error('Payment create: pending-check failed, allowing request:', pendingError.message)
    else if ((pendingRows?.length ?? 0) > 0) {
      let stillLive = 0
      for (const row of pendingRows as PlanPaymentRow[]) {
        try {
          const result = await checkAndSettlePlanPayment(row)
          if (result === 'paid') {
            // Settling just activated the plan from a QR the customer had
            // already paid. Same as create-phone: report it as a successful
            // outcome instead of minting a second operation they'd be
            // charged for. 'expired' falls through -- that row is dead.
            return NextResponse.json({ error: 'already_paid' }, { status: 409 })
          }
          if (result === 'not_paid') stillLive++
        } catch (e: any) {
          // Kaspi unreachable -- keep the old conservative behaviour and
          // treat the row as live rather than minting a second operation.
          console.error('Payment create: could not settle pending row', row.id, '— treating as live:', e.message)
          stillLive++
        }
      }
      if (stillLive > 0) {
        return NextResponse.json({ error: 'already_pending' }, { status: 409 })
      }
    }

    const connection = await loadPlatformConnection()
    if (!connection) return NextResponse.json({ error: 'Platform Kaspi connection not set up' }, { status: 500 })

    const amount = getPlanAmount(plan, billingPeriod)
    const payment = await createPayment(connection, { amount, orderId: `${userId}__${plan}__${Date.now()}` })

    const { error: insertError } = await supabase.from('payment_requests').insert({
      user_id: userId,
      email: user.email,
      plan,
      amount,
      billing_period: billingPeriod,
      status: 'pending',
      order_id: payment.operationId,
      qr_operation_id: payment.operationId,
    })
    if (insertError) {
      console.error('Plan payment created but failed to persist for tracking — operation', payment.operationId, ':', insertError.message)
      return NextResponse.json({ error: 'tracking_failed' }, { status: 502 })
    }

    return NextResponse.json({
      qr_token: payment.paymentLink,
      ext_tran_id: payment.operationId,
      expire_date: payment.expiresAt,
    })
  } catch (e: any) {
    console.error('Payment create error:', e)
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
