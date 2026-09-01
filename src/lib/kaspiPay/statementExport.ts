import * as XLSX from 'xlsx'
import type { KaspiOperationRow } from './operationsQuery'

const COLUMNS = ['Дата', 'Сумма', 'Направление', 'Счёт', 'Клиент', 'Комиссия 2%', 'Категория']

function directionLabel(direction: string): string {
  return direction === 'in' ? 'Входящие' : 'Исходящие'
}

function categoryLabel(category: string): string {
  return category === 'platform' ? 'Счета' : 'Платформа'
}

// Explicit Asia/Almaty timeZone so the formatted date doesn't depend on the
// host machine's local timezone (test runners and Vercel's serverless
// functions both typically run in UTC) -- same reasoning as
// kaspiShop/ordersExport.ts's formatDate.
function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('ru-KZ', { timeZone: 'Asia/Almaty' })
}

export function buildStatementWorkbookBuffer(operations: KaspiOperationRow[]): Buffer {
  const rows = operations.map(op => [
    formatDate(op.operationDate),
    op.amount,
    directionLabel(op.direction),
    op.matchedInvoiceNumber ?? '',
    op.clientName ?? '',
    op.commissionAmount ?? '',
    categoryLabel(op.category),
  ])
  const sheet = XLSX.utils.aoa_to_sheet([COLUMNS, ...rows])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Выписка')
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
