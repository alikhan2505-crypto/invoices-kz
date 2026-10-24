import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BIK_BANK_PAGES, BIK_ROWS, type BikLang } from '@/lib/bikRegistry'
import { SEO_TARIFF_BIK_LIVE } from '@/lib/seoLaunch'
import { bankText, hubText, paraText, type FaqItem, type Para } from './bikContent'
import { bankJsonLd, hubJsonLd } from './bikJsonLd'
import { bankMetadata, bikRobots, hubMetadata } from './bikMeta'
import BikHubPage from './BikHubPage'
import BikBankPage from './BikBankPage'

const LANGS: BikLang[] = ['ru', 'kk']
const DASH = /[—–]/
const EMOJI = /\p{Extended_Pictographic}/u
const words = (s: string) => s.trim().split(/\s+/).length
// Visible prose of rendered HTML: no JSON-LD, and no aria-label of the shared logo link.
const visible = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/aria-label="[^"]*"/g, '')

function paras(list: Para[]): string[] {
  return list.map(paraText)
}
function faqText(faq: FaqItem[]): string[] {
  return faq.flatMap(f => [f.q, f.a])
}

function allHubStrings(lang: BikLang): string[] {
  const t = hubText(lang)
  return [
    t.title, t.description, t.keywords, t.summary,
    t.whatIs.h2, ...paras(t.whatIs.paras),
    t.banks.h2, t.banks.intro, ...Object.values(t.banks.head), t.banks.confirmBoth, t.banks.confirmNbk,
    t.others.h2, t.others.intro, ...Object.values(t.others.head),
    t.renames.h2, ...paras(t.renames.paras),
    t.check.h2, ...paras(t.check.paras),
    t.source.h2, ...paras(t.source.paras),
    ...faqText(t.faq),
  ]
}

function allBankStrings(slug: string, lang: BikLang): string[] {
  const row = BIK_BANK_PAGES.find(r => r.slug === slug)!
  const t = bankText(row, lang)
  return [
    t.title, t.description, t.keywords, t.summary, t.detailsH2,
    ...t.rows.flatMap(r => [r.label, r.value]),
    t.detailsNote, t.howToH2, ...paras(t.howTo),
    ...(t.extras ? [t.extras.h2, ...paras(t.extras.paras)] : []),
    t.sourceH2, ...paras(t.sources), t.sourceAdvice, ...faqText(t.faq),
  ]
}

describe('bik hub copy', () => {
  for (const lang of LANGS) {
    const t = hubText(lang)

    it(`${lang}: no em/en dashes and no emoji anywhere in the copy`, () => {
      for (const s of allHubStrings(lang)) {
        expect(DASH.test(s), s).toBe(false)
        expect(EMOJI.test(s), s).toBe(false)
      }
    })

    it(`${lang}: meta title fits ~60 chars, description <= 155, summary 40-60 words`, () => {
      expect(t.title.length).toBeLessThanOrEqual(60)
      expect(t.description.length).toBeLessThanOrEqual(155)
      expect(words(t.summary)).toBeGreaterThanOrEqual(40)
      expect(words(t.summary)).toBeLessThanOrEqual(60)
    })

    it(`${lang}: carries the NBK source, the retrieval date and never says «актуально на»`, () => {
      const joined = allHubStrings(lang).join('\n')
      expect(joined).toContain('nationalbank.kz')
      // The only allowed mention is the sentence explaining why we do NOT write it.
      expect(joined.replace('а не «актуально на»', '')).not.toMatch(/актуально на/i)
      expect(joined).toMatch(lang === 'kk' ? /2026 жылғы 23 қазан/ : /23 октября 2026/)
    })

    it(`${lang}: does not claim the IBAN positions 5-7 rule`, () => {
      const joined = allHubStrings(lang).join('\n')
      expect(joined).not.toMatch(/5[-‐]7|позици|позиц/i)
      // It says the opposite: no rule on the NBK page, we do not use it.
      expect(t.faq.some(f => /ИИК|ЖСК/.test(f.q))).toBe(true)
    })

    it(`${lang}: no unconfirmed claims (SWIFT property, rankings, bank-app how-to)`, () => {
      const joined = allHubStrings(lang).join('\n')
      expect(joined).not.toMatch(/swiftCode|в приложении|қосымшада|лучший|топ-/i)
    })

    it(`${lang}: JSON-LD is built from visible text and avoids swiftCode/sameAs`, () => {
      const ld = JSON.stringify(hubJsonLd(lang))
      expect(ld).not.toContain('swiftCode')
      expect(ld).not.toContain('sameAs')
      const graph = (hubJsonLd(lang) as { '@graph': Record<string, unknown>[] })['@graph']
      const types = graph.map(g => g['@type'])
      expect(types).toEqual(['CollectionPage', 'ItemList', 'BreadcrumbList', 'FAQPage'])
      const faq = graph.find(g => g['@type'] === 'FAQPage') as { mainEntity: { name: string }[] }
      expect(faq.mainEntity.map(q => q.name)).toEqual(t.faq.map(f => f.q))
      const list = graph.find(g => g['@type'] === 'ItemList') as { itemListElement: unknown[] }
      expect(list.itemListElement).toHaveLength(11)
    })
  }

  it('hub FAQ quotes the bank lines exactly as the verification recorded them', () => {
    const ru = hubText('ru').faq.map(f => f.a).join('\n')
    expect(ru).toContain('BIC/SWIFT: HSBKKZKX')
    expect(ru).not.toContain('KMFBKZKK')
    expect(ru).not.toContain('IRTYKZKA')
    expect(ru).toContain('SWIFT/BIC KSNVKZKA')
    expect(ru).toContain('SHBKKZKAXXX')
  })

  it('renders every БИК of the directory into the ru and kk hub HTML', () => {
    for (const lang of LANGS) {
      const html = renderToStaticMarkup(createElement(BikHubPage, { lang }))
      for (const r of BIK_ROWS) expect(html, `${lang} ${r.bik}`).toContain(r.bik)
      expect(DASH.test(visible(html)), `${lang} dash in html`).toBe(false)
      // 11 links to bank pages from the table.
      const base = lang === 'kk' ? '/bik/kk/' : '/bik/'
      for (const r of BIK_BANK_PAGES) expect(html).toContain(`href="${base}${r.slug}"`)
    }
  })
})

