import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { userId, plan } = await req.json()
    if (!userId || !plan) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 })
    }

    const apiKey = process.env.XPAYMENT_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    const amount = plan === 'pro' ? 5990 : 2990

    const res = await fetch('https://api.xpayment.kz/v1/payments/link', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount }),
    })

    const data = await res.json()
    console.log('xpayment response:', JSON.stringify(data))

    if (!res.ok) {
      console.error('xpayment error:', JSON.stringify(data))
      return NextResponse.json({ error: data.message || data.error || 'xpayment error' }, { status: 400 })
    }

    // Сохраняем userId и plan в Supabase — свяжем с платежом через ext_tran_id
    const { createClient: create } = await import('@supabase/supabase-js')
    const supabase = create(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    await supabase.from('payment_requests').insert({
      user_id: userId,
      plan,
      amount,
      status: 'pending',
      order_id: data.ext_tran_id,
    })

    const paymentUrl = data.payment_link || data.qr_token
    console.log('payment url:', paymentUrl, 'full response keys:', Object.keys(data))

    return NextResponse.json({
      qr_token: paymentUrl,
      ext_tran_id: data.ext_tran_id || data.qr_operation_id,
      expire_date: data.expire_date,
    })

  } catch (e: any) {
    console.error('Payment create error:', e)
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}