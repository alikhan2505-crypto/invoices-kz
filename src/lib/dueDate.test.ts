import { describe, it, expect } from 'vitest'
import { addDaysToDateString, todayDateString, computeDefaultDueDate } from './dueDate'

describe('addDaysToDateString', () => {
  it('adds positive days within a month', () => {
    expect(addDaysToDateString('2026-08-07', 3)).toBe('2026-08-10')
  })

  it('subtracts days with a negative offset', () => {
    expect(addDaysToDateString('2026-08-07', -1)).toBe('2026-08-06')
  })

  it('rolls over a month boundary', () => {
    expect(addDaysToDateString('2026-08-31', 1)).toBe('2026-09-01')
  })

  it('rolls over a year boundary', () => {
    expect(addDaysToDateString('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('todayDateString', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(todayDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('день считается по Алматы: ночью с 00:00 до 05:00 это уже следующее число по UTC', () => {
    expect(todayDateString(new Date('2026-11-03T18:59:59Z'))).toBe('2026-11-03') // 23:59:59 в Алматы
    expect(todayDateString(new Date('2026-11-03T19:00:00Z'))).toBe('2026-11-04') // 00:00 в Алматы
    expect(todayDateString(new Date('2026-11-04T04:59:00Z'))).toBe('2026-11-04') // 09:59 в Алматы
  })

  it('граница года и месяца', () => {
    expect(todayDateString(new Date('2026-12-31T19:30:00Z'))).toBe('2027-01-01')
    expect(todayDateString(new Date('2026-02-28T20:00:00Z'))).toBe('2026-03-01')
  })
})

describe('computeDefaultDueDate', () => {
  it('adds the configured number of days', () => {
    expect(computeDefaultDueDate('2026-08-07', '10')).toBe('2026-08-17')
  })

  it('falls back to 3 days when the setting is empty', () => {
    expect(computeDefaultDueDate('2026-08-07', '')).toBe('2026-08-10')
  })

  it('falls back to 3 days when the setting is undefined', () => {
    expect(computeDefaultDueDate('2026-08-07', undefined)).toBe('2026-08-10')
  })

  it('falls back to 3 days when the setting is null', () => {
    expect(computeDefaultDueDate('2026-08-07', null)).toBe('2026-08-10')
  })

  it('falls back to 3 days when the setting is not a number', () => {
    expect(computeDefaultDueDate('2026-08-07', 'abc')).toBe('2026-08-10')
  })

  it('falls back to 3 days when the setting is zero', () => {
    expect(computeDefaultDueDate('2026-08-07', '0')).toBe('2026-08-10')
  })

  it('falls back to 3 days when the setting is negative', () => {
    expect(computeDefaultDueDate('2026-08-07', '-5')).toBe('2026-08-10')
  })
})
