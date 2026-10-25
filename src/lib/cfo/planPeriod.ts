// Период таблицы «Бюджет»: весь год или один квартал. Чистые функции без React и без браузера.

export type PlanPeriod = 'year' | 1 | 2 | 3 | 4

export const PLAN_PERIODS: readonly PlanPeriod[] = ['year', 1, 2, 3, 4]

/** Значение из ?q= или sessionStorage: «1»..«4» → квартал, всё остальное (в том числе «year») → год. */
export function parsePlanPeriod(raw: string | null | undefined): PlanPeriod {
  if (raw === '1') return 1
  if (raw === '2') return 2
  if (raw === '3') return 3
  if (raw === '4') return 4
  return 'year'
}

/** Обратное преобразование: для года параметр не нужен (null), для квартала «1»..«4». */
export function planPeriodParam(period: PlanPeriod): string | null {
  return period === 'year' ? null : String(period)
}

/** Месяцы, видимые в периоде: из 12 месяцев года берём 3 нужных (кварталы 1..4) или все. */
export function periodMonths(yearMonthList: readonly string[], period: PlanPeriod): string[] {
  if (period === 'year') return [...yearMonthList]
  const start = (period - 1) * 3
  return yearMonthList.slice(start, start + 3)
}

/** Сумма значений (в тиынах) по перечисленным месяцам: итог по квартальной или годовой колонке. */
export function sumMonths(months: readonly string[], valueOf: (month: string) => number): number {
  return months.reduce((sum, m) => sum + valueOf(m), 0)
}
