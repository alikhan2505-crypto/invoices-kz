import { createClient } from '@supabase/supabase-js'
import { loadConnectionByUserId } from './connection'
import { getOperationsHistory, KaspiHistoryOperation } from './client'
import { matchOperation, OpenInvoiceForMatch } from './historyMatch'
import { debitWalletForCommission } from './wallet'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface ExistingOpRow {
  matched_invoice_id: string | null
  category: string
  settled_at: string | null
}

// Debits commission exactly once per Kaspi operation, even across a crash
// recovery retry: a re-review of this feature's first version found that
// recording "already processed" (via the kaspi_operations insert) either
// before or after the settle side effects each had their own failure mode
// -- before: a mid-run crash left the invoice permanently unpaid and
// uncharged, un-retryable (settled_at exists to fix this); after: the same
// crash window let the operation re-match a DIFFERENT open invoice on the
// next run and get charged a second time. This check is the belt-and-
// suspenders that also covers the narrower residual window between a
// successful debit and the settled_at update that marks it done.
// Exported so the pending-match confirm route (a second, independent path
// that can also charge commission for the same kaspi_operation_id) can use
// the exact same guard instead of trusting its own single delete-based claim
// -- a re-review found that guard alone doesn't stop a SECOND confirm on a
// pending-match candidate resurrected by a concurrent sync run from also
// charging commission for an operation already paid for.
export async function alreadyCharged(userId: string, opId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('wallet_ledger')
    .select('id')
    .eq('user_id', userId)
    .eq('note', `kaspi_operation:${opId}`)
    .limit(1)
    .maybeSingle()
  // A query failure is NOT "not charged" -- treating it as such on a
  // crash-recovery retry is exactly the kind of silent assumption that
  // already caused a double-charge bug twice in this feature. Throwing
  // aborts processing of this operation (and, via the caller's lack of a
  // catch around this call, the rest of this sync run) rather than risking
  // a second debit; the next run retries cleanly since settled_at was never
  // reached for this operation.
  if (error) throw new Error(`alreadyCharged check failed for user ${userId} operation ${opId}: ${error.message}`)
  return !!data
}

async function settleUnambiguous(userId: string, op: KaspiHistoryOperation, invoiceId: string) {
  // Re-checked here (not just at claim time): the crash-recovery path can
  // reach this function for an invoice that was closed through an entirely
  // different channel (BCC, Excel-import, manual mark-paid, or this same
  // operation's own earlier attempt) in between the original claim and this
  // retry -- mirrors the pending-match confirm route's identical check.
  const { data: invoice } = await supabase.from('invoices').select('status').eq('id', invoiceId).maybeSingle()
  if (!invoice || invoice.status === 'paid' || invoice.status === 'cancelled') return
  await supabase.from('invoices').update({ status: 'paid' }).eq('id', invoiceId)
  await supabase.from('invoice_logs').insert({ invoice_id: invoiceId, status: 'paid' })
  if (await alreadyCharged(userId, op.id)) return
  try {
    await debitWalletForCommission(userId, op.amount, null, `kaspi_operation:${op.id}`)
  } catch (e: any) {
    console.error('CRITICAL: Kaspi history sync commission debit failed for user', userId, 'operation', op.id, ':', e.message)
  }
}

async function recordPendingMatches(userId: string, op: KaspiHistoryOperation, invoices: OpenInvoiceForMatch[]) {
  for (const invoice of invoices) {
    const { error } = await supabase.from('kaspi_pending_matches').insert({
      user_id: userId,
      kaspi_operation_id: op.id,
      invoice_id: invoice.id,
      matched_amount: op.amount,
      matched_date: op.regDate,
      client_name: op.clientName,
    })
    // 23505 (unique on user_id+kaspi_operation_id+invoice_id) means this
    // exact candidate was already recorded by an earlier attempt -- a safe
    // no-op on a recovery retry, not an error.
    if (error && error.code !== '23505') {
      console.error('Kaspi history sync: failed to record pending match for operation', op.id, 'invoice', invoice.id, ':', error.message)
    }
  }
}

