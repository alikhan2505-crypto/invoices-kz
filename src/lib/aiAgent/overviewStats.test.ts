import { describe, it, expect } from 'vitest'
import { kzWindowStart, countNewLeadsSince, countWaitingForHuman, formatDialogWhen } from './overviewStats'

// 15.10.2026 12:00 по Алматы (UTC+5) = 07:00 UTC.
const NOW = Date.parse('2026-10-15T07:00:00.000Z')

describe('kzWindowStart', () => {
  it('starts 7 days back at KZ midnight, today included', () => {
    // 09.10 00:00 по Алматы = 08.10 19:00 UTC.
    expect(kzWindowStart(7, NOW).sinceIso).toBe('2026-10-08T19:00:00.000Z')
  })

  it('uses the KZ date, not the UTC date, right after KZ midnight', () => {
    // 16.10 00:30 по Алматы = 15.10 19:30 UTC -- в UTC ещё 15-е.
    const justAfterMidnight = Date.parse('2026-10-15T19:30:00.000Z')
    expect(kzWindowStart(1, justAfterMidnight).sinceIso).toBe('2026-10-15T19:00:00.000Z')
  })
})

describe('countNewLeadsSince', () => {
  const since = kzWindowStart(7, NOW).sinceIso
  it('counts only new leads created inside the window', () => {
    const items = [
      { leadStatus: 'new', createdAt: '2026-10-14T10:00:00.000Z' },      // в окне
      { leadStatus: 'new', createdAt: '2026-10-08T19:00:00.000Z' },      // ровно граница -- в окне
      { leadStatus: 'new', createdAt: '2026-10-08T18:59:59.000Z' },      // секундой раньше -- нет
      { leadStatus: 'new', createdAt: '2026-09-19T10:00:00.000Z' },      // старая -- нет
      { leadStatus: 'in_progress', createdAt: '2026-10-14T10:00:00.000Z' }, // не новая -- нет
    ]
    expect(countNewLeadsSince(items, since)).toBe(2)
  })
})

describe('countWaitingForHuman', () => {
  it('counts every paused conversation, not just the first five', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ pausedForHuman: i >= 5 }))
    expect(countWaitingForHuman(items)).toBe(7)
    expect(countWaitingForHuman(items.slice(0, 5))).toBe(0)
  })
})

describe('formatDialogWhen', () => {
  it('says today / yesterday in KZ time', () => {
    expect(formatDialogWhen('2026-10-15T04:05:00.000Z', NOW)).toBe('сегодня, 09:05')
    expect(formatDialogWhen('2026-10-14T13:30:00.000Z', NOW)).toBe('вчера, 18:30')
  })

  it('rolls over to the next KZ day before UTC midnight', () => {
    // 14.10 20:00 UTC = 15.10 01:00 по Алматы -- уже «сегодня».
    expect(formatDialogWhen('2026-10-14T20:00:00.000Z', NOW)).toBe('сегодня, 01:00')
  })

  it('shows a date for older dialogs and the year only when it differs', () => {
    const sameYear = formatDialogWhen('2026-09-19T09:15:00.000Z', NOW)
    expect(sameYear).toMatch(/^19 сент\.?, 14:15$/)
    const otherYear = formatDialogWhen('2025-12-31T10:00:00.000Z', NOW)
    expect(otherYear).toContain('2025')
    expect(otherYear.endsWith(', 15:00')).toBe(true)
  })

  it('does not crash on a bad timestamp', () => {
    expect(formatDialogWhen('not-a-date', NOW)).toBe('—')
  })
})
