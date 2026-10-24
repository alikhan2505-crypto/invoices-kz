import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { KASPI_PAGE_SLUGS } from './kaspiTariff'
import { KASPI_GUIDES } from './kaspiGuides'

// Рендерим каждую страницу K1-K8 (ru и kk) в HTML и проверяем то, что видит
// читатель и поисковик: дату сверки, адрес источника, ссылки, JSON-LD, отсутствие
// мусора и тире. Страницы грузим динамически по slug.

async function html(slug: string, lang: 'ru' | 'kk'): Promise<string> {
  const mod = lang === 'kk'
    ? await import(`../app/guides/kk/${slug}/page.tsx`)
    : await import(`../app/guides/${slug}/page.tsx`)
  return renderToStaticMarkup(createElement(mod.default))
}

describe('рендер страниц K1-K8', () => {
  for (const slug of KASPI_PAGE_SLUGS) {
    for (const lang of ['ru', 'kk'] as const) {
      it(`${lang}/${slug}`, async () => {
        const out = await html(slug, lang)
        const guide = KASPI_GUIDES.find(g => g.slug === slug)!

        // Заголовок, блок "Коротко", блок источника с датой сверки.
        expect(out).toContain(guide[lang].title)
        expect(out).toContain(lang === 'ru' ? 'Коротко' : 'Қысқаша')
        expect(out).toContain('23.10.2026')
        expect(out).toContain('https://guide.kaspi.kz/')

        // Ссылка на калькулятор маржи и на главный гайд в нужном языке.
        expect(out).toContain(lang === 'ru' ? 'href="/tools/margin"' : 'href="/tools/kk/margin"')
        expect(out).toContain(lang === 'ru' ? 'href="/guides/komissiya-kaspi"' : 'href="/guides/kk/komissiya-kaspi"')

        // FAQ виден, и по тем же вопросам строится FAQPage в JSON-LD.
        for (const item of guide[lang].faq ?? []) {
          expect(out).toContain(item.q.replace(/&/g, '&amp;'))
        }
        const ld = out.match(/<script type="application\/ld\+json">(.*?)<\/script>/)
        expect(ld).not.toBeNull()
        const graph = JSON.parse(ld![1].replace(/\\u003c/g, '<'))['@graph'] as { '@type': string }[]
        expect(graph.map(n => n['@type'])).toEqual(['Article', 'BreadcrumbList', 'FAQPage'])

        // Мусор и тире.
        expect(out).not.toContain('undefined')
        expect(out).not.toContain('NaN')
        // Тире проверяем в нашем тексте (статья и FAQ). Общая обвязка GuideShell и карточки
        // чужих гайдов ("Читайте также") под эту проверку не попадают.
        const ours = out.slice(out.indexOf('<article'), out.indexOf('nav-card-accent'))
        expect(ours.length).toBeGreaterThan(1000)
        expect(ours).not.toMatch(/[\u2014\u2013]/)
        expect(JSON.stringify(guide)).not.toMatch(/[\u2014\u2013]/)
      })
    }
  }
})
