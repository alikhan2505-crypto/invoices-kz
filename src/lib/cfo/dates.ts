// Календарная арифметика на строках 'YYYY-MM-DD' / 'YYYY-MM'. Date используется
// только в UTC внутри функций, поэтому часовой пояс браузера не сдвигает даты.

const pad = (n: number) => String(n).padStart(2, '0')

export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function monthKey(date: string): string {
  return date.slice(0, 7)
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function firstDay(month: string): string {
  return `${month}-01`
}

export function lastDay(month: string): string {
  return `${month}-${pad(daysInMonth(month))}`
}

export function monthRange(from: string, to: string): string[] {
  const out: string[] = []
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m)
  return out
}

export function yearMonths(year: number): string[] {
  return monthRange(`${year}-01`, `${year}-12`)
}

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const t = Date.parse(`${s}T00:00:00Z`)
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s
}
