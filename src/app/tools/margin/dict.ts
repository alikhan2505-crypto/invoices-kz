import type { ToolFaqItem, ToolLang, ToolSeoCopy } from '@/lib/tools-i18n'
import type { MarginInput } from '@/lib/marginCalc'
import type { KaspiDeliveryDirection, KaspiSaleType } from '@/lib/kaspiShop/margin'
import { KASPI_DELIVERY } from '@/lib/kaspiTariff'

// Все тексты /tools/margin на трёх языках: и <head> (seo), и интерфейс.
// Русский — дословно прежний текст страницы (и прежние title/description из
// удалённого layout.tsx), чтобы не сбить уже набранную выдачу. Суммы
// форматируются снаружи и приходят сюда готовыми строками.
// Схема — docs/tools-i18n-pattern.md.

export type MarginFieldKey = keyof MarginInput

export interface MarginDict {
  seo: ToolSeoCopy
  h1: string
  intro: string
  fieldLabels: Record<MarginFieldKey, string>
  fieldHints: Partial<Record<MarginFieldKey, string>>
  unitTenge: string
  unitPercent: string
  unitPieces: string
  resultTitle: string
  profitPerUnitLabel: string
  lossPerUnitLabel: string
  marginLabel: string
  markupLabel: string
  markupUndefined: string
  breakEvenLabel: string
  breakEvenHint: string
  breakEvenImpossible: string
  costBreakdownTitle: string
  breakdownCost: string
  breakdownCommission: string
  breakdownDelivery: string
  breakdownTax: string
  breakdownOther: string
  breakdownTotal: string
  monthlyTitle: string
  monthlyRevenueLabel: string
  monthlyProfitLabel: string
  lossWarning: string
  exportButton: string
  excelSheetName: string
  excelFileName: string
  excelHeaderParam: string
  excelHeaderValue: string
  ctaTitle: string
  ctaBody: (price: string) => string
  ctaLink: string
  leadPromptTitle: string
  leadPlaceholder: string
  leadSubmitButton: string
  leadSendingButton: string
  leadThanks: string
  categoryLabel: string
  categoryManual: string
  categoryHint: string
  otherToolLink: string
  /** «Как считается» — раскрывающийся блок с формулами под результатом. */
  howTitle: string
  howItems: string[]
  /** Ссылка на гайд о комиссиях Kaspi внизу страницы (/guides/komissiya-kaspi). */
  guideLink: string
  /** Короткая ссылка на тот же гайд рядом с выбором категории. */
  categoryGuideLink: string
  faqTitle: string
  /** Видимый блок вопросов; те же вопросы и ответы слово в слово уходят в FAQPage JSON-LD. */
  faq: ToolFaqItem[]
  /**
   * Названия категорий Kaspi. В KASPI_CATEGORY_COMMISSIONS они русские (так
   * их видит продавец в русском кабинете) и русское название остаётся
   * значением <option> и ключом статистики — здесь только подпись на экране.
   * Незнакомую категорию показываем по-русски.
   */
  categoryNames: Record<string, string>

  // --- Тип продажи, комиссия в акциях, доставка по сетке Kaspi (05.11.2026) ---
  saleTypeLabel: string
  saleTypeNames: Record<KaspiSaleType, string>
  /** Рассрочка Red, кредит и чужая карта комиссию не меняют (единая комиссия с 05.01.2026). */
  saleTypeNote: string
  /** Ставки акций рядом с обычными, показывается в режимах «Акция». */
  promoNote: string
  /** Режим «Акция», а ставка в поле не из таблицы Kaspi: ставку акции не подставляем. */
  promoUnknownRate: string
  surchargeLabel: string
  surchargeHint: string
  /** «Итого комиссия: 13,0 + 1,0 = 14,0 %»; числа приходят готовыми строками. */
  commissionSumLine: (base: string, extra: string, total: string) => string
  deliveryDirections: Record<KaspiDeliveryDirection | 'custom', string>
  weightLabel: string
  weightHint: string
  weightAssumedNote: string
  vatLabel: string
  vatHint: string
  expressNote: string
  customDeliveryHint: string
  /** Названия строк тарифа Kaspi по id (KASPI_DELIVERY.*[].id). */
  deliveryTierNames: Record<string, string>
  /** Итог выбранного тарифа одной строкой. */
  deliveryQuoteLine: (p: DeliveryLineParts) => string
}

export interface DeliveryLineParts {
  direction: string
  tier: string
  basis: 'amount' | 'weight'
  net: string
  total: string
  withVat: boolean
}

/** Названия строк тарифа Kaspi из самой таблицы (ru/kk уже в kaspiTariff.ts, их вычитывал основатель). */
const TIER_ROWS = [...KASPI_DELIVERY.underThreshold, ...KASPI_DELIVERY.fromThreshold]
const tierNames = (lang: 'ru' | 'kk') => Object.fromEntries(TIER_ROWS.map(r => [r.id, r[lang]]))

