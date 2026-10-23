import { formatSampleMoney, type SampleCopy, type SampleDoc } from '@/lib/tools-i18n/toolSample'
import type { ToolLang } from '@/lib/tools-i18n'
import { documentRows, documentTotal, vatIncluded, type Row, type VatType } from './calc'

// Образец для блока «Образец» под формой /tools/nakladnaya (ToolSample). Все
// данные ВЫМЫШЛЕННЫЕ: БИН из нулей, «ИП Пример», «ТОО Образец» — реальных БИН
// здесь быть не должно (тест это проверяет). Бланк повторяет раскладку, которую
// печатает buildNakladnayaHtml (generateNakladnaya): шапка формы З-2, организация
// с ИИН/БИН, номер и дата, отправитель и получатель, таблица товаров из 9
// столбцов со строкой «Итого», сумма прописью, подпись. Итог и НДС считаются
// теми же функциями calc.ts, что и в инструменте, — по тем же строкам, что в
// таблице.

/** Ставка НДС в образце; совпадает с «vat_16» в calc.ts (НДС выделяется из итога). */
export const SAMPLE_VAT_RATE = 16
export const SAMPLE_VAT_TYPE: VatType = 'vat_16'

/**
 * Строки образца в том же виде, в каком их хранит форма (цены уже с НДС).
 * Суммы подобраны так, чтобы итог прописью читался правильно: генератор
 * склоняет «тысяча/тысячи/тысяч» только для 1–9 тысяч, а для составных чисел
 * вроде «84 тысячи» пишет «четыре тысяч», поэтому итог — ровно 85 000.
 */
export const SAMPLE_ROWS: Row[] = [
  { name: 'Бумага офисная А4, 500 листов', qty: '12', unit: 'упак.', price: '2450' },
  { name: 'Картридж для лазерного принтера', qty: '2', unit: 'шт', price: '27800' },
]

/** id секции образца: цель ссылки «Смотреть образец накладной» над формой. */
export const SAMPLE_ANCHOR_ID = 'obrazec'

/** Текст ссылки-якоря над формой (стрелка вниз: образец ниже формы). */
export const nakladnayaSampleAnchorLabel: Record<ToolLang, string> = {
  ru: 'Смотреть образец накладной ↓',
  kk: 'Жүкқұжат үлгісін көру ↓',
  en: 'See the sample delivery note ↓',
}

export const SAMPLE_NUMBER = '1'
export const SAMPLE_DATE = '15.01.2026'

export const SAMPLE_TOTAL = documentTotal(SAMPLE_ROWS)
export const SAMPLE_VAT = vatIncluded(SAMPLE_TOTAL, SAMPLE_VAT_TYPE)

/**
 * Итог прописью так, как его печатает buildNakladnayaHtml (numToWordsNakl там
 * не экспортируется, поэтому строка записана здесь, а тест сверяет её с HTML,
 * который реально выдаёт генератор, — расхождение сразу покажет красный тест).
 */
export const SAMPLE_TOTAL_WORDS = 'восемьдесят пять тысяч тенге 00 тиын'
/** «Всего отпущено количество запасов (прописью)»: две позиции. */
export const SAMPLE_COUNT_WORDS = 'две позиции'

export const SAMPLE_SUPPLIER = {
  name: 'ИП Пример',
  bin: '000000000000',
  address: 'Республика Казахстан, г. Пример, ул. Образцовая, 1',
  director: 'Образцов О.О.',
}

export const SAMPLE_BUYER = { name: 'ТОО «Образец»', bin: '000000000001' }

/** НДС по одной строке — та же формула, что в генераторе (round(сумма − сумма / 1,16)). */
export const lineVat = (amount: number) => Math.round(amount - amount / 1.16)

/** Содержимое бланка — русское на всех языках страницы (генератор печатает русский бланк). */
export function buildNakladnayaSampleDoc(): SampleDoc {
  const s = SAMPLE_SUPPLIER
  const rows = documentRows(SAMPLE_ROWS)
  return {
    // Шапка формы и организация с ИИН/БИН, номером и датой — в слоте «банковского
    // блока» общего компонента (у накладной банка нет).
    bankCaption: 'Приложение 26 к приказу Министра финансов Республики Казахстан от 20 декабря 2012 года № 562. Форма З-2',
    bankRows: [
      [
        { label: 'Организация (индивидуальный предприниматель)', value: `${s.name}, ${s.address}` },
        { label: 'ИИН/БИН', value: s.bin, center: true },
        { label: 'Номер', value: SAMPLE_NUMBER, center: true },
        { label: 'Дата', value: SAMPLE_DATE, center: true },
      ],
    ],
    title: 'НАКЛАДНАЯ НА ОТПУСК ЗАПАСОВ НА СТОРОНУ',
    parties: [
      { label: 'Отправитель:', value: `${s.name}, БИН: ${s.bin}` },
      { label: 'Получатель:', value: `${SAMPLE_BUYER.name}, БИН: ${SAMPLE_BUYER.bin}` },
    ],
    columns: [
      '№', 'Наименование, характеристика', 'Номенкла-турный номер', 'Единица измерения',
      'Кол-во, подлежит отпуску', 'Кол-во, отпущено', 'Цена за единицу, в KZT', 'Сумма с НДС, в KZT', 'Сумма НДС, в KZT',
    ],
    rightAlignedColumns: [6, 7, 8],
    nameColumn: 1,
    rows: [
      ...rows.map((r, i) => ({
        cells: [
          String(i + 1), r.name, String(i + 1), r.unit, String(r.qty), String(r.qty),
          formatSampleMoney(r.price), formatSampleMoney(r.qty * r.price), formatSampleMoney(lineVat(r.qty * r.price)),
        ],
      })),
      { cells: ['', 'Итого', '', '', 'x', 'x', 'x', formatSampleMoney(SAMPLE_TOTAL), formatSampleMoney(SAMPLE_VAT)] },
    ],
    totals: [],
    summaryLines: [
      `Всего отпущено количество запасов (прописью): ${SAMPLE_COUNT_WORDS}`,
      `на сумму (прописью), в KZT: ${SAMPLE_TOTAL_WORDS}`,
    ],
    signatureLabel: 'Отпуск разрешил',
    signatureName: s.director,
  }
}

