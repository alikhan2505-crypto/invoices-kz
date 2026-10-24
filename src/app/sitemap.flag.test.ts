import { afterEach, describe, expect, it, vi } from 'vitest'

// Флаг SEO_TARIFF_BIK_LIVE читается при загрузке модулей (GUIDES собирается один
// раз), поэтому для каждого значения подменяем src/lib/seoLaunch и импортируем
// sitemap и реестр заново.
const K_SLUGS = [
  'komissiya-kaspi-produkty-pitaniya',
  'komissiya-kaspi-apteka-lekarstva',
  'komissiya-kaspi-tovary-dlya-zhivotnykh',
  'komissiya-kaspi-ukrasheniya',
  'komissiya-kaspi-aksessuary',
  'komissiya-kaspi-aksessuary-dlya-telefonov',
  'tarify-dostavki-kaspi-magazin',
  'komissiya-kaspi-s-nds-i-bez-nds',
]
const BIK_SLUGS = [
  'kaspi-bank', 'halyk-bank', 'forte-bank', 'freedom-bank', 'tsentrkredit', 'bereke-bank',
  'evraziyskiy-bank', 'alatau-city-bank', 'kmf-bank', 'vtb-kazakhstan', 'shinhan-bank-kazakhstan',
]

async function load(live: boolean) {
  vi.resetModules()
  vi.doMock('@/lib/seoLaunch', async importOriginal => ({
    ...(await importOriginal<typeof import('@/lib/seoLaunch')>()),
    SEO_TARIFF_BIK_LIVE: live,
  }))
  const sitemap = (await import('./sitemap')).default
  const guides = await import('@/lib/guides')
  return { entries: sitemap(), guides }
}

afterEach(() => {
  vi.doUnmock('@/lib/seoLaunch')
  vi.resetModules()
})

describe('sitemap: страницы комиссий Kaspi и /bik за флагом SEO_TARIFF_BIK_LIVE', () => {
  it('флаг выключен: ни одного нового адреса, ни в sitemap, ни в реестре гайдов', async () => {
    const { entries, guides } = await load(false)
    for (const e of entries) {
      expect(e.url, e.url).not.toContain('/bik')
      for (const slug of K_SLUGS) expect(e.url, e.url).not.toContain(slug)
    }
    for (const slug of K_SLUGS) expect(guides.getGuide(slug), slug).toBeUndefined()
    expect(guides.GUIDES.some(g => K_SLUGS.includes(g.slug))).toBe(false)
  })

  it('флаг включён: все 16 адресов комиссий и 24 адреса /bik есть, с hreflang и lastmod', async () => {
    const { entries, guides } = await load(true)
    const byUrl = new Map(entries.map(e => [e.url, e]))

    for (const slug of K_SLUGS) {
      expect(guides.getGuide(slug), slug).toBeDefined()
      const ru = byUrl.get(`https://invoices.kz/guides/${slug}`)
      const kk = byUrl.get(`https://invoices.kz/guides/kk/${slug}`)
      for (const e of [ru, kk]) {
        expect(e, slug).toBeDefined()
        expect(e!.lastModified).toBe('2026-10-23')
        expect(e!.alternates?.languages).toMatchObject({
          ru: `https://invoices.kz/guides/${slug}`,
          kk: `https://invoices.kz/guides/kk/${slug}`,
        })
      }
    }

    const bikUrls = ['https://invoices.kz/bik', 'https://invoices.kz/bik/kk']
    for (const slug of BIK_SLUGS) bikUrls.push(`https://invoices.kz/bik/${slug}`, `https://invoices.kz/bik/kk/${slug}`)
    expect(bikUrls).toHaveLength(24)
    for (const url of bikUrls) {
      const e = byUrl.get(url)
      expect(e, url).toBeDefined()
      expect(e!.lastModified, url).toBe('2026-10-23')
      const langs = e!.alternates?.languages as Record<string, string>
      expect(Object.keys(langs).sort(), url).toEqual(['kk', 'ru', 'x-default'])
      expect(langs['x-default'], url).toBe(langs.ru)
    }
    expect(entries.filter(e => e.url.includes('/bik'))).toHaveLength(24)
    expect(new Set(entries.map(e => e.url)).size).toBe(entries.length)
  })

  it('флаг включён: «Читайте также» у основного гайда не ломается, K-страницы видят основной гайд', async () => {
    const { guides } = await load(true)
    const main = guides.getGuide('komissiya-kaspi')!
    expect(guides.relatedGuidesOf(main).length).toBeGreaterThan(0)
    const k = guides.getGuide('komissiya-kaspi-ukrasheniya')!
    expect(guides.relatedGuidesOf(k).map(g => g.slug)).toContain('komissiya-kaspi')
  })
})
