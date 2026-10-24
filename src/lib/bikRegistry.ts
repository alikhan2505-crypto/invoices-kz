// Реестр БИК для раздела /bik: все 33 строки справочника Национального Банка РК
// (https://nationalbank.kz/ru/page/spravochnik-bik-rk-ps, получено 23.10.2026) и
// отметка, для каких банков БИК подтверждён ещё и страницей самого банка.
//
// Откуда что берётся (никаких других источников у реестра нет):
//   * БИК, код банка, наименование: таблица НБК, дословно (nb_rows.json из проверки
//     23.10.2026). Единственная правка отображения: у KMF Банка таблица НБК начинается
//     с ЛАТИНСКОЙ "A" перед кириллицей ("Aкционерное общество"), на экране и в разметке
//     мы показываем кириллическую "А" (displayName); nameNbk остаётся как в таблице.
//   * confirmedOnBankSite: true только для 11 банков, у которых проверка 23.10.2026
//     нашла тот же БИК на странице реквизитов самого банка (banks_bik_verified.md).
//     У остальных 22 строк подтверждение только по НБК: страницу банка мы не открывали
//     или БИК на ней не нашли. Это НЕ значит, что БИК неверный.
//   * kind: наша группировка для страницы, не поле НБК. 'bank' = 24 банка, которые
//     открывают счета (включая Банк Развития Казахстана); 'non-bank' = 9 прочих
//     участников справочника (Нацбанк, казначейство, биржа и клиринг, депозитарий,
//     Казпочта, Правительство для граждан, Евразийский банк развития,
//     московский Межгосударственный Банк).
//   * Страницы банков получают только строки с confirmedOnBankSite === true.
//   * ruName/kkName: разговорные названия (Халык, Каспи, Фридом, Народный банк Казахстана)
//     только для текстов страниц и ссылок. Это не факты о банке: юридическое имя всегда
//     берётся из nameNbk/displayName.
//
// Реестр намеренно отдельный от kazakhstanBanks.ts (там порядок и aliases под форму
// счёта); сводить оба к одному источнику стоит позже.

import { NBK_BIK_CHECKED, SEO_TARIFF_BIK_LIVE } from './seoLaunch'

export type BikLang = 'ru' | 'kk'
export type BikKind = 'bank' | 'non-bank'

export const NBK_BIK_SOURCE_URL = 'https://nationalbank.kz/ru/page/spravochnik-bik-rk-ps'
export const NBK_BIK_RETRIEVED = NBK_BIK_CHECKED // '2026-10-23'
/** Дата правки самих страниц /bik (для dateModified и lastmod), не дата сверки. */
export const BIK_PAGES_UPDATED = '2026-10-23'

/** Что подтверждено на странице самого банка (из banks_bik_verified.md). */
export interface BikBankSite {
  /** Адрес страницы с реквизитами. */
  url: string
  host: string
  /** Что это за страница, по-русски и по-казахски (без домена). */
  pageRu: string
  pageKk: string
  /** Как банк подписывает БИК на этой странице: строка дословно, если известна. */
  siteLine?: string
  /** Как банк называет себя на этой странице, дословно, если известно. */
  siteName?: string
  /** БИН банка с этой страницы; только там, где он подтверждён. */
  bin?: string
}

/**
 * Как банк называют в разговоре и в поисковых запросах (проверено по Вордстату КЗ
 * за 08.09-07.10.2026, docs/seo/keywords/2026-10-24). Это НЕ юридическое имя:
 * юридическое наименование остаётся в nameNbk/displayName из таблицы НБК.
 */
export interface BikRuName {
  /** «Халык Банк»: именительный, для заголовков и ссылок. */
  nom: string
  /** «Халык Банка»: родительный, для «БИК Халык Банка». */
  gen: string
  /** Второе разговорное название того же банка, если есть: «Народный банк Казахстана». */
  alias?: string
  aliasGen?: string
  /** Латинское написание, которым банк подписан в справочнике или на своём сайте. */
  latin?: string
}

export interface BikKkName {
  /** Казахская страница: кириллическое название; только там, где оно устоявшееся. */
  nom: string
  /** Латинское написание в скобках, если оно отличается. */
  latin?: string
}

interface BikRaw {
  n: number
  bik: string
  code: string
  nameNbk: string
  kind: BikKind
}

