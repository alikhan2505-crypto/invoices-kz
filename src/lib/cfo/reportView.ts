// Правила показа отчётных таблиц (БДР, БДДС): одни и те же чистые функции
// используют экран (ReportTable) и выгрузка в Excel (exportXlsx), поэтому
// цифры в файле не расходятся с тем, что видно на экране.
//
// Founder 07.10.2026: у месяца, который ещё не наступил, факта нет — «—», а не «0 ₸».
// План будущего месяца реален и показывается. «Итого» по отклонению сравнивает
// подобное с подобным: только уже начавшиеся месяцы, иначе в середине года
// факт с начала года ставился бы против плана на весь год.

export type Measure = 'fact' | 'plan' | 'diff'
export type ReportCell = { plan: number | null; fact: number }
export type ReportRowModel = { cells: Record<string, ReportCell>; total: ReportCell }

export const MEASURE_OPTIONS: { value: Measure; label: string }[] = [
  { value: 'fact', label: 'Факт' },
  { value: 'plan', label: 'План' },
  { value: 'diff', label: 'Отклонение' },
]

export const isFutureMonth = (month: string, currentMonth: string) => month > currentMonth
export const elapsedMonths = (months: string[], currentMonth: string) => months.filter((m) => !isFutureMonth(m, currentMonth))

// Значение клетки для показателя; null = «—» (нет факта в будущем, нет плана).
export function measureValue(cell: ReportCell | undefined, measure: Measure, future: boolean): number | null {
  if (!cell) return null
  if (future && measure !== 'plan') return null
  if (measure === 'fact') return cell.fact
  if (cell.plan === null) return null
  if (measure === 'plan') return cell.plan
  return cell.fact - cell.plan
}

export function cellValue(row: ReportRowModel, month: string, measure: Measure, currentMonth: string): number | null {
  return measureValue(row.cells[month], measure, isFutureMonth(month, currentMonth))
}

// Итог строки: для отклонения — только по начавшимся месяцам, иначе как посчитал отчёт.
export function totalCell(row: ReportRowModel, months: string[], currentMonth: string, measure: Measure): ReportCell {
  if (measure !== 'diff' || row.total.plan === null) return row.total
  return elapsedMonths(months, currentMonth).reduce<ReportCell>(
    (acc, m) => ({ plan: (acc.plan ?? 0) + (row.cells[m]?.plan ?? 0), fact: acc.fact + (row.cells[m]?.fact ?? 0) }),
    { plan: 0, fact: 0 },
  )
}

export function totalValue(row: ReportRowModel, months: string[], currentMonth: string, measure: Measure): number | null {
  return measureValue(totalCell(row, months, currentMonth, measure), measure, elapsedMonths(months, currentMonth).length === 0)
}

export function totalHeading(months: string[], currentMonth: string, measure: Measure): string {
  const elapsed = elapsedMonths(months, currentMonth)
  return measure === 'diff' && elapsed.length > 0 && elapsed.length < months.length ? 'Итого с начала года' : 'Итого'
}
