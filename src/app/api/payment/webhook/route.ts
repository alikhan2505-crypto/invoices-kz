import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const body = await req.json()
  console.log('Webhook received:', JSON.stringify(body))

  const { event, payment } = body
  if (event !== 'payment.completed') {
    return NextResponse.json({ ok: true })
  }

  const { merchant_order_id, amount, metadata } = payment
  const userId = metadata?.user_id
  const plan = metadata?.plan

  if (!userId || !plan) {
    console.error('Missing metadata:', metadata)
    return NextResponse.json({ error: 'Missing metadata' }, { status: 400 })
  }

  // Активируем подписку на 30 дней
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  const { error } = await supabase.from('profiles').update({
    plan,
    plan_expires_at: expiresAt.toISOString(),
  }).eq('id', userId)

  if (error) {
    console.error('Supabase error:', error)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  // Telegram уведомление
  try {
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('supabase.co', '') || 'https://invoices.kz'}/api/telegram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `💳 <b>Оплата получена!</b>\n👤 User: ${userId}\n📦 Тариф: ${plan === 'pro' ? 'Pro' : 'Basic'}\n💰 Сумма: ${amount} ₸\n✅ Подписка активирована до ${expiresAt.toLocaleDateString('ru-KZ')}`
      })
    })
  } catch {}

  return NextResponse.json({ ok: true })
}