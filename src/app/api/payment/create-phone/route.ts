import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadPlatformConnection } from '@/lib/kaspiPay/connection'
import { createInvoiceByPhone } from '@/lib/kaspiPay/client'

const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { userId, plan, phone } = await req.json()
    if (!userId || !plan || !phone || (plan !== 'pro' && plan !== 'basic')) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 })
    }

    const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
    const { data: { user } } = accessToken
      ? await supabaseAuth.auth.getUser(accessToken)
      : { data: { user: null } }
    if (!user || user.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const connection = await loadPlatformConnection()
    if (!connection) return NextResponse.json({ error: 'Platform Kaspi connection not set up' }, { status: 500 })

    const amount = plan === 'pro' ? 5990 : 2990
    const comment = plan === 'pro' ? 'INVOICES.KZ Pro тариф' : 'INVOICES.KZ Basic тариф'
    const invoice = await createInvoiceByPhone(connection, { phoneNumber: phone, amount, comment })

    const { error: insertError } = await supabase.from('payment_requests').insert({
      user_id: userId,
      email: user.email,
      plan,
      amount,
      status: 'pending',
      order_id: invoice.operationId,
      qr_operation_id: invoice.operationId,
    })
    if (insertError) {
      console.error('Plan phone-payment created but failed to persist — operation', invoice.operationId, ':', insertError.message)
      return NextResponse.json({ error: 'tracking_failed' }, { status: 502 })
    }

    return NextResponse.json({ payment_id: invoice.operationId, status: 'pending' })
  } catch (e: any) {
    console.error('Phone payment error:', e)
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