// Syncs one connected customer's Kaspi transaction history and auto-settles
// unambiguous invoice matches -- same effect as a self-created QR settling,
// no click required, commission charged the same way. Ambiguous matches are
// recorded for manual confirmation instead (never auto-picked), and never
// charged commission until confirmed.
//
// Every operation goes through claim -> settle -> mark-settled, in that
// order, never settle-then-claim: the kaspi_operations row is inserted
// FIRST (the atomic claim, protected by the unique(user_id,
// kaspi_operation_id) constraint) with settled_at left null, THEN the
// settle side effects run, THEN settled_at is set. A crash between claim
// and settle leaves a recoverable row -- the NEXT run finds it via
// settled_at IS NULL and completes settlement using the row's OWN STORED
// matched_invoice_id, never by re-deriving a fresh match (which could
// legitimately land on a different invoice if the pool changed in between,
// double-processing the same payment).
export async function syncKaspiHistory(userId: string): Promise<{ synced: number, autoConfirmed: number, pending: number }> {
  const connection = await loadConnectionByUserId(userId)
  if (!connection) return { synced: 0, autoConfirmed: 0, pending: 0 }

  const endDate = new Date().toISOString().slice(0, 10)
  const operations = await getOperationsHistory(connection, { endDate })

  const { data: openInvoicesRaw } = await supabase
    .from('invoices')
    .select('id, number, client_name, amount')
    .eq('user_id', userId)
    .not('status', 'in', '(paid,cancelled)')
  const openInvoices: OpenInvoiceForMatch[] = (openInvoicesRaw || []) as any[]

  // Kaspi's history feed shows every operation on the account, including
  // ones invoices.kz itself already minted and settled via Phase 1's own
  // createPayment/checkStatus path (kaspi_payment_requests) -- confirmed
  // live: our own test QR payment's operation id appears in this same
  // history feed. These are recorded (for dashboard visibility) as
  // already-settled, never re-matched or re-charged.
  const { data: ownQrRowsRaw } = await supabase
    .from('kaspi_payment_requests')
    .select('kaspi_operation_id, invoice_id')
    .eq('user_id', userId)
  const ownQrOperations = new Map((ownQrRowsRaw || []).map((r: any) => [r.kaspi_operation_id, r.invoice_id as string | null]))

  const { data: existingRowsRaw } = await supabase
    .from('kaspi_operations')
    .select('kaspi_operation_id, matched_invoice_id, category, settled_at')
    .eq('user_id', userId)
  const existingOps = new Map<string, ExistingOpRow>(
    (existingRowsRaw || []).map((r: any) => [r.kaspi_operation_id, { matched_invoice_id: r.matched_invoice_id, category: r.category, settled_at: r.settled_at }])
  )

  let synced = 0
  let autoConfirmed = 0
  let pending = 0

  for (const op of operations) {
    const existing = existingOps.get(op.id)

    // Fully processed in an earlier run -- nothing left to do.
    if (existing && existing.settled_at) continue

    if (existing && !existing.settled_at) {
      // Crash-recovery path: this operation was claimed but never finished
      // settling. Re-fetch live state instead of trusting the batch
      // snapshot taken at the top of this run -- the pending-matches
      // confirm route can resolve this exact operation (category/
      // matched_invoice_id) concurrently while this run is still working
      // through earlier operations, and acting on a stale snapshot here was
      // itself a prior bug (a resolved operation could get its deleted
      // pending-match candidates silently re-inserted). This still leaves a
      // narrow window if two sync runs for the same user overlap (no
      // manual "sync now" trigger exists yet, only the shared daily cron,
      // so this is deliberately not fully lock-guarded) -- logged as an
      // accepted residual risk, not a gap to silently ignore.
      const { data: liveRow } = await supabase
        .from('kaspi_operations')
        .select('matched_invoice_id, category, settled_at')
        .eq('user_id', userId)
        .eq('kaspi_operation_id', op.id)
        .maybeSingle()
      if (!liveRow || liveRow.settled_at) continue // already finished by a concurrent confirm/run

      if (liveRow.category === 'platform' && liveRow.matched_invoice_id) {
        await settleUnambiguous(userId, op, liveRow.matched_invoice_id)
        autoConfirmed++
      } else {
        // Ambiguous or unmatched at claim time -- no money was ever at
        // stake for this branch, so it's safe to recompute fresh against
        // the current open-invoice pool rather than trust a stale
        // candidate list. Every outcome must be handled here: silently
        // handling only 'ambiguous' and falling through to settled_at for
        // an operation that recomputes as 'unambiguous' was itself a bug --
        // it permanently lost the operation (never settled, never queued
        // for confirmation) the instant it was marked settled_at.
        const match = matchOperation(op, openInvoices)
        if (match.kind === 'unambiguous') {
          await supabase.from('kaspi_operations')
            .update({ matched_invoice_id: match.invoice.id, category: 'platform' })
            .eq('user_id', userId).eq('kaspi_operation_id', op.id)
          await settleUnambiguous(userId, op, match.invoice.id)
          autoConfirmed++
          const idx = openInvoices.findIndex(i => i.id === match.invoice.id)
          if (idx !== -1) openInvoices.splice(idx, 1)
        } else if (match.kind === 'ambiguous') {
          await recordPendingMatches(userId, op, match.invoices)
          pending++
        }
      }
      await supabase.from('kaspi_operations').update({ settled_at: new Date().toISOString() }).eq('user_id', userId).eq('kaspi_operation_id', op.id)
      continue
    }

    // Never seen before.
    if (ownQrOperations.has(op.id)) {
      // The founder's own spec for this column: 'platform' (shown as "Счета")
      // only when the payment is actually tied to one of OUR invoices;
      // everything else -- a Kaspi Shop order, or a bare API/webhook payment
      // with no invoice_id -- must fall back to 'other' ("Платформа"). This
      // used to be unconditionally 'platform' for every kaspi_payment_requests
      // row regardless of invoice_id, which showed "Счета" (with an empty
      // Счёт column) for exactly the two cases the founder's spec calls
      // "Платформа" -- caught while walking through how a founder's own
      // Cashier-API test payment (no invoice) would categorize.
      const invoiceId = ownQrOperations.get(op.id)
      const { error: insertError } = await supabase.from('kaspi_operations').insert({
        user_id: userId,
        kaspi_operation_id: op.id,
        order_number: op.orderNumber,
        amount: op.amount,
        direction: op.direction,
        operation_type: op.operationType,
        client_name: op.clientName,
        matched_invoice_id: invoiceId,
        category: invoiceId ? 'platform' : 'other',
        operation_date: op.regDate,
        settled_at: new Date().toISOString(), // already settled by Phase 1, nothing more to do
      })
      if (!insertError) synced++
      else if (insertError.code !== '23505') console.error('Kaspi history sync: failed to record own-QR operation', op.id, 'for user', userId, ':', insertError.message)
      continue
    }

    const match = matchOperation(op, openInvoices)
    const category = match.kind === 'unambiguous' ? 'platform' : 'other'
    const matchedInvoiceId = match.kind === 'unambiguous' ? match.invoice.id : null

    // The atomic claim. Money moves ONLY after this succeeds.
    const { error: insertError } = await supabase.from('kaspi_operations').insert({
      user_id: userId,
      kaspi_operation_id: op.id,
      order_number: op.orderNumber,
      amount: op.amount,
      direction: op.direction,
      operation_type: op.operationType,
      client_name: op.clientName,
      matched_invoice_id: matchedInvoiceId,
      category,
      operation_date: op.regDate,
      settled_at: null,
    })
    if (insertError) {
      if (insertError.code === '23505') continue // claimed by a concurrent run -- its job to settle it
      console.error('Kaspi history sync: failed to record operation', op.id, 'for user', userId, ':', insertError.message)
      continue
    }
    synced++

    if (match.kind === 'unambiguous') {
      await settleUnambiguous(userId, op, match.invoice.id)
      autoConfirmed++
      // Remove this invoice from the in-memory pool so a later operation
      // in the same sync run (e.g. a duplicate transfer) can't match it
      // again in the same pass.
      const idx = openInvoices.findIndex(i => i.id === match.invoice.id)
      if (idx !== -1) openInvoices.splice(idx, 1)
    } else if (match.kind === 'ambiguous') {
      await recordPendingMatches(userId, op, match.invoices)
      pending++
    }
    await supabase.from('kaspi_operations').update({ settled_at: new Date().toISOString() }).eq('user_id', userId).eq('kaspi_operation_id', op.id)
  }

  // Recorded even when nothing new was found -- "we checked and there was
  // nothing" is still a real sync, and the dashboard shows this timestamp
  // regardless of whether it came from the daily cron or a manual refresh.
  await supabase.from('kaspi_connections').update({ last_history_sync_at: new Date().toISOString() }).eq('user_id', userId)

  return { synced, autoConfirmed, pending }
}
