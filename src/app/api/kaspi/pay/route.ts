import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnectionByApiToken } from '@/lib/kaspiPay/connection'
import { createPayment } from '@/lib/kaspiPay/client'
import { getActivePlan } from '@/lib/plan'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Generous enough for a genuinely busy shop hitting this from its own
// checkout (a queue of 20 customers a minute at one till is already an
// exceptional day), tight enough that a leaked API token cannot be used to
// hammer Kaspi's backend and get that customer's Cashier role flagged.
// Counted straight off kaspi_payment_requests — deliberately no new caching
// or rate-limit dependency for v1.
const PAY_RATE_LIMIT = 20
const PAY_RATE_WINDOW_MS = 60_000

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // loadConnectionByApiToken throws on a genuine DB error (Task 6) rather
  // than returning null — that must not be conflated with "bad token".
  let found: Awaited<ReturnType<typeof loadConnectionByApiToken>>
  try {
    found = await loadConnectionByApiToken(token)
  } catch (e: any) {
    console.error('Kaspi connection lookup error:', e.message)
    return NextResponse.json({ error: 'kaspi_unavailable' }, { status: 502 })
  }
  if (!found) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // The real enforcement point for the whole feature. This route is called
  // by the customer's own site indefinitely, so without a plan check here a
  // user could subscribe to Pro for one month, connect, and keep full
  // production API access forever. Deliberately NOT applied to the polling
  // cron: that only resolves already-created requests (money that may
  // already have moved), so gating it would strand real payments — creation
  // is the point where the paid capability is actually consumed.
  const { data: ownerProfile } = await supabase
    .from('profiles')
    .select('plan, plan_expires_at, bonus_expires_at, trial_expires_at')
    .eq('id', found.userId)
    .single()
  if (!getActivePlan(ownerProfile).canAcquiring) {
    return NextResponse.json({ error: 'not_pro' }, { status: 403 })
  }

  const { amount, order_id, callback_url } = await req.json()
  if (!amount || !order_id) {
    return NextResponse.json({ error: 'amount and order_id required' }, { status: 400 })
  }

  const { count: recentCount, error: rateError } = await supabase
    .from('kaspi_payment_requests')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', found.userId)
    .gte('created_at', new Date(Date.now() - PAY_RATE_WINDOW_MS).toISOString())
  // Fails open on a counting error: a Supabase hiccup must not stop a real
  // shop taking real money. The limit exists to blunt abuse, not to be a
  // hard financial control.
  if (rateError) console.error('Kaspi pay: rate-limit count failed, allowing request:', rateError.message)
  else if ((recentCount ?? 0) >= PAY_RATE_LIMIT) {
    console.error('Kaspi pay: rate limit hit for user', found.userId, `— ${recentCount} requests in the last minute`)
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  try {
    const payment = await createPayment(found.connection, { amount, orderId: order_id })

    // A payment now genuinely exists on Kaspi's side and money can change
    // hands — an untracked insert failure here must not still report
    // success, since Task 8's poller and the caller's own callback_url
    // webhook would then have no way to ever learn this payment happened.
    const { error: insertError } = await supabase.from('kaspi_payment_requests').insert({
      user_id: found.userId,
      invoice_id: null,
      order_id,
      amount,
      kaspi_operation_id: payment.operationId,
      qr_token: payment.qrToken,
      payment_link: payment.paymentLink,
      // Per-request callback_url wins; falling back to the connection's own
      // default (set once on /profile/kaspi-pay) means callers who always
      // want the same webhook don't have to pass it on every single call.
      callback_url: callback_url || found.defaultWebhookUrl || null,
      status: 'pending',
      expires_at: payment.expiresAt,
    })

    if (insertError) {
      console.error('Kaspi payment created but failed to persist for tracking — operation', payment.operationId, ':', insertError.message)
      return NextResponse.json({ error: 'tracking_failed' }, { status: 502 })
    }

    return NextResponse.json({
      qr_token: payment.qrToken,
      payment_link: payment.paymentLink,
      operation_id: payment.operationId,
      expire_date: payment.expiresAt,
    })
  } catch (e: any) {
    console.error('Kaspi pay create error:', e.message)
    return NextResponse.json({ error: 'kaspi_unavailable' }, { status: 502 })
  }
}
