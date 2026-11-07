import { describe, it, expect } from 'vitest'
import { toolMetadata, toolAlternates, toolUrl, TOOL_LANGS } from '@/lib/tools-i18n'
import { KASPI_CATEGORY_COMMISSIONS, KASPI_DELIVERY_DIRECTIONS } from '@/lib/kaspiShop/margin'
import { KASPI_DELIVERY } from '@/lib/kaspiTariff'
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
    expect(m.title).toBe('Калькулятор маржи Kaspi — прибыль с продажи | invoices.kz')
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

describe('margin dictionary: sale type and Kaspi delivery grid (05.11.2026)', () => {
  const langs = ['ru', 'kk', 'en'] as const
  const keys = (o: object) => Object.keys(o).sort()

  it('has the same nested keys in every language', () => {
    for (const lang of langs) {
      expect(keys(marginDict[lang].saleTypeNames), lang).toEqual(['promo', 'promo24', 'regular'])
      expect(keys(marginDict[lang].deliveryDirections), lang).toEqual([...KASPI_DELIVERY_DIRECTIONS, 'custom'].sort())
      expect(keys(marginDict[lang].deliveryTierNames), lang).toEqual(keys(marginDict.ru.deliveryTierNames))
    }
  })

  it('names every row of the Kaspi grid in every language, ru and kk exactly as in the guide table', () => {
    const rows = [...KASPI_DELIVERY.underThreshold, ...KASPI_DELIVERY.fromThreshold]
    expect(rows).toHaveLength(10)
    for (const lang of langs) {
      for (const r of rows) {
        const name = marginDict[lang].deliveryTierNames[r.id]
        expect(name, `${lang}: ${r.id}`).toBeTruthy()
        if (lang !== 'en') expect(name).toBe(r[lang])
      }
    }
  })

  it('every new string is non-empty and has no long dash in user-visible text', () => {
    for (const lang of langs) {
      const t = marginDict[lang]
      const strings = [
        t.saleTypeLabel, ...Object.values(t.saleTypeNames), t.saleTypeNote, t.promoNote, t.promoUnknownRate,
        t.surchargeLabel, t.surchargeHint, t.weightLabel, t.weightHint, t.weightAssumedNote, t.vatLabel, t.vatHint,
        t.expressNote, t.customDeliveryHint, ...Object.values(t.deliveryDirections), ...Object.values(t.deliveryTierNames),
        t.commissionSumLine('13,0 %', '1,0 %', '14,0 %'),
        t.deliveryQuoteLine({ direction: 'x', tier: 'y', basis: 'amount', net: '1', total: '2', withVat: true }),
      ]
      for (const str of strings) {
        expect(str.trim().length, lang).toBeGreaterThan(0)
        expect(str, `${lang}: ${str}`).not.toContain('—')
        expect(str, `${lang}: ${str}`).not.toContain('undefined')
      }
    }
  })

  it('states the facts the research found: no extra fee for Red/credit/other bank, 0-0-24 only in the cabinet, Express per warehouse', () => {
    for (const lang of langs) {
      const t = marginDict[lang]
      expect(t.saleTypeNote, lang).toContain('0-0-3/6/12')
      expect(t.saleTypeNote, lang).toMatch(/05\.01\.2026|5 January 2026/)
      expect(t.surchargeHint, lang).toMatch(lang === 'en' ? /Marketing/ : /Маркетинг/)
      expect(t.surchargeLabel, lang).toContain('0-0-24')
      expect(t.promoNote, lang).toMatch(/13[.,]0.*7[.,]7.*16[.,]1/)
      expect(t.vatLabel, lang).toContain('16%')
    }
    expect(marginDict.ru.expressNote).toContain('каждый склад')
    expect(marginDict.kk.expressNote).toContain('әр қойма')
    expect(marginDict.en.expressNote).toContain('each warehouse')
  })

  it('the one-line tariff quote shows the net price, and the VAT total only when VAT is on', () => {
    for (const lang of langs) {
      const q = marginDict[lang].deliveryQuoteLine
      const withVat = q({ direction: 'D', tier: 'T', basis: 'weight', net: '1 099 ₸', total: '1 275 ₸', withVat: true })
      const without = q({ direction: 'D', tier: 'T', basis: 'weight', net: '1 099 ₸', total: '1 275 ₸', withVat: false })
      expect(withVat, lang).toContain('1 099 ₸')
      expect(withVat, lang).toContain('1 275 ₸')
      expect(without, lang).toContain('1 099 ₸')
      expect(without, lang).not.toContain('1 275 ₸')
    }
  })

  it('the promo copy tells the seller to check the rate in the seller account and that the field is editable (review 05.11)', () => {
    const where = { ru: /Маркетинг → Акции Магазина/, kk: /Маркетинг → Дүкен акциялары/, en: /Marketing → Shop promos/ }
    for (const lang of langs) {
      const t = marginDict[lang]
      expect(t.promoNote, `${lang} promoNote`).toMatch(where[lang])
      const promoItem = t.howItems.find(i => /13[.,]0.*7[.,]7.*16[.,]1/.test(i))
      expect(promoItem, `${lang} howItems promo item`).toBeTruthy()
      expect(promoItem, `${lang} howItems promo item`).toMatch(where[lang])
      expect(promoItem, lang).not.toContain('—')
      expect(t.promoNote, lang).not.toContain('—')
    }
    expect(marginDict.ru.promoNote).toContain('таблицы акций')
    expect(marginDict.en.promoNote).toContain('editable')
  })

  it('"How it is calculated" says the floor price uses the tariff for the price itself, in every language', () => {
    const marker = { ru: 'для самой этой цены', kk: 'дәл сол бағаға сәйкес', en: 'for that price itself' }
    for (const lang of langs) {
      const item = marginDict[lang].howItems.find(i => i.includes(marker[lang]))
      expect(item, lang).toBeTruthy()
      expect(item, lang).not.toContain('—')
    }
  })

  it('the quoted promo rates in the copy are the ones in the table', () => {
    const promo = KASPI_CATEGORY_COMMISSIONS.map(c => c.promoRatePercent)
    expect([...new Set(promo)].sort((a, b) => a - b)).toEqual([7.7, 13, 16.1])
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
