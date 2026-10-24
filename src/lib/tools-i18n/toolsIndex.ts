import type { Metadata } from 'next'
import {
  SITE_ORIGIN, TOOL_CHROME, TOOL_LANGS, TOOL_LOCALE, TOOL_OG_LOCALE,
  toolLinkPath, toolTitle, toolsIndexAlternates, toolsIndexUrl,
  type ToolLang, type ToolSeoCopy,
} from './index'

// Тексты и <head> индекса бесплатных инструментов на трёх языках:
//   ru /tools   kk /tools/kk   en /tools/en
// Сама страница — ToolsIndexView.tsx. Карточка инструмента без языковой
// версии на kk/en ведёт на русский адрес и помечается «орысша» / «in Russian»
// — см. isToolLocalized(). С 14.10.2026 переведены все восемь, пометок нет.

export interface ToolCard { slug: string; title: string; text: string }
export interface ToolGroup { title: string; tools: ToolCard[] }

export interface ToolsIndexDict {
  seo: ToolSeoCopy
  h1: string
  intro: string
  groups: ToolGroup[]
  /** Пометка у карточки инструмента, который пока есть только на русском. */
  ruOnly: string
  guidesLink: string
}

export const toolsIndexDict: Record<ToolLang, ToolsIndexDict> = {
  ru: {
    seo: {
      title: 'Бесплатные инструменты для бизнеса: счёт, АВР, налоги',
      description:
        'Счёт на оплату, АВР, накладная, КП, налоги ИП 2026, проверка контрагента по БИН, маржа Kaspi и склейка накладных. Бесплатные инструменты для бизнеса.',
      keywords:
        'бесплатные инструменты для ип, счёт на оплату онлайн, акт выполненных работ онлайн, накладная онлайн, калькулятор налогов ип 2026, проверка контрагента по бин, калькулятор маржи kaspi, склейка накладных kaspi',
      ogTitle: 'Бесплатные инструменты для бизнеса — invoices.kz',
      ogDescription: 'Документы, налоги ИП, проверка контрагента и инструменты для продавцов Kaspi. Бесплатно, без регистрации.',
      ogImageAlt: 'Инструменты — invoices.kz',
    },
    h1: 'Бесплатные инструменты',
    intro: 'Считают и печатают без регистрации. Для продавцов Kaspi и не только.',
    groups: [
      {
        title: 'Документы',
        tools: [
          { slug: 'schet', title: 'Счёт на оплату онлайн', text: 'Готовый счёт по казахстанской форме за минуту: БИК из справочника, сумма прописью, НДС 16% или без. 3 счёта в квартал бесплатно.' },
          { slug: 'avr', title: 'Акт выполненных работ онлайн', text: 'Готовый АВР по привычной форме: стороны, договор, сумма прописью, НДС. 3 акта в квартал бесплатно.' },
          { slug: 'nakladnaya', title: 'Накладная онлайн', text: 'Накладная на отпуск запасов (З-2): стороны, товары, сумма прописью. 3 накладные в квартал бесплатно.' },
          { slug: 'kp', title: 'Коммерческое предложение', text: 'Аккуратное КП с позициями, итогом и сроком действия — отправьте клиенту за минуту. 3 КП в квартал бесплатно.' },
        ],
      },
      {
        title: 'Налоги и проверка контрагента',
        tools: [
          { slug: 'nalogi', title: 'Налоги ИП — 2026', text: 'Сколько платит ИП на упрощёнке по новому кодексу: налог 4% и взносы за себя — помесячно и за полугодие.' },
          { slug: 'zarplata', title: 'Расчёт зарплаты 2026', text: 'Сколько получит работник на руки и сколько он стоит работодателю: ИПН, взносы и налоги с зарплаты, расчёт и из суммы на руки.' },
          { slug: 'kontragent', title: 'Проверка контрагента по БИН', text: 'Неблагонадёжность, ликвидация, налоговая задолженность и НДС — по официальным данным КГД. 3 проверки в квартал бесплатно.' },
        ],
      },
      {
        title: 'Для продавцов Kaspi',
        tools: [
          { slug: 'margin', title: 'Калькулятор маржи Kaspi', text: 'Сколько остаётся с продажи после комиссии категории, доставки и налога — и сколько это в месяц.' },
          { slug: 'waybills', title: 'Печать накладных Kaspi одним PDF (А4/А6)', text: 'Накладные одним PDF: 4 на лист А4 или А6 на термопринтер — без ножниц и возни. 5 склеек в месяц бесплатно, без ограничений — в Kaspi Bot (Про).' },
        ],
      },
    ],
    ruOnly: '',
    guidesLink: 'Гайды по документам и комиссиям →',
  },
  kk: {
    seo: {
      title: 'Кәсіпкерге тегін құралдар: шот, ОЖА, жүкқұжат, салық',
      description:
        'Төлем шоты, ОЖА, жүкқұжат, коммерциялық ұсыныс, ЖК салығы 2026, контрагентті БСН бойынша тексеру, Kaspi маржасы. Кәсіпкерге арналған тегін құралдар.',
      keywords:
        'жк үшін тегін құралдар, төлем шоты онлайн, орындалған жұмыстар актісі онлайн, жүкқұжат онлайн, жк салығы калькулятор 2026, контрагентті бсн бойынша тексеру, kaspi маржа калькуляторы, kaspi жүкқұжаттарын біріктіру, коммерциялық ұсыныс онлайн',
      ogTitle: 'Кәсіпкерге арналған тегін құралдар — invoices.kz',
      ogDescription: 'Құжаттар, ЖК салықтары, контрагентті тексеру және Kaspi сатушыларына арналған құралдар. Тегін, тіркелусіз.',
      ogImageAlt: 'Тегін құралдар — invoices.kz',
    },
    h1: 'Тегін құралдар',
    intro: 'Тіркелусіз есептейді және басып шығарады. Kaspi сатушыларына да, басқа кәсіпкерлерге де.',
    groups: [
      {
        title: 'Құжаттар',
        tools: [
          { slug: 'schet', title: 'Төлем шоты онлайн', text: 'Қазақстандық үлгідегі дайын шот бір минутта: БСК анықтамалықтан, сомасы жазбаша, ҚҚС 16% немесе ҚҚС-сыз. Тоқсанына 3 шот тегін.' },
          { slug: 'avr', title: 'Орындалған жұмыстар актісі онлайн', text: 'Үйреншікті үлгідегі дайын ОЖА: тараптар, шарт, сомасы жазбаша, ҚҚС. Тоқсанына 3 акт тегін.' },
          { slug: 'nakladnaya', title: 'Жүкқұжат онлайн', text: 'Қорларды жағына босатуға арналған жүкқұжат (З-2): тараптар, тауарлар, сомасы жазбаша. Тоқсанына 3 жүкқұжат тегін.' },
          { slug: 'kp', title: 'Коммерциялық ұсыныс', text: 'Позициялары, жалпы сомасы және қолданылу мерзімі бар ұқыпты КҰ — клиентке бір минутта жіберіңіз. Тоқсанына 3 КҰ тегін.' },
        ],
      },
      {
        title: 'Салықтар және контрагентті тексеру',
        tools: [
          { slug: 'nalogi', title: 'ЖК салықтары — 2026', text: 'Оңайлатылған декларациядағы ЖК жаңа кодекс бойынша қанша төлейді: 4% салық және өзі үшін жарналар — ай сайын және жарты жылға.' },
          { slug: 'zarplata', title: 'Жалақыны есептеу 2026', text: 'Қызметкер қолға қанша алады және жұмыс берушіге қанша тұрады: ЖТС, жарналар мен жалақыдан салықтар, қолға алатын сомадан кері есеп.' },
          { slug: 'kontragent', title: 'Контрагентті БСН бойынша тексеру', text: 'Сенімсіз салық төлеуші, тарату, салық берешегі және ҚҚС — МКК ресми деректері бойынша. Тоқсанына 3 тексеру тегін.' },
        ],
      },
      {
        title: 'Kaspi сатушыларына',
        tools: [
          { slug: 'margin', title: 'Kaspi маржа калькуляторы', text: 'Санат комиссиясы, жеткізу және салық шегерілгеннен кейін бір сатылымнан қанша қалады — және бұл айына қанша болады.' },
          { slug: 'waybills', title: 'Kaspi жүкқұжаттарын бір PDF-пен басып шығару (А4/А6)', text: 'Жүкқұжаттар бір PDF-те: А4 парағына 4-тен немесе термопринтерге А6 — қайшысыз, әурешіліксіз. Айына 5 рет тегін, шектеусіз — Kaspi Bot-та (Про).' },
        ],
      },
    ],
    ruOnly: 'орысша',
    guidesLink: 'Құжаттар мен комиссиялар бойынша нұсқаулықтар →',
  },
  en: {
    seo: {
      title: 'Free Business Tools for Kazakhstan — Invoices, Taxes',
      description:
        'Free Kazakhstan business tools: invoice, AVR, delivery note, commercial proposal, sole proprietor tax calculator 2026, company check by BIN, Kaspi tools.',
      keywords:
        'kazakhstan business tools free, kazakhstan invoice generator, kazakhstan certificate of completed work avr, kazakhstan sole proprietor tax calculator 2026, check company by bin kazakhstan, kaspi margin calculator, kaspi waybill merge pdf, kazakhstan delivery note z-2',
      ogTitle: 'Free business tools for Kazakhstan — invoices.kz',
      ogDescription: 'Documents, sole proprietor taxes, company checks and tools for Kaspi sellers. Free, no sign-up.',
      ogImageAlt: 'Free tools — invoices.kz',
    },
    h1: 'Free tools',
    intro: 'They calculate and print without sign-up. For Kaspi sellers and any small business in Kazakhstan.',
    groups: [
      {
        title: 'Documents',
        tools: [
          { slug: 'schet', title: 'Invoice for payment', text: 'A ready invoice in the standard Kazakhstan format in a minute: bank code from the directory, amount in words, with or without 16% VAT. 3 free invoices per quarter.' },
          { slug: 'avr', title: 'Certificate of completed work (AVR)', text: 'A ready AVR in the familiar format: parties, contract, amount in words, VAT. 3 free certificates per quarter.' },
          { slug: 'nakladnaya', title: 'Delivery note (form Z-2)', text: 'Inventory release note: parties, goods, amount in words. 3 free notes per quarter.' },
          { slug: 'kp', title: 'Commercial proposal', text: 'A clean proposal with line items, total and validity date — send it to your client in a minute. 3 free proposals per quarter.' },
        ],
      },
      {
        title: 'Taxes and company checks',
        tools: [
          { slug: 'nalogi', title: 'Sole proprietor taxes — 2026', text: 'What a sole proprietor on the simplified regime pays under the new Tax Code: 4% tax and own social contributions — per month and per half-year.' },
          { slug: 'zarplata', title: 'Salary calculator 2026', text: 'What an employee takes home and what the employer pays in total: income tax, contributions and payroll taxes, also from a take-home amount.' },
          { slug: 'kontragent', title: 'Company check by BIN', text: 'Unreliable-taxpayer status, liquidation, tax debt and VAT registration — from official State Revenue Committee data. 3 free checks a quarter.' },
        ],
      },
      {
        title: 'For Kaspi sellers',
        tools: [
          { slug: 'margin', title: 'Kaspi margin calculator', text: 'What you keep from a sale after the category commission, delivery and tax — and what that adds up to per month.' },
          { slug: 'waybills', title: 'Print Kaspi Waybills as One PDF (A4/A6)', text: 'Waybills in one PDF: 4 per A4 sheet, or A6 for a thermal printer — no scissors, no fuss. 5 free merges a month, unlimited in Kaspi Bot (Pro).' },
        ],
      },
    ],
    ruOnly: 'in Russian',
    guidesLink: 'Guides on documents and commissions (in Russian) →',
  },
}

