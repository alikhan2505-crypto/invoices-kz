import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    await supabase.from('webhook_logs').insert({ body })
    console.log('Webhook received:', JSON.stringify(body))

    const event = body?.event
    const merchant_order_id = body?.merchant_order_id  // прямо в корне!

    console.log('event:', event, 'merchant_order_id:', merchant_order_id)

    if (event !== 'payment.completed') {
      console.log('Skipping event:', event)
      return NextResponse.json({ ok: true })
    }

    if (!merchant_order_id || !merchant_order_id.includes('__|__')) {
      console.log('No valid order_id:', merchant_order_id)
      return NextResponse.json({ ok: true })
    }

    const parts = merchant_order_id.split('__|__')
    const userId = parts[0]
    const plan = parts[1]

    console.log('Activating plan:', plan, 'for user:', userId)

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ plan, plan_expires_at: expiresAt.toISOString() })
      .eq('id', userId)

    if (updateError) {
      console.error('Update error:', JSON.stringify(updateError))
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

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
    console.error('WEBHOOK CRASH:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}