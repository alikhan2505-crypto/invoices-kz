import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getOrCreateKaspiPaymentForInvoice } from '@/lib/kaspiPay/invoicePayment'
import { checkAndSettleKaspiPayment } from '@/lib/kaspiPay/settlePayment'

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
//
// The page polls this route every few seconds while a payment is pending
// (see /view/[token]), so it doubles as the primary confirmation path: a
// live Kaspi check runs right here instead of waiting for the daily safety
// -net cron. That's what makes "no click needed to confirm payment" true
// on a Vercel plan whose cron can only run once a day.
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
    if (!payment) return NextResponse.json({ payment: null })

    if (payment.status === 'pending') {
      try {
        const outcome = await checkAndSettleKaspiPayment(payment)
        if (outcome === 'paid') payment.status = 'paid'
        else if (outcome === 'expired') return NextResponse.json({ payment: null })
      } catch (e: any) {
        // Fails open: the payer still sees their existing pending QR and the
        // page keeps polling, so a transient Kaspi/network hiccup on this one
        // tick just means the next poll (or the daily cron) catches it.
        console.error('Kaspi live status check failed for payment', payment.id, e.message)
      }
    }

    return NextResponse.json({ payment: { qr_token: payment.qr_token, payment_link: payment.payment_link, status: payment.status } })
  } catch (e: any) {
    // The page treats a null payment as "no Kaspi option here" and still
    // renders the bank requisites, so a Kaspi-side failure degrades rather
    // than breaking the payer's view of the invoice.
    console.error('Kaspi invoice-payment lookup failed for invoice', invoice.id, e.message)
    return NextResponse.json({ payment: null })
  }
}
