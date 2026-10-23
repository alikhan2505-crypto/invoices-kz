import { formatSampleMoney, type SampleCopy, type SampleDoc } from '@/lib/tools-i18n/toolSample'
import type { ToolLang } from '@/lib/tools-i18n'
import { documentRows, documentTotal, vatIncluded, type Row, type VatType } from './calc'

// Образец для блока «Образец» под формой /tools/avr (ToolSample). Все данные
// ВЫМЫШЛЕННЫЕ: БИН из нулей, «ИП Пример», «ТОО Образец» — реальных БИН, имён и
// адресов здесь быть не должно (тест это проверяет). Бланк повторяет раскладку,
// которую печатает buildAVRHtml (форма Р-1): шапка-приложение, договор и номер,
// стороны, таблица работ, итог, строки про запасы и приложение, подписи.
// Итог считается теми же функциями calc.ts, что и в инструменте.
//
// НДС: в инструменте по умолчанию выбрано «Без НДС» (EMPTY.vatType), поэтому
// образец показывает акт без НДС — под «Итого» строки налога нет. Как считается
// НДС 16% у плательщика, описано в пункте под образцом, а сумма для тех же строк
// (SAMPLE_VAT_IF_PAYER) сверяется тестом с тем, что печатает генератор при
// выбранном «С НДС 16%».

/** Тип НДС в образце — по умолчанию в форме («Без НДС»). */
export const SAMPLE_VAT_TYPE: VatType = 'no_vat'

/** Строки образца в том же виде, в каком их хранит форма. */
export const SAMPLE_ROWS: Row[] = [
  { name: 'Консультационные услуги по бухгалтерскому учёту', qty: '1', unit: 'услуга', price: '120000' },
  { name: 'Обучение сотрудников работе с отчётностью', qty: '8', unit: 'час', price: '5000' },
]

/** id секции образца: цель ссылки «Смотреть образец акта» над формой. */
export const SAMPLE_ANCHOR_ID = 'obrazec'

/** Текст ссылки-якоря над формой (стрелка вниз: образец ниже формы). */
export const avrSampleAnchorLabel: Record<ToolLang, string> = {
  ru: 'Смотреть образец акта ↓',
  kk: 'Акт үлгісін көру ↓',
  en: 'See the sample act ↓',
}

/** Гайд «документы ИП» есть на ru и kk; английской версии нет — en ведёт на русскую. */
export const AVR_GUIDE_SLUG = 'dokumenty-ip-kazakhstan'
export const avrGuidePath = (lang: ToolLang) => (lang === 'kk' ? `/guides/kk/${AVR_GUIDE_SLUG}` : `/guides/${AVR_GUIDE_SLUG}`)

export const SAMPLE_NUMBER = '1'
export const SAMPLE_DATE = '15.01.2026'
export const SAMPLE_CONTRACT_NUMBER = '12'
export const SAMPLE_CONTRACT_DATE = '10.01.2026'

export const SAMPLE_TOTAL = documentTotal(SAMPLE_ROWS)
/** НДС, который появился бы под итогом при выбранном «С НДС 16%» (для пункта-пояснения и теста). */
export const SAMPLE_VAT_IF_PAYER = vatIncluded(SAMPLE_TOTAL, 'vat_16')

export const SAMPLE_EXECUTOR = {
  name: 'ИП Пример',
  bin: '000000000000',
  address: 'Республика Казахстан, г. Пример, ул. Образцовая, 1',
  director: 'Образцов О.О.',
}

export const SAMPLE_CUSTOMER = {
  name: 'ТОО «Образец»',
  bin: '000000000001',
  address: 'Республика Казахстан, г. Пример, ул. Тестовая, 2',
}

/**
 * Строки под таблицей и подпись — как в buildAVRHtml. В самом генераторе в
 * первой строке опечатка («от заказчик____»); в образце слово дописано, тест
 * сверяет общую часть строки.
 */
export const SAMPLE_STOCK_LINE = 'Сведения об использовании запасов, полученных от заказчика_______________________ наименование, количество, стоимость'
export const SAMPLE_APPENDIX_LINE =
  'Приложение: Перечень документации, в том числе отчёт(ы) о маркетинговых, научных исследованиях, консультационных и прочих услугах (обязательны при их наличии) на _____ страниц'
export const SAMPLE_ACCEPT_LINE = 'Принял (Заказчик): должность, подпись, расшифровка подписи. М.П. Дата подписания (принятия) работ (услуг): ____________________'

/** Содержимое бланка — русское на всех языках страницы (генератор печатает русский бланк). */
export function buildAvrSampleDoc(): SampleDoc {
  const e = SAMPLE_EXECUTOR
  const c = SAMPLE_CUSTOMER
  const rows = documentRows(SAMPLE_ROWS)
  return {
    bankCaption: 'Приложение 50 к приказу Министра финансов Республики Казахстан от 20 декабря 2012 года № 562. Форма Р-1',
    bankRows: [
      [
        { label: 'Договор (контракт)', value: `№${SAMPLE_CONTRACT_NUMBER} от ${SAMPLE_CONTRACT_DATE} года` },
        { label: 'Номер документа', value: SAMPLE_NUMBER, center: true },
        { label: 'Дата составления', value: SAMPLE_DATE, center: true },
      ],
    ],
    title: 'АКТ ВЫПОЛНЕННЫХ РАБОТ (ОКАЗАННЫХ УСЛУГ)',
    parties: [
      { label: 'Заказчик', value: `${c.name}, ${c.address}. ИИН/БИН: ${c.bin}` },
      { label: 'Исполнитель', value: `${e.name}, ${e.address}. ИИН/БИН: ${e.bin}` },
    ],
    columns: [
      '№ п/п',
      'Наименование работ (услуг)',
      'Дата выполнения работ (оказания услуг)',
      'Сведения об отчёте (при наличии)',
      'Единица измерения',
      'Количество',
      'Цена за единицу',
      'Стоимость',
    ],
    rightAlignedColumns: [6, 7],
    nameColumn: 1,
    rows: rows.map((r, i) => ({
      cells: [String(i + 1), r.name, SAMPLE_DATE, '—', r.unit, String(r.qty), formatSampleMoney(r.price), formatSampleMoney(r.qty * r.price)],
    })),
    totals: [{ label: 'Итого', value: formatSampleMoney(SAMPLE_TOTAL) }],
    summaryLines: [SAMPLE_STOCK_LINE, SAMPLE_APPENDIX_LINE, SAMPLE_ACCEPT_LINE],
    signatureLabel: 'Сдал (Исполнитель)',
    signatureName: e.director,
  }
}

