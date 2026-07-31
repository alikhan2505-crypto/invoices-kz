import * as XLSX from 'xlsx'
import { StatementRow } from './acquiringMatch'
import { formatDate } from './date'

export class AcquiringParseError extends Error {
  constructor(public code: 'not_excel' | 'too_large' | 'no_sheet' | 'unreadable' | 'unknown_structure', message: string) {
    super(message)
  }
}

const MAX_FILE_BYTES = 5 * 1024 * 1024

const BIN_HEADER_ALIASES = ['бин', 'иин', 'бин/иин', 'иин/бин']
const AMOUNT_HEADER_ALIASES = ['сумма', 'сумма операции', 'сумма платежа']
const DATE_HEADER_ALIASES = ['дата', 'дата операции', 'дата платежа']
const DESCRIPTION_HEADER_ALIASES = ['назначение', 'назначение платежа', 'контрагент', 'описание']

function normalizeHeader(cell: unknown): string {
  return String(cell ?? '').trim().toLowerCase()
}

function findColumn(headerRow: unknown[], aliases: string[]): number {
  for (let i = 0; i < headerRow.length; i++) {
    const cell = normalizeHeader(headerRow[i])
    if (aliases.some(alias => cell === alias || cell.includes(alias))) return i
  }
  return -1
}

export async function parseStatementFile(file: File): Promise<StatementRow[]> {
  const isExcel = /\.(xlsx|xls)$/i.test(file.name)
  if (!isExcel) {
    throw new AcquiringParseError('not_excel', 'Поддерживаются только файлы .xlsx или .xls')
  }

  // Check MIME type: allow empty file.type (browser inconsistency), only reject if non-empty and mismatched
  const validMimeTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
    'application/octet-stream', // common fallback reported by some browsers (e.g. mobile) for valid .xlsx files
  ]
  if (file.type && !validMimeTypes.includes(file.type)) {
    throw new AcquiringParseError('not_excel', 'Поддерживаются только файлы .xlsx или .xls')
  }

  if (file.size > MAX_FILE_BYTES) {
    throw new AcquiringParseError('too_large', 'Файл слишком большой (максимум 5 МБ)')
  }

  const buffer = await file.arrayBuffer()

  let workbook
  let grid: unknown[][]
  try {
    workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
    const firstSheetName = workbook.SheetNames[0]
    if (!firstSheetName) {
      throw new AcquiringParseError('no_sheet', 'В файле нет ни одного листа')
    }
    const sheet = workbook.Sheets[firstSheetName]
    grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  } catch (error) {
    if (error instanceof AcquiringParseError) {
      throw error
    }
    throw new AcquiringParseError('unreadable', 'Не удалось прочитать файл — убедитесь, что это корректный Excel-файл')
  }

  let headerRowIndex = -1
  let binCol = -1
  let amountCol = -1
  let dateCol = -1
  let descriptionCol = -1

  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    const candidateBinCol = findColumn(grid[i], BIN_HEADER_ALIASES)
    const candidateAmountCol = findColumn(grid[i], AMOUNT_HEADER_ALIASES)
    if (candidateBinCol !== -1 && candidateAmountCol !== -1) {
      headerRowIndex = i
      binCol = candidateBinCol
      amountCol = candidateAmountCol
      dateCol = findColumn(grid[i], DATE_HEADER_ALIASES)
      descriptionCol = findColumn(grid[i], DESCRIPTION_HEADER_ALIASES)
      break
    }
  }

  if (headerRowIndex === -1) {
    throw new AcquiringParseError('unknown_structure', 'Не удалось распознать структуру файла — попробуйте другой формат экспорта')
  }

  const rows: StatementRow[] = []
  for (let i = headerRowIndex + 1; i < grid.length; i++) {
    const line = grid[i]
    if (!line || line.length === 0) continue
    const binRaw = String(line[binCol] ?? '').trim()
    const amountRaw = line[amountCol]
    if (!binRaw || amountRaw === '' || amountRaw === undefined) continue
    const amount = Number(String(amountRaw).replace(/\s/g, '').replace(',', '.'))
    if (!Number.isFinite(amount)) continue
    const dateRaw = dateCol !== -1 ? line[dateCol] : undefined
    const date = dateRaw instanceof Date ? formatDate(dateRaw.toISOString()) : String(dateRaw ?? '')
    rows.push({
      bin: binRaw.replace(/\D/g, ''),
      amount,
      date,
      description: descriptionCol !== -1 ? String(line[descriptionCol] ?? '') : '',
    })
  }

  return rows
}
