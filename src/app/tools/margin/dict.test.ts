import { describe, it, expect } from 'vitest'
import { toolMetadata, toolAlternates, toolUrl, TOOL_LANGS } from '@/lib/tools-i18n'
import { KASPI_CATEGORY_COMMISSIONS } from '@/lib/kaspiShop/margin'
import { calculateMargin } from '@/lib/marginCalc'
import { marginDict } from './dict'
import { formatPercent, parseAmount } from './numbers'

describe('margin dictionary', () => {
  it('has the same keys in every language', () => {
    const keys = (o: object) => Object.keys(o).sort()
    for (const lang of ['kk', 'en'] as const) {
      expect(keys(marginDict[lang])).toEqual(keys(marginDict.ru))
      expect(keys(marginDict[lang].seo)).toEqual(keys(marginDict.ru.seo))
      expect(keys(marginDict[lang].fieldLabels)).toEqual(keys(marginDict.ru.fieldLabels))
      expect(keys(marginDict[lang].fieldHints)).toEqual(keys(marginDict.ru.fieldHints))
      expect(marginDict[lang].howItems).toHaveLength(marginDict.ru.howItems.length)
    }
  })

  it('keeps the ru head exactly as it was before the split', () => {
    const m = toolMetadata('margin', 'ru', marginDict.ru.seo)
    expect(m.title).toBe('Калькулятор маржи Kaspi — расчёт прибыли с продажи | invoices.kz')
    expect(m.alternates?.canonical).toBe('https://invoices.kz/tools/margin')
  })

  it('canonicalises each language to itself with hreflang to all three', () => {
    for (const lang of TOOL_LANGS) {
      const m = toolMetadata('margin', lang, marginDict[lang].seo)
      expect(m.alternates?.canonical).toBe(toolUrl('margin', lang))
      expect(m.alternates?.languages).toEqual(toolAlternates('margin'))
    }
  })

  it('names every Kaspi category in kk and en', () => {
    for (const lang of ['kk', 'en'] as const) {
      for (const c of KASPI_CATEGORY_COMMISSIONS) {
        expect(marginDict[lang].categoryNames[c.label], `${lang}: ${c.label}`).toBeTruthy()
      }
    }
  })

  it('uses Kazakh terms, not Russian abbreviations, on the kk page', () => {
    const kk = JSON.stringify(marginDict.kk, (_k, v) => (typeof v === 'function' ? v('X') : v))
    // categoryNames keys are the Russian Kaspi labels by design — check values only.
    const kkValues = kk.replace(/"[^"]*[а-яё][^"]*":/gi, '')
    // No word-boundary escape here: in a JS regex without the u flag it never fires next to Cyrillic.
    expect(kkValues).not.toMatch(/(^|[^а-яё])ИП([^а-яё]|$)|НДС|БИН|упрощ|себестоим|прибыль/i)
    expect(kkValues).toMatch(/ЖК/)
  })

  it('has no Kazakh-specific or Cyrillic letters in the en copy (except ₸ and category keys)', () => {
    const en = JSON.stringify({ ...marginDict.en, categoryNames: Object.values(marginDict.en.categoryNames) },
      (_k, v) => (typeof v === 'function' ? v('X') : v))
    expect(en).not.toMatch(/[а-яёәғқңөұүһі]/i)
  })
})

describe('margin number input', () => {
  it('reads comma decimals and space-grouped thousands', () => {
    expect(parseAmount('12,5')).toBe(12.5)
    expect(parseAmount('12.5')).toBe(12.5)
    expect(parseAmount('10 000')).toBe(10000)
    expect(parseAmount('10 000')).toBe(10000)
    expect(parseAmount('')).toBe(0)
    expect(parseAmount('abc')).toBe(0)
  })

  it('reads comma thousands on the en page, but keeps the comma decimal on ru/kk', () => {
    expect(parseAmount('10,000', 'en')).toBe(10000)
    expect(parseAmount('1,250,000', 'en')).toBe(1250000)
    expect(parseAmount('12,5', 'en')).toBe(12.5)
    expect(parseAmount('10,000', 'ru')).toBe(10)
    expect(parseAmount('12,500', 'kk')).toBe(12.5)
    // Both separators: the rightmost one is the decimal, on any language.
    expect(parseAmount('10,000.50', 'en')).toBe(10000.5)
    expect(parseAmount('10.000,50', 'ru')).toBe(10000.5)
    expect(parseAmount('1.250.000', 'ru')).toBe(1250000)
    // Pasted with a currency or percent sign.
    expect(parseAmount('10 000 ₸')).toBe(10000)
    expect(parseAmount('5000тг')).toBe(5000)
    expect(parseAmount('12,5 %')).toBe(12.5)
  })

  it('a comma-typed commission actually changes the result', () => {
    const base = { costPrice: 5000, sellPrice: 10000, deliveryCost: 800, taxPercent: 4, otherCosts: 200, monthlyUnits: 30 }
    const withComma = calculateMargin({ ...base, commissionPercent: parseAmount('12,5') })
    expect(withComma.commission).toBe(1250)
    expect(withComma.profitPerUnit).toBe(10000 - 5000 - 800 - 200 - 1250 - 400)
  })

  it('formats percent per language without a negative zero', () => {
    expect(formatPercent(12.5, 'ru')).toBe('12,5 %')
    expect(formatPercent(12.5, 'kk')).toBe('12,5 %')
    expect(formatPercent(12.5, 'en')).toBe('12.5%')
    expect(formatPercent(-0.04, 'ru')).toBe('0,0 %')
    expect(formatPercent(-7.36, 'en')).toBe('-7.4%')
  })
})
