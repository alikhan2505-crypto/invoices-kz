import { formatSampleMoney, type SampleCopy, type SampleDoc } from '@/lib/tools-i18n/toolSample'
import { toolGuidePath, type ToolLang } from '@/lib/tools-i18n'
import { kpLines, kpTotal, kpVatIncluded, type KpRow } from './calc'
import { kpStrings, kpUnitLabel, type KpLang } from '@/lib/kpI18n'

// Образец для блока «Образец» под формой /tools/kp (ToolSample). Все данные
// ВЫМЫШЛЕННЫЕ: БИН из нулей, телефон из нулей, почта на example.com — реальных
// реквизитов здесь быть не должно (тест это проверяет). Бланк повторяет
// раскладку, которую печатает generateKP при vatType = 'vat_16' и без банка
// (инструмент банк в КП не спрашивает): шапка с данными поставщика, номер и
// дата, стороны, таблица позиций без колонки «Код», итоги, примечание,
// подпись, дата составления и срок действия. НДС и итог считаются теми же
// функциями calc.ts, что и в инструменте.
//
// Образец печатается на языке страницы (с 25.10.2026 КП умеет ru/kk/en): служебные
// подписи берутся из того же словаря, что и сам документ (src/lib/kpI18n.ts),
// а вымышленные данные (названия, адрес, позиции, примечание) есть на каждом
// языке в SAMPLE_BY_LANG. Русские SAMPLE_ROWS / SAMPLE_SUPPLIER / SAMPLE_BUYER /
// SAMPLE_NOTE остаются как были: на них считаются сумма и НДС.

/** Строки образца в том же виде, в каком их хранит форма (цены уже с НДС). */
export const SAMPLE_ROWS: KpRow[] = [
  { name: 'Разработка логотипа и фирменного стиля', qty: '1', unit: 'услуга', price: '150000' },
  { name: 'Визитки, печать 500 шт.', qty: '2', unit: 'упак.', price: '12500' },
]

/** id секции образца: цель ссылки «Смотреть образец КП» над формой. */
export const SAMPLE_ANCHOR_ID = 'obrazec'

/** Текст ссылки-якоря над формой (стрелка вниз: образец ниже формы). */
export const kpSampleAnchorLabel: Record<ToolLang, string> = {
  ru: 'Смотреть образец КП ↓',
  kk: 'КҰ үлгісін көру ↓',
  en: 'See the sample offer ↓',
}

/** Гайд «Счёт, АВР, накладная и КП» есть на ru и kk; английского нет — en ведёт на русский. */
export const KP_GUIDE_SLUG = 'dokumenty-ip-kazakhstan'
export const kpGuidePath = (lang: ToolLang) => toolGuidePath(KP_GUIDE_SLUG, lang)

export const SAMPLE_NUMBER = '1'
export const SAMPLE_DATE = '15.01.2026'
/** Срок действия — 30 дней от даты составления, как по умолчанию в инструменте. */
export const SAMPLE_VALID_UNTIL = '14.02.2026'
export const SAMPLE_NOTE = 'Срок выполнения: 10 рабочих дней. Оплата: 50% предоплата, остаток после сдачи работ.'

export const SAMPLE_VAT_RATE = 16
export const SAMPLE_TOTAL = kpTotal(SAMPLE_ROWS)
/** «В том числе» НДС: цены с НДС, налог выделяется из итога (как печатает generateKP). */
export const SAMPLE_VAT = kpVatIncluded(SAMPLE_TOTAL)
/** Итого без НДС по формуле generateKP: Math.round(total / 1.16). */
export const SAMPLE_NET = Math.round(SAMPLE_TOTAL / 1.16)

export const SAMPLE_SUPPLIER = {
  name: 'ИП Пример',
  bin: '000000000000',
  address: 'Республика Казахстан, г. Пример, ул. Образцовая, 1',
  phone: '+7 000 000 00 00',
  email: 'sales@example.com',
  director: 'Образцов О.О.',
}

export const SAMPLE_BUYER = { name: 'ТОО «Образец»', bin: '000000000001' }

const tenge = (n: number) => `${formatSampleMoney(n)} ₸`