export const marginDict: Record<ToolLang, MarginDict> = {
  ru: {
    seo: {
      title: 'Калькулятор маржи Kaspi — прибыль с продажи',
      description:
        'Калькулятор маржи Kaspi: прибыль с продажи после комиссии, доставки и налога, маржинальность, наценка и минимальная цена. Бесплатно, выгрузка в Excel.',
      keywords:
        'калькулятор маржи kaspi, комиссия kaspi магазина расчет, как посчитать прибыль на kaspi, маржинальность товара калькулятор, минимальная цена kaspi, наценка на товар расчет, unit экономика kaspi',
      ogTitle: 'Калькулятор маржи Kaspi — сколько остаётся с продажи',
      ogDescription:
        'Прибыль, маржинальность и минимальная цена с учётом комиссии Kaspi, доставки и налога. Бесплатно, без регистрации, выгрузка в Excel.',
      ogImageAlt: 'Калькулятор маржи Kaspi — invoices.kz',
    },
    h1: 'Калькулятор маржи для Kaspi',
    intro:
      'Посчитайте, сколько остаётся с одной продажи после комиссии Kaspi, доставки и налога — и ниже какой цены опускаться нельзя. Бесплатно и без регистрации.',
    fieldLabels: {
      costPrice: 'Себестоимость',
      sellPrice: 'Цена продажи на Kaspi',
      commissionPercent: 'Комиссия Kaspi',
      deliveryCost: 'Доставка на единицу',
      taxPercent: 'Налог с оборота',
      otherCosts: 'Прочие расходы на единицу',
      monthlyUnits: 'Продаж в месяц',
    },
    fieldHints: {
      commissionPercent: 'Выберите категорию выше — ставка подставится сама',
      taxPercent: 'ИП на упрощёнке в РК с 2026 года — 4% с оборота',
      otherCosts: 'Упаковка, реклама, возвраты',
    },
    unitTenge: '₸',
    unitPercent: '%',
    unitPieces: 'шт',
    resultTitle: 'С одной продажи',
    profitPerUnitLabel: 'Прибыль',
    lossPerUnitLabel: 'Убыток',
    marginLabel: 'Маржинальность',
    markupLabel: 'Наценка',
    markupUndefined: 'укажите себестоимость',
    breakEvenLabel: 'Минимальная цена',
    breakEvenHint:
      'Ниже этой цены вы продаёте в минус — комиссия и налог берутся с цены, поэтому она выше суммы расходов.',
    breakEvenImpossible: 'Комиссия и налог забирают всю цену — заработать невозможно ни при какой цене.',
    costBreakdownTitle: 'Куда уходит цена',
    breakdownCost: 'Себестоимость',
    breakdownCommission: 'Комиссия Kaspi',
    breakdownDelivery: 'Доставка',
    breakdownTax: 'Налог',
    breakdownOther: 'Прочие расходы',
    breakdownTotal: 'Всего расходов',
    monthlyTitle: 'За месяц',
    monthlyRevenueLabel: 'Оборот',
    monthlyProfitLabel: 'Прибыль',
    lossWarning: 'При этой цене каждая продажа приносит убыток.',
    exportButton: 'Скачать расчёт в Excel',
    excelSheetName: 'Маржа',
    excelFileName: 'raschet-marzhi.xlsx',
    excelHeaderParam: 'Показатель',
    excelHeaderValue: 'Значение',
    ctaTitle: 'Знать минимальную цену мало — её нужно удержать',
    ctaBody: price =>
      `Ваша минимальная цена — ${price}. Демпинг-бот в invoices.kz сам держит вас в топе Kaspi и никогда не опускает цену ниже заданного вами порога.`,
    ctaLink: 'Посмотреть Kaspi Bot →',
    leadPromptTitle: 'Хотите узнавать о новых бесплатных инструментах?',
    leadPlaceholder: 'Email или телефон (необязательно)',
    leadSubmitButton: 'Отправить',
    leadSendingButton: 'Отправляем…',
    leadThanks: 'Спасибо! Дадим знать, когда выйдет что-то новое.',
    categoryLabel: 'Категория товара на Kaspi',
    categoryManual: 'Другое — укажу комиссию сам',
    categoryHint:
      'Ставки из официального тарифа Kaspi. Если вашей категории в списке нет, выберите «Другое» и впишите свой процент.',
    otherToolLink: 'Ещё бесплатно: печать накладных Kaspi одним PDF →',
    howTitle: 'Как считается',
    howItems: [
      'Комиссия Kaspi и налог с оборота берутся с цены продажи, а не с себестоимости — поэтому при повышении цены они тоже растут.',
      'Прибыль = цена − себестоимость − доставка − прочие расходы − комиссия − налог.',
      'Маржинальность — доля прибыли в цене продажи. Наценка — прибыль, делённая на себестоимость.',
      'Минимальная цена = (себестоимость + доставка + прочие расходы) ÷ (1 − (комиссия % + налог %) ÷ 100). Это цена, при которой продажа выходит ровно в ноль.',
      'Дробные числа можно вводить и с запятой, и с точкой.',
      'Доставка Kaspi считается по официальной сетке с 01.01.2026: до 10 000 ₸ по сумме заказа, от 10 000 ₸ по весу. Цены в сетке без НДС, Kaspi списывает с НДС 16%. Тарифы проверены 17.10.2026. Минимальная цена считается по тарифу для самой этой цены, а не для текущей: это наименьшая цена, начиная с которой любая более высокая не приносит убытка.',
      'В акциях Магазина комиссия выше: 13,0 / 7,7 / 16,1 % вместо 12,5 / 7,3 / 15,5 %. Надбавку за рассрочку 0-0-24 Kaspi публикует только в кабинете продавца, поэтому её вводите сами. Ставки акций взяты из таблицы акций Kaspi: сверьте свою в кабинете продавца (Маркетинг → Акции Магазина), поле комиссии можно править.',
    ],
    guideLink: 'Комиссия Kaspi по категориям: полная таблица ставок →',
    categoryGuideLink: 'Все ставки по категориям →',
    faqTitle: 'Частые вопросы',
    faq: [
      {
        q: 'Какая комиссия у Kaspi Магазина?',
        a: 'От 7,3% до 15,5% от цены продажи, уже с НДС, в зависимости от категории. 7,3%: лекарства, продукты питания, корма, лакомства и наполнители туалета для животных; 15,5%: большинство аксессуаров для телефонов (чехлы, стёкла, кабели) и украшения; для большинства остальных категорий 12,5%, в том числе зарядные устройства и внешние аккумуляторы. Ставки взяты из официального тарифа «Тарифы Магазина на Kaspi.kz», он действует с 05.01.2026, проверено 23.10.2026: выберите категорию в калькуляторе, и ставка подставится сама. Если вашей категории нет в списке, введите свой процент вручную.',
      },
      {
        q: 'Как посчитать минимальную цену на Kaspi?',
        a: 'Минимальная цена = (себестоимость + доставка + прочие расходы) ÷ (1 − (комиссия % + налог %) ÷ 100). Комиссия и налог берутся с цены продажи, а не с себестоимости, поэтому минимальная цена всегда выше простой суммы расходов. Это цена, при которой продажа выходит ровно в ноль; ниже неё вы торгуете в убыток.',
      },
      {
        q: 'Чем маржинальность отличается от наценки?',
        a: 'Маржинальность — доля прибыли в цене продажи, наценка — прибыль, делённая на себестоимость. Прибыль = цена − себестоимость − доставка − прочие расходы − комиссия − налог.',
      },
      {
        q: 'Какой налог учитывать в калькуляторе?',
        a: 'По умолчанию подставлено 4% с оборота — ставка для ИП на упрощёнке в Казахстане с 2026 года. Если у вас другая ставка или другой режим, измените значение в поле «Налог с оборота». Налог, как и комиссия, считается от цены продажи.',
      },
    ],
    categoryNames: {},

    saleTypeLabel: 'Тип продажи',
    saleTypeNames: { regular: 'Обычная', promo: 'Акция Kaspi', promo24: 'Акция 0-0-24' },
    saleTypeNote:
      'Рассрочка Kaspi Red 0-0-3/6/12, Kaspi Кредит и оплата картой другого банка комиссию не меняют: с 05.01.2026 она единая. Меняет её только участие в акции.',
    promoNote:
      'В акциях Магазина комиссия выше: 13,0 / 7,7 / 16,1 % вместо 12,5 / 7,3 / 15,5 % (тарифы акций Kaspi, проверено 17.10.2026). Это ставки из таблицы акций, а не из общего тарифа: сверьте свою в кабинете продавца (Маркетинг → Акции Магазина), поле можно править.',
    promoUnknownRate:
      'Ставка в поле не из таблицы Kaspi (7,3 / 12,5 / 15,5 %), поэтому ставку акции мы не подставляем: впишите её сами.',
    surchargeLabel: 'Надбавка за 0-0-24, п.п.',
    surchargeHint:
      'Kaspi публикует эту надбавку только в кабинете продавца: Маркетинг → Акции Магазина. Впишите её оттуда; пока там 0, расчёт идёт по ставке акции. Применяется ли таблица акций именно к 0-0-24, Kaspi не уточняет.',
    commissionSumLine: (base, extra, total) => `Итого комиссия: ${base} + ${extra} = ${total}`,
    deliveryDirections: { city: 'Город', kazakhstan: 'По Казахстану', express: 'Express', custom: 'Свой вариант или самовывоз' },
    weightLabel: 'Вес заказа, кг',
    weightHint:
      'Нужен только для заказов от 10 000 ₸: с этой суммы Kaspi считает доставку по весу.',
    weightAssumedNote: 'Вес не указан: взята строка «до 5 кг». Тяжелее заказ, дороже доставка.',
    vatLabel: 'Добавить НДС 16% (Kaspi списывает доставку с НДС)',
    vatHint:
      'Тарифы доставки Kaspi указаны без НДС. Зачитывается ли этот НДС у плательщиков НДС, Kaspi не пишет.',
    expressNote: 'Express: Kaspi берёт отдельную плату за каждый склад в заказе. Здесь посчитана одна доставка.',
    customDeliveryHint: 'Самовывоз или своя курьерская служба: впишите любую сумму, можно 0.',
    deliveryTierNames: tierNames('ru'),
    deliveryQuoteLine: ({ direction, tier, basis, net, total, withVat }) =>
      `Тариф Kaspi: ${direction}, ${basis === 'amount' ? 'сумма заказа' : 'заказ от 10 000 ₸, вес'} ${tier}: ${net} без НДС${withVat ? `, с НДС 16%: ${total}` : ''}`,
  },

  kk: {
    seo: {
      title: 'Kaspi маржа калькуляторы — пайданы есептеу',
      description:
        'Kaspi-дегі сатылымнан комиссия, жеткізу және салықтан кейін қанша пайда қалатынын есептеңіз: маржа, үстеме, ең төмен баға. Тегін, Excel-ге жүктеу.',
      keywords:
        'kaspi маржа калькуляторы, kaspi комиссиясын есептеу, kaspi дүкен комиссиясы, kaspi-де пайданы қалай есептеу, маржа калькуляторы қазақша, тауар үстемесін есептеу, kaspi ең төмен баға, kaspi сатушыға арналған калькулятор',
      ogTitle: 'Kaspi маржа калькуляторы — сатылымнан қанша қалады',
      ogDescription:
        'Kaspi комиссиясы, жеткізу және салықты ескеріп — пайда, маржа және ең төмен баға. Тегін, тіркелусіз, Excel-ге жүктеу.',
      ogImageAlt: 'Kaspi маржа калькуляторы — invoices.kz',
    },
    h1: 'Kaspi сатушыларына арналған маржа калькуляторы',
    intro:
      'Kaspi комиссиясы, жеткізу және салық шегерілгеннен кейін бір сатылымнан қанша қалатынын — және бағаны қай деңгейден төмен түсіруге болмайтынын есептеңіз. Тегін, тіркелусіз.',
    fieldLabels: {
      costPrice: 'Өзіндік құны',
      sellPrice: 'Kaspi-дегі сату бағасы',
      commissionPercent: 'Kaspi комиссиясы',
      deliveryCost: 'Бір данаға жеткізу',
      taxPercent: 'Айналымнан салық',
      otherCosts: 'Бір данаға басқа шығындар',
      monthlyUnits: 'Айына сатылым саны',
    },
    fieldHints: {
      commissionPercent: 'Жоғарыдан санатты таңдаңыз — мөлшерлеме өзі қойылады',
      taxPercent: 'Оңайлатылған декларация режиміндегі ЖК 2026 жылдан бастап айналымның 4%-ын төлейді',
      otherCosts: 'Қаптама, жарнама, қайтарылған тауарлар',
    },
    unitTenge: '₸',
    unitPercent: '%',
    unitPieces: 'дана',
    resultTitle: 'Бір сатылымнан',
    profitPerUnitLabel: 'Пайда',
    lossPerUnitLabel: 'Залал',
    marginLabel: 'Маржиналдылық',
    markupLabel: 'Үстеме',
    markupUndefined: 'өзіндік құнын енгізіңіз',
    breakEvenLabel: 'Ең төмен баға',
    breakEvenHint:
      'Бұдан арзан сатсаңыз, залалға шығасыз. Комиссия мен салық бағадан алынады, сондықтан ең төмен баға шығындардың жиынтығынан жоғары болады.',
    breakEvenImpossible: 'Комиссия мен салық бүкіл бағаны жұтып қояды — ешқандай бағамен пайда табу мүмкін емес.',
    costBreakdownTitle: 'Баға неге жұмсалады',
    breakdownCost: 'Өзіндік құны',
    breakdownCommission: 'Kaspi комиссиясы',
    breakdownDelivery: 'Жеткізу',
    breakdownTax: 'Салық',
    breakdownOther: 'Басқа шығындар',
    breakdownTotal: 'Барлық шығын',
    monthlyTitle: 'Айына',
    monthlyRevenueLabel: 'Айналым',
    monthlyProfitLabel: 'Пайда',
    lossWarning: 'Бұл бағамен әр сатылым залал әкеледі.',
    exportButton: 'Есепті Excel-ге жүктеу',
    excelSheetName: 'Маржа',
    excelFileName: 'marzha-esebi.xlsx',
    excelHeaderParam: 'Көрсеткіш',
    excelHeaderValue: 'Мәні',
    ctaTitle: 'Ең төмен бағаны білу аз — оны ұстап тұру керек',
    ctaBody: price =>
      `Сіздің ең төмен бағаңыз — ${price}. invoices.kz демпинг-боты сізді Kaspi-де ұсыныстар тізімінің басында өзі ұстап тұрады және бағаны сіз белгілеген шектен ешқашан төмен түсірмейді.`,
    ctaLink: 'Kaspi Bot туралы толығырақ →',
    leadPromptTitle: 'Жаңа тегін құралдар шыққанда хабарлайық па?',
    leadPlaceholder: 'Email немесе телефон (міндетті емес)',
    leadSubmitButton: 'Жіберу',
    leadSendingButton: 'Жіберіліп жатыр…',
    leadThanks: 'Рақмет! Жаңа құрал шыққанда хабар береміз.',
    categoryLabel: 'Kaspi-дегі тауар санаты',
    categoryManual: 'Басқа — комиссияны өзім жазамын',
    categoryHint:
      'Мөлшерлемелер Kaspi-дің ресми тарифінен алынған. Санатыңыз тізімде болмаса, «Басқа» дегенді таңдап, өз пайызыңызды жазыңыз.',
    otherToolLink: 'Тағы бір тегін құрал: Kaspi жүкқұжаттарын бір PDF-пен басып шығару →',
    howTitle: 'Қалай есептеледі',
    howItems: [
      'Kaspi комиссиясы мен айналым салығы өзіндік құннан емес, сату бағасынан алынады — сондықтан баға өскен сайын олар да өседі.',
      'Пайда = баға − өзіндік құны − жеткізу − басқа шығындар − комиссия − салық.',
      'Маржиналдылық — пайданың сату бағасындағы үлесі. Үстеме — пайданың өзіндік құнға қатынасы.',
      'Ең төмен баға = (өзіндік құны + жеткізу + басқа шығындар) ÷ (1 − (комиссия % + салық %) ÷ 100). Осы бағамен сатылым дәл нөлге шығады.',
      'Бөлшек сандарды үтірмен де, нүктемен де жазуға болады.',
      'Kaspi жеткізуі 01.01.2026 бастап ресми кесте бойынша есептеледі: 10 000 ₸-ға дейінгі тапсырыстар үшін тапсырыс сомасымен, 10 000 ₸ және одан жоғарылар үшін салмақпен. Кестедегі бағалар ҚҚС-сыз, Kaspi 16% ҚҚС-пен ұстайды. Тарифтер 17.10.2026 күні тексерілді. Ең төмен баға ағымдағы бағаға емес, дәл сол бағаға сәйкес тариф бойынша есептеледі: бұл одан жоғары кез келген баға залал әкелмейтін ең төмен баға.',
      'Дүкен акцияларында комиссия жоғары: 12,5 / 7,3 / 15,5 % орнына 13,0 / 7,7 / 16,1 %. 0-0-24 бөліп төлеуі үшін қосымша комиссияны Kaspi тек сатушының тіркелгісінде жариялайды, сондықтан оны өзіңіз жазасыз. Акция мөлшерлемелері Kaspi акция кестесінен алынған: өзіңіздікін сатушының тіркелгісінде (Маркетинг → Дүкен акциялары) тексеріңіз, комиссия өрісін түзетуге болады.',
    ],
    guideLink: 'Kaspi комиссиясы санаттар бойынша: мөлшерлемелердің толық кестесі →',
    categoryGuideLink: 'Санаттар бойынша барлық мөлшерлемелер →',
    faqTitle: 'Жиі қойылатын сұрақтар',
    faq: [
      {
        q: 'Kaspi Магазин комиссиясы қанша?',
        a: 'Санатына байланысты сату бағасының 7,3%-ынан 15,5%-ына дейін, ҚҚС-пен қоса. 7,3%: дәрілер, азық-түлік, жануарларға арналған жем, дәмді тағам және дәретхана толтырғыштары; 15,5%: телефон аксессуарларының көбі (қаптар, шынылар, кабельдер) және әшекей бұйымдар; қалған санаттардың көбінде 12,5%, соның ішінде зарядтау құрылғылары мен сыртқы аккумуляторлар. Мөлшерлемелер Kaspi-дің ресми тарифінен («Тарифы Магазина на Kaspi.kz») алынған: 05.01.2026 бастап күшінде, 23.10.2026 күні тексерілді. Калькуляторда санатты таңдасаңыз, мөлшерлеме өзі қойылады. Санатыңыз тізімде болмаса, өз пайызыңызды қолмен жазыңыз.',
      },
      {
        q: 'Kaspi-де ең төмен бағаны қалай есептеуге болады?',
        a: 'Ең төмен баға = (өзіндік құны + жеткізу + басқа шығындар) ÷ (1 − (комиссия % + салық %) ÷ 100). Комиссия мен салық өзіндік құннан емес, сату бағасынан алынады, сондықтан ең төмен баға шығындардың қарапайым жиынтығынан әрқашан жоғары болады. Осы бағамен сатылым дәл нөлге шығады, одан арзан сатсаңыз — залалға.',
      },
      {
        q: 'Маржиналдылық пен үстеменің айырмашылығы неде?',
        a: 'Маржиналдылық — пайданың сату бағасындағы үлесі, үстеме — пайданың өзіндік құнға қатынасы. Пайда = баға − өзіндік құны − жеткізу − басқа шығындар − комиссия − салық.',
      },
      {
        q: 'Калькуляторда қандай салық ескеріледі?',
        a: 'Әдепкі бойынша айналымның 4%-ы қойылған — бұл Қазақстандағы оңайлатылған декларация режиміндегі ЖК үшін 2026 жылдан бастап белгіленген мөлшерлеме. Сізде басқа мөлшерлеме немесе режим болса, «Айналымнан салық» өрісіндегі мәнді өзгертіңіз. Салық та комиссия сияқты сату бағасынан есептеледі.',
      },
    ],
    categoryNames: {
      'Автотовары': 'Автотауарлар',
      'Аптека — лекарства': 'Дәріхана — дәрі-дәрмек',
      'Аптека — прочее (БАД, медтехника, гигиена, оптика)': 'Дәріхана — басқасы (ББҚ, медтехника, гигиена, оптика)',
      'Бытовая техника': 'Тұрмыстық техника',
      'Детские товары': 'Балалар тауарлары',
      'Досуг, книги': 'Бос уақыт, кітаптар',
      'Канцелярские товары': 'Кеңсе тауарлары',
      'Компьютеры': 'Компьютерлер',
      'Красота и здоровье': 'Сұлулық пен денсаулық',
      'Мебель': 'Жиһаз',
      'Обувь': 'Аяқ киім',
      'Одежда': 'Киім',
      'Подарки, товары для праздников': 'Сыйлықтар, мерекеге арналған тауарлар',
      'Продукты питания': 'Азық-түлік',
      'Спорт, туризм': 'Спорт, туризм',
      'Строительство, ремонт': 'Құрылыс, үй жөндеу',
      'ТВ, Аудио, Видео': 'ТД, Аудио, Видео',
      'Телефоны и гаджеты — смартфоны и гаджеты': 'Телефондар мен гаджеттер — смартфондар мен гаджеттер',
      'Телефоны и гаджеты — аксессуары (чехлы, кабели, стёкла)': 'Телефондар мен гаджеттер — аксессуарлар (қаптар, кабельдер, қорғаныс шынылары)',
      'Телефоны и гаджеты — зарядные устройства и внешние аккумуляторы': 'Телефондар мен гаджеттер — зарядтау құрылғылары және сыртқы аккумуляторлар',
      'Товары для дома и дачи': 'Үй, бақша тауарлары',
      'Товары для животных — корма и лакомства': 'Жануарлар тауарлары — жем және дәмді тағам',
      'Товары для животных — наполнители туалета и комбикорма': 'Жануарлар тауарлары — дәретхана толтырғыштары және құрама жем',
      'Товары для животных — прочее (ветаптека, груминг, аксессуары)': 'Жануарлар тауарлары — басқасы (ветдәріхана, груминг, аксессуарлар)',
      'Украшения': 'Әшекейлер',
    },

    saleTypeLabel: 'Сатылым түрі',
    saleTypeNames: { regular: 'Әдеттегі', promo: 'Kaspi акциясы', promo24: '0-0-24 акциясы' },
    saleTypeNote:
      'Kaspi Red 0-0-3/6/12 бөліп төлеуі, Kaspi Кредит және басқа банк картасымен төлеу комиссияны өзгертпейді: 05.01.2026 бастап комиссия бірыңғай. Оны тек акцияға қатысу өзгертеді.',
    promoNote:
      'Дүкен акцияларында комиссия жоғары: 12,5 / 7,3 / 15,5 % орнына 13,0 / 7,7 / 16,1 % (Kaspi акция тарифтері, 17.10.2026 тексерілді). Бұл жалпы тарифтегі емес, акция кестесіндегі мөлшерлемелер: өзіңіздікін сатушының тіркелгісінде (Маркетинг → Дүкен акциялары) тексеріңіз, өрісті түзетуге болады.',
    promoUnknownRate:
      'Өрістегі мөлшерлеме Kaspi кестесіндегі (7,3 / 12,5 / 15,5 %) мөлшерлемелердің бірі емес, сондықтан акция мөлшерлемесін өзіміз қоймаймыз: оны өзіңіз жазыңыз.',
    surchargeLabel: '0-0-24 үшін қосымша комиссия, п.т.',
    surchargeHint:
      'Kaspi бұл қосымша комиссияны тек сатушының тіркелгісінде жариялайды: Маркетинг → Дүкен акциялары. Сол жерден алып жазыңыз; онда 0 тұрғанда есеп акция мөлшерлемесімен жүреді. Акция кестесі дәл 0-0-24 акциясына қолданыла ма, Kaspi нақтыламайды. п.т. деп пайыздық тармақты айтамыз.',
    commissionSumLine: (base, extra, total) => `Комиссия жиыны: ${base} + ${extra} = ${total}`,
    deliveryDirections: { city: 'Қала', kazakhstan: 'Қазақстан бойынша', express: 'Express', custom: 'Өз нұсқам немесе өзі алып кету' },
    weightLabel: 'Тапсырыс салмағы, кг',
    weightHint:
      'Тек сомасы 10 000 ₸ және одан жоғары тапсырыстарға керек: осы сомадан бастап Kaspi жеткізуді салмақпен есептейді.',
    weightAssumedNote: 'Салмағы көрсетілмеген: «5 кг-ға дейін» жолы алынды. Тапсырыс ауыр болса, жеткізу қымбаттайды.',
    vatLabel: 'Жеткізуге 16% ҚҚС қосу (Kaspi жеткізуді ҚҚС-пен ұстайды)',
    vatHint:
      'Kaspi жеткізу тарифтері ҚҚС-сыз көрсетілген. ҚҚС төлеушілер бұл ҚҚС-ты есепке жатқыза ала ма, Kaspi жазбайды.',
    expressNote: 'Express: Kaspi тапсырыстағы әр қойма үшін бөлек ақы алады. Мұнда бір жеткізу есептелген.',
    customDeliveryHint: 'Өзі алып кету немесе өз курьерлік қызметі: кез келген соманы жазыңыз, 0 болады.',
    deliveryTierNames: tierNames('kk'),
    deliveryQuoteLine: ({ direction, tier, basis, net, total, withVat }) =>
      `Kaspi тарифі: ${direction}, ${basis === 'amount' ? 'тапсырыс сомасы' : '10 000 ₸ және одан жоғары тапсырыс, салмағы'} ${tier}: ${net} ҚҚС-сыз${withVat ? `, 16% ҚҚС-пен: ${total}` : ''}`,
  },

  en: {
    seo: {
      title: 'Kaspi Margin Calculator — Profit per Sale',
      description:
        'Kaspi.kz margin calculator: profit on one sale after commission, delivery and tax, plus margin, markup and floor price. Free, with Excel export.',
      keywords:
        'kaspi margin calculator, kaspi.kz seller commission, kaspi commission rates by category, selling on kaspi kazakhstan, kazakhstan marketplace profit calculator, kaspi break-even price, kazakhstan sole trader turnover tax',
      ogTitle: 'Kaspi Margin Calculator — what one sale really leaves you',
      ogDescription:
        'Profit, margin and floor price after Kaspi commission, delivery and tax in Kazakhstan. Free, no sign-up, Excel export.',
      ogImageAlt: 'Kaspi margin calculator — invoices.kz',
    },
    h1: 'Kaspi Margin Calculator',
    intro:
      "Work out what one sale on Kaspi.kz, Kazakhstan's largest marketplace, actually leaves you after the commission, delivery and tax — and the price you must never go below. Free, no sign-up.",
    fieldLabels: {
      costPrice: 'Cost price',
      sellPrice: 'Selling price on Kaspi',
      commissionPercent: 'Kaspi commission',
      deliveryCost: 'Delivery per unit',
      taxPercent: 'Turnover tax',
      otherCosts: 'Other costs per unit',
      monthlyUnits: 'Sales per month',
    },
    fieldHints: {
      commissionPercent: 'Pick a category above and the rate fills itself in',
      taxPercent: "Sole traders (IE) on Kazakhstan's simplified regime pay 4% of turnover since 2026",
      otherCosts: 'Packaging, ads, returns',
    },
    unitTenge: '₸',
    unitPercent: '%',
    unitPieces: 'pcs',
    resultTitle: 'Per sale',
    profitPerUnitLabel: 'Profit',
    lossPerUnitLabel: 'Loss',
    marginLabel: 'Margin',
    markupLabel: 'Markup',
    markupUndefined: 'enter a cost price',
    breakEvenLabel: 'Floor price',
    breakEvenHint:
      'Below this you sell at a loss. Commission and tax are taken off the price, so the floor sits above the sum of your costs.',
    breakEvenImpossible: 'Commission and tax take the entire price — no price can turn a profit.',
    costBreakdownTitle: 'Where the price goes',
    breakdownCost: 'Cost price',
    breakdownCommission: 'Kaspi commission',
    breakdownDelivery: 'Delivery',
    breakdownTax: 'Tax',
    breakdownOther: 'Other costs',
    breakdownTotal: 'Total costs',
    monthlyTitle: 'Per month',
    monthlyRevenueLabel: 'Revenue',
    monthlyProfitLabel: 'Profit',
    lossWarning: 'At this price every sale loses money.',
    exportButton: 'Download as Excel',
    excelSheetName: 'Margin',
    excelFileName: 'kaspi-margin.xlsx',
    excelHeaderParam: 'Metric',
    excelHeaderValue: 'Value',
    ctaTitle: 'Knowing your floor price is not enough — you have to hold it',
    ctaBody: price =>
      `Your floor price is ${price}. The repricing bot in invoices.kz keeps you at the top of the Kaspi offer list on its own and never drops below the floor you set.`,
    ctaLink: 'See Kaspi Bot →',
    leadPromptTitle: 'Want to hear about new free tools?',
    leadPlaceholder: 'Email or phone (optional)',
    leadSubmitButton: 'Send',
    leadSendingButton: 'Sending…',
    leadThanks: "Thanks! We'll let you know when something new ships.",
    categoryLabel: 'Product category on Kaspi',
    categoryManual: 'Other — I will enter the rate myself',
    categoryHint:
      "Rates come from Kaspi's own published tariff. If your category is not listed, pick Other and type your rate.",
    otherToolLink: 'Also free: print Kaspi waybills as one PDF →',
    howTitle: 'How it is calculated',
    howItems: [
      'Kaspi commission and turnover tax are charged on the selling price, not on the cost, so they grow as you raise the price.',
      'Profit = price − cost − delivery − other costs − commission − tax.',
      'Margin is profit as a share of the selling price. Markup is profit divided by the cost price.',
      'Floor price = (cost + delivery + other costs) ÷ (1 − (commission % + tax %) ÷ 100). At this price a sale breaks exactly even.',
      'Amounts are in Kazakhstani tenge (₸). Decimals can be typed with a comma or a dot.',
      'Kaspi delivery follows the official grid in force since 1 January 2026: by order amount below 10 000 ₸, by weight from 10 000 ₸. Grid prices exclude VAT, Kaspi debits them with 16% VAT. Tariffs checked on 17 October 2026. The floor price uses the tariff for that price itself, not for the current one: it is the lowest price from which every higher price makes no loss.',
      'In Shop promos the commission is higher: 13.0 / 7.7 / 16.1% instead of 12.5 / 7.3 / 15.5%. Kaspi publishes the surcharge for 0-0-24 instalments only in the seller cabinet, so you enter it yourself. The promo rates come from the Kaspi promo table: check yours in the seller cabinet (Marketing → Shop promos); the commission field is editable.',
    ],
    guideLink: 'Kaspi commission by category: full rate table (in Russian) →',
    categoryGuideLink: 'All rates by category (in Russian) →',
    faqTitle: 'Frequently asked questions',
    faq: [
      {
        q: 'What commission does Kaspi charge sellers?',
        a: "Between 7.3% and 15.5% of the selling price, VAT included, depending on the category. 7.3% applies to medicines, groceries, and pet food, treats and litter; 15.5% to most phone accessories (cases, screen protectors, cables) and jewellery; most other categories are 12.5%, including phone chargers and power banks. The rates come from Kaspi's official Shop tariff “Tariffs of the Shop on Kaspi.kz” (in force since 5 January 2026, checked on 23 October 2026): pick a category in the calculator and the rate fills itself in. If your category is not listed, type your own rate.",
      },
      {
        q: 'How do I work out the minimum price on Kaspi?',
        a: 'Floor price = (cost + delivery + other costs) ÷ (1 − (commission % + tax %) ÷ 100). Commission and tax are charged on the selling price, not on the cost, so the floor is always above the plain sum of your costs. At this price a sale breaks exactly even; below it you lose money.',
      },
      {
        q: 'What is the difference between margin and markup?',
        a: 'Margin is profit as a share of the selling price; markup is profit divided by the cost price. Profit = price − cost − delivery − other costs − commission − tax.',
      },
      {
        q: 'Which tax does the calculator use?',
        a: "It is pre-filled with 4% of turnover, the rate for sole traders (IE) on Kazakhstan's simplified regime since 2026. If your rate or regime is different, change the “Turnover tax” field. Tax, like commission, is taken from the selling price.",
      },
    ],
    categoryNames: {
      'Автотовары': 'Car parts & accessories',
      'Аптека — лекарства': 'Pharmacy — medicines',
      'Аптека — прочее (БАД, медтехника, гигиена, оптика)': 'Pharmacy — other (supplements, medical devices, hygiene, optics)',
      'Бытовая техника': 'Home appliances',
      'Детские товары': 'Kids',
      'Досуг, книги': 'Leisure, books',
      'Канцелярские товары': 'Stationery',
      'Компьютеры': 'Computers',
      'Красота и здоровье': 'Beauty & health',
      'Мебель': 'Furniture',
      'Обувь': 'Shoes',
      'Одежда': 'Clothing',
      'Подарки, товары для праздников': 'Gifts & party supplies',
      'Продукты питания': 'Groceries',
      'Спорт, туризм': 'Sports & outdoors',
      'Строительство, ремонт': 'Construction & renovation',
      'ТВ, Аудио, Видео': 'TV, audio, video',
      'Телефоны и гаджеты — смартфоны и гаджеты': 'Phones & gadgets — smartphones and gadgets',
      'Телефоны и гаджеты — аксессуары (чехлы, кабели, стёкла)': 'Phones & gadgets — accessories (cases, cables, screen protectors)',
      'Телефоны и гаджеты — зарядные устройства и внешние аккумуляторы': 'Phones & gadgets — chargers and power banks (external batteries)',
      'Товары для дома и дачи': 'Home & garden',
      'Товары для животных — корма и лакомства': 'Pet supplies — food and treats',
      'Товары для животных — наполнители туалета и комбикорма': 'Pet supplies — litter and compound feed for farm animals',
      'Товары для животных — прочее (ветаптека, груминг, аксессуары)': 'Pet supplies — other (vet pharmacy, grooming, accessories)',
      'Украшения': 'Jewellery',
    },

    saleTypeLabel: 'Sale type',
    saleTypeNames: { regular: 'Regular', promo: 'Kaspi promo', promo24: '0-0-24 promo' },
    saleTypeNote:
      'Kaspi Red 0-0-3/6/12 instalments, Kaspi Credit and paying with a card from another bank do not change the commission: it has been a single rate since 5 January 2026. Only taking part in a promo does.',
    promoNote:
      'In Shop promos the commission is higher: 13.0 / 7.7 / 16.1% instead of 12.5 / 7.3 / 15.5% (Kaspi promo tariff, checked 17 October 2026). These are rates from the promo table, not from the regular tariff: check yours in the seller cabinet (Marketing → Shop promos); the field is editable.',
    promoUnknownRate:
      'The rate in the field is not one of the Kaspi tiers (7.3 / 12.5 / 15.5%), so we do not fill in a promo rate: type it yourself.',
    surchargeLabel: 'Surcharge for 0-0-24, pp',
    surchargeHint:
      'Kaspi publishes this surcharge only in the seller cabinet: Marketing → Shop promos. Copy it from there; while it is 0 the result uses the plain promo rate. Kaspi does not say whether the promo table applies to 0-0-24 promos.',
    commissionSumLine: (base, extra, total) => `Total commission: ${base} + ${extra} = ${total}`,
    deliveryDirections: { city: 'City', kazakhstan: 'Across Kazakhstan', express: 'Express', custom: 'My own or pickup' },
    weightLabel: 'Order weight, kg',
    weightHint:
      'Only needed for orders of 10 000 ₸ and up: from that amount Kaspi bills delivery by weight.',
    weightAssumedNote: 'No weight entered: the “up to 5 kg” row is used. A heavier order costs more to deliver.',
    vatLabel: 'Add 16% VAT (Kaspi debits delivery with VAT)',
    vatHint:
      'Kaspi delivery tariffs are listed without VAT. Whether VAT-registered sellers can offset this VAT, Kaspi does not say.',
    expressNote: 'Express: Kaspi charges separately for each warehouse in the order. One delivery is counted here.',
    customDeliveryHint: 'Pickup or your own courier: type any amount, 0 is allowed.',
    deliveryTierNames: {
      lt1000: 'under 1 000 ₸',
      '1000-3000': '1 000 to 3 000 ₸',
      '3000-5000': '3 000 to 5 000 ₸',
      '5000-10000': '5 000 to 10 000 ₸',
      'w-to5': 'up to 5 kg',
      'w-5-15': '5-15 kg',
      'w-15-30': '15-30 kg',
      'w-30-60': '30-60 kg',
      'w-60-100': '60-100 kg',
      'w-over100': 'over 100 kg',
    },
    deliveryQuoteLine: ({ direction, tier, basis, net, total, withVat }) =>
      `Kaspi tariff: ${direction}, ${basis === 'amount' ? 'order amount' : 'order of 10 000 ₸ and up, weight'} ${tier}: ${net} excl. VAT${withVat ? `, with 16% VAT: ${total}` : ''}`,
  },
}
