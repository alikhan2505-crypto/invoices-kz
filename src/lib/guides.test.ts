import { describe, it, expect } from 'vitest'
import {
  GUIDES, getGuide, guideAlternates, guidesIndexAlternates, guideJsonLdData,
  guideMetaTitle, guidePublished, relatedGuidesOf, type GuideLang,
} from './guides'
import { LOCALIZED_TOOL_SLUGS } from './tools-i18n'
import { WAYBILLS_MONTH_LIMIT } from './toolQuota'
import { MAX_FILES, sheetCount } from '@/app/tools/waybills/uploads'

const LANGS: GuideLang[] = ['ru', 'kk']
const words = (s: string) => s.trim().split(/\s+/).length

describe('guides registry', () => {
  it('has unique slugs', () => {
    expect(new Set(GUIDES.map(g => g.slug)).size).toBe(GUIDES.length)
  })

  for (const lang of LANGS) {
    it(`${lang}: title <= 60 and description <= 155 characters`, () => {
      for (const g of GUIDES) {
        expect(g[lang].title.length, `${g.slug} title`).toBeLessThanOrEqual(60)
        expect(g[lang].description.length, `${g.slug} description`).toBeLessThanOrEqual(155)
      }
    })

    it(`${lang}: answer-first summary is 40-60 words (except where the article opens with its own)`, () => {
      for (const g of GUIDES) {
        const s = g[lang].summary
        if (g.slug === 'komissiya-kaspi') {
          expect(s).toBeUndefined()
          continue
        }
        expect(s, `${g.slug} summary`).toBeTruthy()
        expect(words(s!), `${g.slug} summary words`).toBeGreaterThanOrEqual(40)
        expect(words(s!), `${g.slug} summary words`).toBeLessThanOrEqual(60)
      }
    })

    it(`${lang}: no emoji in copy`, () => {
      const emoji = /\p{Extended_Pictographic}/u
      for (const g of GUIDES) {
        const c = g[lang]
        const all = [c.title, c.description, c.shortTitle, c.summary ?? '', ...(c.faq ?? []).flatMap(f => [f.q, f.a])]
        for (const s of all) expect(emoji.test(s), `${g.slug}: ${s}`).toBe(false)
      }
    })
  }

  it('keeps ru/kk parity of the FAQ', () => {
    for (const g of GUIDES) {
      expect((g.ru.faq ?? []).length, g.slug).toBe((g.kk.faq ?? []).length)
    }
  })

  it('related tools exist, related guides exist and never point at themselves', () => {
    for (const g of GUIDES) {
      expect(g.relatedTools.length, `${g.slug} tools`).toBeGreaterThan(0)
      for (const t of g.relatedTools) expect(LOCALIZED_TOOL_SLUGS, `${g.slug} -> ${t}`).toContain(t)
      for (const r of g.relatedGuides) {
        expect(getGuide(r), `${g.slug} -> ${r}`).toBeDefined()
        expect(r).not.toBe(g.slug)
      }
    }
  })

  it('every guide links the tools the brief asks for', () => {
    expect(getGuide('dokumenty-ip-kazakhstan')!.relatedTools).toEqual(expect.arrayContaining(['schet', 'avr', 'nakladnaya', 'kp']))
    expect(getGuide('kak-vystavit-schet-ip')!.relatedTools).toEqual(expect.arrayContaining(['schet', 'kontragent']))
    expect(getGuide('esf-kazakhstan-2026')!.relatedTools).toContain('schet')
    expect(getGuide('komissiya-kaspi')!.relatedTools).toEqual(expect.arrayContaining(['margin', 'waybills']))
  })
})

