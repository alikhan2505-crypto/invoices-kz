import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface KaspiOperationRow {
  id: string
  orderNumber: string
  amount: number
  direction: string
  category: string
  clientName: string | null
  matchedInvoiceId: string | null
  matchedInvoiceNumber: string | null
  operationDate: string
  commissionAmount: number | null
}

// Shared by the statement view (/api/kaspi/operations, limit 200) and its
// Excel/PDF export (/api/kaspi/operations/export, a higher limit) so the
// commission join below isn't duplicated between them.
export async function fetchKaspiOperations(userId: string, opts: {
  direction?: string
  category?: string
  from?: string | null
  to?: string | null
  limit?: number
}): Promise<KaspiOperationRow[]> {
  const { direction = 'all', category = 'all', from, to, limit = 200 } = opts

  let query = supabase
    .from('kaspi_operations')
    .select('id, kaspi_operation_id, order_number, amount, direction, category, client_name, matched_invoice_id, operation_date, invoices(number, client_name)')
    .eq('user_id', userId)
    .order('operation_date', { ascending: false })
    .limit(limit)
  if (direction !== 'all') query = query.eq('direction', direction)
  if (category !== 'all') query = query.eq('category', category)
  // Dates arrive as plain YYYY-MM-DD from the period picker (a UI concept,
  // not Kaspi's) -- "to" is inclusive of the whole day, hence the
  // end-of-day time appended rather than treating it as an exact instant.
  if (from) query = query.gte('operation_date', from)
  if (to) query = query.lte('operation_date', `${to}T23:59:59.999`)

  const { data: ops } = await query

  // 2% commission per successful incoming payment is debited from the same
  // wallet this connection funds (see wallet.ts's debitWalletForCommission),
  // but wallet_ledger has no FK back to kaspi_operations -- historySync.ts
  // links them by convention via note = 'kaspi_operation:<id>' instead, where
  // <id> is the Kaspi-side kaspi_operation_id, NOT this table's own `id`
  // primary key (a founder repro on 2026-09-01 -- a real commission debit
  // visible in the wallet's own recent-activity list -- traced this join
  // back to matching on the wrong column, so it could never find a row no
  // matter how correctly the debit's note was written). One batched lookup
  // for the current result set rather than N+1.
  const incomingOpIds = (ops || []).filter((o: any) => o.direction === 'in').map((o: any) => o.kaspi_operation_id)
  const commissionByOpId = new Map<string, number>()
  if (incomingOpIds.length > 0) {
    const { data: ledgerRows } = await supabase
      .from('wallet_ledger')
      .select('amount, note')
      .eq('user_id', userId)
      .eq('type', 'commission')
      .in('note', incomingOpIds.map((id: string) => `kaspi_operation:${id}`))
    for (const row of ledgerRows || []) {
      const opId = String(row.note).replace('kaspi_operation:', '')
      // amount is stored negative (a debit); the statement shows what was
      // actually taken, so flip the sign back to a positive tenge figure.
      commissionByOpId.set(opId, Math.abs(Number(row.amount)))
    }
  }

  return (ops || []).map((o: any) => ({
    id: o.id,
    orderNumber: o.order_number,
    amount: Number(o.amount),
    direction: o.direction,
    category: o.category,
    clientName: o.client_name,
    matchedInvoiceId: o.matched_invoice_id,
    matchedInvoiceNumber: o.invoices?.number ?? null,
    operationDate: o.operation_date,
    commissionAmount: o.direction === 'in' ? (commissionByOpId.get(o.kaspi_operation_id) ?? null) : null,
  }))
}
