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
  // Set by the page's 60s idle timer. Minting stays bounded by
  // getOrCreateKaspiPaymentForInvoice's own 3-per-minute cap, so this cannot
  // be used to drive traffic into Kaspi on the owner's connection.
  const idle = req.nextUrl.searchParams.get('idle') === 'true'

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

    let current = payment
    let live: string = current.status
    if (current.status === 'pending') {
      try {
        // terminateDead: this page hands the payer a replacement immediately,
        // so a QR Kaspi has already rejected (scanned then cancelled) must not
        // linger. force: the page's 60s idle timer gave up on a code nobody
        // touched. Neither ever discards a 'paid' or 'scanning' attempt.
        const outcome = await checkAndSettleKaspiPayment(current, { terminateDead: true, force: idle })
        live = outcome
        if (outcome === 'paid') current.status = 'paid'
        else if (outcome === 'expired' || outcome === 'failed') {
          // Answering null here made the whole Kaspi block vanish from the
          // payer's page mid-poll, leaving them staring at an invoice with no
          // way to pay it and no explanation. The row is closed now, so
          // getOrCreate mints a replacement instead of returning the dead one
          // -- the same thing the next page load would have done anyway.
          const replacement = await getOrCreateKaspiPaymentForInvoice(invoice)
          if (!replacement) return NextResponse.json({ payment: null })
          current = replacement
          live = 'pending'
        }
      } catch (e: any) {
        // Fails open: the payer still sees their existing pending QR and the
        // page keeps polling, so a transient Kaspi/network hiccup on this one
        // tick just means the next poll (or the daily cron) catches it.
        console.error('Kaspi live status check failed for payment', current.id, e.message)
      }
    }

    // expires_at lets the page count the QR down; `live` carries Kaspi's own
    // verdict ('scanning' while the payer is on the confirmation screen) so
    // the page can say what is happening instead of showing a bare timer.
    return NextResponse.json({
      payment: {
        qr_token: current.qr_token,
        payment_link: current.payment_link,
        status: current.status,
        expires_at: current.expires_at ?? null,
        live,
      },
    })
  } catch (e: any) {
    // The page treats a null payment as "no Kaspi option here" and still
    // renders the bank requisites, so a Kaspi-side failure degrades rather
    // than breaking the payer's view of the invoice.
    console.error('Kaspi invoice-payment lookup failed for invoice', invoice.id, e.message)
    return NextResponse.json({ payment: null })
  }
}
