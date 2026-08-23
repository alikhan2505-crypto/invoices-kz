import * as XLSX from 'xlsx'

export type ExportOrderRow = {
  code: string
  cityName: string | null
  customerFirstName: string
  customerLastName: string
  totalPrice: number
  creationTime: string
  plannedDeliveryDate: string | null
  items: { name: string; quantity: number }[]
}

const COLUMNS = ['№ заказа', 'Город', 'Покупатель', 'Сумма', 'Дата создания', 'Дата передачи', 'Товары']

// Explicit Asia/Almaty timeZone so the formatted date doesn't depend on the
// host machine's local timezone (test runners and Vercel's serverless
// functions both typically run in UTC).
function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ru-KZ', { timeZone: 'Asia/Almaty' })
}

export function buildOrdersWorkbookBuffer(orders: ExportOrderRow[]): Buffer {
  const rows = orders.map(o => [
    o.code,
    o.cityName ?? '',
    `${o.customerFirstName} ${o.customerLastName}`.trim(),
    o.totalPrice,
    formatDate(o.creationTime),
    formatDate(o.plannedDeliveryDate),
    o.items.map(i => `${i.name} ×${i.quantity}`).join('; '),
  ])
  const sheet = XLSX.utils.aoa_to_sheet([COLUMNS, ...rows])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Заказы')
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
