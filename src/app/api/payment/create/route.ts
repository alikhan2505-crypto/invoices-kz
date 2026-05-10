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
    const comment = plan === 'pro' ? 'INVOICES.KZ Pro тариф' : 'INVOICES.KZ Basic тариф'

    const res = await fetch('https://api.xpayment.kz/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
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
      console.error('xpayment error:', data)
      return NextResponse.json({ error: data.message || 'xpayment error', details: data }, { status: 400 })
    }

    return NextResponse.json({ payment_id: data.payment_id, status: data.status })

  } catch (e: any) {
    console.error('Payment create error:', e)
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}