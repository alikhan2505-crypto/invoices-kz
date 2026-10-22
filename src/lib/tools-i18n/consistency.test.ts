import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import sitemap from '@/app/sitemap'
import { KASPI_CATEGORY_COMMISSIONS } from '@/lib/kaspiShop/margin'
import { avrDict } from '@/app/tools/avr/dict'
import { kontragentDict } from '@/app/tools/kontragent/dict'
import { kpDict } from '@/app/tools/kp/dict'
import { marginDict } from '@/app/tools/margin/dict'
import { nakladnayaDict } from '@/app/tools/nakladnaya/dict'
import { nalogiDict } from '@/app/tools/nalogi/dict'
import { schetDict } from '@/app/tools/schet/dict'
import { waybillsDict } from '@/app/tools/waybills/dict'
import {
  LOCALIZED_TOOL_SLUGS, TOOL_LANGS, isToolLocalized, toolAlternates, toolLinkPath,
  toolFaqJsonLd, toolMetadata, toolUrl, toolsIndexAlternates, toolsIndexUrl, TOOL_TITLE_MAX, type ToolLang, type ToolSeoCopy,
} from './index'
import { toolsIndexCards, toolsIndexDict, toolsIndexMetadata } from './toolsIndex'

// Сквозная проверка всех переведённых инструментов /tools и индекса: одна и
// та же структура, hreflang взаимный, sitemap полный, заголовки не
// повторяются, на kk/en в <head> нет русского. Если перевели новый
// инструмент — добавить его словарь в DICTS (тест ниже напомнит).

type SeoDict = Record<ToolLang, { seo: ToolSeoCopy; h1: string }>
const DICTS: Record<string, SeoDict> = {
  avr: avrDict,
  kontragent: kontragentDict,
  kp: kpDict,
  margin: marginDict,
  nakladnaya: nakladnayaDict,
  nalogi: nalogiDict,
  schet: schetDict,
  waybills: waybillsDict,
}

const ROOT = path.resolve(__dirname, '../../..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8')

