// Выгрузка отчётов и журнала в Excel. Таблицы собираются чистыми функциями
// (суммы — в тенге числами, чтобы в Excel их можно было складывать), запись
// файла — одна строка xlsx в браузере. Что показывать в клетке, решают те же
// функции, что и экран (reportView): будущие месяцы — пусто, итог отклонения —
// по начавшимся месяцам.
import * as XLSX from 'xlsx'
import type { CfoAccount, CfoArticle, CfoOperation } from './types'
import { DIRECTION_LABEL, accountName, opTitle, shortMonth } from './labels'
import { cellValue, totalHeading, totalValue, type Measure, type ReportCell } from './reportView'
import { vocab, type CfoMode } from './mode'

export type ExportRow = { label: string; level: number; cells: Record<string, ReportCell>; total: ReportCell }
type Sheet = (string | number | null)[][]

const tenge = (t: number | null) => (t === null ? null : Math.round(t) / 100)
const indent = (level: number, s: string) => `${'   '.repeat(level)}${s}`

export function reportSheets(months: string[], rows: ExportRow[], currentMonth: string): Record<string, Sheet> {
  const sheet = (measure: Measure): Sheet => [
    ['Статья', ...months.map((m) => `${shortMonth(m)} ${m.slice(0, 4)}`), totalHeading(months, currentMonth, measure)],
    ...rows.map((r) => [indent(r.level, r.label), ...months.map((m) => tenge(cellValue(r, m, measure, currentMonth))), tenge(totalValue(r, months, currentMonth, measure))]),
  ]
  return {
    Факт: sheet('fact'),
    План: sheet('plan'),
    Отклонение: sheet('diff'),
  }
}

export function operationsSheet(ops: CfoOperation[], accounts: CfoAccount[], articles: CfoArticle[], mode?: CfoMode): Sheet {
  const v = vocab(mode)
  return [
    ['Дата оплаты', mode === 'family' ? 'Месяц учёта' : 'Дата начисления', 'Тип', 'Статья', 'Счёт', 'Счёт получателя', v.counterparty, 'Комментарий', 'Сумма, ₸', 'Статус'],
    ...ops.map((o) => [
      o.paidOn, o.accruedOn, DIRECTION_LABEL[o.direction], o.direction === 'transfer' ? '' : opTitle(o, accounts, articles),
      accountName(o.accountId, accounts), o.toAccountId ? accountName(o.toAccountId, accounts) : '',
      o.counterparty ?? '', o.comment ?? '',
      o.direction === 'out' ? -(tenge(o.amount) as number) : tenge(o.amount),
      o.status === 'actual' ? 'Факт' : 'План',
    ]),
  ]
}

export function downloadWorkbook(fileName: string, sheets: Record<string, Sheet>): void {
  const wb = XLSX.utils.book_new()
  for (const [name, data] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = data[0].map((_, i) => ({ wch: i === 0 ? 42 : 14 }))
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31))
  }
  XLSX.writeFile(wb, fileName)
}
