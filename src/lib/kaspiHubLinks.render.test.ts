import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { KASPI_PAGE_SLUGS } from './kaspiTariff'

// Главный гайд /guides/komissiya-kaspi (ru и kk) ссылается на страницы K1-K8 только
// при SEO_TARIFF_BIK_LIVE = true. Флаг читается при загрузке модулей, поэтому
// подменяем seoLaunch и импортируем страницу заново.

async function hubHtml(lang: 'ru' | 'kk', live: boolean): Promise<string> {
  vi.resetModules()
  vi.doMock('@/lib/seoLaunch', async importOriginal => ({
    ...(await importOriginal<typeof import('@/lib/seoLaunch')>()),
    SEO_TARIFF_BIK_LIVE: live,
  }))
  const mod = lang === 'kk'
    ? await import(`../app/guides/kk/${'komissiya-kaspi'}/page.tsx`)
    : await import(`../app/guides/${'komissiya-kaspi'}/page.tsx`)
  return renderToStaticMarkup(createElement(mod.default))
}

afterEach(() => {
  vi.doUnmock('@/lib/seoLaunch')
  vi.resetModules()
})

describe('главный гайд комиссий: блок ссылок на K1-K8', () => {
  for (const lang of ['ru', 'kk'] as const) {
    const prefix = lang === 'kk' ? '/guides/kk/' : '/guides/'

    it(`${lang}: флаг выключен, ссылок на K-страницы нет`, async () => {
      const out = await hubHtml(lang, false)
      for (const slug of KASPI_PAGE_SLUGS) expect(out).not.toContain(`href="${prefix}${slug}"`)
    })

    it(`${lang}: флаг включён, все 8 ссылок есть`, async () => {
      const out = await hubHtml(lang, true)
      for (const slug of KASPI_PAGE_SLUGS) expect(out).toContain(`href="${prefix}${slug}"`)
      expect(out).not.toContain('undefined')
      const start = out.indexOf(lang === 'ru' ? 'Комиссии по отдельным категориям' : 'Жеке санаттар бойынша')
      const end = out.indexOf(lang === 'ru' ? 'Источник ставок' : 'Мөлшерлемелер көзі')
      expect(start).toBeGreaterThan(0)
      expect(end).toBeGreaterThan(start)
      expect(out.slice(start, end)).not.toMatch(/[—–]/)
    })
  }
})
