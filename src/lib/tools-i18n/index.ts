import type { Metadata } from 'next'

// Общие помощники для языковых версий бесплатных инструментов /tools.
// Схема та же, что у /guides: у каждого языка свой адрес (поисковик видит три
// отдельные страницы, связанные hreflang), русский остаётся на старом адресе
// без префикса — чтобы не потерять уже набранный им вес в выдаче.
//
//   ru  https://invoices.kz/tools/<slug>
//   kk  https://invoices.kz/tools/kk/<slug>
//   en  https://invoices.kz/tools/en/<slug>
//
// Язык страницы задаёт АДРЕС, а не кука/localStorage посетителя: робот куки не
// носит, и одна и та же ссылка должна всегда отдавать один и тот же текст.
// Описание схемы целиком — docs/tools-i18n-pattern.md.
//
// Файл серверо-безопасный (без 'use client'): его импортируют и page.tsx с
// metadata, и клиентские компоненты. Сигнатуры — стабильный контракт для
// остальных инструментов, менять только с обратной совместимостью.

export type ToolLang = 'ru' | 'kk' | 'en'

export const TOOL_LANGS: readonly ToolLang[] = ['ru', 'kk', 'en'] as const

export const SITE_ORIGIN = 'https://invoices.kz'

/** Путь страницы инструмента на нужном языке: '/tools/kontragent', '/tools/kk/kontragent'. */
export function toolPath(slug: string, lang: ToolLang): string {
  return lang === 'ru' ? `/tools/${slug}` : `/tools/${lang}/${slug}`
}

/** Абсолютный адрес — для canonical, hreflang, og:url и sitemap. */
export function toolUrl(slug: string, lang: ToolLang): string {
  return `${SITE_ORIGIN}${toolPath(slug, lang)}`
}

/**
 * hreflang-набор для metadata.alternates.languages и для sitemap.ts.
 * x-default указывает на русский адрес без префикса — это исторический
 * «нейтральный» адрес инструмента, на него уже ведут все внешние ссылки.
 */
export function toolAlternates(slug: string): Record<ToolLang | 'x-default', string> {
  return {
    ru: toolUrl(slug, 'ru'),
    kk: toolUrl(slug, 'kk'),
    en: toolUrl(slug, 'en'),
    'x-default': toolUrl(slug, 'ru'),
  }
}

/**
 * Инструменты, у которых уже есть все три языковые версии
 * (/tools/<slug>, /tools/kk/<slug>, /tools/en/<slug>). Единый источник для
 * sitemap.ts и индекса /tools: инструмент без перевода (schet, avr на
 * 14.10.2026) живёт только на русском адресе и в sitemap идёт без hreflang.
 * Перевели новый инструмент — добавить slug сюда, больше ничего не надо.
 */
export const LOCALIZED_TOOL_SLUGS: readonly string[] = [
  'kontragent', 'kp', 'margin', 'nakladnaya', 'nalogi', 'waybills',
] as const

export function isToolLocalized(slug: string): boolean {
  return LOCALIZED_TOOL_SLUGS.includes(slug)
}

/**
 * Путь инструмента для ссылки со страницы на языке `lang`: своя языковая
 * версия, если она есть, иначе русский адрес (а не 404).
 */
export function toolLinkPath(slug: string, lang: ToolLang): string {
  return isToolLocalized(slug) ? toolPath(slug, lang) : toolPath(slug, 'ru')
}

/** Языки, для которых есть индекс /tools на этом языке (с 14.10.2026 — все три). */
export const LOCALIZED_TOOLS_INDEX: readonly ToolLang[] = TOOL_LANGS

export function toolsIndexPath(lang: ToolLang): string {
  return lang !== 'ru' && LOCALIZED_TOOLS_INDEX.includes(lang) ? `/tools/${lang}` : '/tools'
}

export function toolsIndexUrl(lang: ToolLang): string {
  return `${SITE_ORIGIN}${toolsIndexPath(lang)}`
}

/** hreflang-набор индекса /tools — та же форма, что toolAlternates(). */
export function toolsIndexAlternates(): Record<ToolLang | 'x-default', string> {
  return {
    ru: toolsIndexUrl('ru'),
    kk: toolsIndexUrl('kk'),
    en: toolsIndexUrl('en'),
    'x-default': toolsIndexUrl('ru'),
  }
}

/** Гайды есть на ru и kk; английских нет — en-страницы ведут на русские. */
export function guidesIndexPath(lang: ToolLang): string {
  return lang === 'kk' ? '/guides/kk' : '/guides'
}

/** BCP-47 для JSON-LD inLanguage и форматирования. */
export const TOOL_LOCALE: Record<ToolLang, string> = { ru: 'ru-KZ', kk: 'kk-KZ', en: 'en-KZ' }

/** og:locale (подчёркивание, как требует Open Graph). */
export const TOOL_OG_LOCALE: Record<ToolLang, string> = { ru: 'ru_KZ', kk: 'kk_KZ', en: 'en_US' }

/** Тексты для <head> одной языковой версии инструмента. */
export interface ToolSeoCopy {
  /** <title> без хвоста « | invoices.kz» — он добавляется здесь. */
  title: string
  description: string
  keywords: string
  /** Короче title — для og:title / twitter:title. */
  ogTitle: string
  ogDescription: string
  /** alt картинки превью. */
  ogImageAlt: string
}

