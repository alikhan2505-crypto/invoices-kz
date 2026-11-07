// Сутки и периоды по времени Алматы (UTC+5, без перехода на летнее время): чистые
// функции без обращений к Kaspi, чтобы их могли брать и сервер, и страница
// (аудит Kaspi 06.11.2026, K37).

export const KZ_OFFSET_MS = 5 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export const MAX_PERIOD_DAYS = 365

/** Дата YYYY-MM-DD по времени Алматы для момента ms. */
export function almatyDateOf(ms: number): string {
  return new Date(ms + KZ_OFFSET_MS).toISOString().slice(0, 10)
}

/** Начало суток по Алматы (00:00 UTC+5), в которые попадает момент ms. */
export function almatyDayStartMs(ms: number): number {
  return Math.floor((ms + KZ_OFFSET_MS) / DAY_MS) * DAY_MS - KZ_OFFSET_MS
}

/**
 * Начало окна «последние N дней»: N календарных суток по Алматы, считая
 * сегодняшние (7 дней = сегодня и шесть предыдущих). Раньше окно было скользящим
 * N×24 часа от текущего момента и начиналось посреди суток.
 */
export function windowStartForDays(days: number, nowMs: number = Date.now()): number {
  return almatyDayStartMs(nowMs) - (days - 1) * DAY_MS
}

/** Дата YYYY-MM-DD, сдвинутая на days суток (отрицательное -- назад). */
export function shiftAlmatyDate(date: string, days: number): string {
  return almatyDateOf(Date.parse(`${date}T00:00:00+05:00`) + days * DAY_MS)
}

export type SincePeriod = { ok: true; startMs: number; days: number } | { ok: false }

/**
 * «Свой период»: дата YYYY-MM-DD, с которой считать (включительно, 00:00 UTC+5).
 * Не из будущего и не старше года.
 */
export function parseSinceDate(raw: string | null | undefined, nowMs: number = Date.now()): SincePeriod {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { ok: false }
  const startMs = Date.parse(`${raw}T00:00:00+05:00`)
  if (!Number.isFinite(startMs)) return { ok: false }
  // Date.parse переносит «2026-02-31» на март; такая дата не настоящая.
  if (almatyDateOf(startMs) !== raw) return { ok: false }
  const todayStart = almatyDayStartMs(nowMs)
  if (startMs > todayStart) return { ok: false }
  const days = Math.round((todayStart - startMs) / DAY_MS) + 1
  if (days > MAX_PERIOD_DAYS) return { ok: false }
  return { ok: true, startMs, days }
}
