import type { ToolLang, ToolSeoCopy } from '@/lib/tools-i18n'
import type { MarginInput } from '@/lib/marginCalc'

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
  /**
   * Названия категорий Kaspi. В KASPI_CATEGORY_COMMISSIONS они русские (так
   * их видит продавец в русском кабинете) и русское название остаётся
   * значением <option> и ключом статистики — здесь только подпись на экране.
   * Незнакомую категорию показываем по-русски.
   */
  categoryNames: Record<string, string>
}

export const marginDict: Record<ToolLang, MarginDict> = {
  ru: {
    seo: {
      title: 'Калькулятор маржи Kaspi — расчёт прибыли с продажи',
      description:
        'Посчитайте прибыль с одной продажи на Kaspi после комиссии, доставки и налога. Калькулятор покажет маржинальность, наценку и минимальную цену, ниже которой торговать в убыток. Бесплатно, без регистрации, с выгрузкой в Excel.',
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
    otherToolLink: 'Ещё бесплатно: склейка накладных Kaspi →',
    howTitle: 'Как считается',
    howItems: [
      'Комиссия Kaspi и налог с оборота берутся с цены продажи, а не с себестоимости — поэтому при повышении цены они тоже растут.',
      'Прибыль = цена − себестоимость − доставка − прочие расходы − комиссия − налог.',
      'Маржинальность — доля прибыли в цене продажи. Наценка — прибыль, делённая на себестоимость.',
      'Минимальная цена = (себестоимость + доставка + прочие расходы) ÷ (1 − (комиссия % + налог %) ÷ 100). Это цена, при которой продажа выходит ровно в ноль.',
      'Дробные числа можно вводить и с запятой, и с точкой.',
    ],
    categoryNames: {},
  },

  kk: {
    seo: {
      title: 'Kaspi маржа калькуляторы — бір сатылымнан түсетін пайданы есептеу',
      description:
        'Kaspi-дегі бір сатылымнан комиссия, жеткізу және салық шегерілгеннен кейін қанша пайда қалатынын есептеңіз. Калькулятор маржаны, үстемені және одан төмен сатсаңыз зиянға шығатын ең төменгі бағаны көрсетеді. Тегін, тіркелусіз, Excel-ге жүктеуге болады.',
      keywords:
        'kaspi маржа калькуляторы, kaspi комиссиясын есептеу, kaspi дүкен комиссиясы, kaspi-де пайданы қалай есептеу, маржа калькуляторы қазақша, тауар үстемесін есептеу, kaspi ең төменгі баға, kaspi сатушыға арналған калькулятор',
      ogTitle: 'Kaspi маржа калькуляторы — сатылымнан қанша қалады',
      ogDescription:
        'Kaspi комиссиясы, жеткізу және салықты ескеріп — пайда, маржа және ең төменгі баға. Тегін, тіркелусіз, Excel-ге жүктеу.',
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
    breakEvenLabel: 'Ең төменгі баға',
    breakEvenHint:
      'Бұдан арзан сатсаңыз, залалға шығасыз. Комиссия мен салық бағадан алынады, сондықтан ең төменгі баға шығындардың жиынтығынан жоғары болады.',
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
    ctaTitle: 'Ең төменгі бағаны білу аз — оны ұстап тұру керек',
    ctaBody: price =>
      `Сіздің ең төменгі бағаңыз — ${price}. invoices.kz демпинг-боты сізді Kaspi-де ұсыныстар тізімінің басында өзі ұстап тұрады және бағаны сіз белгілеген шектен ешқашан төмен түсірмейді.`,
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
    otherToolLink: 'Тағы бір тегін құрал: Kaspi жүкқұжаттарын бір файлға біріктіру →',
    howTitle: 'Қалай есептеледі',
    howItems: [
      'Kaspi комиссиясы мен айналым салығы өзіндік құннан емес, сату бағасынан алынады — сондықтан баға өскен сайын олар да өседі.',
      'Пайда = баға − өзіндік құны − жеткізу − басқа шығындар − комиссия − салық.',
      'Маржиналдылық — пайданың сату бағасындағы үлесі. Үстеме — пайданың өзіндік құнға қатынасы.',
      'Ең төменгі баға = (өзіндік құны + жеткізу + басқа шығындар) ÷ (1 − (комиссия % + салық %) ÷ 100). Осы бағамен сатылым дәл нөлге шығады.',
      'Бөлшек сандарды үтірмен де, нүктемен де жазуға болады.',
    ],
    categoryNames: {
      'Автотовары': 'Автотауарлар',
      'Аптека — лекарства': 'Дәріхана — дәрілер',
      'Аптека — прочее (БАД, медтехника, гигиена, оптика)': 'Дәріхана — басқасы (ББҚ, медтехника, гигиена, оптика)',
      'Бытовая техника': 'Тұрмыстық техника',
      'Детские товары': 'Балалар тауарлары',
      'Досуг, книги': 'Демалыс, кітаптар',
      'Канцелярские товары': 'Кеңсе тауарлары',
      'Компьютеры': 'Компьютерлер',
      'Красота и здоровье': 'Сұлулық және денсаулық',
      'Мебель': 'Жиһаз',
      'Обувь': 'Аяқ киім',
      'Одежда': 'Киім',
      'Подарки, товары для праздников': 'Сыйлықтар, мерекеге арналған тауарлар',
      'Продукты питания': 'Азық-түлік',
      'Спорт, туризм': 'Спорт, туризм',
      'Строительство, ремонт': 'Құрылыс, жөндеу',
      'ТВ, Аудио, Видео': 'ТВ, аудио, бейне',
      'Телефоны и гаджеты — смартфоны и гаджеты': 'Телефондар мен гаджеттер — смартфондар мен гаджеттер',
      'Телефоны и гаджеты — аксессуары (чехлы, кабели, стёкла)': 'Телефондар мен гаджеттер — аксессуарлар (қаптар, кабельдер, қорғаныс шынылары)',
      'Товары для дома и дачи': 'Үйге және саяжайға арналған тауарлар',
      'Товары для животных — корма и лакомства': 'Жануарларға арналған тауарлар — жем және тағам',
      'Товары для животных — прочее (ветаптека, груминг, аксессуары)': 'Жануарларға арналған тауарлар — басқасы (ветдәріхана, груминг, аксессуарлар)',
      'Украшения': 'Әшекей бұйымдар',
    },
  },

  en: {
    seo: {
      title: 'Kaspi Margin Calculator — Profit per Sale for Sellers in Kazakhstan',
      description:
        "Work out the profit on one Kaspi.kz sale after the marketplace commission, delivery and Kazakhstan's turnover tax. See your margin, markup and the floor price below which every order loses money. Free, no sign-up, Excel export.",
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
    otherToolLink: 'Also free: Kaspi waybill merger →',
    howTitle: 'How it is calculated',
    howItems: [
      'Kaspi commission and turnover tax are charged on the selling price, not on the cost, so they grow as you raise the price.',
      'Profit = price − cost − delivery − other costs − commission − tax.',
      'Margin is profit as a share of the selling price. Markup is profit divided by the cost price.',
      'Floor price = (cost + delivery + other costs) ÷ (1 − (commission % + tax %) ÷ 100). At this price a sale breaks exactly even.',
      'Amounts are in Kazakhstani tenge (₸). Decimals can be typed with a comma or a dot.',
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
      'Товары для дома и дачи': 'Home & garden',
      'Товары для животных — корма и лакомства': 'Pet supplies — food and treats',
      'Товары для животных — прочее (ветаптека, груминг, аксессуары)': 'Pet supplies — other (vet pharmacy, grooming, accessories)',
      'Украшения': 'Jewellery',
    },
  },
}