describe('guide nakladnye-kaspi-odnim-pdf', () => {
  const guide = getGuide('nakladnye-kaspi-odnim-pdf')!

  it('is registered with the agreed related tools and guides', () => {
    expect(guide).toBeDefined()
    expect(guide.relatedTools).toEqual(['waybills', 'margin'])
    expect(guide.relatedGuides).toEqual(['komissiya-kaspi', 'kak-vystavit-schet-ip'])
    expect(guide.updated).toBe('2026-10-23')
  })

  for (const lang of LANGS) {
    it(`${lang}: 4-5 FAQ items, each with a question and a non-trivial answer`, () => {
      const faq = guide[lang].faq ?? []
      expect(faq.length).toBeGreaterThanOrEqual(4)
      expect(faq.length).toBeLessThanOrEqual(5)
      for (const f of faq) {
        expect(f.q.trim().endsWith('?'), f.q).toBe(true)
        expect(words(f.a), f.q).toBeGreaterThanOrEqual(10)
      }
      expect(new Set(faq.map(f => f.q)).size).toBe(faq.length)
    })

    it(`${lang}: facts match the tool (30 files per merge, 5 free merges, 8 A4 sheets for 30)`, () => {
      const text = [guide[lang].summary ?? '', ...(guide[lang].faq ?? []).map(f => f.a)].join(' ')
      expect(text).toContain(String(MAX_FILES))
      expect(text).toContain(String(WAYBILLS_MONTH_LIMIT))
      expect(text).toContain(String(sheetCount(MAX_FILES, 'a4')))
    })
  }

  it('keeps the A4 / A6 split the tool actually has', () => {
    expect(sheetCount(30, 'a4')).toBe(8)
    expect(sheetCount(30, 'a6')).toBe(30)
  })

  it('the FAQ JSON-LD mirrors the visible Q&A exactly', () => {
    for (const lang of LANGS) {
      const graph = guideJsonLdData(guide, lang)['@graph'] as Record<string, unknown>[]
      const faq = graph.find(n => n['@type'] === 'FAQPage') as {
        mainEntity: { name: string; acceptedAnswer: { text: string } }[]
      }
      expect(faq.mainEntity.map(q => q.name)).toEqual(guide[lang].faq!.map(f => f.q))
      expect(faq.mainEntity.map(q => q.acceptedAnswer.text)).toEqual(guide[lang].faq!.map(f => f.a))
    }
  })

  it('has both language routes and hreflang alternates', () => {
    const a = guideAlternates(guide.slug)
    expect(a.ru).toBe('https://invoices.kz/guides/nakladnye-kaspi-odnim-pdf')
    expect(a.kk).toBe('https://invoices.kz/guides/kk/nakladnye-kaspi-odnim-pdf')
  })
})

describe('guideMetaTitle', () => {
  it('appends the brand only when the result fits 60 characters', () => {
    expect(guideMetaTitle('Короткий заголовок')).toBe('Короткий заголовок | invoices.kz')
    const long = 'x'.repeat(50)
    expect(guideMetaTitle(long)).toBe(long)
  })

  it('never produces a title above 60 characters for the registry', () => {
    for (const g of GUIDES) for (const lang of LANGS) {
      expect(guideMetaTitle(g[lang].title).length).toBeLessThanOrEqual(60)
    }
  })
})

describe('relatedGuidesOf', () => {
  it('returns the curated list, in order', () => {
    const g = getGuide('komissiya-kaspi')!
    expect(relatedGuidesOf(g).map(x => x.slug)).toEqual(g.relatedGuides)
  })

  it('falls back to every other guide when nothing is curated', () => {
    const g = { ...getGuide('komissiya-kaspi')!, relatedGuides: [] }
    expect(relatedGuidesOf(g)).toHaveLength(GUIDES.length - 1)
    expect(relatedGuidesOf(g).some(x => x.slug === g.slug)).toBe(false)
  })
})

describe('hreflang', () => {
  it('guide alternates carry ru, kk and x-default (= ru)', () => {
    const a = guideAlternates('komissiya-kaspi')
    expect(a.ru).toBe('https://invoices.kz/guides/komissiya-kaspi')
    expect(a.kk).toBe('https://invoices.kz/guides/kk/komissiya-kaspi')
    expect(a['x-default']).toBe(a.ru)
  })

  it('index alternates carry x-default', () => {
    expect(guidesIndexAlternates()['x-default']).toBe('https://invoices.kz/guides')
  })
})

describe('guideJsonLdData', () => {
  const guide = getGuide('kak-vystavit-schet-ip')!

  it('datePublished defaults to the last-edit date and is independent when set', () => {
    expect(guidePublished(guide)).toBe(guide.updated)
    const g2 = { ...guide, published: '2026-01-01' }
    const article = (guideJsonLdData(g2, 'ru')['@graph'] as Record<string, unknown>[])[0]
    expect(article.datePublished).toBe('2026-01-01')
    expect(article.dateModified).toBe(guide.updated)
  })

  it('author stays the Organization', () => {
    const article = (guideJsonLdData(guide, 'ru')['@graph'] as Record<string, unknown>[])[0]
    expect(article.author).toEqual({ '@id': 'https://invoices.kz/#organization' })
  })

  it('emits FAQPage only for guides with visible FAQ, from the same items', () => {
    for (const lang of LANGS) {
      const graph = guideJsonLdData(guide, lang)['@graph'] as Record<string, unknown>[]
      const faq = graph.find(n => n['@type'] === 'FAQPage') as { mainEntity: { name: string }[] }
      expect(faq.mainEntity.map(q => q.name)).toEqual(guide[lang].faq!.map(f => f.q))
    }
    const other = getGuide('komissiya-kaspi')!
    const graph = guideJsonLdData(other, 'ru')['@graph'] as Record<string, unknown>[]
    expect(graph.some(n => n['@type'] === 'FAQPage')).toBe(false)
  })
})
