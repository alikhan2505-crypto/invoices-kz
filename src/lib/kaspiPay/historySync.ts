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

  let synced = 0
  let autoConfirmed = 0
  let pending = 0

  for (const op of operations) {
    const match = matchOperation(op, openInvoices)
    const category = match.kind === 'unambiguous' ? 'platform' : 'other'

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
      matched_invoice_id: match.kind === 'unambiguous' ? match.invoice.id : null,
      category,
      operation_date: op.regDate,
    })
    if (insertError) {
      if (insertError.code === '23505') continue // already synced, not an error
      console.error('Kaspi history sync: failed to record operation', op.id, 'for user', userId, ':', insertError.message)
      continue
    }
    synced++

    if (match.kind === 'unambiguous') {
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
    } else if (match.kind === 'ambiguous') {
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
  }

  return { synced, autoConfirmed, pending }
}
