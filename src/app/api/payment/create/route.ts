import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadPlatformConnection } from '@/lib/kaspiPay/connection'
import { createPayment } from '@/lib/kaspiPay/client'

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
    const { userId, plan } = await req.json()
    if (!userId || !plan || (plan !== 'pro' && plan !== 'basic')) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 })
    }

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

    const connection = await loadPlatformConnection()
    if (!connection) return NextResponse.json({ error: 'Platform Kaspi connection not set up' }, { status: 500 })

    const amount = plan === 'pro' ? 5990 : 2990
    const payment = await createPayment(connection, { amount, orderId: `${userId}__${plan}__${Date.now()}` })

    const { error: insertError } = await supabase.from('payment_requests').insert({
      user_id: userId,
      email: user.email,
      plan,
      amount,
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