export interface BikRow extends BikRaw {
  /** nameNbk без латинской "A" вместо кириллической (см. шапку файла). */
  displayName: string
  confirmedOnBankSite: boolean
  bankSite?: BikBankSite
  /** Адрес страницы банка: только когда confirmedOnBankSite. */
  slug?: string
  /** Короткое название для заголовков и ссылок. */
  label?: string
  /** Разговорные названия для текстов страниц (см. BikRuName). Только у банков со страницей. */
  ruName?: BikRuName
  kkName?: BikKkName
}

// Таблица НБК, дословно. Порядок как в справочнике (по БИК).
const NBK_ROWS: BikRaw[] = [
  { n: 1, bik: 'ATYNKZKA', code: '949', nameNbk: 'АО "Altyn Bank" (ДБ China Citic Bank Corporation Limited)', kind: 'bank' },
  { n: 2, bik: 'BKCHKZKA', code: '913', nameNbk: 'АО ДБ "БАНК КИТАЯ В КАЗАХСТАНЕ"', kind: 'bank' },
  { n: 3, bik: 'BRKEKZKA', code: '914', nameNbk: 'АО "Bereke Bank" (дочерний банк Lesha Bank LLC (Public))', kind: 'bank' },
  { n: 4, bik: 'CASPKZKA', code: '722', nameNbk: 'АО "KASPI BANK"', kind: 'bank' },
  { n: 5, bik: 'CEDUKZKA', code: '766', nameNbk: 'АО "Центральный Депозитарий Ценных Бумаг"', kind: 'non-bank' },
  { n: 6, bik: 'CITIKZKA', code: '832', nameNbk: 'АО "Ситибанк Казахстан"', kind: 'bank' },
  { n: 7, bik: 'DVKAKZKA', code: '907', nameNbk: 'АО "Банк Развития Казахстана"', kind: 'bank' },
  { n: 8, bik: 'EABRKZKA', code: '700', nameNbk: 'ЕВРАЗИЙСКИЙ БАНК РАЗВИТИЯ', kind: 'non-bank' },
  { n: 9, bik: 'EURIKZKA', code: '948', nameNbk: 'АО "Евразийский Банк"', kind: 'bank' },
  { n: 10, bik: 'GCVPKZ2A', code: '009', nameNbk: 'НАО Государственная корпорация "Правительство для граждан"', kind: 'non-bank' },
  { n: 11, bik: 'HCSKKZKA', code: '972', nameNbk: 'АО "Жилищный строительный сберегательный банк "Отбасы банк"', kind: 'bank' },
  { n: 12, bik: 'HLALKZKZ', code: '246', nameNbk: 'АО «Исламский Банк «ADCB»', kind: 'bank' },
  { n: 13, bik: 'HSBKKZKX', code: '601', nameNbk: 'АО "Народный Банк Казахстана"', kind: 'bank' },
  { n: 14, bik: 'ICBKKZKX', code: '930', nameNbk: 'АО "Торгово-промышленный Банк Китая в г. Алматы"', kind: 'bank' },
  { n: 15, bik: 'INEARUMM', code: '550', nameNbk: 'г.Москва Межгосударственный Банк', kind: 'non-bank' },
  { n: 16, bik: 'INLMKZKA', code: '886', nameNbk: 'АО "Home Credit Bank" (ДБ АО "ForteBank")', kind: 'bank' },
  { n: 17, bik: 'IRTYKZKA', code: '965', nameNbk: 'АО "ForteBank"', kind: 'bank' },
  { n: 18, bik: 'KCCJKZKK', code: '715', nameNbk: 'АО "Клиринговый центр KASE"', kind: 'non-bank' },
  { n: 19, bik: 'KCJBKZKX', code: '856', nameNbk: 'АО "Банк ЦентрКредит"', kind: 'bank' },
  { n: 20, bik: 'KICEKZKX', code: '927', nameNbk: 'АО "Казахстанская фондовая биржа"', kind: 'non-bank' },
  { n: 21, bik: 'KINCKZKA', code: '821', nameNbk: 'АО "Банк "Bank RBK"', kind: 'bank' },
  { n: 22, bik: 'KKMFKZ2A', code: '070', nameNbk: 'РГУ "Комитет государственного казначейства МФ РК"', kind: 'non-bank' },
  { n: 23, bik: 'KMFBKZKK', code: '719', nameNbk: 'Aкционерное общество "KMF Банк"', kind: 'bank' },
  { n: 24, bik: 'KPSTKZKA', code: '563', nameNbk: 'АО "КАЗПОЧТА"', kind: 'non-bank' },
  { n: 25, bik: 'KSNVKZKA', code: '551', nameNbk: 'АО "Фридом Банк Казахстан"', kind: 'bank' },
  { n: 26, bik: 'KZIBKZKA', code: '885', nameNbk: 'АО "ДБ "КАЗАХСТАН-ЗИРААТ ИНТЕРНЕШНЛ БАНК"', kind: 'bank' },
  { n: 27, bik: 'MOKFKZKA', code: '724', nameNbk: 'Акционерное общество «Коммерческий Банк БиЭнКей»', kind: 'bank' },
  { n: 28, bik: 'NBRKKZKX', code: '125', nameNbk: 'РГУ Национальный Банк Республики Казахстан', kind: 'non-bank' },
  { n: 29, bik: 'NURSKZKX', code: '849', nameNbk: 'АО "Нурбанк"', kind: 'bank' },
  { n: 30, bik: 'SHBKKZKA', code: '435', nameNbk: 'АО "Шинхан Банк Казахстан"', kind: 'bank' },
  { n: 31, bik: 'TSESKZKA', code: '998', nameNbk: 'АО "Alatau City Bank"', kind: 'bank' },
  { n: 32, bik: 'VTBAKZKZ', code: '432', nameNbk: 'ДО АО Банк ВТБ (Казахстан)', kind: 'bank' },
  { n: 33, bik: 'ZAJSKZ22', code: '896', nameNbk: 'АО "Исламский банк "Заман-Банк"', kind: 'bank' },
]

