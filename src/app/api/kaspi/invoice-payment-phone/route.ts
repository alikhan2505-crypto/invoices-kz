import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createPhonePaymentForInvoice } from '@/lib/kaspiPay/invoicePayment'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Public, unauthenticated -- same trust model as /api/kaspi/invoice-payment
// (the payer viewing /view/[token] is never logged in). Unlike that route,
// this one delivers a real push notification to a phone number the caller
// supplies, so createPhonePaymentForInvoice applies its own tighter,
// phone-specific rate limit on top -- see that function's comment for why
// an anonymous public link needs stricter throttling here than the QR path.
export async function POST(req: NextRequest) {
  const { token, phone } = await req.json()
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, user_id, amount, status')
    .eq('public_token', token)
    .maybeSingle()
  if (!invoice) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const result = await createPhonePaymentForInvoice(invoice, phone)
  if (!result.ok) {
    const status = result.reason === 'invalid_phone' ? 400
      : result.reason === 'rate_limited' ? 429
      : result.reason === 'already_paid' ? 409
      : 502
    return NextResponse.json({ error: result.reason }, { status })
  }
  return NextResponse.json({ ok: true })
}
