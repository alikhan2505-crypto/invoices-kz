import { describe, expect, it } from 'vitest'
import { formatDate, formatDateSafe, formatDateTime, formatTime } from './date'

// Вне браузера форматтеры работают в Asia/Almaty (UTC+5).
describe('date formatting of DB timestamps', () => {
  it('reads a timestamp without time zone (UTC in the DB) as UTC', () => {
    expect(formatTime('2026-10-14T06:04:51.47424')).toBe('11:04')
    expect(formatDateTime('2026-10-14 06:04:51')).toContain('11:04')
  })

  it('keeps explicit offsets as they are', () => {
    expect(formatTime('2026-10-14T06:04:51+00:00')).toBe('11:04')
    expect(formatTime('2026-10-14T11:04:00+05:00')).toBe('11:04')
    expect(formatTime('2026-10-14T06:04:00Z')).toBe('11:04')
  })

  it('does not shift date-only values', () => {
    expect(formatDate('2026-10-17')).toContain('17')
  })

  it('a UTC late evening is already the next day in Almaty', () => {
    expect(formatDate('2026-09-30T20:30:00')).toContain('1 окт')
  })

  it('formatDateSafe returns free text unchanged', () => {
    expect(formatDateSafe('20082026')).toBe('20082026')
  })
})
