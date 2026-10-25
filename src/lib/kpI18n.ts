// Словарь печатного документа «Коммерческое предложение» (generateKP) на трёх
// языках. Решение основателя 25.10.2026: документы остаются русскими, КРОМЕ КП,
// его нужно уметь печатать на казахском и английском; русский - по умолчанию.
//
// Здесь ТОЛЬКО служебные подписи бланка. Всё, что вводит пользователь (названия,
// БИН, адреса, примечание, пользовательские единицы), печатается как есть.
// Казахские строки (kk) ждут вычитки основателя (см. KK_DOC_UNDER_REVIEW): пока
// флаг включён, интерфейс честно пишет рядом с выбором «Қазақша», что текст
// проверяется. После вычитки флаг выключают одной правкой.
//
// Терминология сверена с остальным проектом: БСН/ЖСН, ЖСК, БСК, КБе
// (src/lib/i18n/profileAccounts.ts, invoiceFlow.ts, landing.ts), ҚҚС, КҰ, Жеткізуші
// / Сатып алушы (src/app/tools/*/dict.ts), ескертпе, жарамдылық мерзімі.

export type KpLang = 'ru' | 'kk' | 'en'
export const KP_LANGS: readonly KpLang[] = ['ru', 'kk', 'en']
export const KP_DEFAULT_LANG: KpLang = 'ru'

/** Казахский текст документа ещё не вычитан основателем: рядом с выбором языка показываем «(текст проверяется)». */
export const KK_DOC_UNDER_REVIEW = true

export function isKpLang(v: unknown): v is KpLang {
  return v === 'ru' || v === 'kk' || v === 'en'
}

export interface KpStrings {
  /** Значение атрибута lang у <html>; пусто - атрибут не пишем (ru, как было раньше). */
  htmlLang: string
  // Панель (только на экране, в печать и PDF не попадает)
  back: string
  print: string
  downloadPdf: string
  loading: string
  /** Префикс перед номером в панели: «КП №». */
  toolbarNo: string
  // Шапка
  defaultCompany: string
  bin: string
  tel: string
  email: string
  /** Заглавная надпись над номером в шапке. */
  headerLabel: string
  /** Знак номера перед самим номером в шапке: «№ 1». */
  numberSign: string
  /** «от 14.10.2026». */
  dateLine: (date: string) => string
  // Заголовок
  title: string
  subtitle: string
  supplier: string
  buyer: string
  // Таблица
  itemsTitle: string
  colNo: string
  colCode: string
  colName: string
  colQty: string
  colUnit: string
  colPrice: string
  colSum: string
  defaultUnit: string
  // Итоги
  subtotalNoVat: string
  vat16: string
  total: string
  vat0: string
  vatLabel: string
  noVat: string
  totalDue: string
  // Примечание, банк
  note: string
  bankTitle: string
  bank: string
  iik: string
  bik: string
  kbe: string
  // Подписи
  signer: string
  dateIssued: string
  validUntil: string
  // Подвал
  footerSub: string
  /** Префикс имени PDF-файла: «КП-» + номер + «.pdf». */
  fileNamePrefix: string
}

