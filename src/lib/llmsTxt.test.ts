import { describe, expect, it } from 'vitest'
import { buildLlmsTxt } from './llmsTxt'
import { BIK_BANK_PAGES } from './bikRegistry'
import { KASPI_GUIDES } from './kaspiGuides'

describe('buildLlmsTxt', () => {
  it('флаг выключен: прежнее содержимое без новых разделов', () => {
    const t = buildLlmsTxt(false)
    expect(t.startsWith('# invoices.kz\n\n> invoices.kz')).toBe(true)
    expect(t.endsWith('- [Карта сайта](https://invoices.kz/sitemap.xml)\n')).toBe(true)
    expect(t).not.toContain('/bik')
    expect(t).not.toContain('БИК банков')
    for (const g of KASPI_GUIDES) expect(t).not.toContain(g.slug)
    expect(t).toContain('## Гайды (русский; казахские версии — /guides/kk/<название>)')
    expect(t).toContain('- [Как открыть ИП в 2026 году](https://invoices.kz/guides/kak-otkryt-ip-2026)\n\n## Optional\n')
  })

  it('по умолчанию совпадает с выключенным флагом (флаг в репозитории false)', () => {
    expect(buildLlmsTxt()).toBe(buildLlmsTxt(false))
  })

  it('флаг включён: 8 страниц K, хаб и 11 банков, Optional остаётся последним', () => {
    const t = buildLlmsTxt(true)
    for (const g of KASPI_GUIDES) expect(t).toContain(`https://invoices.kz/guides/${g.slug})`)
    expect(t).toContain('## БИК банков РК')
    expect(t).toContain('https://invoices.kz/bik)')
    expect(t).toContain('https://invoices.kz/bik/kk')
    expect(BIK_BANK_PAGES).toHaveLength(11)
    for (const r of BIK_BANK_PAGES) {
      expect(t).toContain(`https://invoices.kz/bik/${r.slug}`)
      expect(t).toContain(`https://invoices.kz/bik/kk/${r.slug}`)
      expect(t).toContain(r.bik)
    }
    expect(t.indexOf('## БИК банков РК')).toBeLessThan(t.indexOf('## Optional'))
    expect(t.indexOf('guides/kak-otkryt-ip-2026')).toBeLessThan(t.indexOf('komissiya-kaspi-produkty-pitaniya'))
    expect(t.endsWith('- [Карта сайта](https://invoices.kz/sitemap.xml)\n')).toBe(true)
    const added = t.slice(t.indexOf('komissiya-kaspi-produkty-pitaniya') - 200, t.indexOf('## Optional'))
    expect(added).not.toMatch(/[—–]/)
  })
})
