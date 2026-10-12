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
  {
    slug: 'proverka-kontragenta',
    updated: '2026-10-12',
    ru: {
      shortTitle: 'Проверка контрагента',
      title: 'Как проверить контрагента по БИН в Казахстане: пошагово',
      description:
        'Что проверить перед сделкой: существование и статус компании, список неблагонадёжных КГД, ликвидация, налоговая задолженность и НДС. Все официальные источники — и как увидеть всё сразу одной бесплатной проверкой.',
    },
    kk: {
      shortTitle: 'Контрагентті тексеру',
      title: 'Қазақстанда контрагентті БСН бойынша қалай тексеру керек',
      description:
        'Мәміле алдында нені тексеру керек: компанияның бар-жоғы мен мәртебесі, МКК сенімсіздер тізімі, тарату, салық қарызы және ҚҚС. Барлық ресми дереккөздер — және бәрін бір тегін тексерумен қалай көруге болады.',
    },
  },
  {
    slug: 'nalogi-ip-uproshchenka-2026',
    updated: '2026-10-12',
    ru: {
      shortTitle: 'Налоги ИП на упрощёнке — 2026',
      title: 'Налоги ИП на упрощёнке в 2026 году: новая ставка 4% и что ещё изменил Налоговый кодекс',
      description:
        'С 1 января 2026 года действует новый Налоговый кодекс: ставка по упрощённой декларации выросла с 3% до 4%, лимит дохода — 600 000 МРП, патент и розничный налог отменены. Сколько и когда платить ИП, включая взносы за себя.',
    },
    kk: {
      shortTitle: 'ЖК салықтары — 2026',
      title: '2026 жылы оңайлатылған декларациядағы ЖК салықтары: жаңа 4% мөлшерлеме',
      description:
        '2026 жылғы 1 қаңтардан жаңа Салық кодексі қолданыста: оңайлатылған декларация бойынша мөлшерлеме 3%-дан 4%-ға өсті, табыс шегі — 600 000 АЕК, патент пен бөлшек салық алынып тасталды. ЖК қанша және қашан төлейді.',
    },
  },
  {
    slug: 'esf-kazakhstan-2026',
    updated: '2026-10-12',
    ru: {
      shortTitle: 'ЭСФ — кто обязан',
      title: 'ЭСФ в 2026 году: кто обязан выписывать электронные счета-фактуры в Казахстане',
      description:
        'Электронный счёт-фактура по новому Налоговому кодексу: кто обязан выписывать (не только плательщики НДС), в какие сроки, когда можно не выписывать и чем ЭСФ отличается от обычного счёта на оплату.',
    },
    kk: {
      shortTitle: 'ЭШФ — кім міндетті',
      title: '2026 жылы ЭШФ: Қазақстанда электрондық шот-фактураны кім жазуға міндетті',
      description:
        'Жаңа Салық кодексі бойынша электрондық шот-фактура: кім жазуға міндетті (ҚҚС төлеушілер ғана емес), қандай мерзімде, қашан жазбауға болады және ЭШФ төлемге арналған қарапайым шоттан несімен ерекшеленеді.',
    },
  },
  {
    slug: 'penya-za-prosrochku',
    updated: '2026-10-12',
    ru: {
      shortTitle: 'Пеня за просрочку оплаты',
      title: 'Клиент не платит по счёту: как посчитать пеню по статье 353 ГК РК',
      description:
        'Как считается законная неустойка за просрочку оплаты: формула от базовой ставки Нацбанка, пример расчёта в тенге, чем договорная пеня отличается от законной и как правильно её предъявить.',
    },
    kk: {
      shortTitle: 'Кешіктіру өсімпұлы',
      title: 'Клиент шотты төлемей жатыр: АК 353-бабы бойынша өсімпұлды қалай есептеу керек',
      description:
        'Төлемді кешіктіргені үшін заңды тұрақсыздық айыбы қалай есептеледі: Ұлттық банктің базалық мөлшерлемесінен формула, теңгемен есептеу мысалы және оны қалай дұрыс талап ету керек.',
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
