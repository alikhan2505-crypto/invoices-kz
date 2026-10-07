// Все расчёты кабинета — в целых тиынах, чтобы копейки не накапливали ошибку.
// В БД суммы хранятся numeric(14,2) в тенге; переход только здесь.

export const MAX_AMOUNT_TIYN = 99_999_999_999_999

export function toTiyn(value: number | string): number {
  const n = typeof value === 'string' ? Number(value) : value
  return Math.round(n * 100)
}

// Ввод человека: пробелы (в т.ч. неразрывные) как разделители тысяч,
// запятая или точка как десятичный знак, не больше двух знаков после него.
export function parseAmountInput(raw: string, opts: { allowNegative?: boolean } = {}): number | null {
  const cleaned = raw.replace(/\s/g, '').replace(',', '.')
  const re = opts.allowNegative ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/
  if (!re.test(cleaned)) return null
  return Math.round(Number(cleaned) * 100)
}

export function tiynToNumber(t: number): number {
  return t / 100
}

export function toDbAmount(t: number): string {
  return (t / 100).toFixed(2)
}

export function formatTenge(t: number): string {
  const v = (t / 100).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  return `${v} ₸`
}