/** Вымышленные данные образца на каждом языке документа (цифры и реквизиты общие). */
export interface SampleLangData {
  supplier: { name: string; address: string; director: string }
  buyerName: string
  rows: KpRow[]
  note: string
}

export const SAMPLE_BY_LANG: Record<KpLang, SampleLangData> = {
  ru: { supplier: SAMPLE_SUPPLIER, buyerName: SAMPLE_BUYER.name, rows: SAMPLE_ROWS, note: SAMPLE_NOTE },
  kk: {
    supplier: { name: 'ЖК Үлгі', address: 'Қазақстан Республикасы, Үлгі қ., Үлгілік к-сі, 1', director: 'Үлгілік Ү.Ү.' },
    buyerName: '«Үлгі» ЖШС',
    rows: [
      { name: 'Логотип пен фирмалық стильді әзірлеу', qty: '1', unit: 'услуга', price: '150000' },
      { name: 'Визиткалар, 500 дана басып шығару', qty: '2', unit: 'упак.', price: '12500' },
    ],
    note: 'Орындау мерзімі: 10 жұмыс күні. Төлем: 50% алдын ала төлем, қалғаны жұмыс тапсырылған соң.',
  },
  en: {
    supplier: { name: 'Sole proprietor Sample', address: 'Republic of Kazakhstan, Sample City, 1 Sample St.', director: 'Sample S.S.' },
    buyerName: 'Sample LLP',
    rows: [
      { name: 'Logo and brand identity design', qty: '1', unit: 'услуга', price: '150000' },
      { name: 'Business cards, print run of 500', qty: '2', unit: 'упак.', price: '12500' },
    ],
    note: 'Lead time: 10 business days. Payment: 50% prepayment, the rest after delivery.',
  },
}

const SAMPLE_CAPTIONS: Record<KpLang, { header: string; contacts: string }> = {
  ru: { header: 'Шапка предложения', contacts: 'Контакты' },
  kk: { header: 'Ұсыныстың тақырып бөлігі', contacts: 'Байланыс' },
  en: { header: 'Proposal header', contacts: 'Contacts' },
}

/** Содержимое бланка на языке документа (по умолчанию русский, как печатает generateKP). */
export function buildKpSampleDoc(lang: KpLang = 'ru'): SampleDoc {
  const S = kpStrings(lang)
  const d = SAMPLE_BY_LANG[lang]
  const s = d.supplier
  const c = SAMPLE_CAPTIONS[lang]
  const lines = kpLines(d.rows)
  const titleSep = lang === 'kk' ? ', ' : ' '
  return {
    bankCaption: c.header,
    bankRows: [
      [
        { label: S.supplier, value: s.name },
        { label: S.bin.replace(/:\s*$/, ''), value: SAMPLE_SUPPLIER.bin, center: true },
        { label: c.contacts, value: `${S.tel}${SAMPLE_SUPPLIER.phone} · ${SAMPLE_SUPPLIER.email}`, center: true },
      ],
    ],
    title: `${S.title} ${S.numberSign}${SAMPLE_NUMBER}${titleSep}${S.dateLine(SAMPLE_DATE)}`,
    parties: [
      { label: S.supplier, value: `${s.name}, ${S.bin}${SAMPLE_SUPPLIER.bin}, ${s.address}` },
      { label: S.buyer, value: `${d.buyerName}, ${S.bin}${SAMPLE_BUYER.bin}` },
    ],
    columns: [S.colNo, S.colName, S.colQty, S.colUnit, S.colPrice, S.colSum],
    rightAlignedColumns: [4, 5],
    nameColumn: 1,
    rows: lines.map((l, i) => ({
      cells: [String(i + 1), l.name, String(l.qty), kpUnitLabel(l.unit, lang), tenge(l.price), tenge(l.qty * l.price)],
    })),
    totals: [
      { label: S.subtotalNoVat, value: tenge(SAMPLE_NET) },
      { label: S.vat16, value: tenge(SAMPLE_VAT) },
      { label: S.totalDue, value: tenge(SAMPLE_TOTAL) },
    ],
    summaryLines: [
      `${S.note}: ${d.note}`,
      `${S.dateIssued}: ${SAMPLE_DATE}`,
      `${S.validUntil}: ${SAMPLE_VALID_UNTIL}`,
    ],
    signatureLabel: S.signer,
    signatureName: s.director,
  }
}

