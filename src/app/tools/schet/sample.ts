import { formatSampleMoney, type SampleCopy, type SampleDoc } from '@/lib/tools-i18n/toolSample'
import type { ToolLang } from '@/lib/tools-i18n'
import { documentRows, documentTotal, vatIncluded, type Row, type VatType } from './calc'

// Образец для блока «Образец» под формой /tools/schet (ToolSample). Все данные
// ВЫМЫШЛЕННЫЕ: БИН из нулей, «Банк Образец», БИК SAMPLEKZ — реальных БИН/ИИК
// здесь быть не должно (тест это проверяет). Бланк повторяет раскладку, которую
// печатает generateInvoicePDF: банковский блок, стороны, таблица позиций, итог,
// НДС, сумма прописью, подпись. Итог и НДС считаются теми же функциями calc.ts,
// что и в инструменте, — по тем же строкам, что в таблице.

/** Ставка НДС в образце; совпадает с «vat_16» в calc.ts (НДС выделяется из итога). */
export const SAMPLE_VAT_RATE = 16
export const SAMPLE_VAT_TYPE: VatType = 'vat_16'

/** Строки образца в том же виде, в каком их хранит форма (цены уже с НДС). */
export const SAMPLE_ROWS: Row[] = [
  { name: 'Консультационные услуги', qty: '1', unit: 'услуга', price: '120000' },
  { name: 'Бумага офисная А4, 500 листов', qty: '12', unit: 'упак.', price: '2450' },
]

/** id секции образца: цель ссылки «Смотреть образец счёта» над формой. */
export const SAMPLE_ANCHOR_ID = 'obrazec'

/** Текст ссылки-якоря над формой (стрелка вниз: образец ниже формы). */
export const schetSampleAnchorLabel: Record<ToolLang, string> = {
  ru: 'Смотреть образец счёта ↓',
  kk: 'Шот үлгісін көру ↓',
  en: 'See the sample invoice ↓',
}

/** Статья о реквизитах счёта есть на ru и kk; английской нет — en ведёт на русскую. */
export const schetGuidePath = (lang: ToolLang) =>
  lang === 'kk' ? '/guides/kk/kak-vystavit-schet-ip' : '/guides/kak-vystavit-schet-ip'

export const SAMPLE_NUMBER = '1'
export const SAMPLE_DATE = '15.01.2026'

export const SAMPLE_TOTAL = documentTotal(SAMPLE_ROWS)
export const SAMPLE_VAT = vatIncluded(SAMPLE_TOTAL, SAMPLE_VAT_TYPE)

/**
 * Итог прописью так, как его печатает generateInvoicePDF (numberToWords там не
 * экспортируется, поэтому строка записана здесь, а тест сверяет её с HTML,
 * который реально выдаёт генератор, — расхождение сразу покажет красный тест).
 */
export const SAMPLE_TOTAL_WORDS = 'сто сорок девять тысяч четыреста тенге 00 тиын'

export const SAMPLE_SUPPLIER = {
  name: 'ИП Пример',
  bin: '000000000000',
  address: 'Республика Казахстан, г. Пример, ул. Образцовая, 1',
  director: 'Образцов О.О.',
  bankName: 'АО «Банк Образец»',
  iik: 'KZ000000000000000000',
  bik: 'SAMPLEKZ',
  kbe: '19',
  knp: '849',
}

export const SAMPLE_BUYER = { name: 'ТОО «Образец»', bin: '000000000001' }

/** Содержимое бланка — русское на всех языках страницы (генератор печатает русский бланк). */
export function buildSchetSampleDoc(): SampleDoc {
  const s = SAMPLE_SUPPLIER
  const rows = documentRows(SAMPLE_ROWS)
  return {
    bankCaption: 'Образец платежного поручения',
    bankRows: [
      [
        { label: 'Бенефициар:', value: `${s.name}, БИН: ${s.bin}` },
        { label: 'ИИК', value: s.iik, center: true },
        { label: 'КБе', value: s.kbe, center: true },
      ],
      [
        { label: 'Банк бенефициара:', value: s.bankName },
        { label: 'БИК', value: s.bik, center: true },
        { label: 'Код назначения платежа', value: s.knp, center: true },
      ],
    ],
    title: `Счет на оплату №${SAMPLE_NUMBER} от ${SAMPLE_DATE}`,
    parties: [
      { label: 'Поставщик:', value: `ИИН/БИН: ${s.bin}, ${s.name}, ${s.address}` },
      { label: 'Покупатель:', value: `ИИН/БИН: ${SAMPLE_BUYER.bin}, ${SAMPLE_BUYER.name}` },
    ],
    columns: ['№', 'Наименование', 'Кол-во', 'Ед.', 'Цена', 'Сумма'],
    rightAlignedColumns: [4, 5],
    nameColumn: 1,
    rows: rows.map((r, i) => ({
      cells: [String(i + 1), r.name, String(r.qty), r.unit, formatSampleMoney(r.price), formatSampleMoney(r.qty * r.price)],
    })),
    totals: [
      { label: 'Итого:', value: formatSampleMoney(SAMPLE_TOTAL) },
      { label: `В том числе НДС ${SAMPLE_VAT_RATE}%:`, value: formatSampleMoney(SAMPLE_VAT) },
    ],
    summaryLines: [
      `Всего наименований ${rows.length}, на сумму ${formatSampleMoney(SAMPLE_TOTAL)} KZT`,
      `Всего к оплате: ${SAMPLE_TOTAL_WORDS}`,
    ],
    signatureLabel: 'Руководитель',
    signatureName: s.director,
  }
}