// Тексты вокруг образца. Пункты — только из того, что уже сказано на странице
// инструмента (dict.ts: FAQ про АВР, Р-1 и НДС 16%, подписи полей) и в гайде
// dokumenty-ip-kazakhstan; новых юридических требований не добавляем. Названия
// на kk — как в словаре инструмента (орындаушы, тапсырыс беруші, ОЖА, БСН, ҚҚС).
export const avrSampleCopy: Record<ToolLang, SampleCopy> = {
  ru: {
    heading: 'Образец акта выполненных работ',
    ribbon: 'Пример',
    intro:
      'Так выглядит готовый АВР по форме Р-1: стороны, договор, перечень работ и итог. Все данные в примере вымышленные, а НДС по умолчанию не выделяется.',
    pointsTitle: 'Что должно быть в акте выполненных работ',
    points: [
      'Стороны: название, БИН/ИИН и адрес исполнителя и заказчика.',
      'Договор (контракт), номер акта и дата составления.',
      'Перечень работ или услуг: наименование, дата выполнения, количество, цена за единицу и стоимость, затем итог. Плательщик НДС выбирает «С НДС 16%»: налог выделяется из итога по формуле итог × 16 / 116.',
      'Подписи: акт подписывают обе стороны, исполнитель сдаёт работы, заказчик принимает. Так заказчик подтверждает, что работа принята в полном объёме и претензий нет.',
    ],
    caption:
      'Пример с вымышленными данными: БИН, названия и адреса не принадлежат реальным компаниям. В образце подписи сокращены: в готовом акте у исполнителя и заказчика по своему блоку с должностью, подписью и расшифровкой, расположенному рядом.',
    scrollLabel: 'Образец акта выполненных работ, таблицу можно прокрутить по горизонтали',
  },
  kk: {
    heading: 'Орындалған жұмыстар актісінің үлгісі',
    ribbon: 'Мысал',
    intro:
      'Дайын ОЖА-ны Р-1 нысаны бойынша осылай көрінеді: тараптар, шарт, жұмыстар тізбесі және жиынтық. Мысалдағы барлық деректер ойдан шығарылған, ал ҚҚС әдепкі бойынша бөлінбейді.',
    pointsTitle: 'Орындалған жұмыстар актісінде не болуы керек',
    points: [
      'Тараптар: орындаушы мен тапсырыс берушінің атауы, БСН/ЖСН және мекенжайы.',
      'Шарт (келісімшарт), актінің нөмірі және жасалған күні.',
      'Жұмыстар немесе қызметтер тізбесі: атауы, орындалған күні, саны, бір бірліктің бағасы және құны, содан кейін жиынтық. ҚҚС төлеушісі «ҚҚС 16% қоса алғанда» таңдайды: салық жиынтықтан сома × 16 / 116 формуласымен бөлініп шығарылады.',
      'Қолтаңбалар: актіге екі тарап қол қояды, орындаушы жұмысты тапсырады, тапсырыс беруші қабылдайды. Осылайша тапсырыс беруші жұмыстың толық көлемде қабылданғанын және наразылығы жоқ екенін растайды.',
    ],
    caption:
      'Акт бланкісі орыс тілінде шығады. Мысалдағы БСН, атаулар мен мекенжайлар нақты компанияларға тиесілі емес. Үлгіде қолтаңбалар қысқартылған: дайын актіде орындаушы мен тапсырыс берушінің әрқайсысында лауазымы, қолтаңбасы және толық аты-жөні бар жеке блок қатар тұрады.',
    scrollLabel: 'Орындалған жұмыстар актісінің үлгісі, кестені көлденеңінен жылжытуға болады',
  },
  en: {
    heading: 'Certificate of completed works (AVR): sample',
    ribbon: 'Example',
    intro:
      'This is what a finished AVR on form R-1 looks like: the parties, the contract, the list of works and the total. All data in the example is fictional, and VAT is not extracted by default.',
    pointsTitle: 'What a certificate of completed works must include',
    points: [
      'Parties: the name, BIN/IIN and address of the contractor and of the customer.',
      'The contract, the certificate number and the date it is drawn up.',
      'The list of works or services: name, date of completion, quantity, price per unit and cost, then the total. A VAT payer picks “VAT 16% included”: VAT is extracted from the total as total × 16 / 116.',
      'Signatures: both parties sign, the contractor hands over the work and the customer accepts it. This is how the customer confirms the work was accepted in full with no claims.',
    ],
    caption:
      'The generated form is in Russian. The BIN, names and addresses in the example are fictional and belong to no real company. The signatures are shortened here: in the finished act the contractor and the customer each have their own side-by-side block with a position, signature and full name.',
    scrollLabel: 'Sample certificate of completed works, the table scrolls horizontally',
  },
}