// Тексты вокруг образца. Пункты — только то, что уже сказано на странице
// инструмента (dict.ts: FAQ, подсказки к полям) и в гайде dokumenty-ip-kazakhstan;
// у КП нет установленной формы, поэтому ничего сверх этого не обещаем.
export const kpSampleCopy: Record<ToolLang, SampleCopy> = {
  ru: {
    heading: 'Образец коммерческого предложения',
    ribbon: 'Пример',
    intro:
      'Так выглядит готовое КП: данные поставщика, покупатель, позиции с ценами, итог с НДС, срок действия и строка подписи. Все данные в примере вымышленные.',
    pointsTitle: 'Что указать в коммерческом предложении',
    points: [
      'Кто предлагает: название ИП или ТОО, БИН/ИИН и контакты.',
      'Кому и что именно: позиции с количеством и ценой, затем итоговая сумма.',
      'Срок действия и условия: сроки, доставка, порядок оплаты. Если срок действия не указан, в КП ставится 30 дней.',
      'НДС: плательщик НДС выбирает «С НДС 16%» и указывает цены с налогом, сумма НДС выделяется в итоге. Подпись и печать для КП не обязательны.',
    ],
    caption: 'Пример с вымышленными данными: БИН, телефон, почта и названия не принадлежат реальным компаниям.',
    scrollLabel: 'Образец коммерческого предложения, таблицу можно прокрутить по горизонтали',
  },
  kk: {
    heading: 'Коммерциялық ұсыныстың үлгісі',
    ribbon: 'Мысал',
    intro:
      'Дайын КҰ осылай көрінеді: жеткізушінің деректері, сатып алушы, бағасы көрсетілген позициялар, ҚҚС бар жиынтығы, қолданылу мерзімі және қол қою жолы. Мысалдағы барлық деректер ойдан шығарылған.',
    pointsTitle: 'Коммерциялық ұсынысқа не жазу керек',
    points: [
      'Кім ұсынады: ЖК немесе ЖШС атауы, БСН/ЖСН және байланыс деректері.',
      'Кімге және нақты не: саны мен бағасы көрсетілген позициялар, содан кейін жалпы сома.',
      'Қолданылу мерзімі және шарттар: мерзімдер, жеткізу, төлеу тәртібі. Қолданылу мерзімі көрсетілмесе, КҰ-ға 30 күн қойылады.',
      'ҚҚС: ҚҚС төлеушісі «ҚҚС 16% қоса алғанда» дегенді таңдап, бағаларды салықпен бірге жазады, ҚҚС сомасы қорытындыда бөлек шығады. КҰ үшін қол мен мөр міндетті емес.',
    ],
    caption: 'Мысалдағы БСН, телефон, пошта және атаулар нақты компанияларға тиесілі емес. Ұсыныс осы бет тілінде (қазақша) жасалады.',
    scrollLabel: 'Коммерциялық ұсыныстың үлгісі, кестені көлденеңінен жылжытуға болады',
  },
  en: {
    heading: 'Commercial proposal: sample',
    ribbon: 'Example',
    intro:
      'This is what a finished commercial proposal looks like: the supplier’s details, the buyer, items with prices, a total with VAT, the validity date and a signature line. All data in the example is fictional.',
    pointsTitle: 'What to include in a commercial proposal',
    points: [
      'Who is offering: the business name, BIN/IIN (the business or personal tax ID) and contacts.',
      'To whom and what exactly: items with quantity and price, then the total.',
      'Validity and terms: timelines, delivery, payment. If you leave the validity date empty, the proposal is valid for 30 days.',
      'VAT: a VAT payer chooses “VAT 16% included” and enters prices including tax, so the VAT amount is shown separately in the total. A signature and a stamp are not required for a proposal.',
    ],
    caption: 'The BIN, phone, email and names in the example are fictional and belong to no real company. The proposal is generated in the language of this page.',
    scrollLabel: 'Sample commercial proposal, the table scrolls horizontally',
  },
}
