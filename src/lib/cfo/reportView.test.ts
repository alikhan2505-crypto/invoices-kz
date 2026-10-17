import { describe, expect, it } from 'vitest'
import { cellValue, elapsedMonths, isFutureMonth, measureValue, totalCell, totalHeading, totalValue, type ReportRowModel } from './reportView'

const months = ['2026-09', '2026-10', '2026-11', '2026-12']
const current = '2026-10'
// Выручка: факт только по прошедшим месяцам, план на весь год.
const row: ReportRowModel = {
  cells: {
    '2026-09': { plan: 500_00, fact: 450_00 },
    '2026-10': { plan: 500_00, fact: 120_00 },
    '2026-11': { plan: 500_00, fact: 0 },
    '2026-12': { plan: 500_00, fact: 0 },
  },
  total: { plan: 2000_00, fact: 570_00 },
}
const noPlan: ReportRowModel = { cells: { '2026-09': { plan: null, fact: 10 }, '2026-10': { plan: null, fact: 20 }, '2026-11': { plan: null, fact: 20 }, '2026-12': { plan: null, fact: 20 } }, total: { plan: null, fact: 20 } }

describe('reportView', () => {
  it('a month that has not started shows no fact and no deviation, but keeps its plan', () => {
    expect(isFutureMonth('2026-11', current)).toBe(true)
    expect(elapsedMonths(months, current)).toEqual(['2026-09', '2026-10'])
    expect(cellValue(row, '2026-11', 'fact', current)).toBeNull()
    expect(cellValue(row, '2026-11', 'diff', current)).toBeNull()
    expect(cellValue(row, '2026-11', 'plan', current)).toBe(500_00)
    expect(cellValue(row, '2026-10', 'diff', current)).toBe(-380_00)
    expect(cellValue(row, '2026-09', 'fact', current)).toBe(450_00)
  })

  it('deviation total covers only elapsed months (QA P1-3: −3 827 999,75 on screen vs −13 827 999,75 in Excel)', () => {
    expect(totalCell(row, months, current, 'diff')).toEqual({ plan: 1000_00, fact: 570_00 })
    expect(totalValue(row, months, current, 'diff')).toBe(-430_00)
    expect(totalValue(row, months, current, 'fact')).toBe(570_00)
    expect(totalValue(row, months, current, 'plan')).toBe(2000_00)
    expect(totalHeading(months, current, 'diff')).toBe('Итого с начала года')
    expect(totalHeading(months, current, 'fact')).toBe('Итого')
    expect(totalHeading(months, '2027-01', 'diff')).toBe('Итого')
  })

  it('rows without a plan have no plan or deviation; a year entirely in the future has no totals', () => {
    expect(cellValue(noPlan, '2026-09', 'plan', current)).toBeNull()
    expect(cellValue(noPlan, '2026-09', 'diff', current)).toBeNull()
    expect(totalValue(noPlan, months, current, 'diff')).toBeNull()
    expect(totalValue(row, months, '2026-08', 'fact')).toBeNull()
    expect(measureValue(undefined, 'fact', false)).toBeNull()
  })
})
