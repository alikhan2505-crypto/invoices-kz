import { describe, it, expect } from 'vitest'
import {
  toolPath, toolUrl, toolAlternates, toolMetadata, toolsIndexPath, guidesIndexPath,
  formatIsoDate, formatTenge, toolJsonLd, toolLinkPath, TOOL_LANGS,
} from './index'
import { kontragentDict } from '@/app/tools/kontragent/dict'

describe('tools-i18n paths', () => {
  it('keeps ru on the historical unprefixed URL', () => {
    expect(toolPath('kontragent', 'ru')).toBe('/tools/kontragent')
    expect(toolPath('kontragent', 'kk')).toBe('/tools/kk/kontragent')
    expect(toolPath('kontragent', 'en')).toBe('/tools/en/kontragent')
    expect(toolUrl('kontragent', 'kk')).toBe('https://invoices.kz/tools/kk/kontragent')
  })

  it('lists every language plus x-default in hreflang', () => {
    expect(toolAlternates('schet')).toEqual({
      ru: 'https://invoices.kz/tools/schet',
      kk: 'https://invoices.kz/tools/kk/schet',
      en: 'https://invoices.kz/tools/en/schet',
      'x-default': 'https://invoices.kz/tools/schet',
    })
  })

  it('links schet and avr to their own language version (translated 14.10.2026)', () => {
    for (const slug of ['schet', 'avr']) {
      expect(toolLinkPath(slug, 'ru')).toBe(`/tools/${slug}`)
      expect(toolLinkPath(slug, 'kk')).toBe(`/tools/kk/${slug}`)
      expect(toolLinkPath(slug, 'en')).toBe(`/tools/en/${slug}`)
    }
  })

  it('links each language to its own tools index', () => {
    expect(toolsIndexPath('ru')).toBe('/tools')
    expect(toolsIndexPath('kk')).toBe('/tools/kk')
    expect(toolsIndexPath('en')).toBe('/tools/en')
    expect(guidesIndexPath('kk')).toBe('/guides/kk')
    expect(guidesIndexPath('en')).toBe('/guides')
  })
})

describe('toolMetadata', () => {
  it('canonicalises each language to itself with the same alternates', () => {
    for (const lang of TOOL_LANGS) {
      const m = toolMetadata('kontragent', lang, kontragentDict[lang].seo)
      expect(m.alternates?.canonical).toBe(toolUrl('kontragent', lang))
      expect(m.alternates?.languages).toEqual(toolAlternates('kontragent'))
      expect(String(m.title)).toMatch(/\| invoices\.kz$/)
      const og = m.openGraph as { url?: string; locale?: string; alternateLocale?: string[] }
      expect(og.url).toBe(toolUrl('kontragent', lang))
      expect(og.alternateLocale).toHaveLength(2)
      expect(og.alternateLocale).not.toContain(og.locale)
    }
  })

  it('keeps the ru title exactly as it was before the split', () => {
    const m = toolMetadata('kontragent', 'ru', kontragentDict.ru.seo)
    expect(m.title).toBe('Проверка контрагента по БИН — бесплатно, по данным КГД | invoices.kz')
  })
})

describe('formatting helpers', () => {
  it('turns ISO dates into dd.mm.yyyy and leaves the rest alone', () => {
    expect(formatIsoDate('1997-12-04')).toBe('04.12.1997')
    expect(formatIsoDate('1997-12-04T00:00:00+06:00')).toBe('04.12.1997')
    expect(formatIsoDate('04.12.1997')).toBe('04.12.1997')
    expect(formatIsoDate(null)).toBeNull()
  })

  it('formats tenge with grouped digits', () => {
    expect(formatTenge(1234567.4).replace(/\s/g, ' ')).toBe('1 234 567 ₸')
  })

  it('escapes < in JSON-LD', () => {
    expect(toolJsonLd('kontragent', 'en', '</script><b>', 'x')).not.toContain('<')
  })
})

describe('kontragent dictionary', () => {
  it('has the same keys in every language', () => {
    const keys = (o: object) => Object.keys(o).sort()
    expect(keys(kontragentDict.kk)).toEqual(keys(kontragentDict.ru))
    expect(keys(kontragentDict.en)).toEqual(keys(kontragentDict.ru))
  })

  it('translates known register statuses and passes unknown ones through', () => {
    expect(kontragentDict.kk.status('Зарегистрирован')).toBe('Тіркелген')
    expect(kontragentDict.en.status('Ликвидирован')).toBe('Liquidated')
    expect(kontragentDict.en.status('Что-то новое')).toBe('Что-то новое')
    expect(kontragentDict.ru.status('Зарегистрирован')).toBe('Зарегистрирован')
  })

  it('uses Kazakh terms, not Russian abbreviations, on the kk page', () => {
    const kk = JSON.stringify(kontragentDict.kk, (_k, v) => (typeof v === 'function' ? v('X', 'Y') : v))
    // \b не работает рядом с кириллицей в JS-regex без флага u — граница
    // слова своя: не буква ни с одной стороны. И без учёта регистра.
    expect(kk).not.toMatch(/(?<![а-яёәғқңөұүһі])(БИН|ИИН|НДС|КГД|ИП)(?![а-яёәғқңөұүһі])/i)
    expect(kk).toMatch(/БСН/)
    expect(kk).toMatch(/ҚҚС/)
  })
})
