import type { Metadata } from 'next'
import { guideMetaTitle } from '@/lib/guides'
import { SEO_TARIFF_BIK_LIVE } from '@/lib/seoLaunch'
import {
  bikBankAlternates,
  bikBankPath,
  bikHubAlternates,
  bikHubPath,
  getBikBySlug,
  type BikLang,
} from '@/lib/bikRegistry'
import { CHROME, bankText, hubText } from './bikContent'

// While SEO_TARIFF_BIK_LIVE is false the /bik pages exist (the founder reviews
// them by URL) but tell crawlers to stay away; they are also absent from the
// sitemap, the guides hub and llms.txt. Flipping the flag makes them ordinary
// indexable pages.
export function bikRobots(): NonNullable<Metadata['robots']> {
  return SEO_TARIFF_BIK_LIVE ? { index: true, follow: true } : { index: false, follow: false }
}

const OG_IMAGE = 'https://invoices.kz/og-image.png'

export function hubMetadata(lang: BikLang): Metadata {
  const t = hubText(lang)
  const url = `https://invoices.kz${bikHubPath(lang)}`
  return {
    title: guideMetaTitle(t.title),
    description: t.description,
    keywords: t.keywords,
    robots: bikRobots(),
    alternates: { canonical: url, languages: bikHubAlternates() },
    openGraph: {
      type: 'website',
      locale: CHROME[lang].ogLocale,
      url,
      siteName: 'INVOICES.KZ',
      title: t.title,
      description: t.description,
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: t.title }],
    },
  }
}

export function bankMetadata(slug: string, lang: BikLang): Metadata {
  const row = getBikBySlug(slug)
  if (!row) throw new Error(`No БИК page for slug ${slug}`)
  const t = bankText(row, lang)
  const url = `https://invoices.kz${bikBankPath(slug, lang)}`
  return {
    title: guideMetaTitle(t.title),
    description: t.description,
    keywords: t.keywords,
    robots: bikRobots(),
    alternates: { canonical: url, languages: bikBankAlternates(slug) },
    openGraph: {
      type: 'website',
      locale: CHROME[lang].ogLocale,
      url,
      siteName: 'INVOICES.KZ',
      title: t.title,
      description: t.description,
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: t.title }],
    },
  }
}
