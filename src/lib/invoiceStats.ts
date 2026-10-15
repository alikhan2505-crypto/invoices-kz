// Общая логика «этого месяца» для дашборда и /profile.
//
// invoices.created_at — `timestamp without time zone` в UTC; Supabase отдаёт
// его без «Z», и `new Date()` разобрал бы такую строку как местное время.
// Поэтому всё идёт через parseDbTimestamp, как на дашборде, а месяц — по
// часам браузера (так его считает и дашборд, цифры должны совпадать).
//
// Колонки paid_at нет: оплаченный счёт относится к месяцу, в котором его
// создали, — так же, как в «Доход за период» на дашборде.
import { parseDbTimestamp } from './plan'

/** Лежит ли момент в том же календарном месяце (по часам браузера), что и `now`. */
export function isInLocalMonth(value: unknown, now: Date = new Date()): boolean {
  const d = parseDbTimestamp(value)
  if (!d) return false
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
}

/**
 * Начало текущего месяца по часам браузера минус сутки — для фильтра
 * `created_at >= …` в запросе. Запас нужен потому, что колонка без часового
 * пояса, а точную границу всё равно проводит isInLocalMonth.
 */
export function localMonthQueryFloor(now: Date = new Date()): string {
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  return new Date(start.getTime() - 24 * 60 * 60 * 1000).toISOString()
}

/** Сумма ОПЛАЧЕННЫХ счетов этого месяца. Черновики и аннулированные не входят. */
export function sumPaidInMonth(
  rows: ReadonlyArray<{ amount: unknown; status?: unknown; created_at: unknown }>,
  now: Date = new Date(),
): number {
  let total = 0
  for (const row of rows) {
    if (row.status !== 'paid') continue
    if (!isInLocalMonth(row.created_at, now)) continue
    const amount = Number(row.amount)
    if (Number.isFinite(amount)) total += amount
  }
  return total
}
