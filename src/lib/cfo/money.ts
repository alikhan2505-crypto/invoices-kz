// Все расчёты кабинета — в целых тиынах, чтобы копейки не накапливали ошибку.
// В БД суммы хранятся numeric(14,2) в тенге; переход только здесь.

export const MAX_AMOUNT_TIYN = 99_999_999_999_999
export const TOO_LARGE_AMOUNT = 'Слишком большая сумма'

// Единый знак минус (U+2212) во всех суммах кабинета — toLocaleString отдаёт дефис.
export const MINUS = '−'

export function toTiyn(value: number | string): number {
  const n = typeof value === 'string' ? Number(value) : value
  return Math.round(n * 100)
}

// Ввод человека: пробелы (в т.ч. неразрывные) как разделители тысяч,
// запятая или точка как десятичный знак, не больше двух знаков после него.
export function parseAmountInput(raw: string, opts: { allowNegative?: boolean } = {}): number | null {
  const cleaned = raw.replace(/\s/g, '').replace(/^[−–]/, '-').replace(',', '.')
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

// Целые тенге — без копеек; с копейками — всегда два знака («1 250,50 ₸», не «1 250,5 ₸»).
export function formatTenge(t: number): string {
  const digits = t % 100 === 0 ? 0 : 2
  const v = (Math.abs(t) / 100).toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return `${t < 0 ? MINUS : ''}${v} ₸`
}

// Целое число с разрядами: 65901132 → «65 901 132».
export function formatNumber(n: number): string {
  return `${n < 0 ? MINUS : ''}${Math.abs(Math.round(n)).toLocaleString('ru-RU')}`
}

// Компактная сумма для плитки календаря: 1 250 000 → «+1,25 млн», 10 000 000 → «+10 млн»,
// 1 000 000 000 → «+1 млрд», 45 000 → «+45 тыс», 900 → «+900».
// Сначала округляем, потом выбираем разряд: 999 999 → «+1 млн», а не «+1000 тыс».
export function shortTenge(t: number): string {
  const v = Math.abs(t) / 100
  const sign = t < 0 ? MINUS : '+'
  const scaled = (x: number) => (x >= 10 ? Math.round(x) : Number(x.toFixed(2)))
  const show = (x: number) => String(x).replace('.', ',')
  if (v < 999.5) return `${sign}${Math.round(v)}`
  const k = Math.round(v / 1_000)
  if (k < 1_000) return `${sign}${k} тыс`
  const m = scaled(v / 1_000_000)
  if (m < 1_000) return `${sign}${show(m)} млн`
  return `${sign}${show(scaled(v / 1_000_000_000))} млрд`
}
