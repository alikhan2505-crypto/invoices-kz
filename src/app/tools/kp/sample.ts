import { formatSampleMoney, type SampleCopy, type SampleDoc } from '@/lib/tools-i18n/toolSample'
import { toolGuidePath, type ToolLang } from '@/lib/tools-i18n'
import { kpLines, kpTotal, kpVatIncluded, type KpRow } from './calc'

// Образец для блока «Образец» под формой /tools/kp (ToolSample). Все данные
// ВЫМЫШЛЕННЫЕ: БИН из нулей, телефон из нулей, почта на example.com — реальных
// реквизитов здесь быть не должно (тест это проверяет). Бланк повторяет
// раскладку, которую печатает generateKP при vatType = 'vat_16' и без банка
// (инструмент банк в КП не спрашивает): шапка с данными поставщика, номер и
// дата, стороны, таблица позиций без колонки «Код», итоги, примечание,
// подпись, дата составления и срок действия. НДС и итог считаются теми же
// функциями calc.ts, что и в инструменте.

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

/** Содержимое бланка — русское на всех языках страницы (генератор печатает русский бланк). */
export function buildKpSampleDoc(): SampleDoc {
  const s = SAMPLE_SUPPLIER
  const lines = kpLines(SAMPLE_ROWS)
  return {
    bankCaption: 'Шапка предложения',
    bankRows: [
      [
        { label: 'Поставщик', value: s.name },
        { label: 'БИН', value: s.bin, center: true },
        { label: 'Контакты', value: `Тел: ${s.phone} · ${s.email}`, center: true },
      ],
    ],
    title: `Коммерческое предложение № ${SAMPLE_NUMBER} от ${SAMPLE_DATE}`,
    parties: [
      { label: 'Поставщик', value: `${s.name}, БИН: ${s.bin}, ${s.address}` },
      { label: 'Покупатель', value: `${SAMPLE_BUYER.name}, БИН: ${SAMPLE_BUYER.bin}` },
    ],
    columns: ['№', 'Наименование', 'Кол-во', 'Ед.', 'Цена', 'Сумма'],
    rightAlignedColumns: [4, 5],
    nameColumn: 1,
    rows: lines.map((l, i) => ({
      cells: [String(i + 1), l.name, String(l.qty), l.unit, tenge(l.price), tenge(l.qty * l.price)],
    })),
    totals: [
      { label: 'Итого без НДС:', value: tenge(SAMPLE_NET) },
      { label: `НДС ${SAMPLE_VAT_RATE}%:`, value: tenge(SAMPLE_VAT) },
      { label: 'ИТОГО К ОПЛАТЕ:', value: tenge(SAMPLE_TOTAL) },
    ],
    summaryLines: [
      `Примечание: ${SAMPLE_NOTE}`,
      `Дата составления: ${SAMPLE_DATE}`,
      `Действителен до: ${SAMPLE_VALID_UNTIL}`,
    ],
    signatureLabel: 'Руководитель / Представитель',
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
    caption: 'Ұсыныс бланкісі орыс тілінде шығады. Мысалдағы БСН, телефон, пошта және атаулар нақты компанияларға тиесілі емес.',
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
    caption: 'The generated form is in Russian. The BIN, phone, email and names in the example are fictional and belong to no real company.',
    scrollLabel: 'Sample commercial proposal, the table scrolls horizontally',
  },
}
