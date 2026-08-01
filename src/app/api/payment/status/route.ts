import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAndSettlePlanPayment } from '@/lib/kaspiPay/settlePlanPayment'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orderId = req.nextUrl.searchParams.get('order_id')
  if (!orderId) return NextResponse.json({ error: 'order_id required' }, { status: 400 })

  const { data: row } = await supabase
    .from('payment_requests')
    .select('id, user_id, plan, amount, qr_operation_id, status')
    .eq('order_id', orderId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!row) return NextResponse.json({ status: null })

  if (row.status === 'pending') {
    try {
      const outcome = await checkAndSettlePlanPayment(row as any)
      return NextResponse.json({ status: outcome === 'paid' ? 'paid' : 'pending' })
    } catch (e: any) {
      console.error('Plan payment status check failed for', orderId, ':', e.message)
      return NextResponse.json({ status: 'pending' })
    }
  }
  return NextResponse.json({ status: row.status })
}
