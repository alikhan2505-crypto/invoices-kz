import { createClient } from '@supabase/supabase-js'
import { loadConnectionByUserId } from './connection'
import { createPayment } from './client'
import { getActivePlan } from '@/lib/plan'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface KaspiInvoicePayment {
  qr_token: string | null
  payment_link: string | null
  status: string
}

// A Kaspi QR is short-lived, but an emailed invoice is routinely opened hours
// or days later. Minting it once at send time meant that by the time the payer
// actually clicked through, the row had been marked 'expired' and the QR
// simply vanished from /view/[token] with no way to get a new one — a
// money-losing dead end. Every reader goes through this helper instead, which
// hands back the live payment if there is one and mints a fresh one if there
// isn't.
const CLOSED_INVOICE_STATUSES = new Set(['paid', 'cancelled'])

// This helper is reachable from the PUBLIC /view/[token] path, so minting is
// bounded per invoice: without it, anyone who knows a public token could sit
// in a loop and drive calls into Kaspi's backend on the owner's Cashier role.
// Three in a minute is far more than any real payer needs (the first call
// already produces a link that every later call reuses until it expires).
const MINT_WINDOW_MS = 60_000
const MINT_LIMIT = 3

/**
 * Returns the invoice's currently-valid Kaspi payment, creating one on demand
 * if the previous link has expired (or none was ever created). Returns null
 * when no payment can or should exist: the owner has no Kaspi connection, the
 * invoice is already settled, minting is rate-limited, or the new payment
 * could not be persisted for tracking.
 *
 * Throws only on genuine failures of the underlying lookup/Kaspi call —
 * callers decide whether that degrades the page or fails the request.
 */
export async function getOrCreateKaspiPaymentForInvoice(invoice: {
  id: string
  user_id: string
  amount: number | string
  status?: string | null
}): Promise<KaspiInvoicePayment | null> {
  // .limit(1) is load-bearing: send-invoice used to insert a new row on every
  // resend, so an invoice can legitimately have several 'pending' rows, and a
  // bare .maybeSingle() answers >1 row with a PGRST116 error and null data —
  // which silently hid the QR on both the payer's and the owner's page.
  const { data: existing, error } = await supabase
    .from('kaspi_payment_requests')
    .select('qr_token, payment_link, status, expires_at')
    .eq('invoice_id', invoice.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`kaspi_payment_requests lookup for invoice ${invoice.id} failed: ${error.message}`)

  if (existing && (!existing.expires_at || new Date(existing.expires_at) > new Date())) {
    return { qr_token: existing.qr_token, payment_link: existing.payment_link, status: existing.status }
  }

  // A settled invoice must never get a fresh payment link minted for it.
  if (invoice.status && CLOSED_INVOICE_STATUSES.has(invoice.status)) return null

  // Kaspi Pay is Pro-only, enforced server-side on every route that lets a
  // user set one up or spend it directly — but this helper mints on the
  // owner's behalf from two call sites (send-invoice, and the public
  // invoice-payment endpoint) with no auth header to gate. Checked here,
  // right before minting, so a lapsed Pro user's still-valid existing link
  // (returned above) keeps working, but no further Kaspi payment is ever
  // created for their invoices once Pro expires.
  const { data: ownerProfile } = await supabase
    .from('profiles')
    .select('plan, plan_expires_at, bonus_expires_at, trial_expires_at')
    .eq('id', invoice.user_id)
    .single()
  if (!getActivePlan(ownerProfile).canAcquiring) return null

  const { count: recentMints, error: rateError } = await supabase
    .from('kaspi_payment_requests')
    .select('id', { count: 'exact', head: true })
    .eq('invoice_id', invoice.id)
    .gte('created_at', new Date(Date.now() - MINT_WINDOW_MS).toISOString())
  if (rateError) console.error('Kaspi invoice payment: mint rate count failed for invoice', invoice.id, rateError.message)
  else if ((recentMints ?? 0) >= MINT_LIMIT) {
    console.error('Kaspi invoice payment: mint rate limit hit for invoice', invoice.id)
    return null
  }

  const connection = await loadConnectionByUserId(invoice.user_id)
  if (!connection) return null

  const payment = await createPayment(connection, { amount: Number(invoice.amount), orderId: invoice.id })

  // The stale row (if any) is deliberately left 'pending' rather than being
  // marked expired here: the polling cron checks its real status with Kaspi
  // before expiring anything, and a payment that landed in the last seconds
  // before expiry still needs to be caught there.
  const { error: insertError } = await supabase.from('kaspi_payment_requests').insert({
    user_id: invoice.user_id,
    invoice_id: invoice.id,
    order_id: invoice.id,
    amount: invoice.amount,
    kaspi_operation_id: payment.operationId,
    qr_token: payment.qrToken,
    payment_link: payment.paymentLink,
    status: 'pending',
    expires_at: payment.expiresAt,
  })
  if (insertError) {
    // Unique violation on kaspi_payment_requests_invoice_pending_idx (one
    // partial-unique row per invoice_id where status='pending') means a
    // concurrent call — this helper is reachable from the PUBLIC
    // /view/[token] path, so two simultaneous requests can both pass the
    // pre-insert checks above and both call Kaspi. The other call's insert
    // won the race; hand back whatever it created instead of erroring, so
    // the loser sees the same live link rather than a false failure. The
    // just-created Kaspi-side payment from this call is simply never
    // tracked — harmless, it just expires unclaimed on Kaspi's side.
    if (insertError.code === '23505') {
      const { data: winner } = await supabase
        .from('kaspi_payment_requests')
        .select('qr_token, payment_link, status')
        .eq('invoice_id', invoice.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (winner) return { qr_token: winner.qr_token, payment_link: winner.payment_link, status: winner.status }
    }
    // A real payment now exists on Kaspi's side that the poller has no row to
    // find. Surfacing a link that can never auto-confirm would be worse than
    // showing none, so this degrades to "no Kaspi payment" exactly like a
    // failed createPayment would.
    console.error('Kaspi payment created but failed to persist for tracking — invoice', invoice.id, 'operation', payment.operationId, ':', insertError.message)
    return null
  }

  return { qr_token: payment.qrToken, payment_link: payment.paymentLink, status: 'pending' }
}
