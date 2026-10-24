import { describe, expect, it } from 'vitest'
import {
  KASPI_TARIFF_CHECKED,
  KASPI_TARIFF_EFFECTIVE,
  NBK_BIK_CHECKED,
  SEO_TARIFF_BIK_LIVE,
  formatKkDate,
  formatRuDate,
} from './seoLaunch'

describe('seoLaunch', () => {
  it('is on: the founder approved publishing the pages', () => {
    expect(SEO_TARIFF_BIK_LIVE).toBe(true)
  })

  it('formats Russian dates', () => {
    expect(formatRuDate(KASPI_TARIFF_CHECKED)).toBe('23 октября 2026')
    expect(formatRuDate(KASPI_TARIFF_EFFECTIVE)).toBe('5 января 2026')
    expect(formatRuDate(NBK_BIK_CHECKED)).toBe('23 октября 2026')
  })

  it('formats Kazakh dates', () => {
    expect(formatKkDate(KASPI_TARIFF_CHECKED)).toBe('2026 жылғы 23 қазан')
    expect(formatKkDate(KASPI_TARIFF_EFFECTIVE)).toBe('2026 жылғы 5 қаңтар')
  })

  it('rejects malformed dates', () => {
    expect(() => formatRuDate('23.10.2026')).toThrow()
    expect(() => formatKkDate('2026-13-01')).toThrow()
  })
})
