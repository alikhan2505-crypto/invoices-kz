import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnectionByApiToken } from '@/lib/kaspiPay/connection'
import { checkAndSettleKaspiPayment } from '@/lib/kaspiPay/settlePayment'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Lets an external customer's own site check a payment it created via
// /api/kaspi/pay without waiting for the daily safety-net cron. Same
// authentication as /api/kaspi/pay; not Pro-gated for the same reason the
// cron isn't (see pay/route.ts) -- this only resolves a request that already
// exists, it doesn't consume the paid capability further.
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let found: Awaited<ReturnType<typeof loadConnectionByApiToken>>
  try {
    found = await loadConnectionByApiToken(token)
  } catch (e: any) {
    console.error('Kaspi pay status: connection lookup error:', e.message)
    return NextResponse.json({ error: 'kaspi_unavailable' }, { status: 502 })
  }
  if (!found) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const operationId = req.nextUrl.searchParams.get('operation_id')
  if (!operationId) return NextResponse.json({ error: 'operation_id required' }, { status: 400 })

  const { data: reqRow, error: fetchError } = await supabase
    .from('kaspi_payment_requests')
    .select('id, user_id, invoice_id, order_id, amount, kaspi_operation_id, callback_url, expires_at, status')
    .eq('kaspi_operation_id', operationId)
    .eq('user_id', found.userId)
    .maybeSingle()
  if (fetchError) {
    console.error('Kaspi pay status: lookup failed:', fetchError.message)
    return NextResponse.json({ error: 'kaspi_unavailable' }, { status: 502 })
  }
  if (!reqRow) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  let status = reqRow.status
  if (status === 'pending') {
    try {
      const outcome = await checkAndSettleKaspiPayment(reqRow)
      if (outcome === 'paid') status = 'paid'
      else if (outcome === 'expired') status = 'expired'
    } catch (e: any) {
      // Fail open with the last-known DB status — the caller can just poll
      // again; the daily cron is the backstop if they never do.
      console.error('Kaspi pay status: live check failed for', reqRow.id, e.message)
    }
  }

  return NextResponse.json({
    operation_id: reqRow.kaspi_operation_id,
    order_id: reqRow.order_id,
    amount: reqRow.amount,
    status,
    paid: status === 'paid',
  })
}
