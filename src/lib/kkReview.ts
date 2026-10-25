// Реестр казахских текстов, которые ещё не вычитал основатель (решение
// 25.10.2026: kk-тексты, написанные ИИ, он вычитывает сам, а до тех пор их
// нельзя показывать как утверждённые).
//
// Что здесь есть:
//  - страницы (scope 'page'): адреса kk-страниц, на которых показывается плашка
//    «текст проверяется» (src/components/KkReviewNotice.tsx). Подключена в трёх
//    общих обёртках: src/app/tools/kk/layout.tsx, src/app/guides/GuideShell.tsx
//    и src/app/bik/BikShell.tsx, поэтому на страницы ничего дописывать не нужно;
//  - документы и интерфейс (scope 'document' и 'ui'): справочно, без плашки
//    (у документа свой флаг KK_DOC_UNDER_REVIEW в src/lib/kpI18n.ts, язык
//    интерфейса переключается кнопкой, а не адресом).
//
// Полный список самих строк для чтения лежит вне репозитория:
// «Вопросы к основателю/Тексты на вычитку (казахский).md».
//
// Когда основатель вычитал страницу: убрать её слаг из массива ниже (плашка
// пропадёт сама) и перенести адрес в KK_REVIEWED_PATHS, чтобы тест на полноту
// реестра не считал страницу забытой. Не noindex: плашка не меняет индексацию.

export type KkReviewScope = 'page' | 'document' | 'ui'

export interface KkReviewEntry {
  id: string
  scope: KkReviewScope
  /** Для 'page': адреса kk-страниц (с ведущим «/»). Для остальных: файлы с текстами. */
  paths: readonly string[]
  note: string
}

/** Инструменты /tools/kk/<slug>, ещё не вычитанные. */
export const KK_REVIEW_TOOL_SLUGS: readonly string[] = [
  'avr', 'kontragent', 'kp', 'margin', 'nakladnaya', 'nalogi', 'schet', 'waybills', 'zarplata',
]

/** Гайды /guides/kk/<slug>, ещё не вычитанные. */
export const KK_REVIEW_GUIDE_SLUGS: readonly string[] = [
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

/** Страницы банков /bik/kk/<slug>, ещё не вычитанные. */
export const KK_REVIEW_BIK_SLUGS: readonly string[] = [
  'alatau-city-bank', 'bereke-bank', 'evraziyskiy-bank', 'forte-bank', 'freedom-bank', 'halyk-bank',
  'kaspi-bank', 'kmf-bank', 'shinhan-bank-kazakhstan', 'tsentrkredit', 'vtb-kazakhstan',
]

/**
 * Адреса kk-страниц, которые основатель уже вычитал и утвердил. Пока пусто.
 * Нужен только тесту полноты: любая kk-страница из реестров гайдов, инструментов
 * и банков обязана быть либо на проверке, либо здесь (иначе её просто забыли).
 */
export const KK_REVIEWED_PATHS: readonly string[] = []

const NOTE_TOOL = 'kk-ветка словаря dict.ts инструмента, образцы документов sample.ts'
const NOTE_GUIDE = 'казахская версия статьи целиком (текст страницы, метаданные, вопросы-ответы)'
const NOTE_BIK = 'казахская версия страницы банка (шаблон из src/app/bik/bikContent.ts)'

export const KK_REVIEW_ENTRIES: readonly KkReviewEntry[] = [
  { id: 'tools-index', scope: 'page', paths: ['/tools/kk'], note: 'индекс инструментов: карточки и подписи (src/lib/tools-i18n)' },
  ...KK_REVIEW_TOOL_SLUGS.map((slug): KkReviewEntry => ({ id: `tool-${slug}`, scope: 'page', paths: [`/tools/kk/${slug}`], note: NOTE_TOOL })),
  { id: 'guides-index', scope: 'page', paths: ['/guides/kk'], note: 'индекс гайдов: названия и описания карточек' },
  ...KK_REVIEW_GUIDE_SLUGS.map((slug): KkReviewEntry => ({ id: `guide-${slug}`, scope: 'page', paths: [`/guides/kk/${slug}`], note: NOTE_GUIDE })),
  { id: 'bik-hub', scope: 'page', paths: ['/bik/kk'], note: 'хаб БСК банков (src/app/bik/bikContent.ts)' },
  ...KK_REVIEW_BIK_SLUGS.map((slug): KkReviewEntry => ({ id: `bik-${slug}`, scope: 'page', paths: [`/bik/kk/${slug}`], note: NOTE_BIK })),
  {
    id: 'kp-document',
    scope: 'document',
    paths: ['src/lib/kpI18n.ts', 'src/lib/generateKP.ts'],
    note: 'печатное коммерческое предложение на казахском; рядом с выбором языка в кабинете стоит пометка (флаг KK_DOC_UNDER_REVIEW)',
  },
  {
    id: 'cabinet-ui',
    scope: 'ui',
    paths: ['src/lib/i18n'],
    note: 'казахские строки интерфейса кабинета и лендингов, добавленные с 15.09.2026; плашки нет: язык переключается кнопкой, а не адресом',
  },
]

const REVIEW_PAGE_PATHS: ReadonlySet<string> = new Set(
  KK_REVIEW_ENTRIES.filter(e => e.scope === 'page').flatMap(e => e.paths),
)

/** '/tools/kk/zarplata/?x=1#y' -> '/tools/kk/zarplata'. Корень остаётся '/'. */
function normalizePath(pathname: string): string {
  const clean = pathname.split('#')[0].split('?')[0]
  const trimmed = clean.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

/**
 * Страница показывает казахский текст, который ещё не вычитан основателем
 * (для неё нужна плашка «текст проверяется»). Совпадение точное по адресу:
 * русские и английские версии, а также любые другие страницы дают false.
 */
export function isKkUnderReview(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return REVIEW_PAGE_PATHS.has(normalizePath(pathname))
}