describe('bik bank pages', () => {
  it('has exactly the 11 confirmed banks', () => {
    expect(BIK_BANK_PAGES.map(r => r.slug)).toEqual([
      'bereke-bank', 'kaspi-bank', 'evraziyskiy-bank', 'halyk-bank', 'forte-bank', 'tsentrkredit',
      'kmf-bank', 'freedom-bank', 'shinhan-bank-kazakhstan', 'alatau-city-bank', 'vtb-kazakhstan',
    ])
  })

  for (const lang of LANGS) {
    for (const row of BIK_BANK_PAGES) {
      const slug = row.slug!
      const tag = `${lang} ${slug}`

      it(`${tag}: copy has no dashes or emoji, carries БИК, NBK name, source and date`, () => {
        const strings = allBankStrings(slug, lang)
        for (const s of strings) {
          expect(DASH.test(s), `${tag}: ${s}`).toBe(false)
          expect(EMOJI.test(s), `${tag}: ${s}`).toBe(false)
        }
        const joined = strings.join('\n')
        expect(joined).toContain(row.bik)
        expect(joined).toContain(row.displayName)
        expect(joined).toContain(row.code)
        expect(joined).toContain(row.bankSite!.host)
        expect(joined).toContain('nationalbank.kz')
        expect(joined).toMatch(lang === 'kk' ? /2026 жылғы 23 қазан/ : /23 октября 2026/)
        expect(joined).not.toMatch(/swiftCode|актуально на|өзекті/i)
      })

      it(`${tag}: meta lengths, summary size and robots`, () => {
        const t = bankText(row, lang)
        expect(t.title.length).toBeLessThanOrEqual(60)
        expect(t.description.length, t.description).toBeLessThanOrEqual(155)
        expect(words(t.summary)).toBeGreaterThanOrEqual(35)
        expect(words(t.summary)).toBeLessThanOrEqual(80)
        const meta = bankMetadata(slug, lang)
        expect(meta.robots).toEqual(SEO_TARIFF_BIK_LIVE ? { index: true, follow: true } : { index: false, follow: false })
        const canon = lang === 'kk' ? `https://invoices.kz/bik/kk/${slug}` : `https://invoices.kz/bik/${slug}`
        expect(meta.alternates?.canonical).toBe(canon)
        expect(meta.alternates?.languages).toEqual({
          ru: `https://invoices.kz/bik/${slug}`,
          kk: `https://invoices.kz/bik/kk/${slug}`,
          'x-default': `https://invoices.kz/bik/${slug}`,
        })
      })

      it(`${tag}: JSON-LD is WebPage + BreadcrumbList + FAQPage with BIC identifier, no swiftCode`, () => {
        const ld = bankJsonLd(row, lang)
        const s = JSON.stringify(ld)
        expect(s).not.toContain('swiftCode')
        expect(s).not.toContain('sameAs')
        const graph = (ld as { '@graph': Record<string, unknown>[] })['@graph']
        expect(graph.map(g => g['@type'])).toEqual(['WebPage', 'BreadcrumbList', 'FAQPage'])
        const about = (graph[0] as { about: { identifier: { propertyID: string; value: string } } }).about
        expect(about.identifier).toEqual({ '@type': 'PropertyValue', propertyID: 'BIC', value: row.bik })
        const faq = graph[2] as { mainEntity: { name: string }[] }
        expect(faq.mainEntity.map(q => q.name)).toEqual(bankText(row, lang).faq.map(f => f.q))
      })

      it(`${tag}: renders and links to the hub and /tools/schet`, () => {
        const html = renderToStaticMarkup(createElement(BikBankPage, { slug, lang }))
        expect(html).toContain(row.bik)
        expect(html).toContain(lang === 'kk' ? 'href="/bik/kk"' : 'href="/bik"')
        expect(html).toContain(lang === 'kk' ? 'href="/tools/kk/schet"' : 'href="/tools/schet"')
        expect(DASH.test(visible(html))).toBe(false)
      })
    }
  }

  it('prints a БИН only where the verification confirmed it', () => {
    const withBin = BIK_BANK_PAGES.filter(r => r.bankSite!.bin).map(r => r.slug)
    expect(withBin).not.toContain('halyk-bank')
    expect(withBin).not.toContain('evraziyskiy-bank')
    expect(withBin).toHaveLength(9)
    const kaspi = bankText(BIK_BANK_PAGES.find(r => r.slug === 'kaspi-bank')!, 'ru')
    expect(kaspi.rows.some(r => r.value === '971240001315')).toBe(true)
  })

  it('Bereke page states SABRKZKA is absent from the NBK table and attributes the old code', () => {
    const t = allBankStrings('bereke-bank', 'ru').join('\n')
    expect(t).toContain('SABRKZKA')
    expect(t).toContain('BRKEKZKA')
    expect(t).toMatch(/отсутствует/)
    expect(t).toMatch(/В устаревшем справочнике/)
  })

  it('Alatau page attributes the Jusan rename to the press, not to the bank', () => {
    const ru = allBankStrings('alatau-city-bank', 'ru').join('\n')
    expect(ru).toMatch(/по сообщениям прессы/)
    expect(ru).toContain('16 июня 2025')
    const title = bankText(BIK_BANK_PAGES.find(r => r.slug === 'alatau-city-bank')!, 'ru').title
    expect(title).toBe('БИК Alatau City Bank (бывш. Jusan Bank): TSESKZKA')
  })

  it('Freedom page gives both facts as written and does not explain why', () => {
    const ru = allBankStrings('freedom-bank', 'ru').join('\n')
    expect(ru).toContain('NBRKKZKX')
    expect(ru).toContain('KSNVKZKA')
    expect(ru).toMatch(/Причину мы не проверяли/)
  })
})