interface Confirmation {
  slug: string
  label: string
  ruName: BikRuName
  kkName?: BikKkName
  site: BikBankSite
}

// Ровно 11 банков. Источники: banks_bik_verified.md, раздел «Источники» (23.10.2026).
const CONFIRMED_ON_BANK_SITE: Record<string, Confirmation> = {
  CASPKZKA: {
    slug: 'kaspi-bank',
    label: 'Kaspi Bank',
    ruName: { nom: 'Каспи Банк', gen: 'Каспи Банка', latin: 'Kaspi Bank' },
    kkName: { nom: 'Каспи Банк', latin: 'Kaspi Bank' },
    site: {
      url: 'https://guide.kaspi.kz/cdn/content/pay/product/documents/Valyutniye-operatsii/Rekvizity-AO-Kaspi-Bank.pdf',
      host: 'guide.kaspi.kz',
      pageRu: 'PDF с реквизитами Kaspi Bank',
      pageKk: 'Kaspi Bank деректемелері бар PDF',
      bin: '971240001315',
    },
  },
  HSBKKZKX: {
    slug: 'halyk-bank',
    label: 'Halyk Bank',
    ruName: { nom: 'Халык Банк', gen: 'Халык Банка', alias: 'Народный банк Казахстана', aliasGen: 'Народного банка Казахстана', latin: 'Halyk Bank' },
    kkName: { nom: 'Халық Банк', latin: 'Halyk Bank' },
    site: {
      url: 'https://halykbank.kz/en/about/contacts/kontakty-i-rekvizity',
      host: 'halykbank.kz',
      pageRu: 'страница контактов и реквизитов (английская версия сайта)',
      pageKk: 'байланыс пен деректемелер беті (сайттың ағылшын нұсқасы)',
      siteLine: 'BIC/SWIFT: HSBKKZKX',
      siteName: 'JSC Halyk Bank',
    },
  },
  IRTYKZKA: {
    slug: 'forte-bank',
    label: 'ForteBank',
    ruName: { nom: 'Форте Банк', gen: 'Форте Банка', latin: 'ForteBank' },
    kkName: { nom: 'Форте Банк', latin: 'ForteBank' },
    site: {
      url: 'https://support.forte.kz/bank_details',
      host: 'support.forte.kz',
      pageRu: 'страница реквизитов банка',
      pageKk: 'банк деректемелері беті',
      siteLine: 'БИК IRTYKZKA',
      siteName: 'АО «ForteBank»',
      bin: '990740000683',
    },
  },
  KSNVKZKA: {
    slug: 'freedom-bank',
    label: 'Freedom Bank',
    ruName: { nom: 'Фридом Банк', gen: 'Фридом Банка', latin: 'Freedom Bank' },
    kkName: { nom: 'Фридом Банк', latin: 'Freedom Bank' },
    site: {
      url: 'https://bankffin.kz/ru/requisites',
      host: 'bankffin.kz',
      pageRu: 'страница реквизитов банка',
      pageKk: 'банк деректемелері беті',
      siteLine: 'SWIFT/BIC KSNVKZKA',
      siteName: 'АО "Фридом Банк Казахстан"',
      bin: '090740019001',
    },
  },
  KCJBKZKX: {
    slug: 'tsentrkredit',
    label: 'Банк ЦентрКредит',
    ruName: { nom: 'Банк ЦентрКредит', gen: 'Банка ЦентрКредит' },
    site: {
      url: 'https://www.bcc.kz/about/press-center/news/smena-rekvizitov-eco-center-bank/',
      host: 'bcc.kz',
      pageRu: 'новость банка о смене реквизитов Eco Center Bank',
      pageKk: 'банктің Eco Center Bank деректемелерінің өзгеруі туралы жаңалығы',
      siteLine: 'БИК KCJBKZKX',
      siteName: 'АО «Банк ЦентрКредит»',
      bin: '980640000093',
    },
  },
  BRKEKZKA: {
    slug: 'bereke-bank',
    label: 'Bereke Bank',
    ruName: { nom: 'Береке Банк', gen: 'Береке Банка', latin: 'Bereke Bank' },
    kkName: { nom: 'Береке Банк', latin: 'Bereke Bank' },
    site: {
      url: 'https://berekebank.kz/ru/about/requisites',
      host: 'berekebank.kz',
      pageRu: 'страница реквизитов банка',
      pageKk: 'банк деректемелері беті',
      siteLine: 'БИК BRKEKZKA',
      siteName: 'АО «Bereke Bank» (ДБ Lesha Bank LLC (Public))',
      bin: '930740000137',
    },
  },
  EURIKZKA: {
    slug: 'evraziyskiy-bank',
    label: 'Евразийский Банк',
    ruName: { nom: 'Евразийский Банк', gen: 'Евразийского Банка' },
    site: {
      url: 'https://eubank.kz/ru/requisites',
      host: 'eubank.kz',
      pageRu: 'страница реквизитов банка',
      pageKk: 'банк деректемелері беті',
      siteLine: '«БИК Банка получателя» EURIKZKA',
      siteName: 'АО «Евразийский Банк»',
    },
  },
  TSESKZKA: {
    slug: 'alatau-city-bank',
    label: 'Alatau City Bank',
    ruName: { nom: 'Алатау Сити Банк', gen: 'Алатау Сити Банка', latin: 'Alatau City Bank' },
    kkName: { nom: 'Алатау Сити Банк', latin: 'Alatau City Bank' },
    site: {
      url: 'https://alataucitybank.kz/business/salary-project',
      host: 'alataucitybank.kz',
      pageRu: 'страница банка про зарплатный проект',
      pageKk: 'банктің жалақы жобасы беті',
      siteLine: 'БИК TSESKZKA',
      siteName: 'АО «Alatau City Bank»',
      bin: '920140000084',
    },
  },
  KMFBKZKK: {
    slug: 'kmf-bank',
    label: 'KMF Банк',
    ruName: { nom: 'КМФ Банк', gen: 'КМФ Банка', latin: 'KMF Банк' },
    site: {
      url: 'https://kmf.kz/about/rekvizity/',
      host: 'kmf.kz',
      pageRu: 'страница реквизитов банка',
      pageKk: 'банк деректемелері беті',
      siteLine: 'БИК KMFBKZKK',
      siteName: 'АО "KMF Банк"',
      bin: '061240001583',
    },
  },
  VTBAKZKZ: {
    slug: 'vtb-kazakhstan',
    label: 'ВТБ Казахстан',
    ruName: { nom: 'ВТБ Казахстан', gen: 'ВТБ Казахстан' },
    site: {
      url: 'https://www.vtb-bank.kz/about/offices/',
      host: 'vtb-bank.kz',
      pageRu: 'страница офисов банка',
      pageKk: 'банк кеңселері беті',
      siteLine: 'БИК VTBAKZKZ',
      siteName: 'ДО АО Банк ВТБ (Казахстан)',
      bin: '080940010300',
    },
  },
  SHBKKZKA: {
    slug: 'shinhan-bank-kazakhstan',
    label: 'Шинхан Банк Казахстан',
    ruName: { nom: 'Шинхан Банк Казахстан', gen: 'Шинхан Банка Казахстан' },
    site: {
      url: 'https://www.shinhan.kz/en/about-bank/requisites/',
      host: 'shinhan.kz',
      pageRu: 'страница реквизитов банка (английская версия сайта)',
      pageKk: 'банк деректемелері беті (сайттың ағылшын нұсқасы)',
      siteLine: 'BIC/SWIFT SHBKKZKAXXX',
      siteName: 'Shinhan Bank Kazakhstan JSC',
      bin: '080240019735',
    },
  },
}

