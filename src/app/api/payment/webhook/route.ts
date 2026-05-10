import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.log('Webhook body:', JSON.stringify(body))

    const { event, payment } = body
    console.log('Event:', event, 'Payment:', JSON.stringify(payment))

    if (event !== 'payment.completed') {
      console.log('Skipping non-completed event:', event)
      return NextResponse.json({ ok: true })
    }

    const merchant_order_id = payment?.merchant_order_id
    const amount = payment?.amount
    console.log('merchant_order_id:', merchant_order_id, 'amount:', amount)

    if (!merchant_order_id) {
      console.log('No merchant_order_id, skipping')
      return NextResponse.json({ ok: true })
    }

    // Ищем заявку по order_id
    console.log('Looking up payment_request for order_id:', merchant_order_id)
    const { data: request, error: findError } = await supabase
      .from('payment_requests')
      .select('*')
      .eq('order_id', merchant_order_id)
      .maybeSingle()

    console.log('Found request:', JSON.stringify(request), 'Error:', JSON.stringify(findError))

    if (findError) {
      console.error('DB find error:', JSON.stringify(findError))
      return NextResponse.json({ error: findError.message }, { status: 500 })
    }

    if (!request) {
      console.log('No request found for order_id:', merchant_order_id, '— probably test webhook')
      return NextResponse.json({ ok: true })
    }

    const userId = request.user_id
    const plan = request.plan
    console.log('Activating plan:', plan, 'for user:', userId)

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ plan, plan_expires_at: expiresAt.toISOString() })
      .eq('id', userId)

    if (updateError) {
      console.error('Profile update error:', JSON.stringify(updateError))
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    await supabase
      .from('payment_requests')
      .update({ status: 'completed' })
      .eq('order_id', merchant_order_id)

    console.log('SUCCESS: plan activated for', userId, 'until', expiresAt)

    try {
      const { data: profile } = await supabase
        .from('profiles').select('company_name').eq('id', userId).single()
      await fetch('https://invoices.kz/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `💳 <b>Оплата!</b>\n👤 ${profile?.company_name || userId}\n📦 ${plan === 'pro' ? 'Pro 5 990 ₸' : 'Basic 2 990 ₸'}\n📅 до ${expiresAt.toLocaleDateString('ru-KZ')}`
        })
      })
    } catch {}

    return NextResponse.json({ ok: true })

  } catch (e: any) {
    console.error('WEBHOOK CRASH:', e.message, e.stack)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}