/**
 * Полный объект Metadata для языковой версии инструмента: canonical на себя,
 * hreflang на все три языка, og:locale + og:locale:alternate.
 * `ogImage` — путь от корня сайта, обычно '/og/tool-<slug>.png' (картинка
 * общая для всех языков, пока не нарисованы локализованные).
 */
export function toolMetadata(slug: string, lang: ToolLang, copy: ToolSeoCopy, ogImage = `/og/tool-${slug}.png`): Metadata {
  const url = toolUrl(slug, lang)
  const image = `${SITE_ORIGIN}${ogImage}`
  return {
    title: `${copy.title} | invoices.kz`,
    description: copy.description,
    keywords: copy.keywords,
    alternates: { canonical: url, languages: toolAlternates(slug) },
    openGraph: {
      type: 'website',
      locale: TOOL_OG_LOCALE[lang],
      alternateLocale: TOOL_LANGS.filter(l => l !== lang).map(l => TOOL_OG_LOCALE[l]),
      url,
      siteName: 'INVOICES.KZ',
      title: copy.ogTitle,
      description: copy.ogDescription,
      images: [{ url: image, width: 1200, height: 630, alt: copy.ogImageAlt }],
    },
    twitter: {
      card: 'summary_large_image',
      title: copy.ogTitle,
      description: copy.ogDescription,
      images: [image],
    },
  }
}

/** Подписи переключателя языков — каждая на своём языке, как принято. */
export const TOOL_LANG_LABEL: Record<ToolLang, string> = { ru: 'Рус', kk: 'Қаз', en: 'Eng' }
export const TOOL_LANG_NAME: Record<ToolLang, string> = { ru: 'Русский', kk: 'Қазақша', en: 'English' }

/**
 * Общая обвязка страницы инструмента (не сам инструмент): ссылки внизу,
 * карточка-призыв к регистрации, подпись переключателя языков.
 */
export interface ToolChromeCopy {
  allTools: string
  guides: string
  langSwitchAria: string
  ctaTitle: string
  ctaBody: string
  ctaButton: string
  breadcrumbHome: string
  breadcrumbTools: string
}

export const TOOL_CHROME: Record<ToolLang, ToolChromeCopy> = {
  ru: {
    allTools: '← Все инструменты',
    guides: 'Гайды по документам →',
    langSwitchAria: 'Язык страницы',
    ctaTitle: 'Инструменты бесплатные. Платформа — тоже.',
    ctaBody:
      'Счета за минуту, приём оплат Kaspi, проверка контрагентов без лимита и учёт финансов — в одном кабинете invoices.kz. Регистрация по ссылке на почту, карта не нужна.',
    ctaButton: 'Начать бесплатно',
    breadcrumbHome: 'Главная',
    breadcrumbTools: 'Бесплатные инструменты',
  },
  kk: {
    allTools: '← Барлық құралдар',
    guides: 'Құжаттар бойынша нұсқаулықтар →',
    langSwitchAria: 'Бет тілі',
    ctaTitle: 'Құралдар тегін. Платформа да тегін.',
    ctaBody:
      'Бір минутта шот жазу, Kaspi арқылы төлем қабылдау, контрагенттерді шектеусіз тексеру және қаржы есебі — бәрі invoices.kz бір кабинетінде. Тіркелу поштаға келген сілтеме арқылы, карта қажет емес.',
    ctaButton: 'Тегін бастау',
    breadcrumbHome: 'Басты бет',
    breadcrumbTools: 'Тегін құралдар',
  },
  en: {
    allTools: '← All tools',
    guides: 'Document guides (in Russian) →',
    langSwitchAria: 'Page language',
    ctaTitle: 'The tools are free. So is the platform.',
    ctaBody:
      'Invoices in a minute, Kaspi payments, unlimited counterparty checks and finance tracking — all in one invoices.kz account. Sign up with an email link, no card required.',
    ctaButton: 'Start for free',
    breadcrumbHome: 'Home',
    breadcrumbTools: 'Free tools',
  },
}

/**
 * schema.org-разметка языковой версии инструмента (WebApplication +
 * BreadcrumbList) как готовая JSON-строка для <script type="application/ld+json">.
 * Строка уже экранирована от '</script>' — вставлять через
 * dangerouslySetInnerHTML как есть (см. ToolJsonLd в ./ToolJsonLd.tsx).
 */
export function toolJsonLd(slug: string, lang: ToolLang, name: string, description: string): string {
  const url = toolUrl(slug, lang)
  const chrome = TOOL_CHROME[lang]
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        '@id': `${url}#app`,
        name,
        description,
        url,
        inLanguage: TOOL_LOCALE[lang],
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Any',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'KZT' },
        publisher: { '@id': `${SITE_ORIGIN}/#organization` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: chrome.breadcrumbHome, item: SITE_ORIGIN },
          { '@type': 'ListItem', position: 2, name: chrome.breadcrumbTools, item: `${SITE_ORIGIN}${toolsIndexPath(lang)}` },
          { '@type': 'ListItem', position: 3, name, item: url },
        ],
      },
    ],
  }
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

/** «2024-03-05» → «05.03.2024»; всё, что не похоже на ISO-дату, — как есть. */
export function formatIsoDate(value: string | null | undefined): string | null {
  if (!value) return null
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : value
}

/** Сумма в тенге с пробелами-разделителями — так пишут в РК на любом языке. */
export function formatTenge(n: number): string {
  return `${Math.round(n).toLocaleString('ru-RU')} ₸`
}
