import { createClient } from '@supabase/supabase-js'
import { loadConnectionByUserId } from './connection'
import { getOperationsHistory } from './client'
import { matchOperation, OpenInvoiceForMatch } from './historyMatch'
import { debitWalletForCommission } from './wallet'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Syncs one connected customer's Kaspi transaction history, records every
// operation exactly once (unique on user_id+kaspi_operation_id makes a
// re-sync of an overlapping window a safe no-op via the insert's own
// conflict), and auto-settles unambiguous invoice matches -- same effect
// as a self-created QR settling, no click required, commission charged the
// same way. Ambiguous matches are recorded for manual confirmation instead
// (never auto-picked), and never charged commission until confirmed.
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
  // history feed. Without this exclusion, an operation already paid and
  // commission-charged once would be re-evaluated here; its invoice is now
  // closed (excluded from openInvoices above), so the SAME operation could
  // spuriously match a DIFFERENT open invoice of the same amount and get
  // charged a second time. Fetched as a map (not just an id set) so these
  // can still be recorded in kaspi_operations for dashboard completeness --
  // just without re-matching or re-charging, since Phase 1 already did both.
  const { data: ownQrRowsRaw } = await supabase
    .from('kaspi_payment_requests')
    .select('kaspi_operation_id, invoice_id')
    .eq('user_id', userId)
  const ownQrOperations = new Map((ownQrRowsRaw || []).map((r: any) => [r.kaspi_operation_id, r.invoice_id as string | null]))

  let synced = 0
  let autoConfirmed = 0
  let pending = 0

  for (const op of operations) {
    const ownQrInvoiceId = ownQrOperations.get(op.id)
    const alreadySettledByOwnQr = ownQrOperations.has(op.id)

    const match = alreadySettledByOwnQr ? { kind: 'unmatched' as const } : matchOperation(op, openInvoices)
    const category = alreadySettledByOwnQr ? 'platform' : (match.kind === 'unambiguous' ? 'platform' : 'other')

    // Settle side effects happen BEFORE the kaspi_operations insert (not
    // after, as an earlier version of this function had it) -- if the
    // function is killed between them, the operation is simply re-synced
    // from scratch next run. With the insert-first ordering, a mid-way
    // kill would have left the operation permanently marked "already
    // processed" (via the unique constraint) while the invoice stayed
    // unpaid and no commission was ever charged, with no way to retry.
    if (!alreadySettledByOwnQr && match.kind === 'unambiguous') {
      await supabase.from('invoices').update({ status: 'paid' }).eq('id', match.invoice.id)
      await supabase.from('invoice_logs').insert({ invoice_id: match.invoice.id, status: 'paid' })
      try {
        await debitWalletForCommission(userId, op.amount, null, `kaspi_operation:${op.id}`)
      } catch (e: any) {
        console.error('CRITICAL: Kaspi history sync commission debit failed for user', userId, 'operation', op.id, ':', e.message)
      }
      autoConfirmed++
      // Remove this invoice from the in-memory pool so a later operation
      // in the same sync run (e.g. a duplicate transfer) can't match it
      // again in the same pass.
      const idx = openInvoices.findIndex(i => i.id === match.invoice.id)
      if (idx !== -1) openInvoices.splice(idx, 1)
    } else if (!alreadySettledByOwnQr && match.kind === 'ambiguous') {
      for (const invoice of match.invoices) {
        await supabase.from('kaspi_pending_matches').insert({
          user_id: userId,
          kaspi_operation_id: op.id,
          invoice_id: invoice.id,
          matched_amount: op.amount,
          matched_date: op.regDate,
          client_name: op.clientName,
        })
      }
      pending++
    }

    // The unique(user_id, kaspi_operation_id) constraint makes this the
    // idempotency guard: a re-sync of an already-recorded operation hits
    // 23505 and is skipped entirely -- never re-matched, never re-charged.
    const { error: insertError } = await supabase.from('kaspi_operations').insert({
      user_id: userId,
      kaspi_operation_id: op.id,
      order_number: op.orderNumber,
      amount: op.amount,
      direction: op.direction,
      client_name: op.clientName,
      matched_invoice_id: alreadySettledByOwnQr ? ownQrInvoiceId : (match.kind === 'unambiguous' ? match.invoice.id : null),
      category,
      operation_date: op.regDate,
    })
    if (insertError) {
      if (insertError.code === '23505') continue // already synced, not an error
      console.error('Kaspi history sync: failed to record operation', op.id, 'for user', userId, ':', insertError.message)
      continue
    }
    synced++
  }

  return { synced, autoConfirmed, pending }
}
