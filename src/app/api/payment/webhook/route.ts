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

    if (event !== 'payment.completed') {
      console.log('Skipping event:', event)
      return NextResponse.json({ ok: true })
    }

    const merchant_order_id = payment?.merchant_order_id
    const amount = payment?.amount
    console.log('merchant_order_id:', merchant_order_id)

    if (!merchant_order_id || !merchant_order_id.includes('__|__')) {
      console.log('Test webhook or invalid order_id, skipping')
      return NextResponse.json({ ok: true })
    }

    // Парсим userId и plan из orderId
    const parts = merchant_order_id.split('__|__')
    const userId = parts[0]
    const plan = parts[1]

    if (!userId || !plan) {
      console.error('Cannot parse userId/plan from orderId:', merchant_order_id)
      return NextResponse.json({ error: 'Invalid order id' }, { status: 400 })
    }

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

    console.log('SUCCESS: plan activated for', userId, 'until', expiresAt)

    // Telegram уведомление
    try {
      const { data: profile } = await supabase
        .from('profiles').select('company_name').eq('id', userId).single()
      await fetch('https://invoices.kz/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `💳 <b>Оплата получена!</b>\n👤 ${profile?.company_name || userId}\n📦 ${plan === 'pro' ? 'Pro — 5 990 ₸' : 'Basic — 2 990 ₸'}\n💰 Сумма: ${amount} ₸\n📅 Активен до: ${expiresAt.toLocaleDateString('ru-KZ')}`
        })
      })
    } catch (e) {
      console.log('Telegram failed:', e)
    }

    return NextResponse.json({ ok: true })

  } catch (e: any) {
    console.error('WEBHOOK CRASH:', e.message, e.stack)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}