/** "Aкционерное" с латинской A (так в таблице НБК у KMF Банка) -> кириллическая "А". */
function toDisplayName(name: string): string {
  return name.replace(/^A(?=[а-яё])/, 'А')
}

export const BIK_ROWS: BikRow[] = NBK_ROWS.map(raw => {
  const conf = CONFIRMED_ON_BANK_SITE[raw.bik]
  return {
    ...raw,
    displayName: toDisplayName(raw.nameNbk),
    confirmedOnBankSite: conf !== undefined,
    ...(conf
      ? { bankSite: conf.site, slug: conf.slug, label: conf.label, ruName: conf.ruName, ...(conf.kkName ? { kkName: conf.kkName } : {}) }
      : {}),
  }
})

/** 24 банка. */
export const BIK_BANKS: BikRow[] = BIK_ROWS.filter(r => r.kind === 'bank')
/** 9 прочих участников справочника. */
export const BIK_NON_BANKS: BikRow[] = BIK_ROWS.filter(r => r.kind === 'non-bank')
/** Банки со своей страницей (confirmedOnBankSite), в порядке таблицы НБК. */
export const BIK_BANK_PAGES: BikRow[] = BIK_ROWS.filter(r => r.confirmedOnBankSite && r.slug !== undefined)

export function getBikBySlug(slug: string): BikRow | undefined {
  return BIK_BANK_PAGES.find(r => r.slug === slug)
}

