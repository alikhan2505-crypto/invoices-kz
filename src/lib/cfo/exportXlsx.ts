// Выгрузка отчётов и журнала в Excel. Таблицы собираются чистыми функциями
// (суммы — в тенге числами, чтобы в Excel их можно было складывать), запись
// файла — одна строка xlsx в браузере.
import * as XLSX from 'xlsx'
import type { CfoAccount, CfoArticle, CfoOperation } from './types'
import { DIRECTION_LABEL, accountName, opTitle, shortMonth } from './labels'

export type ExportRow = { label: string; level: number; cells: Record<string, { plan: number | null; fact: number }>; total: { plan: number | null; fact: number } }
type Sheet = (string | number | null)[][]

const tenge = (t: number) => Math.round(t) / 100
const indent = (level: number, s: string) => `${'   '.repeat(level)}${s}`

export function reportSheets(months: string[], rows: ExportRow[]): Record<string, Sheet> {
  const header = ['Статья', ...months.map((m) => `${shortMonth(m)} ${m.slice(0, 4)}`), 'Итого']
  const sheet = (pick: (c: { plan: number | null; fact: number }) => number | null): Sheet => [
    header,
    ...rows.map((r) => [indent(r.level, r.label), ...months.map((m) => pick(r.cells[m])), pick(r.total)]),
  ]
  return {
    Факт: sheet((c) => tenge(c.fact)),
    План: sheet((c) => (c.plan === null ? null : tenge(c.plan))),
    Отклонение: sheet((c) => (c.plan === null ? null : tenge(c.fact - c.plan))),
  }
}

export function operationsSheet(ops: CfoOperation[], accounts: CfoAccount[], articles: CfoArticle[]): Sheet {
  return [
    ['Дата оплаты', 'Дата начисления', 'Тип', 'Статья', 'Счёт', 'Счёт получателя', 'Контрагент', 'Комментарий', 'Сумма, ₸', 'Статус'],
    ...ops.map((o) => [
      o.paidOn, o.accruedOn, DIRECTION_LABEL[o.direction], o.direction === 'transfer' ? '' : opTitle(o, accounts, articles),
      accountName(o.accountId, accounts), o.toAccountId ? accountName(o.toAccountId, accounts) : '',
      o.counterparty ?? '', o.comment ?? '',
      o.direction === 'out' ? -tenge(o.amount) : tenge(o.amount),
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
