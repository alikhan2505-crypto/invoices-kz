import { MetadataRoute } from 'next'
import { GUIDES, guideAlternates } from '@/lib/guides'
import { ROOT_HUB_LIVE } from '@/lib/rootHub'
import { TOOL_LANGS, isToolLocalized, toolAlternates, toolUrl, toolsIndexAlternates, toolsIndexUrl } from '@/lib/tools-i18n'

// Все инструменты /tools, которые есть в sitemap (переведённые и нет).
const TOOL_SLUGS_IN_SITEMAP = ['waybills', 'margin', 'kontragent', 'schet', 'avr', 'nalogi', 'nakladnaya', 'kp'] as const

// Реальные даты правок, ISO (YYYY-MM-DD). Единственное место, где они живут:
// при правке страницы обновите её дату здесь. Никогда не new Date() -- иначе
// каждая выдача sitemap «меняет» все страницы, и Google/Яндекс перестают
// доверять lastmod. Гайды берут дату из GUIDES[].updated, но не раньше
// LASTMOD.guides (пакет SEO-правок 22.10.2026 затронул все гайды).
// changefreq/priority убраны: Google их игнорирует.
const LASTMOD = {
  root: '2026-10-22', // лендинг Счетов + разметка (SEO-пакет 22.10.2026)
  docsHub: '2026-10-22',
  cashierApi: '2026-10-17',
  productLandings: '2026-10-22', // kaspi./agent./salon. (lp/[key], landings.ts)
  tools: '2026-10-22',
  toolsIndex: '2026-10-22',
  guidesIndex: '2026-10-23', // на странице появилась карточка гайда про накладные Kaspi
  guides: '2026-10-22',
  privacy: '2026-10-13',
  terms: '2026-10-13',
} as const

function guideLastmod(updated: string): string {
  return updated > LASTMOD.guides ? updated : LASTMOD.guides
}

export default function sitemap(): MetadataRoute.Sitemap {
  const guidesAlt = { ru: 'https://invoices.kz/guides', kk: 'https://invoices.kz/guides/kk' }
  return [
    { url: 'https://invoices.kz', lastModified: LASTMOD.root },
    // The Счета pitch's own address once it moves off apex '/' -- see
    // src/lib/rootHub.ts. Listed only once it's actually what's live there
    // (same gating the api. cutover below already uses), so the sitemap
    // never claims a page that isn't the one really serving yet.
    ...(ROOT_HUB_LIVE ? [{ url: 'https://docs.invoices.kz/', lastModified: LASTMOD.docsHub }] : []),
    // /login намеренно нет: это форма входа, она noindex (login/layout.tsx).
    {
      url: process.env.API_HOST_REDIRECT === '1' ? 'https://api.invoices.kz/' : 'https://invoices.kz/cashier-api',
      lastModified: LASTMOD.cashierApi,
    },
    // Product subdomain landings (kaspi./agent./salon., stage 3 of the
    // product split, hostRouting.ts) -- these have always been missing
    // from the sitemap even though they're live, canonical-self URLs
    // (lp/[key]/page.tsx -> l.origin) with nothing gating them, unlike
    // docs./api. above. Added 05.10.2026.
    { url: 'https://kaspi.invoices.kz/', lastModified: LASTMOD.productLandings },
    { url: 'https://agent.invoices.kz/', lastModified: LASTMOD.productLandings },
    // salon.invoices.kz закрыт («скоро», noindex) с 23.10.2026 -- в карте сайта его нет.
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
            lastModified: LASTMOD.tools,
            alternates: { languages: toolAlternates(slug) },
          }))
        : [{
            url: toolUrl(slug, 'ru'),
            lastModified: LASTMOD.tools,
          }],
    ),
    // Индекс инструментов: страница-указатель для набравших /tools руками,
    // на трёх языках.
    ...TOOL_LANGS.map(lang => ({
      url: toolsIndexUrl(lang),
      lastModified: LASTMOD.toolsIndex,
      alternates: { languages: toolsIndexAlternates() },
    })),
    {
      // Guides index -- the organic entry point for search queries the product
      // answers ("комиссия Kaspi", "как выставить счёт ИП") rather than for the
      // brand name.
      url: 'https://invoices.kz/guides',
      lastModified: LASTMOD.guidesIndex,
      alternates: { languages: guidesAlt },
    },
    {
      url: 'https://invoices.kz/guides/kk',
      lastModified: LASTMOD.guidesIndex,
      alternates: { languages: guidesAlt },
    },
    // Each guide reports its real edit date (GUIDES[].updated, но не раньше
    // LASTMOD.guides), никогда не «сейчас». Both language routes list
    // each other via alternates.languages (hreflang) so a crawler knows
    // they're the same article, not duplicate content.
    ...GUIDES.flatMap(g => [
      {
        url: `https://invoices.kz/guides/${g.slug}`,
        lastModified: guideLastmod(g.updated),
        alternates: { languages: guideAlternates(g.slug) },
      },
      {
        url: `https://invoices.kz/guides/kk/${g.slug}`,
        lastModified: guideLastmod(g.updated),
        alternates: { languages: guideAlternates(g.slug) },
      },
    ]),
    { url: 'https://invoices.kz/privacy', lastModified: LASTMOD.privacy },
    { url: 'https://invoices.kz/terms', lastModified: LASTMOD.terms },
  ]
}
