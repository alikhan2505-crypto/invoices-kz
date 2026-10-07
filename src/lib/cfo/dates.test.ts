import { describe, it, expect } from 'vitest'
import { addDays, addMonths, daysInMonth, firstDay, lastDay, isIsoDate, monthKey, monthRange, todayIso, yearMonths } from './dates'

describe('dates', () => {
  it('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('addMonths wraps years both ways', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
  })

  it('daysInMonth handles leap years', () => {
    expect(daysInMonth('2028-02')).toBe(29)
    expect(daysInMonth('2026-02')).toBe(28)
    expect(daysInMonth('2026-04')).toBe(30)
  })

  it('first/last day and month key', () => {
    expect(firstDay('2026-02')).toBe('2026-02-01')
    expect(lastDay('2026-02')).toBe('2026-02-28')
    expect(monthKey('2026-02-17')).toBe('2026-02')
  })

  it('monthRange is inclusive and yearMonths has twelve', () => {
    expect(monthRange('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
    expect(yearMonths(2026)).toHaveLength(12)
    expect(yearMonths(2026)[0]).toBe('2026-01')
  })

  it('isIsoDate rejects impossible dates', () => {
    expect(isIsoDate('2026-02-28')).toBe(true)
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('26-02-01')).toBe(false)
    expect(isIsoDate('')).toBe(false)
  })

  it('todayIso uses the local calendar date', () => {
    expect(todayIso(new Date(2026, 9, 7, 23, 30))).toBe('2026-10-07')
  })
})
