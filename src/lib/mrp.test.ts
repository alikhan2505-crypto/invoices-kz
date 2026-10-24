import { describe, it, expect } from 'vitest'
import {
  MRP_2026, MZP_2026, MRP_CHECKED, MRP_CONVERSION_STEPS, MRP_GUIDE,
  SIMPLIFIED_INCOME_LIMIT_MRP, SIMPLIFIED_INCOME_LIMIT_TENGE,
  VAT_REGISTRATION_THRESHOLD_MRP, VAT_REGISTRATION_THRESHOLD_TENGE,
  formatNumber, formatTenge, mrpConversionRows, mrpToTenge,
} from './mrp'
import { MRP_2026 as IP_TAXES_MRP, MZP_2026 as IP_TAXES_MZP } from './ipTaxes'
import { getGuide, GUIDES } from './guides'
import { buildLlmsTxt } from './llmsTxt'
import { LOCALIZED_TOOL_SLUGS } from './tools-i18n'

const words = (s: string) => s.trim().split(/\s+/).length
const NBSP = ' '

describe('МРП 2026: константы', () => {
  it('значения совпадают с Законом № 239-VIII, ст. 7 (МРП 4 325, МЗП 85 000)', () => {
    expect(MRP_2026).toBe(4325)
    expect(MZP_2026).toBe(85000)
  })

  it('совпадают с константами калькулятора налогов ИП (ipTaxes.ts)', () => {
    expect(MRP_2026).toBe(IP_TAXES_MRP)
    expect(MZP_2026).toBe(IP_TAXES_MZP)
  })

  it('пороги НК: 600 000 МРП и 10 000 МРП', () => {
    expect(SIMPLIFIED_INCOME_LIMIT_MRP).toBe(600_000)
    expect(VAT_REGISTRATION_THRESHOLD_MRP).toBe(10_000)
    expect(SIMPLIFIED_INCOME_LIMIT_TENGE).toBe(2_595_000_000)
    expect(VAT_REGISTRATION_THRESHOLD_TENGE).toBe(43_250_000)
  })
})

describe('пересчёт МРП в тенге', () => {
  it('точные значения таблицы', () => {
    const expected: Record<number, number> = {
      1: 4_325, 5: 21_625, 10: 43_250, 14: 60_550, 25: 108_125, 30: 129_750,
      100: 432_500, 200: 865_000, 500: 2_162_500, 1000: 4_325_000, 10_000: 43_250_000,
    }
    const rows = mrpConversionRows()
    expect(rows.map(r => r.mrp)).toEqual([1, 5, 10, 14, 25, 30, 100, 200, 500, 1000, 10_000])
    for (const r of rows) expect(r.tenge, `${r.mrp} МРП`).toBe(expected[r.mrp])
  })

  it('каждая строка = число × константа, без накопления ошибки', () => {
    for (const n of MRP_CONVERSION_STEPS) expect(mrpToTenge(n)).toBe(n * MRP_2026)
  })

  it('принимает другой размер МРП и ноль', () => {
    expect(mrpToTenge(100, 3_932)).toBe(393_200)
    expect(mrpToTenge(0)).toBe(0)
  })
})

describe('форматирование', () => {
  it('группирует тысячи неразрывным пробелом', () => {
    expect(formatNumber(4325)).toBe(`4${NBSP}325`)
    expect(formatNumber(999)).toBe('999')
    expect(formatNumber(2_595_000_000)).toBe(`2${NBSP}595${NBSP}000${NBSP}000`)
    expect(formatTenge(60_550)).toBe(`60${NBSP}550${NBSP}₸`)
  })
})

describe('запись в реестре гайдов', () => {
  const guide = getGuide('mrp-2026')!

  it('зарегистрирована, видна в реестре, который питает sitemap и индекс', () => {
    expect(guide).toBeDefined()
    expect(guide).toBe(MRP_GUIDE)
    expect(GUIDES.filter(g => g.slug === 'mrp-2026')).toHaveLength(1)
    expect(guide.updated).toBe(MRP_CHECKED)
  })

  it('связи: инструменты nalogi и schet, гайд про налоги ИП', () => {
    expect(guide.relatedTools).toEqual(expect.arrayContaining(['nalogi', 'schet']))
    for (const t of guide.relatedTools) expect(LOCALIZED_TOOL_SLUGS).toContain(t)
    expect(guide.relatedGuides).toContain('nalogi-ip-uproshchenka-2026')
    for (const r of guide.relatedGuides) expect(getGuide(r), r).toBeDefined()
  })

  for (const lang of ['ru', 'kk'] as const) {
    it(`${lang}: title <= 60, description <= 155, summary 40-60 слов, 4-5 FAQ с ответами >= 10 слов`, () => {
      const c = guide[lang]
      expect(c.title.length).toBeLessThanOrEqual(60)
      expect(c.description.length).toBeLessThanOrEqual(155)
      expect(words(c.summary!)).toBeGreaterThanOrEqual(40)
      expect(words(c.summary!)).toBeLessThanOrEqual(60)
      const faq = c.faq!
      expect(faq.length).toBeGreaterThanOrEqual(4)
      expect(faq.length).toBeLessThanOrEqual(5)
      for (const f of faq) {
        expect(f.q.trim().endsWith('?'), f.q).toBe(true)
        expect(words(f.a), f.q).toBeGreaterThanOrEqual(10)
      }
    })

    it(`${lang}: без длинных и средних тире и эмодзи, числа берутся из констант`, () => {
      const c = guide[lang]
      const all = [c.title, c.description, c.shortTitle, c.summary!, ...c.faq!.flatMap(f => [f.q, f.a])]
      const text = all.join(' ')
      expect(text).not.toMatch(/[–—]/)
      expect(/\p{Extended_Pictographic}/u.test(text)).toBe(false)
      expect(c.summary!).toContain(formatNumber(MRP_2026))
      expect(c.summary!).toContain(formatNumber(SIMPLIFIED_INCOME_LIMIT_TENGE))
      expect(c.faq!.map(f => f.a).join(' ')).toContain(formatNumber(VAT_REGISTRATION_THRESHOLD_TENGE))
      expect(c.faq!.map(f => f.a).join(' ')).toContain(formatNumber(mrpToTenge(100)))
    })
  }

  it('llms.txt содержит гайд при любом значении флага', () => {
    expect(buildLlmsTxt(false)).toContain('https://invoices.kz/guides/mrp-2026')
    expect(buildLlmsTxt(true)).toContain('https://invoices.kz/guides/mrp-2026')
  })
})
