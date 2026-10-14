import { describe, it, expect } from 'vitest'
import { toolMetadata, toolUrl, toolAlternates, TOOL_LANGS } from '@/lib/tools-i18n'
import { nalogiDict, nalogiFaqJsonLd } from './dict'

// Страховка языковых версий /tools/nalogi (схема — docs/tools-i18n-pattern.md).
const flatten = (o: unknown) =>
  JSON.stringify(o, (_k, v) => {
    if (typeof v !== 'function') return v
    const out = v('X', 'Y')
    return typeof out === 'object' ? `${out.pre}${out.b}${out.post}` : out
  })

describe('nalogi dictionary', () => {
  it('has the same keys in every language', () => {
    const keys = (o: object) => Object.keys(o).sort()
    expect(keys(nalogiDict.kk)).toEqual(keys(nalogiDict.ru))
    expect(keys(nalogiDict.en)).toEqual(keys(nalogiDict.ru))
    expect(nalogiDict.kk.faq).toHaveLength(nalogiDict.ru.faq.length)
    expect(nalogiDict.en.faq).toHaveLength(nalogiDict.ru.faq.length)
  })

  it('keeps the ru title exactly as it was before the split', () => {
    const m = toolMetadata('nalogi', 'ru', nalogiDict.ru.seo)
    expect(m.title).toBe('Калькулятор налогов ИП 2026 — упрощёнка 4% и взносы за себя | invoices.kz')
    expect(m.alternates?.canonical).toBe('https://invoices.kz/tools/nalogi')
  })

  it('canonicalises each language to itself with hreflang to all three', () => {
    for (const lang of TOOL_LANGS) {
      const m = toolMetadata('nalogi', lang, nalogiDict[lang].seo)
      expect(m.alternates?.canonical).toBe(toolUrl('nalogi', lang))
      expect(m.alternates?.languages).toEqual(toolAlternates('nalogi'))
    }
  })

  it('uses Kazakh terms, not Russian abbreviations, on the kk page', () => {
    const kk = flatten(nalogiDict.kk)
    expect(kk).not.toMatch(/БИН|НДС|КГД|\bИП\b|ИП |ОПВ|ВОСМС|МЗП|МРП|(^|[^А-ЯЁӘҒҚҢӨҰҮҺІа-яё])СО($|[^А-ЯЁӘҒҚҢӨҰҮҺІа-яё])/)
    for (const term of ['ЖК', 'МЗЖ', 'ЖМЗЖ', 'ӘА', 'МӘМС', 'ЕТЖ', 'АЕК', 'ҚҚС']) expect(kk).toContain(term)
  })

  it('has no Cyrillic in the English copy apart from the ₸ sign', () => {
    expect(flatten(nalogiDict.en)).not.toMatch(/[А-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/)
  })

  it('formats the effective rate with the language decimal separator', () => {
    expect(nalogiDict.ru.decimalSeparator).toBe(',')
    expect(nalogiDict.kk.decimalSeparator).toBe(',')
    expect(nalogiDict.en.decimalSeparator).toBe('.')
  })

  it('points the kk page to the Kazakh guide', () => {
    expect(nalogiDict.kk.guideHref).toBe('/guides/kk/nalogi-ip-uproshchenka-2026')
    expect(nalogiDict.ru.guideHref).toBe('/guides/nalogi-ip-uproshchenka-2026')
  })

  it('builds an escaped FAQPage JSON-LD that matches the visible questions', () => {
    for (const lang of TOOL_LANGS) {
      const raw = nalogiFaqJsonLd(lang)
      expect(raw).not.toContain('<')
      const data = JSON.parse(raw)
      expect(data['@type']).toBe('FAQPage')
      expect(data.mainEntity.map((q: { name: string }) => q.name)).toEqual(nalogiDict[lang].faq.map(f => f.q))
    }
  })
})
