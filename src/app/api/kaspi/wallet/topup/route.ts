import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadPlatformConnection } from '@/lib/kaspiPay/connection'
import { createPayment } from '@/lib/kaspiPay/client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const MIN_TOPUP = 1000

// This route hits the single shared platform Kaspi connection (not a
// per-customer one), same reasoning as PAY_RATE_LIMIT/MINT_LIMIT elsewhere
// in this codebase: unbounded calls from one authenticated user could get
// the one connection every customer's billing depends on flagged by Kaspi.
const TOPUP_RATE_LIMIT = 5
const TOPUP_RATE_WINDOW_MS = 60_000

export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { amount } = await req.json()
  if (!amount || typeof amount !== 'number' || amount < MIN_TOPUP) {
    return NextResponse.json({ error: 'invalid_amount', min: MIN_TOPUP }, { status: 400 })
  }

  const { count: recentCount, error: rateError } = await supabase
    .from('kaspi_wallet_topups')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', new Date(Date.now() - TOPUP_RATE_WINDOW_MS).toISOString())
  if (rateError) console.error('Wallet topup: rate-limit count failed, allowing request:', rateError.message)
  else if ((recentCount ?? 0) >= TOPUP_RATE_LIMIT) {
    console.error('Wallet topup: rate limit hit for user', user.id, `— ${recentCount} requests in the last minute`)
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const connection = await loadPlatformConnection()
  if (!connection) return NextResponse.json({ error: 'Platform Kaspi connection not set up' }, { status: 500 })

  try {
    const payment = await createPayment(connection, { amount, orderId: `topup_${user.id}_${Date.now()}` })
    const { data: inserted, error: insertError } = await supabase
      .from('kaspi_wallet_topups')
      .insert({
        user_id: user.id,
        amount,
        kaspi_operation_id: payment.operationId,
        qr_token: payment.qrToken,
        payment_link: payment.paymentLink,
        status: 'pending',
        expires_at: payment.expiresAt,
      })
      .select('id')
      .single()
    if (insertError) {
      console.error('Wallet topup created but failed to persist — operation', payment.operationId, ':', insertError.message)
      return NextResponse.json({ error: 'tracking_failed' }, { status: 502 })
    }
    return NextResponse.json({ topup_id: inserted.id, payment_link: payment.paymentLink, expires_at: payment.expiresAt })
  } catch (e: any) {
    console.error('Wallet topup create error:', e.message)
    return NextResponse.json({ error: 'kaspi_unavailable' }, { status: 502 })
  }
}
