import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isValidSignature } from '@/lib/webhookSignature'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()

    const secret = process.env.XPAYMENT_WEBHOOK_SECRET
    if (!secret) {
      console.error('XPAYMENT_WEBHOOK_SECRET not configured')
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
    }
    if (!isValidSignature(rawBody, req.headers.get('x-xpayment-signature'), secret)) {
      console.error('Invalid webhook signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const body = JSON.parse(rawBody)

    const deliveryId = body?.delivery_id
    if (deliveryId) {
      const { data: existing } = await supabase
        .from('webhook_logs')
        .select('id')
        .filter('body->>delivery_id', 'eq', deliveryId)
        .limit(1)
        .maybeSingle()
      if (existing) {
        console.log('Duplicate delivery, skipping:', deliveryId)
        return NextResponse.json({ ok: true, duplicate: true })
      }
    }

    await supabase.from('webhook_logs').insert({ body })
    console.log('Webhook v3:', JSON.stringify(body))

    const event = body?.event
    const merchant_order_id = body?.merchant_order_id

    console.log('event:', event, 'order_id:', merchant_order_id)

    if (event !== 'payment.completed') {
      return NextResponse.json({ ok: true })
    }

    if (!merchant_order_id || !merchant_order_id.includes('__|__')) {
      console.log('Skipping - no valid order_id:', merchant_order_id)
      return NextResponse.json({ ok: true })
    }

    const parts = merchant_order_id.split('__|__')
    const userId = parts[0]
    const plan = parts[1]

    console.log('Activating:', plan, 'for:', userId)

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    // Учитываем бонусные дни
    const { data: profile } = await supabase
      .from('profiles')
      .select('bonus_expires_at')
      .eq('id', userId)
      .single()

    if (profile?.bonus_expires_at) {
      const bonusEnd = new Date(profile.bonus_expires_at)
      if (bonusEnd > new Date()) {
        const bonusDays = Math.ceil((bonusEnd.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
        expiresAt.setDate(expiresAt.getDate() + bonusDays)
        console.log('Added bonus days:', bonusDays)
      }
    }

    const { error } = await supabase
      .from('profiles')
      .update({ plan, plan_expires_at: expiresAt.toISOString() })
      .eq('id', userId)

    if (error) {
      console.error('Update error:', JSON.stringify(error))
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('SUCCESS for', userId)

    try {
      const { data: prof } = await supabase
        .from('profiles').select('company_name').eq('id', userId).single()
      await fetch('https://invoices.kz/api/telegram', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': process.env.INTERNAL_API_SECRET!,
        },
        body: JSON.stringify({
          message: `💳 <b>Оплата!</b>\n👤 ${prof?.company_name || userId}\n📦 ${plan === 'pro' ? 'Pro 5 990 ₸' : 'Basic 2 990 ₸'}\n📅 до ${expiresAt.toLocaleDateString('ru-KZ')}`
        })
      })
    } catch {}

    return NextResponse.json({ ok: true })

  } catch (e: any) {
    console.error('CRASH:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}