import { describe, it, expect } from 'vitest'
import {
  toolPath, toolUrl, toolAlternates, toolMetadata, toolsIndexPath, guidesIndexPath,
  formatIsoDate, formatTenge, toolJsonLd, toolLinkPath, TOOL_LANGS,
  toolTitle, toolFaqJsonLd, toolGuidePath, TOOL_TITLE_MAX,
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

  it('puts the brand after the title when the whole thing fits in 60 characters', () => {
    const m = toolMetadata('kontragent', 'ru', kontragentDict.ru.seo)
    expect(m.title).toBe('Проверка контрагента по БИН — бесплатно | invoices.kz')
  })
})

describe('toolTitle', () => {
  it('appends the brand only when the whole title still fits in the limit', () => {
    expect(toolTitle('Короткий заголовок')).toBe('Короткий заголовок | invoices.kz')
    const fits = 'x'.repeat(TOOL_TITLE_MAX - ' | invoices.kz'.length)
    expect(toolTitle(fits)).toBe(`${fits} | invoices.kz`)
    expect(toolTitle(fits)).toHaveLength(TOOL_TITLE_MAX)
    const tooLong = fits + 'y'
    expect(toolTitle(tooLong)).toBe(tooLong)
  })
})

describe('toolGuidePath', () => {
  it('sends kk to the Kazakh guide and ru/en to the Russian one', () => {
    expect(toolGuidePath('komissiya-kaspi', 'ru')).toBe('/guides/komissiya-kaspi')
    expect(toolGuidePath('komissiya-kaspi', 'kk')).toBe('/guides/kk/komissiya-kaspi')
    expect(toolGuidePath('komissiya-kaspi', 'en')).toBe('/guides/komissiya-kaspi')
  })
})

describe('toolFaqJsonLd', () => {
  const items = [{ q: 'Что такое <b>?', a: 'Ответ </script>' }, { q: 'Второй?', a: 'Да.' }]

  it('builds an FAQPage that mirrors the items one to one on the language URL', () => {
    const data = JSON.parse(toolFaqJsonLd('margin', 'kk', items))
    expect(data['@type']).toBe('FAQPage')
    expect(data['@id']).toBe('https://invoices.kz/tools/kk/margin#faq')
    expect(data.inLanguage).toBe('kk-KZ')
    expect(data.mainEntity).toHaveLength(2)
    expect(data.mainEntity[0].name).toBe(items[0].q)
    expect(data.mainEntity[0].acceptedAnswer.text).toBe(items[0].a)
  })

  it('is safe to inline in a script tag', () => {
    expect(toolFaqJsonLd('margin', 'ru', items)).not.toContain('<')
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
