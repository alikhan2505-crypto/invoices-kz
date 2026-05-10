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
    console.log('Webhook v4:', JSON.stringify(body))

    const event = body?.event
    if (event !== 'payment.completed') {
      console.log('Skipping event:', event)
      return NextResponse.json({ ok: true })
    }

    // Для /payments/link webhook содержит ext_tran_id
    const extTranId = body?.ext_tran_id || body?.payment?.ext_tran_id
    const merchantOrderId = body?.merchant_order_id || body?.payment?.merchant_order_id

    console.log('ext_tran_id:', extTranId, 'merchant_order_id:', merchantOrderId)

    let userId: string | null = null
    let plan: string | null = null

    // Вариант 1 — ищем по merchant_order_id с __|__ (старый способ через /payments)
    if (merchantOrderId && merchantOrderId.includes('__|__')) {
      const parts = merchantOrderId.split('__|__')
      userId = parts[0]
      plan = parts[1]
      console.log('Found via merchant_order_id:', userId, plan)
    }

    // Вариант 2 — ищем по ext_tran_id в payment_requests
    if (!userId && extTranId) {
      const { data: request } = await supabase
        .from('payment_requests')
        .select('*')
        .eq('order_id', extTranId)
        .maybeSingle()

      if (request) {
        userId = request.user_id
        plan = request.plan
        console.log('Found via ext_tran_id:', userId, plan)
      }
    }

    if (!userId || !plan) {
      console.log('Cannot identify user, skipping')
      return NextResponse.json({ ok: true })
    }

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

    // Обновляем статус заявки
    if (extTranId) {
      await supabase.from('payment_requests')
        .update({ status: 'completed' })
        .eq('order_id', extTranId)
    }

    console.log('SUCCESS for', userId, 'until', expiresAt)

    try {
      const { data: prof } = await supabase
        .from('profiles').select('company_name').eq('id', userId).single()
      await fetch('https://invoices.kz/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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