// \b в JS-regex без флага u кириллицу за букву не считает — граница своя.
const NOT_LETTER_BEFORE = '(?<![A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі])'
const NOT_LETTER_AFTER = '(?![A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі])'
const RU_ABBR_ON_KK = new RegExp(`${NOT_LETTER_BEFORE}(БИН|ИИН|НДС|ИП|ТОО|АВР|КП|КГД|ЭСФ|БИК)${NOT_LETTER_AFTER}`)
const CYRILLIC = /[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/

const seoStrings = (d: { seo: ToolSeoCopy; h1: string }) =>
  [d.h1, d.seo.title, d.seo.description, d.seo.ogTitle, d.seo.ogDescription, d.seo.ogImageAlt]

describe('every localized tool', () => {
  it('has a dictionary registered here', () => {
    expect(Object.keys(DICTS).sort()).toEqual([...LOCALIZED_TOOL_SLUGS].sort())
  })

  for (const slug of LOCALIZED_TOOL_SLUGS) {
    it(`${slug}: three server pages with the right LANG and slug`, () => {
      for (const lang of TOOL_LANGS) {
        const file = lang === 'ru' ? `src/app/tools/${slug}/page.tsx` : `src/app/tools/${lang}/${slug}/page.tsx`
        const src = read(file)
        expect(src, file).not.toMatch(/^['"]use client['"]/m)
        expect(src, file).toContain(`const LANG = '${lang}' as const`)
        expect(src, file).toContain(`toolMetadata('${slug}', LANG`)
        expect(src, file).toContain(`<ToolJsonLd slug="${slug}" lang={LANG}`)
      }
      expect(fs.existsSync(path.join(ROOT, `src/app/tools/${slug}/layout.tsx`)), 'old metadata layout must be gone').toBe(false)
    })

    it(`${slug}: client tool has the language switch for its own slug`, () => {
      const dir = path.join(ROOT, `src/app/tools/${slug}`)
      const tool = fs.readdirSync(dir).find(f => /Tool\.tsx$/.test(f))
      expect(tool, `src/app/tools/${slug}/*Tool.tsx`).toBeTruthy()
      const src = fs.readFileSync(path.join(dir, tool!), 'utf-8')
      expect(src).toContain(`<ToolLangSwitch slug="${slug}" lang={lang} />`)
      expect(src).toContain('toolsIndexPath(lang)')
    })

    it(`${slug}: canonical is self, hreflang is the same reciprocal set on every language`, () => {
      for (const lang of TOOL_LANGS) {
        const m = toolMetadata(slug, lang, DICTS[slug][lang].seo)
        expect(m.alternates?.canonical).toBe(toolUrl(slug, lang))
        expect(m.alternates?.languages).toEqual(toolAlternates(slug))
      }
    })

    it(`${slug}: no Russian in the kk head, no Cyrillic in the en head`, () => {
      for (const s of seoStrings(DICTS[slug].kk)) expect(s).not.toMatch(RU_ABBR_ON_KK)
      for (const s of seoStrings(DICTS[slug].en)) expect(s).not.toMatch(CYRILLIC)
    })
  }

  it('titles are unique across tools and languages', () => {
    const titles = [
      ...Object.values(DICTS).flatMap(d => TOOL_LANGS.map(l => d[l].seo.title)),
      ...TOOL_LANGS.map(l => toolsIndexDict[l].seo.title),
    ]
    expect(new Set(titles).size).toBe(titles.length)
  })
})

describe('tools index', () => {
  it('lists the same tools in the same order on every language', () => {
    const slugs = (l: ToolLang) => toolsIndexCards(l).map(c => c.slug)
    expect(slugs('kk')).toEqual(slugs('ru'))
    expect(slugs('en')).toEqual(slugs('ru'))
    for (const s of LOCALIZED_TOOL_SLUGS) expect(slugs('ru')).toContain(s)
  })

  it('links every card to a page that exists', () => {
    for (const lang of TOOL_LANGS) {
      for (const c of toolsIndexCards(lang)) {
        const p = toolLinkPath(c.slug, lang)
        expect(fs.existsSync(path.join(ROOT, 'src/app', p, 'page.tsx')), p).toBe(true)
      }
    }
  })

  it('has its own page on every language with reciprocal hreflang', () => {
    for (const lang of TOOL_LANGS) {
      const file = lang === 'ru' ? 'src/app/tools/page.tsx' : `src/app/tools/${lang}/page.tsx`
      expect(read(file)).toContain(`toolsIndexMetadata('${lang}')`)
      const m = toolsIndexMetadata(lang)
      expect(m.alternates?.canonical).toBe(toolsIndexUrl(lang))
      expect(m.alternates?.languages).toEqual(toolsIndexAlternates())
    }
  })

  it('has no Russian on kk and no Cyrillic on en, ru-only cards are labelled', () => {
    const all = (l: ToolLang) => {
      const d = toolsIndexDict[l]
      return [d.h1, d.intro, d.ruOnly, d.guidesLink, ...seoStrings(d), ...d.groups.flatMap(g => [g.title, ...g.tools.flatMap(c => [c.title, c.text])])]
    }
    for (const s of all('kk')) expect(s).not.toMatch(RU_ABBR_ON_KK)
    for (const s of all('en')) expect(s).not.toMatch(CYRILLIC)
    expect(toolsIndexDict.kk.ruOnly).not.toBe('')
    expect(toolsIndexDict.en.ruOnly).not.toBe('')
  })
})

describe('sitemap', () => {
  const entries = sitemap()
  const byUrl = new Map(entries.map(e => [e.url, e]))

  it('lists every language of every localized tool with reciprocal hreflang', () => {
    for (const slug of LOCALIZED_TOOL_SLUGS) {
      for (const lang of TOOL_LANGS) {
        const e = byUrl.get(toolUrl(slug, lang))
        expect(e, toolUrl(slug, lang)).toBeTruthy()
        expect(e!.alternates?.languages).toEqual(toolAlternates(slug))
      }
    }
  })

  it('lists the tools index on every language', () => {
    for (const lang of TOOL_LANGS) {
      expect(byUrl.get(toolsIndexUrl(lang))?.alternates?.languages).toEqual(toolsIndexAlternates())
    }
  })

  it('lists every tool from the index, untranslated ones without hreflang', () => {
    for (const c of toolsIndexCards('ru')) {
      const e = byUrl.get(toolUrl(c.slug, 'ru'))
      expect(e, c.slug).toBeTruthy()
      if (!isToolLocalized(c.slug)) {
        expect(e!.alternates).toBeUndefined()
        expect(byUrl.has(toolUrl(c.slug, 'kk'))).toBe(false)
      }
    }
  })

  it('every hreflang target is itself in the sitemap', () => {
    for (const e of entries) {
      for (const u of Object.values(e.alternates?.languages ?? {})) {
        expect(byUrl.has(String(u)), `${e.url} -> ${u}`).toBe(true)
      }
    }
  })

  it('has no duplicate URLs', () => {
    expect(byUrl.size).toBe(entries.length)
  })
})

describe('search snippet limits (22.10.2026)', () => {
  const SLUGS = Object.keys(DICTS)

  it('every title (with the brand when it fits) is at most 60 characters and every description at most 155', () => {
    for (const slug of SLUGS) {
      for (const lang of TOOL_LANGS) {
        const m = toolMetadata(slug, lang, DICTS[slug][lang].seo)
        expect(String(m.title).length, `${slug}.${lang} title: ${m.title}`).toBeLessThanOrEqual(TOOL_TITLE_MAX)
        expect(String(m.description).length, `${slug}.${lang} description`).toBeLessThanOrEqual(155)
      }
    }
  })

  it('the tools index title and description obey the same limits on every language', () => {
    for (const lang of TOOL_LANGS) {
      const m = toolsIndexMetadata(lang)
      expect(String(m.title).length, `index.${lang} title: ${m.title}`).toBeLessThanOrEqual(TOOL_TITLE_MAX)
      expect(String(m.description).length, `index.${lang} description`).toBeLessThanOrEqual(155)
    }
  })

  it('schet, avr, nakladnaya and kp name «образец» / «үлгісі» / «template» in the title on every language', () => {
    const word = { ru: /образец/i, kk: /үлгіс/i, en: /template/i } as const
    for (const slug of ['schet', 'avr', 'nakladnaya', 'kp']) {
      for (const lang of TOOL_LANGS) {
        expect(DICTS[slug][lang].seo.title, `${slug}.${lang}`).toMatch(word[lang])
      }
    }
  })

  it('waybills leads with «объединить накладные Kaspi в один PDF» in title and description (Yandex query)', () => {
    const { title, description } = waybillsDict.ru.seo
    expect(title.startsWith('Объединить накладные Kaspi в один PDF')).toBe(true)
    expect(description.startsWith('Объединить накладные Kaspi в один PDF')).toBe(true)
  })
})

describe('FAQ on margin and waybills', () => {
  it('margin has 3-4 questions on every language and the page ships the matching FAQPage', () => {
    for (const lang of TOOL_LANGS) {
      const { faq } = marginDict[lang]
      expect(faq.length, lang).toBeGreaterThanOrEqual(3)
      expect(faq.length, lang).toBeLessThanOrEqual(4)
      const ld = JSON.parse(toolFaqJsonLd('margin', lang, faq))
      expect(ld.mainEntity.map((e: { name: string }) => e.name)).toEqual(faq.map(f => f.q))
      expect(ld.mainEntity.map((e: { acceptedAnswer: { text: string } }) => e.acceptedAnswer.text)).toEqual(faq.map(f => f.a))
    }
    expect(marginDict.kk.faq).toHaveLength(marginDict.ru.faq.length)
    expect(marginDict.en.faq).toHaveLength(marginDict.ru.faq.length)
  })

  it('margin FAQ commission answer quotes only rates that exist in KASPI_CATEGORY_COMMISSIONS', () => {
    const rates = new Set(KASPI_CATEGORY_COMMISSIONS.map(c => c.ratePercent))
    expect([...rates].sort((a, b) => a - b)).toEqual([7.3, 12.5, 15.5])
    for (const lang of TOOL_LANGS) {
      const a = marginDict[lang].faq[0].a
      for (const r of rates) expect(a, `${lang}: ${r}`).toContain(String(r).replace('.', lang === 'en' ? '.' : ','))
      // И наоборот: каждая дробная ставка в ответе есть в таблице.
      for (const m of a.matchAll(/(\d+[.,]\d+)%/g)) {
        expect(rates.has(Number(m[1].replace(',', '.'))), `${lang}: ${m[0]}`).toBe(true)
      }
    }
  })

  for (const slug of ['margin', 'waybills']) {
    it(`${slug}: all three pages render ToolFaqJsonLd from the same dictionary list the tool draws`, () => {
      for (const lang of TOOL_LANGS) {
        const file = lang === 'ru' ? `src/app/tools/${slug}/page.tsx` : `src/app/tools/${lang}/${slug}/page.tsx`
        expect(read(file), file).toContain(`<ToolFaqJsonLd slug="${slug}" lang={LANG} items={t.faq} />`)
      }
      const tool = slug === 'margin' ? 'MarginTool' : 'WaybillsTool'
      expect(read(`src/app/tools/${slug}/${tool}.tsx`)).toContain('t.faq.map(')
    })
  }

  it('waybills FAQ starts with the answer-first «how to merge» question and keeps the same length everywhere', () => {
    expect(waybillsDict.ru.faq[0].q).toBe('Как объединить накладные Kaspi в один PDF?')
    for (const lang of TOOL_LANGS) expect(waybillsDict[lang].faq).toHaveLength(waybillsDict.ru.faq.length)
  })
})

describe('guide links under the tools', () => {
  // Каждый инструмент ведёт на свой самый близкий гайд, а не на общий индекс /guides.
  const GUIDE: Record<string, string> = {
    schet: 'kak-vystavit-schet-ip',
    avr: 'dokumenty-ip-kazakhstan',
    nakladnaya: 'dokumenty-ip-kazakhstan',
    kp: 'dokumenty-ip-kazakhstan',
    kontragent: 'proverka-kontragenta',
    nalogi: 'nalogi-ip-uproshchenka-2026',
    margin: 'komissiya-kaspi',
  }
  const TOOL_FILE: Record<string, string> = {
    schet: 'SchetTool', avr: 'AvrTool', nakladnaya: 'NakladnayaTool', kp: 'KpTool',
    kontragent: 'KontragentTool', nalogi: 'NalogiTool', margin: 'MarginTool',
  }

  for (const [slug, guide] of Object.entries(GUIDE)) {
    it(`${slug} links to /guides/${guide} and not to the guides index`, () => {
      const src = read(`src/app/tools/${slug}/${TOOL_FILE[slug]}.tsx`)
      const dict = read(`src/app/tools/${slug}/dict.ts`)
      expect(src + dict).toContain(guide)
      expect(src).not.toContain('guidesIndexPath(lang)')
      expect(src).not.toContain('chrome.guides')
    })
  }

  it('every guide a tool points to exists in the Russian and Kazakh guide folders', () => {
    for (const guide of new Set(Object.values(GUIDE))) {
      expect(fs.existsSync(path.join(ROOT, `src/app/guides/${guide}/page.tsx`)), guide).toBe(true)
      expect(fs.existsSync(path.join(ROOT, `src/app/guides/kk/${guide}/page.tsx`)), `kk ${guide}`).toBe(true)
    }
  })

  it('every dictionary that links a guide has a non-empty label on every language', () => {
    const labels: Record<string, Record<ToolLang, string>> = {
      avr: { ru: avrDict.ru.guideLink, kk: avrDict.kk.guideLink, en: avrDict.en.guideLink },
      nakladnaya: { ru: nakladnayaDict.ru.guideLink, kk: nakladnayaDict.kk.guideLink, en: nakladnayaDict.en.guideLink },
      kp: { ru: kpDict.ru.guideLink, kk: kpDict.kk.guideLink, en: kpDict.en.guideLink },
      kontragent: { ru: kontragentDict.ru.guideLink, kk: kontragentDict.kk.guideLink, en: kontragentDict.en.guideLink },
      margin: { ru: marginDict.ru.guideLink, kk: marginDict.kk.guideLink, en: marginDict.en.guideLink },
    }
    for (const [slug, byLang] of Object.entries(labels)) {
      for (const lang of TOOL_LANGS) expect(byLang[lang].trim().length, `${slug}.${lang}`).toBeGreaterThan(5)
      expect(byLang.en, slug).not.toMatch(CYRILLIC)
    }
  })
})
