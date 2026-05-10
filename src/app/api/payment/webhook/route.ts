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

    // Ищем заявку по order_id
    const { data: request } = await supabase
      .from('payment_requests')
      .select('*')
      .eq('order_id', merchant_order_id)
      .single()

    if (!request) {
      console.error('Payment request not found for order_id:', merchant_order_id)
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    const userId = request.user_id
    const plan = request.plan

    // Активируем подписку на 30 дней
    const now = new Date()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    await supabase.from('profiles').update({
      plan,
      plan_expires_at: expiresAt.toISOString(),
    }).eq('id', userId)

    // Обновляем статус заявки
    await supabase.from('payment_requests').update({
      status: 'completed',
    }).eq('order_id', merchant_order_id)

    // Telegram уведомление
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_name, phone')
        .eq('id', userId)
        .single()

      await fetch(`https://invoices.kz/api/telegram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `💳 <b>Оплата получена!</b>\n👤 ${profile?.company_name || userId}\n📦 Тариф: ${plan === 'pro' ? 'Pro 5 990 ₸' : 'Basic 2 990 ₸'}\n💰 Сумма: ${amount} ₸\n📅 Активен до: ${expiresAt.toLocaleDateString('ru-KZ')}`
        })
      })
    } catch {}

    return NextResponse.json({ ok: true })

  } catch (e: any) {
    console.error('Webhook error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}