export const KP_STRINGS: Record<KpLang, KpStrings> = {
  ru: {
    htmlLang: '',
    back: '← Назад',
    print: '🖨️ Печать',
    downloadPdf: '💾 Скачать PDF',
    loading: '⏳ Загрузка...',
    toolbarNo: 'КП №',
    defaultCompany: 'ИП First Project',
    bin: 'БИН: ',
    tel: 'Тел: ',
    email: 'Email: ',
    headerLabel: 'КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ',
    numberSign: '№ ',
    dateLine: d => `от ${d}`,
    title: 'Коммерческое предложение',
    subtitle: 'Уважаемые партнёры, предлагаем вашему вниманию следующие товары и услуги:',
    supplier: 'Поставщик',
    buyer: 'Покупатель',
    itemsTitle: 'Перечень товаров / услуг',
    colNo: '№',
    colCode: 'Код',
    colName: 'Наименование',
    colQty: 'Кол-во',
    colUnit: 'Ед.',
    colPrice: 'Цена',
    colSum: 'Сумма',
    defaultUnit: 'шт',
    subtotalNoVat: 'Итого без НДС:',
    vat16: 'НДС 16%:',
    total: 'Итого:',
    vat0: 'НДС 0%:',
    vatLabel: 'НДС:',
    noVat: 'Без НДС',
    totalDue: 'ИТОГО К ОПЛАТЕ:',
    note: 'Примечание',
    bankTitle: 'Банковские реквизиты',
    bank: 'Банк',
    iik: 'ИИК',
    bik: 'БИК',
    kbe: 'КБе',
    signer: 'Руководитель / Представитель',
    dateIssued: 'Дата составления',
    validUntil: 'Действителен до',
    footerSub: 'Сервисы для бизнеса в Казахстане',
    fileNamePrefix: 'КП-',
  },
  kk: {
    htmlLang: 'kk',
    back: '← Артқа',
    print: '🖨️ Басып шығару',
    downloadPdf: '💾 PDF жүктеу',
    loading: '⏳ Жүктелуде...',
    toolbarNo: 'КҰ №',
    defaultCompany: 'ЖК First Project',
    bin: 'БСН: ',
    tel: 'Тел: ',
    email: 'Email: ',
    headerLabel: 'КОММЕРЦИЯЛЫҚ ҰСЫНЫС',
    numberSign: '№ ',
    dateLine: d => `${d} ж.`,
    title: 'Коммерциялық ұсыныс',
    subtitle: 'Құрметті серіктестер, назарларыңызға келесі тауарлар мен қызметтерді ұсынамыз:',
    supplier: 'Жеткізуші',
    buyer: 'Сатып алушы',
    itemsTitle: 'Тауарлар / қызметтер тізбесі',
    colNo: '№',
    colCode: 'Коды',
    colName: 'Атауы',
    colQty: 'Саны',
    colUnit: 'Өлш. бірл.',
    colPrice: 'Бағасы',
    colSum: 'Сомасы',
    defaultUnit: 'дана',
    subtotalNoVat: 'ҚҚС-сыз жиыны:',
    vat16: 'ҚҚС 16%:',
    total: 'Жиыны:',
    vat0: 'ҚҚС 0%:',
    vatLabel: 'ҚҚС:',
    noVat: 'ҚҚС-сыз',
    totalDue: 'ТӨЛЕУГЕ БАРЛЫҒЫ:',
    note: 'Ескертпе',
    bankTitle: 'Банк деректемелері',
    bank: 'Банк',
    iik: 'ЖСК',
    bik: 'БСК',
    kbe: 'КБе',
    signer: 'Басшы / Өкіл',
    dateIssued: 'Жасалған күні',
    validUntil: 'Жарамдылық мерзімі',
    footerSub: 'Қазақстандағы бизнеске арналған сервистер',
    fileNamePrefix: 'КҰ-',
  },
  en: {
    htmlLang: 'en',
    back: '← Back',
    print: '🖨️ Print',
    downloadPdf: '💾 Download PDF',
    loading: '⏳ Loading...',
    toolbarNo: 'Proposal No. ',
    defaultCompany: 'Sole proprietor First Project',
    bin: 'BIN (tax ID): ',
    tel: 'Tel: ',
    email: 'Email: ',
    headerLabel: 'COMMERCIAL PROPOSAL',
    numberSign: 'No. ',
    dateLine: d => `dated ${d}`,
    title: 'Commercial proposal',
    subtitle: 'Dear partners, we are pleased to offer you the following goods and services:',
    supplier: 'Supplier',
    buyer: 'Buyer',
    itemsTitle: 'List of goods / services',
    colNo: 'No.',
    colCode: 'Code',
    colName: 'Description',
    colQty: 'Qty',
    colUnit: 'Unit',
    colPrice: 'Price',
    colSum: 'Amount',
    defaultUnit: 'pcs',
    subtotalNoVat: 'Subtotal excl. VAT:',
    vat16: 'VAT 16%:',
    total: 'Total:',
    vat0: 'VAT 0%:',
    vatLabel: 'VAT:',
    noVat: 'No VAT',
    totalDue: 'TOTAL DUE:',
    note: 'Note',
    bankTitle: 'Bank details',
    bank: 'Bank',
    iik: 'Account number (IIK)',
    bik: 'Bank code (BIK)',
    kbe: 'Beneficiary code (KBe)',
    signer: 'Director / Representative',
    dateIssued: 'Date issued',
    validUntil: 'Valid until',
    footerSub: 'Business services in Kazakhstan',
    fileNamePrefix: 'Proposal-',
  },
}

/** Строки документа для языка; неизвестное значение - русский. */
export function kpStrings(lang: unknown): KpStrings {
  return isKpLang(lang) ? KP_STRINGS[lang] : KP_STRINGS.ru
}

// Стандартные единицы измерения хранятся по-русски (invoices.items[].unit,
// список /tools и кабинета). В документе на kk/en печатаем их на языке
// документа; всё, чего нет в списке (пользовательский ввод), остаётся как
// введено. Русский документ единицы не трогает.
const UNIT_MAP: Record<string, { kk: string; en: string }> = {
  'шт': { kk: 'дана', en: 'pcs' },
  'шт.': { kk: 'дана', en: 'pcs' },
  'кг': { kk: 'кг', en: 'kg' },
  'т': { kk: 'т', en: 't' },
  'л': { kk: 'л', en: 'l' },
  'м': { kk: 'м', en: 'm' },
  'м²': { kk: 'м²', en: 'm²' },
  'м³': { kk: 'м³', en: 'm³' },
  'компл.': { kk: 'жиынтық', en: 'set' },
  'упак.': { kk: 'қаптама', en: 'pack' },
  'час': { kk: 'сағат', en: 'hour' },
  'день': { kk: 'күн', en: 'day' },
  'месяц': { kk: 'ай', en: 'month' },
  'услуга': { kk: 'қызмет', en: 'service' },
  'усл': { kk: 'қызмет', en: 'service' },
  'усл.': { kk: 'қызмет', en: 'service' },
  'работа': { kk: 'жұмыс', en: 'work' },
}

/** Единица позиции на языке документа; пустая - единица по умолчанию («шт» / дана / pcs). */
export function kpUnitLabel(unit: string | undefined, lang: KpLang): string {
  if (lang === 'ru') return unit || KP_STRINGS.ru.defaultUnit
  const raw = (unit ?? '').trim()
  if (!raw) return KP_STRINGS[lang].defaultUnit
  return UNIT_MAP[raw.toLowerCase()]?.[lang] ?? unit ?? ''
}

/** Имя PDF-файла: «КП-12.pdf» / «КҰ-12.pdf» / «Proposal-12.pdf». */
export function kpFileName(lang: KpLang, number: string): string {
  return `${KP_STRINGS[lang].fileNamePrefix}${number}.pdf`
}
