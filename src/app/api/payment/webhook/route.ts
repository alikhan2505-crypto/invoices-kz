import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.log('Webhook received:', JSON.stringify(body))

    const { event, payment } = body

    if (event !== 'payment.completed') {
      return NextResponse.json({ ok: true })
    }

    const { merchant_order_id, amount } = payment

    if (!merchant_order_id) {
      console.error('No merchant_order_id:', JSON.stringify(payment))
      return NextResponse.json({ error: 'No order id' }, { status: 400 })
    }

    // Ищем заявку по order_id
    const { data: request, error: findError } = await supabase
      .from('payment_requests')
      .select('*')
      .eq('order_id', merchant_order_id)
      .single()

    if (findError || !request) {
      console.error('Payment request not found:', merchant_order_id, findError)
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    const userId = request.user_id
    const plan = request.plan

    console.log('Activating plan:', plan, 'for user:', userId)

    // Активируем подписку на 30 дней
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        plan,
        plan_expires_at: expiresAt.toISOString(),
      })
      .eq('id', userId)

    if (updateError) {
      console.error('Supabase update error:', JSON.stringify(updateError))
      return NextResponse.json({ error: 'DB error' }, { status: 500 })
    }

    // Обновляем статус заявки
    await supabase
      .from('payment_requests')
      .update({ status: 'completed' })
      .eq('order_id', merchant_order_id)

    console.log('Plan activated for user:', userId, 'until:', expiresAt)

    // Telegram уведомление
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_name')
        .eq('id', userId)
        .single()

      await fetch('https://invoices.kz/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `💳 <b>Оплата получена!</b>\n👤 ${profile?.company_name || userId}\n📦 Тариф: ${plan === 'pro' ? 'Pro — 5 990 ₸' : 'Basic — 2 990 ₸'}\n💰 Сумма: ${amount} ₸\n📅 Активен до: ${expiresAt.toLocaleDateString('ru-KZ')}`
        })
      })
    } catch (e) {
      console.log('Telegram notify failed:', e)
    }

    return NextResponse.json({ ok: true })

  } catch (e: any) {
    console.error('Webhook error:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}