export function bikHubPath(lang: BikLang): string {
  return lang === 'kk' ? '/bik/kk' : '/bik'
}

export function bikBankPath(slug: string, lang: BikLang): string {
  return lang === 'kk' ? `/bik/kk/${slug}` : `/bik/${slug}`
}

/** hreflang хаба: ru, kk, x-default на ru (как у guideAlternates). */
export function bikHubAlternates(): Record<BikLang | 'x-default', string> {
  return {
    ru: `https://invoices.kz${bikHubPath('ru')}`,
    kk: `https://invoices.kz${bikHubPath('kk')}`,
    'x-default': `https://invoices.kz${bikHubPath('ru')}`,
  }
}

export function bikBankAlternates(slug: string): Record<BikLang | 'x-default', string> {
  return {
    ru: `https://invoices.kz${bikBankPath(slug, 'ru')}`,
    kk: `https://invoices.kz${bikBankPath(slug, 'kk')}`,
    'x-default': `https://invoices.kz${bikBankPath(slug, 'ru')}`,
  }
}

/**
 * Записи для src/app/sitemap.ts: хаб и страницы банков на двух языках, lastmod
 * из BIK_PAGES_UPDATED (не new Date()). Пока SEO_TARIFF_BIK_LIVE === false
 * возвращает пустой список, поэтому спред в sitemap.ts безопасен и до запуска.
 */
export function bikSitemapEntries(): {
  url: string
  lastModified: string
  alternates: { languages: Record<string, string> }
}[] {
  if (!SEO_TARIFF_BIK_LIVE) return []
  const hub = (['ru', 'kk'] as const).map(lang => ({
    url: `https://invoices.kz${bikHubPath(lang)}`,
    lastModified: BIK_PAGES_UPDATED,
    alternates: { languages: bikHubAlternates() },
  }))
  const banks = BIK_BANK_PAGES.flatMap(r =>
    (['ru', 'kk'] as const).map(lang => ({
      url: `https://invoices.kz${bikBankPath(r.slug!, lang)}`,
      lastModified: BIK_PAGES_UPDATED,
      alternates: { languages: bikBankAlternates(r.slug!) },
    })),
  )
  return [...hub, ...banks]
}
