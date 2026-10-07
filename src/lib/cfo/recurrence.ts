// Правило повтора хранится одной строкой; вхождения разворачиваются на лету.
// Оплаченное вхождение — это реальная операция с recurrenceId + recurrenceDate,
// поэтому его больше не показываем как плановое.
import type { CfoOperation, CfoRecurrence } from './types'
import { daysInMonth, monthKey, monthRange } from './dates'

export function occurrenceDate(month: string, dayOfMonth: number): string {
  const day = Math.min(dayOfMonth, daysInMonth(month))
  return `${month}-${String(day).padStart(2, '0')}`
}

export function expandRecurrences(recurrences: CfoRecurrence[], operations: CfoOperation[], from: string, to: string): CfoOperation[] {
  if (from > to) return []
  const taken = new Set(
    operations.filter((o) => o.recurrenceId && o.recurrenceDate).map((o) => `${o.recurrenceId}|${o.recurrenceDate}`),
  )
  const out: CfoOperation[] = []
  for (const r of recurrences) {
    for (const month of monthRange(monthKey(from), monthKey(to))) {
      const date = occurrenceDate(month, r.dayOfMonth)
      if (date < from || date > to || date < r.startsOn) continue
      if (r.endsOn && date > r.endsOn) continue
      if (taken.has(`${r.id}|${date}`)) continue
      out.push({
        id: `rec:${r.id}:${date}`,
        direction: r.direction,
        amount: r.amount,
        accountId: r.accountId,
        toAccountId: r.toAccountId,
        articleId: r.articleId,
        counterparty: r.counterparty,
        comment: r.comment,
        paidOn: date,
        accruedOn: date,
        status: 'planned',
        recurrenceId: r.id,
        recurrenceDate: date,
      })
    }
  }
  return out.sort((a, b) => a.paidOn.localeCompare(b.paidOn))
}

export function isVirtual(op: CfoOperation): boolean {
  return op.id.startsWith('rec:')
}
