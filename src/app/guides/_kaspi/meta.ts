// kk: вычитка носителем ждёт основателя
//
// Метаданные страниц K1-K8. Отдельный .ts файл без JSX, чтобы логику флага запуска
// можно было проверить тестом.

import type { Metadata } from 'next'
import { Guide, GuideLang, guideAlternates, guideMetaTitle, guidePath } from '@/lib/guides'
import { SEO_TARIFF_BIK_LIVE } from '@/lib/seoLaunch'

/**
 * Метаданные страницы. Пока SEO_TARIFF_BIK_LIVE = false страница закрыта от
 * индексации и от следования по ссылкам; когда флаг включён, поле robots не
 * задаётся и страница ведёт себя как обычный гайд.
 */
export function kaspiMetadata(guide: Guide, lang: GuideLang, keywords: string): Metadata {
  const url = `https://invoices.kz${guidePath(guide.slug, lang)}`
  const copy = guide[lang]
  return {
    title: guideMetaTitle(copy.title),
    description: copy.description,
    keywords,
    ...(SEO_TARIFF_BIK_LIVE ? {} : { robots: { index: false, follow: false } }),
    alternates: { canonical: url, languages: guideAlternates(guide.slug) },
    openGraph: {
      type: 'article',
      locale: lang === 'kk' ? 'kk_KZ' : 'ru_KZ',
      url,
      siteName: 'INVOICES.KZ',
      title: copy.title,
      description: copy.description,
      images: [{ url: 'https://invoices.kz/og-margin.png', width: 1200, height: 630, alt: copy.title }],
    },
  }
}
