import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { userId, plan, phone } = await req.json()
  if (!userId || !plan || !phone) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const amount = plan === 'pro' ? 5990 : 2990
  const comment = plan === 'pro' ? 'INVOICES.KZ Pro тариф' : 'INVOICES.KZ Basic тариф'

  const res = await fetch('https://api.xpayment.kz/v1/payments', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.XPAYMENT_API_KEY}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': `${userId}-${plan}-${Date.now()}`,
    },
    body: JSON.stringify({
      amount,
      comment,
      currency: 'KZT',
      payer_phone: phone,
      merchant_order_id: `${userId}-${plan}-${Date.now()}`,
      metadata: { user_id: userId, plan },
    }),
  })

  const data = await res.json()
  if (!res.ok) {
    return NextResponse.json({ error: data.message || 'Payment error' }, { status: 400 })
  }

  return NextResponse.json({ payment_id: data.payment_id, status: data.status })
}