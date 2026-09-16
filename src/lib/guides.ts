// Registry of the SEO guides under /guides.
//
// Single source for three consumers that would otherwise drift: the index
// page, the sitemap, and each guide's own "читайте также" block. Adding a
// guide means adding its page directory AND an entry here -- the index and
// sitemap then pick it up on their own.
//
// `updated` is the real last-edit date and is what the sitemap reports as
// lastmod, so a crawler is never told a page changed when it didn't.

export type Guide = {
  slug: string
  title: string
  /** Meta description and the index-card subtitle. */
  description: string
  /** Short label for cross-links between guides. */
  shortTitle: string
  updated: string
}

export const GUIDES: Guide[] = [
  {
    slug: 'komissiya-kaspi',
    shortTitle: 'Комиссия Kaspi Магазина',
    title: 'Комиссия Kaspi Магазина: сколько реально забирает маркетплейс',
    description:
      'Актуальные ставки комиссии Kaspi Магазина по категориям — 7,3%, 12,5% и 15,5% с НДС. Почему минимальная цена всегда выше суммы расходов и как посчитать, что остаётся с продажи.',
    updated: '2026-09-16',
  },
  {
    slug: 'kak-vystavit-schet-ip',
    shortTitle: 'Как выставить счёт',
    title: 'Как выставить счёт на оплату для ИП и ТОО в Казахстане',
    description:
      'Что обязательно должно быть в счёте на оплату: реквизиты поставщика, БИН, банк, ИИК и БИК. Частые ошибки, из-за которых счёт не оплачивают, и как отправить его клиенту за минуту.',
    updated: '2026-09-16',
  },
  {
    slug: 'dokumenty-ip-kazakhstan',
    shortTitle: 'Счёт, АВР, накладная и КП',
    title: 'Счёт, АВР, накладная и КП: чем отличаются и когда что нужно',
    description:
      'Разбор четырёх документов казахстанского бизнеса простыми словами: счёт на оплату, акт выполненных работ, накладная на отпуск запасов и коммерческое предложение — что подтверждает каждый и когда его выставляют.',
    updated: '2026-09-16',
  },
]

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find(g => g.slug === slug)
}

export function otherGuides(slug: string): Guide[] {
  return GUIDES.filter(g => g.slug !== slug)
}
