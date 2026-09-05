import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { loadConnectionByUserId, loadWebhookSecretByUserId } from './connection'
import { checkStatus } from './client'
import { isSafeWebhookUrl } from './webhookSafety'
import { debitWalletForCommission } from './wallet'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function signWebhookPayload(rawBody: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
}

export interface SettleableRequest {
  id: string
  user_id: string
  invoice_id: string | null
  order_id: string | null
  shop_order_id: string | null
  amount: number | string
  kaspi_operation_id: string
  callback_url: string | null
  expires_at: string | null
}

// 'scanning' and 'failed' are reported, not acted on: callers that are simply
// watching (the daily cron, the owner's status page) keep treating anything
// that isn't 'paid'/'expired' as still in flight, exactly as before. Only a
// caller that is prepared to hand the payer a replacement QR passes
// { terminateDead } below and acts on them.
export type SettleOutcome = 'paid' | 'not_paid' | 'expired' | 'no_connection' | 'scanning' | 'failed'

/**
 * Checks ONE pending kaspi_payment_requests row against Kaspi's real status
 * and, if paid, atomically settles it: claims the row, marks the linked
 * invoice paid, logs it, and fires the customer's webhook. Shared by the
 * daily safety-net cron and every on-demand caller (the payer's own page
 * while they wait, the public pay-status API) -- "did this get paid" always
 * means the same live Kaspi check no matter who asks or how often.
 *
 * Throws whatever checkStatus/loadConnectionByUserId throw (KaspiAuthError,
 * KaspiConnectionSecretsError, plain network/Supabase errors) rather than
 * catching them here: only a caller with context across many rows (the
 * cron's whole run) can tell a systemic bad-key deploy from one dead
 * connection, so a single on-demand check must not decide that alone.
 */
