import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadPlatformConnection } from '@/lib/kaspiPay/connection'
import { createInvoiceByPhone } from '@/lib/kaspiPay/client'

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
    const { userId, plan, phone } = await req.json()
    if (!userId || !plan || !phone || (plan !== 'pro' && plan !== 'basic')) {
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
    if (rateError) console.error('Phone payment: rate-limit count failed, allowing request:', rateError.message)
    else if ((recentCount ?? 0) >= PLAN_PAYMENT_RATE_LIMIT) {
      console.error('Phone payment: rate limit hit for user', userId, `— ${recentCount} requests in the last minute`)
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }

    // The rate limit above only catches rapid spam within one minute -- it
    // did nothing for a real report of two separate real Kaspi operations
    // created ~67s apart because the first attempt's confirmation wasn't
    // obviously visible. A customer with any still-unresolved pending
    // request (from either this route or the QR-based create/route.ts) must
    // resolve it first -- the daily cron already expires stale ones, so this
    // never permanently locks a customer out.
    const { count: pendingCount, error: pendingError } = await supabase
      .from('payment_requests')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'pending')
    if (pendingError) console.error('Phone payment: pending-check failed, allowing request:', pendingError.message)
    else if ((pendingCount ?? 0) > 0) {
      return NextResponse.json({ error: 'already_pending' }, { status: 409 })
    }

    const connection = await loadPlatformConnection()
    if (!connection) return NextResponse.json({ error: 'Platform Kaspi connection not set up' }, { status: 500 })

    const amount = plan === 'pro' ? 5990 : 2990
    const comment = plan === 'pro' ? 'INVOICES.KZ Pro тариф' : 'INVOICES.KZ Basic тариф'
    const invoice = await createInvoiceByPhone(connection, { phoneNumber: phone, amount, comment })

    const { error: insertError } = await supabase.from('payment_requests').insert({
      user_id: userId,
      email: user.email,
      plan,
      amount,
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
