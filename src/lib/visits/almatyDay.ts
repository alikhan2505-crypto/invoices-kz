// Сутки по Алматы. С 01.03.2024 весь Казахстан живёт в UTC+5 без перехода
// на летнее время, поэтому смещение постоянное.
export const ALMATY_OFFSET_MS = 5 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export interface AlmatyDay {
  day: string // YYYY-MM-DD по Алматы
  startIso: string // начало суток (UTC ISO)
  endIso: string // начало следующих суток (UTC ISO), не включительно
}

// Сутки по Алматы, в которые попадает момент now, со сдвигом на offsetDays.
export function almatyDay(now: Date, offsetDays = 0): AlmatyDay {
  const local = now.getTime() + ALMATY_OFFSET_MS
  const startLocal = Math.floor(local / DAY_MS) * DAY_MS + offsetDays * DAY_MS
  const start = startLocal - ALMATY_OFFSET_MS
  return {
    day: new Date(startLocal).toISOString().slice(0, 10),
    startIso: new Date(start).toISOString(),
    endIso: new Date(start + DAY_MS).toISOString(),
  }
}

// «16.10» и день недели по-русски для заголовка отчёта.
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
export function formatAlmatyDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')} (${wd})`
}

// «20:37» — время по Алматы, на которое собран отчёт (крон Vercel Hobby
// срабатывает в любую минуту назначенного часа).
export function formatAlmatyTime(now: Date): string {
  const local = new Date(now.getTime() + ALMATY_OFFSET_MS)
  return `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`
}

// Сколько суток от дня a до дня b (оба YYYY-MM-DD).
export function almatyDaysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS)
}
