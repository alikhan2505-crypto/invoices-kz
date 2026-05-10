import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { userId, plan, phone } = await req.json()
    if (!userId || !plan || !phone) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 })
    }

    const apiKey = process.env.XPAYMENT_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    const amount = plan === 'pro' ? 5990 : 2990
    const orderId = `${userId}__|__${plan}__|__${Date.now()}`

    const res = await fetch('https://api.xpayment.kz/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': orderId,
      },
      body: JSON.stringify({
        amount,
        comment: plan === 'pro' ? 'INVOICES.KZ Pro тариф' : 'INVOICES.KZ Basic тариф',
        currency: 'KZT',
        payer_phone: phone,
        merchant_order_id: orderId,
      }),
    })

    const data = await res.json()
    console.log('Phone payment response:', JSON.stringify(data))

    if (!res.ok) {
      return NextResponse.json({ error: data.message || data.error || 'xpayment error' }, { status: 400 })
    }

    return NextResponse.json({ payment_id: data.payment_id, status: data.status })

  } catch (e: any) {
    console.error('Phone payment error:', e)
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}