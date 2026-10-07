// Файл выписки → сетка ячеек. Только в браузере: файл никуда не отправляется.
import * as XLSX from 'xlsx'
import type { Grid } from './statementImport'

const MAX_BYTES = 5 * 1024 * 1024

export async function readStatementGrid(file: File): Promise<Grid> {
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error('Нужен файл Excel (.xlsx, .xls) или .csv — выгрузите выписку из интернет-банка в Excel')
  if (file.size > MAX_BYTES) throw new Error('Файл больше 5 МБ — выгрузите выписку за период покороче')
  const buffer = await file.arrayBuffer()
  let wb: XLSX.WorkBook
  try {
    // raw: даты остаются числами Excel, суммы — числами; разбор строк — в statementImport.
    wb = XLSX.read(buffer, { type: 'array', raw: false, cellDates: false })
  } catch {
    throw new Error('Не удалось прочитать файл — откройте его в Excel и сохраните как .xlsx')
  }
  const sheet = wb.Sheets[wb.SheetNames[0] ?? '']
  if (!sheet) throw new Error('В файле нет ни одного листа')
  return XLSX.utils.sheet_to_json<Grid[number]>(sheet, { header: 1, raw: true, defval: '' })
}
