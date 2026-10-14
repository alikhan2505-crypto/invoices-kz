import { MetadataRoute } from 'next'
import { GUIDES, guideAlternates } from '@/lib/guides'
import { ROOT_HUB_LIVE } from '@/lib/rootHub'
import { TOOL_LANGS, isToolLocalized, toolAlternates, toolUrl, toolsIndexAlternates, toolsIndexUrl } from '@/lib/tools-i18n'

// Все инструменты /tools, которые есть в sitemap (переведённые и нет).
const TOOL_SLUGS_IN_SITEMAP = ['waybills', 'margin', 'kontragent', 'schet', 'avr', 'nalogi', 'nakladnaya', 'kp'] as const

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://invoices.kz',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    // The Счета pitch's own address once it moves off apex '/' -- see
    // src/lib/rootHub.ts. Listed only once it's actually what's live there
    // (same gating the api. cutover below already uses), so the sitemap
    // never claims a page that isn't the one really serving yet.
    ...(ROOT_HUB_LIVE ? [{
      url: 'https://docs.invoices.kz/',
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    }] : []),
    {
      url: 'https://invoices.kz/login',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: process.env.API_HOST_REDIRECT === '1' ? 'https://api.invoices.kz/' : 'https://invoices.kz/cashier-api',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    // Product subdomain landings (kaspi./agent./salon., stage 3 of the
    // product split, hostRouting.ts) -- these have always been missing
    // from the sitemap even though they're live, canonical-self URLs
    // (lp/[key]/page.tsx -> l.origin) with nothing gating them, unlike
    // docs./api. above. Added 05.10.2026.
    {
      url: 'https://kaspi.invoices.kz/',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: 'https://agent.invoices.kz/',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: 'https://salon.invoices.kz/',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    // Бесплатные инструменты /tools. Порядок — как в индексе. У переведённых
    // (LOCALIZED_TOOL_SLUGS в src/lib/tools-i18n) три адреса — ru /tools/<slug>,
    // kk /tools/kk/<slug>, en /tools/en/<slug> — и каждый перечисляет все три
    // через alternates.languages (hreflang), как у /guides ниже. Непереведённый
    // инструмент шёл бы только русским адресом, без hreflang (с 14.10.2026
    // переведены все восемь).
    //   waybills, margin — органический вход для продавцов Kaspi;
    //   kontragent — самый частотный запрос, лимит 3/день, дальше регистрация;
    //   schet — «счёт на оплату», лид-магнит; avr — второй документ после счёта;
    //   nalogi — налоги ИП по НК-2026; nakladnaya (З-2) и kp закрывают
    //   документный комплект малого бизнеса.
    ...TOOL_SLUGS_IN_SITEMAP.flatMap(slug =>
      isToolLocalized(slug)
        ? TOOL_LANGS.map(lang => ({
            url: toolUrl(slug, lang),
            lastModified: new Date(),
            changeFrequency: 'monthly' as const,
            priority: 0.7,
            alternates: { languages: toolAlternates(slug) },
          }))
        : [{
            url: toolUrl(slug, 'ru'),
            lastModified: new Date(),
            changeFrequency: 'monthly' as const,
            priority: 0.7,
          }],
    ),
    // Индекс инструментов: страница-указатель для набравших /tools руками,
    // на трёх языках.
    ...TOOL_LANGS.map(lang => ({
      url: toolsIndexUrl(lang),
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.5,
      alternates: { languages: toolsIndexAlternates() },
    })),
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