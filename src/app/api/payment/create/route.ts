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
    // Кодируем userId и plan прямо в orderId через разделитель __|__
    const orderId = `${userId}__|__${plan}__|__${Date.now()}`

    const res = await fetch('https://api.xpayment.kz/v1/payments/link', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount,
        device_interface: 'Pos',
        merchant_order_id: orderId,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      console.error('xpayment error:', JSON.stringify(data))
      return NextResponse.json({ error: data.message || data.error || 'xpayment error', details: data }, { status: 400 })
    }

    console.log('Payment link created:', data.qr_token, 'orderId:', orderId)

    return NextResponse.json({
      qr_token: data.qr_token,
      qr_operation_id: data.qr_operation_id,
      expire_date: data.expire_date,
    })

  } catch (e: any) {
    console.error('Payment create error:', e)
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}