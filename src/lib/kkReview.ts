// Реестр казахских текстов, которые ещё не вычитал основатель (решение
// 25.10.2026: kk-тексты, написанные ИИ, он вычитывает сам, а до тех пор их
// нельзя показывать как утверждённые).
//
// 05.11.2026 основатель вычитал все разделы файла «Тексты на вычитку (казахский).md»
// (инструменты, гайды, банки, документ КП, интерфейс), правки применены (коммит
// 2f346f16), и сказал снять плашку везде, где текст сверен. Реестр стал пустым, плашка
// нигде не показывалась, а механизм остался на будущее.
//
// 05.11.2026 (вечером) в реестре снова одна запись: /tools/kk/margin, у калькулятора маржи
// появились новые казахские строки (тип продажи, акции, доставка по сетке Kaspi). Строки
// для вычитки дописаны в конец «Тексты на вычитку (казахский).md».
//
// Как это работает:
//  - запись scope 'page' в KK_REVIEW_ENTRIES: адреса kk-страниц, на которых показывается
//    плашка «текст проверяется» (src/components/KkReviewNotice.tsx). Плашка стоит под
//    шапкой (логотип и переключатель языка), над заголовком страницы: в общих обёртках
//    src/app/guides/GuideShell.tsx, src/app/bik/BikShell.tsx, src/app/guides/kk/page.tsx
//    и в шапке каждого инструмента (src/app/tools/*/*Tool.tsx, индекс
//    src/lib/tools-i18n/ToolsIndexView.tsx). Новый инструмент: поставить плашку сразу
//    после шапки, как в соседних;
//  - записи 'document' и 'ui' справочные, без плашки (у документа КП свой флаг
//    KK_DOC_UNDER_REVIEW в src/lib/kpI18n.ts, язык интерфейса переключается кнопкой).
//
// Новая или заметно переписанная kk-страница: добавить её запись сюда (плашка появится
// сама), а когда основатель вычитает, убрать запись и перенести адрес в
// KK_REVIEWED_PATHS, чтобы тест на полноту не считал страницу забытой. Плашка не
// меняет индексацию (не noindex).
//
// Полный список самих строк для чтения лежит вне репозитория:
// «Вопросы к основателю/Тексты на вычитку (казахский).md».

export type KkReviewScope = 'page' | 'document' | 'ui'

export interface KkReviewEntry {
  id: string
  scope: KkReviewScope
  /** Для 'page': адреса kk-страниц (с ведущим «/»). Для остальных: файлы с текстами. */
  paths: readonly string[]
  note: string
}

/**
 * Инструменты /tools/kk/<slug>, вычитанные основателем 05.11.2026. margin здесь нет: новые
 * строки от 05.11.2026 ждут вычитки (запись tool-margin ниже), вернуть, когда вычитает.
 */
export const KK_REVIEWED_TOOL_SLUGS: readonly string[] = [
  'avr', 'kontragent', 'kp', 'nakladnaya', 'nalogi', 'schet', 'waybills', 'zarplata',
]

/** Гайды /guides/kk/<slug>, вычитанные основателем 05.11.2026. */
export const KK_REVIEWED_GUIDE_SLUGS: readonly string[] = [
  'dokumenty-ip-kazakhstan',
  'esf-kazakhstan-2026',
  'forma-910-uproshchenka-2026',
  'kak-otkryt-ip-2026',
  'kak-vystavit-schet-ip',
  'komissiya-kaspi',
  'komissiya-kaspi-aksessuary',
  'komissiya-kaspi-aksessuary-dlya-telefonov',
  'komissiya-kaspi-apteka-lekarstva',
  'komissiya-kaspi-produkty-pitaniya',
  'komissiya-kaspi-s-nds-i-bez-nds',
  'komissiya-kaspi-tovary-dlya-zhivotnykh',
  'komissiya-kaspi-ukrasheniya',
  'mrp-2026',
  'nakladnaya-na-otpusk-zapasov-obrazec',
  'nakladnye-kaspi-odnim-pdf',
  'nalogi-ip-uproshchenka-2026',
  'penya-za-prosrochku',
  'proverka-kompanii-po-bin-chto-mozhno-uznat',
  'proverka-kontragenta',
  'tarify-dostavki-kaspi-magazin',
]

/** Страницы банков /bik/kk/<slug>, вычитанные основателем 05.11.2026. */
export const KK_REVIEWED_BIK_SLUGS: readonly string[] = [
  'alatau-city-bank', 'bereke-bank', 'evraziyskiy-bank', 'forte-bank', 'freedom-bank', 'halyk-bank',
  'kaspi-bank', 'kmf-bank', 'shinhan-bank-kazakhstan', 'tsentrkredit', 'vtb-kazakhstan',
]

/**
 * Адреса kk-страниц, которые основатель вычитал и утвердил. Нужен тесту полноты: любая
 * kk-страница из реестров гайдов, инструментов и банков обязана быть либо на проверке
 * (запись в KK_REVIEW_ENTRIES), либо здесь (иначе её просто забыли).
 */
export const KK_REVIEWED_PATHS: readonly string[] = [
  '/tools/kk',
  ...KK_REVIEWED_TOOL_SLUGS.map(slug => `/tools/kk/${slug}`),
  '/guides/kk',
  ...KK_REVIEWED_GUIDE_SLUGS.map(slug => `/guides/kk/${slug}`),
  '/bik/kk',
  ...KK_REVIEWED_BIK_SLUGS.map(slug => `/bik/kk/${slug}`),
]

/** Что сейчас на проверке: с 05.11.2026 только новые строки калькулятора маржи. */
export const KK_REVIEW_ENTRIES: readonly KkReviewEntry[] = [
  {
    id: 'tool-margin',
    scope: 'page',
    paths: ['/tools/kk/margin'],
    note: 'Новые строки от 05.11.2026: тип продажи (обычная, акция Kaspi, акция 0-0-24), надбавка за 0-0-24, направления и вес доставки, НДС на доставку, подсказки про Kaspi Red и кредит. Список в разделе «05.11.2026: калькулятор маржи, новые строки».',
  },
]

/** '/tools/kk/zarplata/?x=1#y' -> '/tools/kk/zarplata'. Корень остаётся '/'. */
function normalizePath(pathname: string): string {
  const clean = pathname.split('#')[0].split('?')[0]
  const trimmed = clean.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

/** Проверка «страница на проверке» по заданному реестру (отдельно, чтобы её можно было тестировать). */
export function makeKkReviewChecker(entries: readonly KkReviewEntry[]): (pathname: string | null | undefined) => boolean {
  const pages: ReadonlySet<string> = new Set(entries.filter(e => e.scope === 'page').flatMap(e => e.paths))
  return pathname => (pathname ? pages.has(normalizePath(pathname)) : false)
}

/**
 * Страница показывает казахский текст, который ещё не вычитан основателем (для неё нужна
 * плашка «текст проверяется»). Совпадение точное по адресу: русские и английские версии,
 * а также любые другие страницы дают false.
 */
export const isKkUnderReview = makeKkReviewChecker(KK_REVIEW_ENTRIES)
