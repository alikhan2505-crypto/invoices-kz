import { createClient } from '@supabase/supabase-js'
import { loadConnectionByUserId } from './connection'
import { createPayment, createInvoiceByPhone } from './client'
import { getWalletBalance, computeCommission } from './wallet'
import { checkAndSettleKaspiPayment, type SettleableRequest } from './settlePayment'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Extends SettleableRequest so a 'pending' result can be handed straight to
// checkAndSettleKaspiPayment by a caller that wants a live check, not just a
// stale DB read (the payer's own page while they wait, /view/[token]'s poll).
export interface KaspiInvoicePayment extends SettleableRequest {
  qr_token: string | null
  payment_link: string | null
  status: string
}

const SETTLEABLE_COLUMNS = 'id, user_id, invoice_id, order_id, amount, kaspi_operation_id, callback_url, expires_at, qr_token, payment_link, status'

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
 * True when a fresh payment could be minted for this invoice right now.
 *
 * Callers that are about to deliberately kill a still-valid QR (the payer
 * page's 60s idle refresh) must ask this FIRST. Expiring the old row and only
 * then discovering the mint is refused leaves the payer with nothing at all --
 * exactly the dead end the idle refresh exists to prevent.
 */
export async function canMintKaspiPaymentForInvoice(invoiceId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('kaspi_payment_requests')
    .select('id', { count: 'exact', head: true })
    .eq('invoice_id', invoiceId)
    .gte('created_at', new Date(Date.now() - MINT_WINDOW_MS).toISOString())
  // Same fail-open stance as the check inside getOrCreate below: a broken
  // count must not block a payer, and getOrCreate re-checks anyway.
  if (error) {
    console.error('Kaspi invoice payment: mint-capacity check failed for invoice', invoiceId, error.message)
    return true
  }
  return (count ?? 0) < MINT_LIMIT
}

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
    .select(SETTLEABLE_COLUMNS)
    .eq('invoice_id', invoice.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`kaspi_payment_requests lookup for invoice ${invoice.id} failed: ${error.message}`)

  if (existing && (!existing.expires_at || new Date(existing.expires_at) > new Date())) {
    return existing as KaspiInvoicePayment
  }

  // A settled invoice must never get a fresh payment link minted for it.
  if (invoice.status && CLOSED_INVOICE_STATUSES.has(invoice.status)) return null

  // Kaspi Pay Cashier is open to every plan; it's monetized per-payment
  // instead (2% commission funded by the connection owner's prepaid wallet
  // balance — see wallet.ts). Checked here, right before minting a NEW
  // payment, so an owner with insufficient balance keeps their still-valid
  // existing link (returned above) but gets no further payment created for
  // their invoices until they top up.
  const balance = await getWalletBalance(invoice.user_id)
  if (balance < computeCommission(Number(invoice.amount))) return null

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
  const { data: inserted, error: insertError } = await supabase
    .from('kaspi_payment_requests')
    .insert({
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
    .select(SETTLEABLE_COLUMNS)
    .single()
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
        .select(SETTLEABLE_COLUMNS)
        .eq('invoice_id', invoice.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (winner) return winner as KaspiInvoicePayment
    }
    // A real payment now exists on Kaspi's side that the poller has no row to
    // find. Surfacing a link that can never auto-confirm would be worse than
    // showing none, so this degrades to "no Kaspi payment" exactly like a
    // failed createPayment would.
    console.error('Kaspi payment created but failed to persist for tracking — invoice', invoice.id, 'operation', payment.operationId, ':', insertError.message)
    return null
  }

  return inserted as KaspiInvoicePayment
}

// This path is reachable from the PUBLIC /view/[token] page with NO
// authentication -- unlike the wallet widget, /kaspi-api, and /upgrade's
// phone-push, where a logged-in owner sends a request to their OWN Kaspi
// account, here any anonymous visitor holding the link could type in
// SOMEONE ELSE's number. A push notification is real-world delivery to a
// stranger, not just a wasted API call, so this is throttled far tighter
// than the QR mint window (3/minute) -- an hour, not a minute -- to bound
// how many pushes one invoice link can fire at a phone number over time.
// The amount is always the invoice's own (never client-supplied), so this
// can't be used to solicit an arbitrary sum either.
const PHONE_MINT_WINDOW_MS = 60 * 60 * 1000
const PHONE_MINT_LIMIT = 3

function normalizeKzPhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length !== 11 || !digits.startsWith('7')) return null
  return digits
}