// Тексты вокруг образца. Пункты — только из того, что уже сказано на странице
// инструмента (словарь dict.ts: поля формы, ошибки, FAQ) и в гайде
// dokumenty-ip-kazakhstan; ничего сверх этого не обещаем.
export const nakladnayaSampleCopy: Record<ToolLang, SampleCopy> = {
  ru: {
    heading: 'Образец накладной на отпуск запасов',
    ribbon: 'Пример',
    intro:
      'Так выглядит готовая накладная на отпуск запасов по форме З-2: организация, отправитель и получатель, товары с количеством и ценой, итог, НДС и сумма прописью. Все данные в примере вымышленные.',
    pointsTitle: 'Что должно быть в накладной',
    points: [
      'Отправитель и получатель: название и БИН/ИИН каждой стороны. БИН получателя можно не указывать.',
      'Номер и дата накладной.',
      'Товары: наименование, единица измерения, количество, цена и сумма по каждой позиции, затем итог и сумма прописью.',
      'НДС и подписи: цены вводятся с НДС, а его сумма выделяется из итога по формуле итог × 16 / 116. Накладную подписывают обе стороны.',
    ],
    caption:
      'Пример с вымышленными данными: БИН и названия не принадлежат реальным компаниям. В готовом документе названия столбцов и сторон полнее (например, «Номер по порядку», «Организация (индивидуальный предприниматель) — отправитель»), есть столбцы про ответственного за поставку, транспортную организацию и товарно-транспортную накладную, строка с номерами столбцов 1-9 и остальные строки подписей: главный бухгалтер, получатель.',
    scrollLabel: 'Образец накладной на отпуск запасов, таблицу можно прокрутить по горизонтали',
  },
  kk: {
    heading: 'Қорларды босатуға арналған жүкқұжат үлгісі',
    ribbon: 'Мысал',
    intro:
      'Қорларды босатуға арналған дайын жүкқұжат З-2 нысаны бойынша осылай көрінеді: ұйым, жеткізуші мен алушы, саны мен бағасы бар тауарлар, жиынтығы, ҚҚС және сомасы жазбаша. Мысалдағы барлық деректер ойдан шығарылған.',
    pointsTitle: 'Жүкқұжатта не болуы керек',
    points: [
      'Жеткізуші және алушы: әр тараптың атауы мен БСН/ЖСН-і. Алушының БСН/ЖСН-ін көрсетпеуге болады.',
      'Жүкқұжаттың нөмірі мен күні.',
      'Тауарлар: әр позицияның атауы, өлшем бірлігі, саны, бағасы және сомасы, содан кейін жиынтығы мен сомасы жазбаша.',
      'ҚҚС және қолтаңбалар: бағалар ҚҚС-ты қоса алғанда енгізіледі, ал оның сомасы жалпы сомадан бөлініп шығарылады: сома × 16 / 116. Жүкқұжатқа екі тарап қол қояды.',
    ],
    caption:
      'Жүкқұжат бланкісі орыс тілінде шығады. Мысалдағы БСН және атаулар нақты компанияларға тиесілі емес. Дайын құжатта баған мен тараптардың атаулары толығырақ (мысалы, «Номер по порядку», «Организация (индивидуальный предприниматель) — отправитель»), жеткізуге жауаптыны, көлік ұйымын және тауар-көлік жүкқұжатын көрсететін бағандар, 1-9 баған нөмірлерінің жолы және басқа қолтаңба жолдары (бас бухгалтер, алушы) бар.',
    scrollLabel: 'Жүкқұжат үлгісі, кестені көлденеңінен жылжытуға болады',
  },
  en: {
    heading: 'Delivery note (form Z-2): sample',
    ribbon: 'Example',
    intro:
      'This is what a finished delivery note (issue of inventory, form Z-2) looks like: the organization, sender and recipient, goods with quantity and price, the total, VAT and the amount in words. All data in the example is fictional.',
    pointsTitle: 'What a delivery note must include',
    points: [
      'Sender and recipient: the name and BIN/IIN of each party. The recipient’s BIN/IIN can be left empty.',
      'The number and date of the delivery note.',
      'Goods: name, unit, quantity, price and amount for each item, then the total and the amount in words.',
      'VAT and signatures: prices are entered VAT-inclusive and VAT is extracted from the total as total × 16 / 116. Both parties sign the note.',
    ],
    caption:
      'The generated form is in Russian. The BIN and names in the example are fictional and belong to no real company. In the finished document the column and party headings are worded in full (for example “Serial number” instead of “№” and “Organization (sole proprietor) — sender” instead of “Sender”), and it also has columns for the person responsible for delivery, the transport organization and the waybill, a row with column numbers 1-9, and the other signature lines: chief accountant, recipient.',
    scrollLabel: 'Sample delivery note, the table scrolls horizontally',
  },
}
