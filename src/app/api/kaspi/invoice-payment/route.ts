import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getOrCreateKaspiPaymentForInvoice } from '@/lib/kaspiPay/invoicePayment'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Public, unauthenticated — the payer viewing /view/[token] is never logged
// in. kaspi_payment_requests has no client-facing RLS policy scoped to an
// anonymous public_token match, so this service-role route is the only way
// for that page to learn whether a Kaspi payment link exists for it,
// mirroring how /api/bcc/status exists because bcc_connections has no
// client-facing SELECT policy either.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, user_id, amount, status')
    .eq('public_token', token)
    .maybeSingle()
  if (!invoice) return NextResponse.json({ payment: null })

  // Regenerates on demand rather than only reading: the link is minted when
  // the invoice is emailed, but the recipient often opens that email hours or
  // days later, by which point the original QR has expired and the payer was
  // left with no way to pay through Kaspi at all.
  try {
    const payment = await getOrCreateKaspiPaymentForInvoice(invoice)
    return NextResponse.json({ payment: payment || null })
  } catch (e: any) {
    // The page treats a null payment as "no Kaspi option here" and still
    // renders the bank requisites, so a Kaspi-side failure degrades rather
    // than breaking the payer's view of the invoice.
    console.error('Kaspi invoice-payment lookup failed for invoice', invoice.id, e.message)
    return NextResponse.json({ payment: null })
  }
}