export type PhonePaymentResult =
  | { ok: true; payment: KaspiInvoicePayment }
  | { ok: false; reason: 'invalid_phone' | 'closed' | 'no_connection' | 'insufficient_balance' | 'rate_limited' | 'already_paid' | 'error' }

/**
 * Pushes a Kaspi payment request for this invoice's own amount to a phone
 * number the payer supplies, replacing any QR-based payment already pending
 * for it (kaspi_payment_requests allows only one 'pending' row per invoice --
 * see kaspi_payment_requests_invoice_pending_idx).
 */
export async function createPhonePaymentForInvoice(
  invoice: { id: string; user_id: string; amount: number | string; status?: string | null },
  phone: unknown,
): Promise<PhonePaymentResult> {
  const phoneNumber = normalizeKzPhone(phone)
  if (!phoneNumber) return { ok: false, reason: 'invalid_phone' }
  if (invoice.status && CLOSED_INVOICE_STATUSES.has(invoice.status)) return { ok: false, reason: 'closed' }

  // Clear any existing pending row (the QR minted on page load, almost
  // always) before inserting -- the partial unique index allows only one.
  // force=true is safe here specifically because a genuinely live payment is
  // caught first: checkAndSettleKaspiPayment always asks Kaspi for the real
  // status before closing anything, so a QR paid in this exact instant is
  // still credited rather than discarded for a phone push nobody asked to
  // replace it with.
  const { data: existingRows } = await supabase
    .from('kaspi_payment_requests')
    .select(SETTLEABLE_COLUMNS)
    .eq('invoice_id', invoice.id)
    .eq('status', 'pending')
  for (const row of (existingRows ?? []) as KaspiInvoicePayment[]) {
    try {
      const outcome = await checkAndSettleKaspiPayment(row, { terminateDead: true, force: true })
      if (outcome === 'paid') return { ok: false, reason: 'already_paid' }
    } catch (e: any) {
      console.error('Phone payment: could not settle existing pending row', row.id, 'for invoice', invoice.id, ':', e.message)
      return { ok: false, reason: 'error' }
    }
  }

  const balance = await getWalletBalance(invoice.user_id)
  if (balance < computeCommission(Number(invoice.amount))) return { ok: false, reason: 'insufficient_balance' }

  const { count: recentPushes, error: rateError } = await supabase
    .from('kaspi_payment_requests')
    .select('id', { count: 'exact', head: true })
    .eq('invoice_id', invoice.id)
    .is('qr_token', null)
    .gte('created_at', new Date(Date.now() - PHONE_MINT_WINDOW_MS).toISOString())
  if (rateError) console.error('Phone payment: rate count failed for invoice', invoice.id, rateError.message)
  else if ((recentPushes ?? 0) >= PHONE_MINT_LIMIT) return { ok: false, reason: 'rate_limited' }

  const connection = await loadConnectionByUserId(invoice.user_id)
  if (!connection) return { ok: false, reason: 'no_connection' }

  try {
    const push = await createInvoiceByPhone(connection, {
      phoneNumber,
      amount: Number(invoice.amount),
      comment: 'Оплата счёта invoices.kz',
    })
    // No qr_token/payment_link/expires_at: there is nothing to scan, and a
    // pushed request has no Kaspi-side deadline of its own (see the wallet's
    // identical phone-push row for the same reasoning).
    const { data: inserted, error: insertError } = await supabase
      .from('kaspi_payment_requests')
      .insert({
        user_id: invoice.user_id,
        invoice_id: invoice.id,
        order_id: invoice.id,
        amount: invoice.amount,
        kaspi_operation_id: push.operationId,
        status: 'pending',
      })
      .select(SETTLEABLE_COLUMNS)
      .single()
    if (insertError) {
      console.error('Phone payment created but failed to persist for tracking — invoice', invoice.id, 'operation', push.operationId, ':', insertError.message)
      return { ok: false, reason: 'error' }
    }
    return { ok: true, payment: inserted as KaspiInvoicePayment }
  } catch (e: any) {
    console.error('Phone payment: Kaspi push failed for invoice', invoice.id, ':', e.message)
    return { ok: false, reason: 'error' }
  }
}
