// Registry of the SEO guides under /guides.
//
// Single source for four consumers that would otherwise drift: the index
// pages, the sitemap, the cross-links between guides and the ru<->kk
// language switch. Adding a guide means adding its page directories AND an
// entry here -- everything else picks it up on its own.
//
// Each language is a REAL route (/guides/<slug> and /guides/kk/<slug>), not
// a client-side toggle. A toggle would render the second language only in
// the browser, so it would never appear in the prerendered HTML a crawler
// reads -- which is the whole point of these pages. Verified the hard way on
// the landing: its kk strings live only in the JS bundle, not in index.html.
//
// `updated` is the real last-edit date and is what the sitemap reports as
// lastmod, so a crawler is never told a page changed when it didn't.

export type GuideLang = 'ru' | 'kk'

export type GuideCopy = {
  title: string
  /** Meta description and the index-card subtitle. */
  description: string
  /** Short label for cross-links between guides. */
  shortTitle: string
}

export type Guide = {
  slug: string
  updated: string
  ru: GuideCopy
  kk: GuideCopy
}

export const GUIDES: Guide[] = [
  {
    slug: 'komissiya-kaspi',
    updated: '2026-09-16',
    ru: {
      shortTitle: 'Комиссия Kaspi Магазина',
      title: 'Комиссия Kaspi Магазина: сколько реально забирает маркетплейс',
      description:
        'Актуальные ставки комиссии Kaspi Магазина по категориям — 7,3%, 12,5% и 15,5% с НДС. Почему минимальная цена всегда выше суммы расходов и как посчитать, что остаётся с продажи.',
    },
    kk: {
      shortTitle: 'Kaspi Магазин комиссиясы',
      title: 'Kaspi Магазин комиссиясы: маркетплейс шын мәнінде қанша ұстайды',
      description:
        'Kaspi Магазин комиссиясының санаттар бойынша өзекті мөлшерлемелері — ҚҚС-пен 7,3%, 12,5% және 15,5%. Ең төмен баға неліктен шығындар сомасынан әрқашан жоғары және сатылымнан не қалатынын қалай есептеу керек.',
    },
  },
  {
    slug: 'kak-vystavit-schet-ip',
    updated: '2026-09-16',
    ru: {
      shortTitle: 'Как выставить счёт',
      title: 'Как выставить счёт на оплату для ИП и ТОО в Казахстане',
      description:
        'Что обязательно должно быть в счёте на оплату: реквизиты поставщика, БИН, банк, ИИК и БИК. Частые ошибки, из-за которых счёт не оплачивают, и как отправить его клиенту за минуту.',
    },
    kk: {
      shortTitle: 'Шотты қалай шығару керек',
      title: 'Қазақстанда ЖК және ЖШС үшін төлемге шотты қалай шығару керек',
      description:
        'Төлемге шотта міндетті түрде не болуы керек: жеткізушінің деректемелері, БСН, банк, ЖСК және БСК. Шот неліктен төленбей қалады және оны клиентке бір минутта қалай жіберуге болады.',
    },
  },
  {
    slug: 'dokumenty-ip-kazakhstan',
    updated: '2026-09-16',
    ru: {
      shortTitle: 'Счёт, АВР, накладная и КП',
      title: 'Счёт, АВР, накладная и КП: чем отличаются и когда что нужно',
      description:
        'Разбор четырёх документов казахстанского бизнеса простыми словами: счёт на оплату, акт выполненных работ, накладная на отпуск запасов и коммерческое предложение — что подтверждает каждый и когда его выставляют.',
    },
    kk: {
      shortTitle: 'Шот, ОЖА, жүкқұжат және КҰ',
      title: 'Шот, ОЖА, жүкқұжат және КҰ: айырмашылығы неде және қашан қажет',
      description:
        'Қазақстандық бизнестің төрт құжатын қарапайым тілмен талдау: төлемге шот, орындалған жұмыстар актісі, қорларды босатуға жүкқұжат және коммерциялық ұсыныс — әрқайсысы нені растайды және қашан шығарылады.',
    },
  },
]

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find(g => g.slug === slug)
}

export function otherGuides(slug: string): Guide[] {
  return GUIDES.filter(g => g.slug !== slug)
}

export function guidePath(slug: string, lang: GuideLang): string {
  return lang === 'kk' ? `/guides/kk/${slug}` : `/guides/${slug}`
}

export function guidesIndexPath(lang: GuideLang): string {
  return lang === 'kk' ? '/guides/kk' : '/guides'
}

/** Both language versions of one guide, for `alternates.languages` (hreflang). */
export function guideAlternates(slug: string): Record<GuideLang, string> {
  return {
    ru: `https://invoices.kz${guidePath(slug, 'ru')}`,
    kk: `https://invoices.kz${guidePath(slug, 'kk')}`,
  }
}
