import { MetadataRoute } from 'next'
import { GUIDES, guideAlternates } from '@/lib/guides'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://invoices.kz',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: 'https://invoices.kz/login',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: 'https://invoices.kz/cashier-api',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      // Free no-signup tool -- exists partly as an organic entry point for
      // Kaspi sellers searching for waybill printing, so it belongs here.
      url: 'https://invoices.kz/tools/waybills',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      // Second free no-signup tool, same purpose as the one above: an organic
      // entry point for a Kaspi seller searching for what they actually earn
      // per sale.
      url: 'https://invoices.kz/tools/margin',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      // Guides index -- the organic entry point for search queries the product
      // answers ("комиссия Kaspi", "как выставить счёт ИП") rather than for the
      // brand name.
      url: 'https://invoices.kz/guides',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
      alternates: { languages: { ru: 'https://invoices.kz/guides', kk: 'https://invoices.kz/guides/kk' } },
    },
    {
      url: 'https://invoices.kz/guides/kk',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
      alternates: { languages: { ru: 'https://invoices.kz/guides', kk: 'https://invoices.kz/guides/kk' } },
    },
    // Each guide reports its own real edit date, so a crawler is never told a
    // page changed when only its neighbours did. Both language routes list
    // each other via alternates.languages (hreflang) so a crawler knows
    // they're the same article, not duplicate content.
    ...GUIDES.flatMap(g => [
      {
        url: `https://invoices.kz/guides/${g.slug}`,
        lastModified: new Date(g.updated),
        changeFrequency: 'monthly' as const,
        priority: 0.7,
        alternates: { languages: guideAlternates(g.slug) },
      },
      {
        url: `https://invoices.kz/guides/kk/${g.slug}`,
        lastModified: new Date(g.updated),
        changeFrequency: 'monthly' as const,
        priority: 0.7,
        alternates: { languages: guideAlternates(g.slug) },
      },
    ]),
    {
      url: 'https://invoices.kz/privacy',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: 'https://invoices.kz/terms',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
  ]
}