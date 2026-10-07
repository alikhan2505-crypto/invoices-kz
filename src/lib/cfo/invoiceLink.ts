// Связка кабинета со счетами invoices.kz. Неоплаченные счета — ожидаемые
// поступления в прогнозе (виртуальные плановые операции, в базу не пишутся),
// оплаченные — кандидаты на «провести приходом».
import type { Workspace } from './data'
import { addDays } from './dates'
import type { CfoOperation, InvoiceLite } from './types'

// Счёт без срока оплаты ждём через неделю после выставления.
export const DAYS_WITHOUT_DUE_DATE = 7
const UNPAID = new Set(['draft', 'sent', 'viewed', 'overdue'])

export const isInvoiceVirtual = (op: Pick<CfoOperation, 'id'>) => op.id.startsWith('inv:')
export const invoiceIdOf = (op: Pick<CfoOperation, 'id'>) => op.id.slice(4)

export function expectedOn(inv: InvoiceLite): string {
  return inv.dueDate ?? addDays(inv.createdOn, DAYS_WITHOUT_DUE_DATE)
}

const defaultAccountId = (ws: Workspace) => {
  const live = ws.accounts.filter((a) => !a.archived)
  return (live.find((a) => a.kind === 'bank') ?? live[0])?.id ?? ''
}
export const revenueArticleId = (ws: Workspace) =>
  (ws.articles.find((a) => !a.archived && a.kind === 'income' && a.pnlGroup === 'revenue') ?? ws.articles.find((a) => !a.archived && a.kind === 'income'))?.id ?? null

const unpaid = (ws: Workspace) => ws.invoices.filter((i) => UNPAID.has(i.status) && i.amount > 0)

// Срок ещё не прошёл — ждём деньги в этот день.
export function expectedInflows(ws: Workspace, today: string): CfoOperation[] {
  const accountId = defaultAccountId(ws)
  const articleId = revenueArticleId(ws)
  if (!accountId) return []
  return unpaid(ws)
    .filter((i) => expectedOn(i) >= today)
    .map((i) => ({
      id: `inv:${i.id}`, direction: 'in', amount: i.amount, accountId, toAccountId: null, articleId,
      counterparty: i.clientName, comment: `Счёт №${i.number}`, paidOn: expectedOn(i), accruedOn: expectedOn(i),
      status: 'planned', recurrenceId: null, recurrenceDate: null,
    }))
}

// Срок прошёл, а денег нет — в прогноз не берём (неизвестно, придут ли), показываем отдельно.
export function overdueReceivables(ws: Workspace, today: string): InvoiceLite[] {
  return unpaid(ws).filter((i) => expectedOn(i) < today).sort((a, b) => expectedOn(a).localeCompare(expectedOn(b)))
}

export function unpostedPaid(ws: Workspace): InvoiceLite[] {
  const linked = new Set(ws.operations.map((o) => o.invoiceId).filter(Boolean))
  return ws.invoices.filter((i) => i.status === 'paid' && i.amount > 0 && !linked.has(i.id))
}

// Операции для прогноза: свои + ожидаемые по счетам, если человек это включил.
export function forecastOperations(ws: Workspace, today: string): CfoOperation[] {
  return ws.countInvoices ? [...ws.operations, ...expectedInflows(ws, today)] : ws.operations
}