export async function checkAndSettleKaspiPayment(
  reqRow: SettleableRequest,
  // terminateDead: close this row now when Kaspi reports the QR cancelled or
  // rejected ('failed'), instead of leaving it pending until expires_at. Only
  // for callers that immediately mint a replacement for the payer -- the
  // public /view/[token] page, where the founder's repro was scanning a code,
  // closing the Kaspi confirmation screen, and being left with a QR that
  // looked fine and that Kaspi would refuse. The cron and the owner-facing
  // status pages keep the cautious default below.
  // force: close the row even when Kaspi still calls it live, because the
  // caller is abandoning this attempt on its own timeline -- /view/[token]'s
  // 60s idle timer, mirroring /kaspi-api's. Never applied when Kaspi reports
  // 'paid' or 'scanning', so a payment in flight is never discarded.
  opts: { terminateDead?: boolean; force?: boolean } = {},
): Promise<SettleOutcome> {
  const connection = await loadConnectionByUserId(reqRow.user_id)
  if (!connection) {
    // Disconnected, or already parked at status='error' by an earlier run
    // (loadConnectionByUserId only loads 'active' rows) -- nothing can ever
    // check this request's real status again, so it's only ever expired.
    if (isPastExpiry(reqRow) && (await tryExpire(reqRow))) return 'expired'
    return 'no_connection'
  }

  const result = await checkStatus(connection, reqRow.kaspi_operation_id)

  if (result.status === 'scanning') return 'scanning'

  if (result.status !== 'paid') {
    // 'failed' rows (cancelled by the payer, insufficient funds, ...) are
    // deliberately left pending until their own expires_at passes -- some of
    // those Kaspi statuses are reachable while a QR is still usable for
    // another attempt, and we'd rather re-poll a dead QR than kill a live one.
    // A caller that will replace the QR right away opts out of that caution.
    const expiredOnKaspi = result.status === 'expired'
    const failedOnKaspi = result.status === 'failed'
    const shouldTerminate = expiredOnKaspi
      || (failedOnKaspi && opts.terminateDead)
      || opts.force
      || isPastExpiry(reqRow)
    if (shouldTerminate && (await tryExpire(reqRow))) {
      return failedOnKaspi ? 'failed' : 'expired'
    }
    return failedOnKaspi ? 'failed' : 'not_paid'
  }

  // Concurrent callers (an overlapping cron run, or two poll requests landing
  // at once) are not idempotent past this point -- the status='pending'
  // predicate turns this into an atomic claim: whichever caller flips the
  // row does the side effects below; everyone else matches zero rows.
  const { data: claimed, error: claimError } = await supabase
    .from('kaspi_payment_requests')
    .update({ status: 'paid' })
    .eq('id', reqRow.id)
    .eq('status', 'pending')
    .select('id')
  if (claimError) throw new Error(`failed to claim paid request: ${claimError.message}`)
  if (!claimed || claimed.length === 0) return 'paid' // already settled by another caller

  if (reqRow.invoice_id) {
    await supabase.from('invoices').update({ status: 'paid' }).eq('id', reqRow.invoice_id)
    await supabase.from('invoice_logs').insert({ invoice_id: reqRow.invoice_id, status: 'paid' })
  }

  // Parallel to the invoice branch above -- a payment request can settle
  // either an invoice OR a storefront order, never both. The two id columns
  // are mutually exclusive by construction (each mint path only ever sets
  // one of them).
  if (reqRow.shop_order_id) {
    await supabase.from('kaspi_shop_orders').update({ status: 'paid' }).eq('id', reqRow.shop_order_id)
  }

  // Commission is charged exactly once, here — the moment a payment is
  // confirmed paid, never at link-creation time and never for anything that
  // expires unpaid. This applies uniformly whether the payment came from an
  // invoice auto-mint link or the external API — one rule, no special cases.
  //
  // The note is the SAME 'kaspi_operation:<id>' convention historySync.ts and
  // the pending-match confirm route use (see wallet_ledger's lack of a real
  // FK to kaspi_operations) -- without it, this call site's commission debit
  // was invisible to the Выписка statement's commission-column join
  // (operationsQuery.ts matches on this exact note string), even though the
  // balance itself was correctly debited. This is the path EVERY real
  // Kaspi Cashier payment settles through (invoice, external API, Kaspi
  // Shop order), so the gap meant the statement's "Комиссия 2%" column
  // silently showed "—" for the large majority of real commission charges.
  try {
    await debitWalletForCommission(reqRow.user_id, Number(reqRow.amount), reqRow.id, `kaspi_operation:${reqRow.kaspi_operation_id}`)
  } catch (e: any) {
    // A failed debit must never un-confirm a real payment the customer
    // already received — logged for manual reconciliation, not retried
    // automatically (retrying here could double-charge if the RPC itself
    // partially succeeded before erroring).
    console.error('Kaspi settle: commission debit failed for request', reqRow.id, 'user', reqRow.user_id, ':', e.message)
  }

  if (reqRow.callback_url) {
    // Each connection signs with its OWN secret (generated at connect time,
    // never the shared KASPI_WEBHOOK_SECRET env var) -- a single shared
    // secret handed to every customer would let any one of them forge a
    // payment.success event for any OTHER customer's callback_url. The env
    // var remains only as a fallback for a connection made before this
    // secret existed (regenerate the token on /profile/acquiring to pick up
    // a real per-connection one).
    const secret = (await loadWebhookSecretByUserId(reqRow.user_id)) ?? process.env.KASPI_WEBHOOK_SECRET
    if (!secret) {
      console.error('Kaspi webhook skipped for', reqRow.id, '— no webhook secret available (neither per-connection nor KASPI_WEBHOOK_SECRET)')
    } else if (!(await isSafeWebhookUrl(reqRow.callback_url))) {
      console.error('Kaspi webhook skipped for', reqRow.id, '— unsafe callback_url:', reqRow.callback_url)
    } else {
      const payload = JSON.stringify({
        event: 'payment.success',
        order_id: reqRow.order_id,
        amount: reqRow.amount,
        operation_id: reqRow.kaspi_operation_id,
      })
      await fetch(reqRow.callback_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Kaspi-Pay-Signature': signWebhookPayload(payload, secret) },
        body: payload,
        signal: AbortSignal.timeout(5000),
      }).catch((e) => console.error('Kaspi webhook delivery failed for', reqRow.id, e.message))
    }
  }

  return 'paid'
}

function isPastExpiry(reqRow: SettleableRequest): boolean {
  return !!reqRow.expires_at && new Date(reqRow.expires_at) <= new Date()
}

async function tryExpire(reqRow: SettleableRequest): Promise<boolean> {
  const { data, error } = await supabase
    .from('kaspi_payment_requests')
    .update({ status: 'expired' })
    .eq('id', reqRow.id)
    .eq('status', 'pending')
    .select('id')
  if (error) {
    console.error('Kaspi settle: failed to expire request', reqRow.id, error.message)
    return false
  }
  const expired = !!(data && data.length > 0)
  // Unlike an invoice (which has its own independent lifecycle -- a payer
  // can just get a fresh QR minted next poll, or pay by bank transfer
  // instead), a storefront order has no other path to completion in v1:
  // Kaspi Pay is the only checkout method. Without this, an abandoned
  // checkout stays stuck at 'pending_payment' forever in Заказы витрины,
  // indistinguishable from one still genuinely in progress.
  if (expired && reqRow.shop_order_id) {
    await supabase.from('kaspi_shop_orders').update({ status: 'expired' }).eq('id', reqRow.shop_order_id).eq('status', 'pending_payment')
  }
  return expired
}
