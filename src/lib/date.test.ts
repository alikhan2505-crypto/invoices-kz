import { describe, expect, it } from 'vitest'
import { dateLocale, formatDate, formatDateNumeric, formatDateSafe, formatDateTime, formatTime } from './date'

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

describe('formatDateNumeric', () => {
  it('prints DD.MM.YYYY, reading a DB timestamp without zone as UTC', () => {
    expect(formatDateNumeric('2026-11-13T10:00:00')).toBe('13.11.2026')
    // 21:00 UTC on the 13th is already the 14th in Almaty (UTC+5).
    expect(formatDateNumeric('2026-11-13 21:00:00')).toBe('14.11.2026')
  })
})

describe('formatDate with the UI language', () => {
  it('defaults to Russian, unchanged', () => {
    expect(formatDate('2026-10-20')).toBe(formatDate('2026-10-20', 'ru'))
    expect(formatDate('2026-10-20', 'ru')).toMatch(/окт/)
  })
  it('prints English month names in en', () => {
    const out = formatDate('2026-10-20', 'en')
    expect(out).toMatch(/Oct/)
    expect(out).not.toMatch(/[а-яё]/i)
  })
  it('prints Kazakh month names in kk', () => {
    const out = formatDate('2026-10-20', 'kk')
    expect(out).toBe('20 қаз. 2026 ж.')
  })
  it('kk date-time has no Intl fallback junk and keeps the Almaty hour', () => {
    expect(formatDateTime('2026-10-14 06:04:51', 'kk')).toBe('14 қаз. 2026 ж., 11:04')
    expect(formatDateTime('2026-10-15 18:38:00', 'kk')).toBe('15 қаз. 2026 ж., 23:38')
  })
  it('keeps the Almaty day boundary in every language', () => {
    expect(formatDate('2026-09-30T20:30:00', 'en')).toMatch(/^1 Oct/)
  })
  it('formatDateTime and formatDateSafe follow the language too', () => {
    expect(formatDateTime('2026-10-14 06:04:51', 'en')).toMatch(/Oct/)
    expect(formatDateTime('2026-10-14 06:04:51', 'en')).toContain('11:04')
    expect(formatDateSafe('2026-10-20', 'en')).toMatch(/Oct/)
    expect(formatDateSafe('20082026', 'en')).toBe('20082026')
  })
  it('maps languages to locales', () => {
    expect(dateLocale('ru')).toBe('ru-KZ')
    expect(dateLocale('kk')).toBe('kk-KZ')
    expect(dateLocale('en')).toBe('en-GB')
  })
})