/** Плоский список карточек в порядке показа — для JSON-LD и тестов. */
export function toolsIndexCards(lang: ToolLang): ToolCard[] {
  return toolsIndexDict[lang].groups.flatMap(g => g.tools)
}

export function toolsIndexMetadata(lang: ToolLang): Metadata {
  const t = toolsIndexDict[lang].seo
  const url = toolsIndexUrl(lang)
  const image = `${SITE_ORIGIN}/og/tools-index.png`
  return {
    title: toolTitle(t.title),
    description: t.description,
    keywords: t.keywords,
    alternates: { canonical: url, languages: toolsIndexAlternates() },
    openGraph: {
      type: 'website',
      locale: TOOL_OG_LOCALE[lang],
      alternateLocale: TOOL_LANGS.filter(l => l !== lang).map(l => TOOL_OG_LOCALE[l]),
      url,
      siteName: 'INVOICES.KZ',
      title: t.ogTitle,
      description: t.ogDescription,
      images: [{ url: image, width: 1200, height: 630, alt: t.ogImageAlt }],
    },
    twitter: { card: 'summary_large_image', title: t.ogTitle, description: t.ogDescription, images: [image] },
  }
}

/** schema.org CollectionPage + ItemList + BreadcrumbList; '<' экранирован. */
export function toolsIndexJsonLd(lang: ToolLang): string {
  const d = toolsIndexDict[lang]
  const url = toolsIndexUrl(lang)
  const chrome = TOOL_CHROME[lang]
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${url}#page`,
        name: d.h1,
        description: d.seo.description,
        url,
        inLanguage: TOOL_LOCALE[lang],
        publisher: { '@id': `${SITE_ORIGIN}/#organization` },
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: toolsIndexCards(lang).map((c, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: c.title,
            url: `${SITE_ORIGIN}${toolLinkPath(c.slug, lang)}`,
          })),
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: chrome.breadcrumbHome, item: SITE_ORIGIN },
          { '@type': 'ListItem', position: 2, name: chrome.breadcrumbTools, item: url },
        ],
      },
    ],
  }
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