describe('launch flag', () => {
  it('robots helper follows SEO_TARIFF_BIK_LIVE and hub metadata uses it', () => {
    const expected = SEO_TARIFF_BIK_LIVE ? { index: true, follow: true } : { index: false, follow: false }
    expect(bikRobots()).toEqual(expected)
    for (const lang of LANGS) expect(hubMetadata(lang).robots).toEqual(expected)
  })

  it('is off until the founder reviews the pages', () => {
    expect(SEO_TARIFF_BIK_LIVE).toBe(false)
  })
})

describe('launch flag on', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/seoLaunch')
    vi.resetModules()
  })

  it('SEO_TARIFF_BIK_LIVE true makes bikRobots() and the hub metadata indexable', async () => {
    vi.resetModules()
    vi.doMock('@/lib/seoLaunch', async importOriginal => ({
      ...(await importOriginal<typeof import('@/lib/seoLaunch')>()),
      SEO_TARIFF_BIK_LIVE: true,
    }))
    const meta = await import('./bikMeta')
    expect(meta.bikRobots()).toEqual({ index: true, follow: true })
    for (const lang of LANGS) expect(meta.hubMetadata(lang).robots).toEqual({ index: true, follow: true })
    for (const r of BIK_BANK_PAGES) {
      for (const lang of LANGS) expect(meta.bankMetadata(r.slug!, lang).robots).toEqual({ index: true, follow: true })
    }
  })
})
