import { describe, it, expect } from 'vitest'
import { formatWithWeekday, buildSalonBlock } from './salonContext'

// Cross-checked against Intl's own independent weekday calculation (a
// completely separate code path from this file's WEEKDAY_RU table) rather
// than hardcoding "18.09.2026 is a Friday" from memory -- the live bug
// this test guards against (18.09.2026: the model was asked to book
// "пятница" and answered with a date that wasn't a Friday at all) was
// exactly a case of trusting arithmetic/memory instead of a real
// calendar.
function intlWeekdayRu(d: Date): string {
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'long', timeZone: 'UTC' }).format(d)
}

describe('formatWithWeekday', () => {
  it('agrees with Intl\'s own weekday calculation across a full week', () => {
    const start = Date.UTC(2026, 8, 14) // arbitrary anchor, a Monday per the calendar -- verified below against Intl, not assumed
    for (let i = 0; i < 7; i++) {
      const d = new Date(start + i * 24 * 60 * 60 * 1000)
      const [, ours] = formatWithWeekday(d).match(/\((.+)\)/)!
      expect(ours).toBe(intlWeekdayRu(d))
    }
  })

  it('formats as YYYY-MM-DD (weekday)', () => {
    const d = new Date(Date.UTC(2026, 8, 18))
    expect(formatWithWeekday(d)).toBe(`2026-09-18 (${intlWeekdayRu(d)})`)
  })
})

describe('buildSalonBlock', () => {
  it('includes the current time (not just a bare date) and a 14-day date/weekday lookup table', () => {
    const block = buildSalonBlock({
      siteId: 'x', name: 'Тест', services: [], masters: [], masterCategories: [], upcomingBookings: [],
    })
    expect(block).toContain('Сейчас:')
    // HH:MM right after the weekday parens -- live incident 18.09.2026:
    // a bare date with no time let the model confirm a same-day slot
    // that had already passed hours earlier.
    expect(block).toMatch(/Сейчас: \d{4}-\d{2}-\d{2} \([а-яё]+\), \d{2}:\d{2}/)
    expect(block).toContain('Даты на ближайшие две недели')
    // 14 entries, each carrying a weekday in parens -- a coarse but honest
    // check that the lookup table actually has 14 rows, not e.g. 1.
    expect(block.match(/\([а-яё]+\)/g)?.length).toBe(15) // 14 table rows + 1 for "Сейчас:"
  })
})
