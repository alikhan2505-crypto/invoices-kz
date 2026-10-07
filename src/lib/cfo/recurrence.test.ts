import { describe, it, expect } from 'vitest'
import { expandRecurrences, isVirtual, occurrenceDate } from './recurrence'
import type { CfoOperation, CfoRecurrence } from './types'

const rent: CfoRecurrence = { id: 'r1', direction: 'out', amount: 30_000_000, accountId: 'kaspi', toAccountId: null, articleId: 'rent', counterparty: 'ТОО Арендодатель', comment: null, dayOfMonth: 31, startsOn: '2026-01-15', endsOn: '2026-05-31' }

const paid = (date: string): CfoOperation => ({ id: `p-${date}`, direction: 'out', amount: 30_000_000, accountId: 'kaspi', toAccountId: null, articleId: 'rent', counterparty: null, comment: null, paidOn: date, accruedOn: date, status: 'actual', recurrenceId: 'r1', recurrenceDate: date })

describe('occurrenceDate', () => {
  it('clamps to the last day of short months', () => {
    expect(occurrenceDate('2026-02', 31)).toBe('2026-02-28')
    expect(occurrenceDate('2028-02', 31)).toBe('2028-02-29')
    expect(occurrenceDate('2026-04', 15)).toBe('2026-04-15')
  })
})

describe('expandRecurrences', () => {
  it('produces one occurrence per month between start and end', () => {
    const dates = expandRecurrences([rent], [], '2026-01-01', '2026-12-31').map((o) => o.paidOn)
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'])
  })

  it('respects the requested window', () => {
    const dates = expandRecurrences([rent], [], '2026-02-01', '2026-03-31').map((o) => o.paidOn)
    expect(dates).toEqual(['2026-02-28', '2026-03-31'])
  })

  it('skips an occurrence that was already paid', () => {
    const dates = expandRecurrences([rent], [paid('2026-02-28')], '2026-01-01', '2026-12-31').map((o) => o.paidOn)
    expect(dates).not.toContain('2026-02-28')
    expect(dates).toHaveLength(4)
  })

  it('builds virtual planned operations', () => {
    const [op] = expandRecurrences([rent], [], '2026-03-01', '2026-03-31')
    expect(op.id).toBe('rec:r1:2026-03-31')
    expect(op.status).toBe('planned')
    expect(op.recurrenceId).toBe('r1')
    expect(op.recurrenceDate).toBe('2026-03-31')
    expect(op.counterparty).toBe('ТОО Арендодатель')
    expect(isVirtual(op)).toBe(true)
  })

  it('an open-ended rule runs to the end of the window', () => {
    const open: CfoRecurrence = { ...rent, id: 'r2', dayOfMonth: 1, startsOn: '2026-01-01', endsOn: null }
    expect(expandRecurrences([open], [], '2026-01-01', '2026-03-31')).toHaveLength(3)
  })

  it('a mid-month start skips that month if the day already passed', () => {
    const late: CfoRecurrence = { ...rent, id: 'r3', dayOfMonth: 10, startsOn: '2026-01-15', endsOn: null }
    expect(expandRecurrences([late], [], '2026-01-01', '2026-02-28').map((o) => o.paidOn)).toEqual(['2026-02-10'])
  })
})