// Тексты вокруг образца. Пункты — из гайда kak-vystavit-schet-ip (ru/kk) и их
// перевод на английский; ничего сверх гайда не обещаем.
export const schetSampleCopy: Record<ToolLang, SampleCopy> = {
  ru: {
    heading: 'Образец счёта на оплату',
    ribbon: 'Пример',
    intro:
      'Так выглядит готовый счёт на оплату: реквизиты поставщика и банка, покупатель, позиции с итогом, НДС и сумма прописью. Все данные в примере вымышленные.',
    pointsTitle: 'Что должно быть в счёте на оплату',
    points: [
      'Поставщик и банк: название ИП или ТОО, БИН (для ИП — ИИН), юридический адрес, наименование банка, ИИК и БИК.',
      'Покупатель: название и БИН/ИИН. Адрес и телефон покупателя указывать не обязательно.',
      'Номер и дата счёта: нужны, чтобы сослаться на счёт в платёжном поручении.',
      'Позиции и итог: наименование, количество, цена и сумма по каждой позиции, затем итог. Плательщик НДС выделяет налог отдельной строкой, остальные пишут «без НДС».',
    ],
    caption: 'Пример с вымышленными данными: БИН, ИИК и названия не принадлежат реальным компаниям.',
    scrollLabel: 'Образец счёта на оплату, таблицу можно прокрутить по горизонтали',
  },
  kk: {
    heading: 'Төлем шотының үлгісі',
    ribbon: 'Мысал',
    intro:
      'Дайын төлем шоты осылай көрінеді: жеткізуші мен банк деректемелері, сатып алушы, жиынтығы бар позициялар, ҚҚС және сомасы жазбаша. Мысалдағы барлық деректер ойдан шығарылған.',
    pointsTitle: 'Төлем шотында не болуы керек',
    points: [
      'Жеткізуші және банк: ЖК немесе ЖШС атауы, БСН (ЖК үшін — ЖСН), заңды мекенжай, банк атауы, ЖСК және БСК.',
      'Сатып алушы: атауы және БСН/ЖСН. Сатып алушының мекенжайы мен телефонын көрсету міндетті емес.',
      'Шоттың нөмірі мен күні: төлем тапсырмасында шотқа сілтеме жасау үшін қажет.',
      'Позициялар және жиынтық: әр позицияның атауы, саны, бағасы және сомасы, содан кейін жиынтық. ҚҚС төлеушісі салықты бөлек жолмен көрсетеді, қалғандары «ҚҚС-сыз» деп жазады.',
    ],
    caption: 'Шот бланкісі орыс тілінде шығады. Мысалдағы БСН, ЖСК және атаулар нақты компанияларға тиесілі емес.',
    scrollLabel: 'Төлем шотының үлгісі, кестені көлденеңінен жылжытуға болады',
  },
  en: {
    heading: 'Invoice for payment: sample',
    ribbon: 'Example',
    intro:
      'This is what a finished invoice for payment looks like: supplier and bank details, the buyer, line items with a total, VAT and the amount in words. All data in the example is fictional.',
    pointsTitle: 'What an invoice for payment must include',
    points: [
      'Supplier and bank: the name of the sole proprietorship or LLP, BIN (IIN for a sole proprietor), registered address, bank name, IIK (account number) and BIC.',
      'Buyer: name and BIN/IIN. The buyer’s address and phone number are optional.',
      'Invoice number and date, so the payment order can refer to the invoice.',
      'Line items and total: name, quantity, price and amount for each item, then the total. A VAT payer shows the tax on a separate line; everyone else writes “no VAT”.',
    ],
    caption: 'The generated form is in Russian. The BIN, account and names in the example are fictional and belong to no real company.',
    scrollLabel: 'Sample invoice for payment, the table scrolls horizontally',
  },
}
