import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnectionByApiToken } from '@/lib/kaspiPay/connection'
import { createPayment } from '@/lib/kaspiPay/client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

  const { amount, order_id, callback_url } = await req.json()
  if (!amount || !order_id) {
    return NextResponse.json({ error: 'amount and order_id required' }, { status: 400 })
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
      callback_url: callback_url || null,
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
