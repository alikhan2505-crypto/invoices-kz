import { describe, expect, it } from 'vitest'
import { yearMonths } from './dates'
import { parsePlanPeriod, periodMonths, planPeriodParam, sumMonths } from './planPeriod'

const months = yearMonths(2026)

describe('periodMonths', () => {
  it('год: все 12 месяцев', () => {
    expect(periodMonths(months, 'year')).toEqual(months)
  })
  it('кварталы: по три месяца', () => {
    expect(periodMonths(months, 1)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(periodMonths(months, 2)).toEqual(['2026-04', '2026-05', '2026-06'])
    expect(periodMonths(months, 3)).toEqual(['2026-07', '2026-08', '2026-09'])
    expect(periodMonths(months, 4)).toEqual(['2026-10', '2026-11', '2026-12'])
  })
  it('не мутирует исходный список', () => {
    const copy = [...months]
    periodMonths(months, 'year').pop()
    expect(months).toEqual(copy)
  })
})

describe('sumMonths', () => {
  const values: Record<string, number> = { '2026-01': 100, '2026-02': 250, '2026-03': 50, '2026-04': 1000, '2026-12': 7 }
  const valueOf = (m: string) => values[m] ?? 0
  it('сумма квартала', () => {
    expect(sumMonths(periodMonths(months, 1), valueOf)).toBe(400)
    expect(sumMonths(periodMonths(months, 2), valueOf)).toBe(1000)
    expect(sumMonths(periodMonths(months, 3), valueOf)).toBe(0)
    expect(sumMonths(periodMonths(months, 4), valueOf)).toBe(7)
  })
  it('сумма четырёх кварталов равна годовой', () => {
    const quarters = ([1, 2, 3, 4] as const).reduce((s, q) => s + sumMonths(periodMonths(months, q), valueOf), 0)
    expect(quarters).toBe(sumMonths(periodMonths(months, 'year'), valueOf))
    expect(quarters).toBe(1407)
  })
  it('пустой список даёт 0', () => {
    expect(sumMonths([], valueOf)).toBe(0)
  })
})

describe('parsePlanPeriod / planPeriodParam', () => {
  it('разбирает 1..4, остальное это год', () => {
    expect(parsePlanPeriod('1')).toBe(1)
    expect(parsePlanPeriod('4')).toBe(4)
    expect(parsePlanPeriod('5')).toBe('year')
    expect(parsePlanPeriod('')).toBe('year')
    expect(parsePlanPeriod(null)).toBe('year')
    expect(parsePlanPeriod(undefined)).toBe('year')
    expect(parsePlanPeriod('year')).toBe('year')
  })
  it('круговое преобразование', () => {
    expect(planPeriodParam('year')).toBeNull()
    for (const q of [1, 2, 3, 4] as const) expect(parsePlanPeriod(planPeriodParam(q))).toBe(q)
  })
})
