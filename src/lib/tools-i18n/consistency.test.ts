import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import sitemap from '@/app/sitemap'
import { kontragentDict } from '@/app/tools/kontragent/dict'
import { kpDict } from '@/app/tools/kp/dict'
import { marginDict } from '@/app/tools/margin/dict'
import { nakladnayaDict } from '@/app/tools/nakladnaya/dict'
import { nalogiDict } from '@/app/tools/nalogi/dict'
import { waybillsDict } from '@/app/tools/waybills/dict'
import {
  LOCALIZED_TOOL_SLUGS, TOOL_LANGS, isToolLocalized, toolAlternates, toolLinkPath,
  toolMetadata, toolUrl, toolsIndexAlternates, toolsIndexUrl, type ToolLang, type ToolSeoCopy,
} from './index'
import { toolsIndexCards, toolsIndexDict, toolsIndexMetadata } from './toolsIndex'

// Сквозная проверка всех переведённых инструментов /tools и индекса: одна и
// та же структура, hreflang взаимный, sitemap полный, заголовки не
// повторяются, на kk/en в <head> нет русского. Если перевели новый
// инструмент — добавить его словарь в DICTS (тест ниже напомнит).

type SeoDict = Record<ToolLang, { seo: ToolSeoCopy; h1: string }>
const DICTS: Record<string, SeoDict> = {
  kontragent: kontragentDict,
  kp: kpDict,
  margin: marginDict,
  nakladnaya: nakladnayaDict,
  nalogi: nalogiDict,
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
