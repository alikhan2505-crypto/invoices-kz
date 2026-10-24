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
    expect(m.title).toBe('Калькулятор налогов ИП 2026 — упрощёнка 4% | invoices.kz')
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

  it('explains the two SO readings in every language: GFSS is the main one, the law text is the second', () => {
    for (const lang of TOOL_LANGS) {
      const n = nalogiDict[lang].soNote
      expect(n.title.length).toBeGreaterThan(10)
      const other = n.other('15 000', '61 450', '1 500', '9 000')
      for (const v of ['15 000', '61 450', '1 500', '9 000']) expect(other).toContain(v)
      expect(n.reason).toContain('245')
      expect(n.reason).toMatch(lang === 'en' ? /17 March 2026 and 4 May 2026/ : /17\.03\.2026.*04\.05\.2026/)
      expect(n.corridor).toContain('595 000')
      expect(nalogiDict[lang].formula.soAfterOpv('300 000', '30 000')).toContain('30 000')
    }
  })

  it('names the fund in full the first time: ru and kk long names, en long name', () => {
    expect(nalogiDict.ru.soNote.reason).toContain('Государственного фонда социального страхования (ГФСС)')
    expect(nalogiDict.kk.soNote.reason).toContain('Мемлекеттік әлеуметтік сақтандыру қоры (ГФСС)')
    expect(nalogiDict.en.soNote.reason).toContain('State Social Insurance Fund (GFSS)')
  })

  it('the refund advice is soft: no "safe" claim, points to the fund or an accountant', () => {
    expect(nalogiDict.ru.soNote.advice).toContain('подлежит возврату по заявлению')
    expect(nalogiDict.ru.soNote.advice).toContain('ГФСС')
    for (const lang of TOOL_LANGS) {
      expect(nalogiDict[lang].soNote.advice).not.toMatch(/безопасно|қауіпсіз|safe/i)
    }
    expect(nalogiDict.ru.soNote.other('A', 'B', 'C', 'D')).toContain('по буквальному тексту закона')
  })

  it('new SO prose has no em or en dashes and the English one has no hyphen-as-dash', () => {
    for (const lang of TOOL_LANGS) {
      const n = nalogiDict[lang].soNote
      const text = JSON.stringify(Object.values(n).map(v => (typeof v === 'function' ? v('X', 'Y', 'Z', 'W') : v)))
      expect(text).not.toMatch(/[‒-―−]/)
    }
    const en = JSON.stringify(Object.values(nalogiDict.en.soNote).map(v => (typeof v === 'function' ? v('X', 'Y', 'Z', 'W') : v)))
    expect(en).not.toMatch(/ - /)
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
