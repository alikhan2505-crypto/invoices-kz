import { describe, it, expect } from 'vitest'
import { isInLocalMonth, localMonthQueryFloor, sumPaidInMonth } from './invoiceStats'

// Середина месяца по местному времени — от часового пояса машины тест не зависит.
const now = new Date(2026, 9, 15, 12, 0, 0)
// Так Postgres отдаёт `timestamp without time zone`: UTC без «Z».
const dbTs = (d: Date) => d.toISOString().replace('T', ' ').replace('Z', '')

describe('isInLocalMonth', () => {
  it('строка без часового пояса из Postgres читается как UTC', () => {
    expect(isInLocalMonth(dbTs(new Date(2026, 9, 3, 10)), now)).toBe(true)
    expect(isInLocalMonth(dbTs(new Date(2026, 8, 30, 10)), now)).toBe(false)
    expect(isInLocalMonth(dbTs(new Date(2025, 9, 3, 10)), now)).toBe(false)
  })
  it('мусор — false', () => {
    expect(isInLocalMonth(null, now)).toBe(false)
    expect(isInLocalMonth('не дата', now)).toBe(false)
  })
})

describe('sumPaidInMonth', () => {
  it('складывает только оплаченные счета этого месяца', () => {
    const inMonth = dbTs(new Date(2026, 9, 5, 9))
    const lastMonth = dbTs(new Date(2026, 8, 28, 9))
    expect(sumPaidInMonth([
      { amount: 1000, status: 'paid', created_at: inMonth },
      { amount: '2500.50', status: 'paid', created_at: inMonth },
      { amount: 9999, status: 'draft', created_at: inMonth },
      { amount: 9999, status: 'cancelled', created_at: inMonth },
      { amount: 9999, status: 'sent', created_at: inMonth },
      { amount: 9999, status: 'paid', created_at: lastMonth },
      { amount: 'abc', status: 'paid', created_at: inMonth },
    ], now)).toBe(3500.5)
  })
  it('0 для пустого списка', () => {
    expect(sumPaidInMonth([], now)).toBe(0)
  })
})

describe('localMonthQueryFloor', () => {
  it('на сутки раньше начала месяца', () => {
    const floor = new Date(localMonthQueryFloor(now))
    expect(floor.getTime()).toBe(new Date(2026, 9, 1).getTime() - 24 * 60 * 60 * 1000)
  })
})
