import { TOOL_LOCALE, type ToolLang, type ToolSeoCopy } from '@/lib/tools-i18n'

// Все тексты /tools/nalogi на трёх языках: и <head> (seo), и интерфейс, и FAQ.
// Русский — дословно прежний текст страницы (title/description особенно —
// чтобы не сбить уже набранную выдачу); новое на ru — только подсказки о
// границах базы, предупреждения о порогах и блок вопросов.
// Суммы форматируются снаружи (formatTenge) и приходят сюда готовыми строками.
//
// Термины kk — как в гайде /guides/kk/nalogi-ip-uproshchenka-2026:
// ИП → ЖК, ОПВ → МЗЖ, ОПВР → ЖМЗЖ, СО → ӘА, ВОСМС → МӘМС, МЗП → ЕТЖ,
// МРП → АЕК, НДС → ҚҚС, маслихат → мәслихат.

/** Текст с одним жирным фрагментом посередине: pre <b>b</b> post. */
export interface RichLine { pre: string; b: string; post: string }

export interface NalogiDict {
  seo: ToolSeoCopy
  h1: string
  intro: RichLine
  incomeLabel: string
  rateLabel: string
  /** Подписи вариантов ставки 2–6%. */
  rateOption: Record<'2' | '3' | '4' | '5' | '6', string>
  baseLabel: string
  baseHint: (mzp: string) => string
  /** Подсказки, когда расчёт взял не ту базу, что ввели (коридоры МЗП). */
  baseRaisedToMin: (amount: string) => string
  baseSoCapped: (amount: string) => string
  basePensionCapped: (amount: string) => string
  before1975: string
  totalTitle: string
  /** Процент уже с нужным десятичным разделителем. */
  effective: (percent: string) => string
  noIncome: string
  decimalSeparator: ',' | '.'
  taxRow: (rate: string) => string
  opvRow: string
  opvrRow: string
  soRow: string
  vosmsRow: string
  contributionsRow: string
  /** Подписи к формулам во всплывающей подсказке строки (правка основателя 14.10). */
  formula: {
    hint: string
    noIncome: string
    before1975: string
    fixed: string
    pensionCorridor: string
    soCorridor: string
    entered: (amount: string) => string
    /** Как получена база основного СО: заявленный доход минус ОПВ. */
    soAfterOpv: (declared: string, opv: string) => string
  }
  halfYear: (amount: string) => RichLine
  /**
   * Заметка под блоком взносов (24.10.2026): основной расчёт идёт по разъяснению
   * ГФСС (СО за вычетом ОПВ), здесь второе толкование, по буквальному тексту
   * ст. 245 п. 2 Соцкодекса. Все числа второго варианта приходят отдельными
   * полями расчёта (soLaw, contributionsLaw, difference), не из основных.
   */
  soNote: {
    title: string
    /** Второе толкование: СО и взносы всего по тексту закона, разница в месяц и за полугодие. */
    other: (so: string, total: string, month: string, half: string) => string
    reason: string
    advice: string
    /** Когда оба толкования дают одну сумму (минимальная база). */
    same: string
    /** Допущение про границы 1-7 МЗП; показывается при доходе выше ~595 000. */
    corridor: string
    more: string
  }
  /** Годовая выручка при таком темпе выше порога ҚҚС / НДС (10 000 МРП).
   *  В числах порогов ниже — неразрывный пробел (U+00A0), чтобы «10 000» не рвалось. */
  vatWarning: (annual: string, threshold: string) => string
  /** …выше лимита упрощёнки (600 000 МРП). */
  limitWarning: (annual: string, limit: string) => string
  disclaimer: string
  guideLink: string
  guideHref: string
  schetLink: string
  faqTitle: string
  faq: Array<{ q: string; a: string }>
}

export const nalogiDict: Record<ToolLang, NalogiDict> = {
  ru: {
    seo: {
      title: 'Калькулятор налогов ИП 2026 — упрощёнка 4%',
      description:
        'Налоги ИП на упрощёнке в 2026 году: налог 4% с дохода, ОПВ, ОПВР, СО и ВОСМС за себя. Посчитайте сумму в месяц и за полугодие — бесплатно.',
      keywords:
        'налоги ип калькулятор казахстан, упрощенка 4 процента 2026, сколько платит ип казахстан, взносы ип за себя 2026, опв со восмс ип, налоговый кодекс 2026 ип, форма 910 сколько платить',
      ogTitle: 'Калькулятор налогов ИП 2026 — упрощёнка 4% и взносы',
      ogDescription: 'Налог 4% и взносы за себя по новому Налоговому кодексу 2026. Бесплатно, без регистрации.',
      ogImageAlt: 'Калькулятор налогов ИП — invoices.kz',
    },
    h1: 'Налоги ИП на упрощёнке — 2026',
    intro: {
      pre: 'По новому Налоговому кодексу: налог ',
      b: '4%',
      post: ' с дохода (в регионе может быть 2–6%) плюс взносы «за себя». Введите цифры — увидите, сколько уходит в месяц и за полугодие.',
    },
    incomeLabel: 'Доход (выручка) в месяц, ₸',
    rateLabel: 'Ставка налога в вашем регионе, %',
    rateOption: {
      '2': '2% — минимум вилки маслихата',
      '3': '3%',
      '4': '4% — базовая ставка кодекса',
      '5': '5%',
      '6': '6% — максимум вилки',
    },
    baseLabel: 'Доход для взносов «за себя», ₸ в месяц',
    baseHint: mzp => `Вы заявляете его сами, минимум для расчёта — 1 МЗП (${mzp}). 0 — дохода не было.`,
    baseRaisedToMin: a => `Это меньше 1 МЗП — взносы считаем от минимальной базы ${a}.`,
    baseSoCapped: a => `СО считаем от дохода за вычетом ОПВ и не больше чем с 7 МЗП (${a}).`,
    basePensionCapped: a => `ОПВ и ОПВР считаем не больше чем с 50 МЗП (${a}).`,
    before1975: 'Родился(ась) до 1975 года — без ОПВР',
    totalTitle: 'Итого в месяц',
    effective: p => `${p}% от выручки`,
    noIncome: 'выручка не указана',
    decimalSeparator: ',',
    taxRow: r => `Налог по упрощёнке (${r}%)`,
    opvRow: 'ОПВ — пенсионный, 10%',
    opvrRow: 'ОПВР — 3,5% (1975 г.р. и младше)',
    soRow: 'СО — соцотчисления, 5%',
    vosmsRow: 'ВОСМС — медстрахование, фикс.',
    contributionsRow: 'Взносы за себя, всего',
    formula: {
      hint: 'Наведите или нажмите на строку — покажем формулу',
      noIncome: 'дохода для взносов не было — можно не платить',
      before1975: 'родились до 1975 года — ОПВР не платится',
      fixed: 'не зависит от дохода',
      pensionCorridor: 'база в коридоре 1–50 МЗП',
      soCorridor: 'база в коридоре 1–7 МЗП',
      entered: a => `введено ${a}`,
      soAfterOpv: (d, o) => `${d} минус ОПВ ${o}`,
    },
    halfYear: a => ({
      pre: 'Налог платится раз в полугодие с формой 910: за 6 месяцев при таком доходе — ',
      b: a,
      post: ' (до 25 августа и до 25 февраля). Взносы — ежемесячно до 25 числа.',
    }),
    soNote: {
      title: 'База СО: есть два толкования',
      other: (so, total, m, h) =>
        `Есть и другое толкование: по буквальному тексту закона СО считают от всего дохода: СО ${so}, итого взносов ${total}, разница ${m} в месяц, ${h} за полугодие.`,
      reason:
        'Расчёт выше идёт по разъяснению Государственного фонда социального страхования (ГФСС) от 17.03.2026 и 04.05.2026: СО считается от дохода за вычетом ОПВ. По буквальному тексту статьи 245 пункта 2 Социального кодекса порядок для ИП не урегулирован.',
      advice:
        'Излишне уплаченное СО подлежит возврату по заявлению: уточните порядок у ГФСС или у бухгалтера.',
      same: 'При такой базе оба толкования дают одну и ту же сумму СО.',
      corridor:
        'Границы 1 и 7 МЗП мы применяем к базе после вычета ОПВ: так читаем границы. При доходе выше примерно 595 000 ₸ уточните порядок у ГФСС.',
      more: 'Подробнее и ссылки на источники в гайде',
    },
    vatWarning: (annual, thr) =>
      `При таком темпе выручка за год — ${annual}. Это выше порога постановки на учёт по НДС — 10 000 МРП (${thr}) в год. Уточните у бухгалтера, касается ли он вас.`,
    limitWarning: (annual, lim) =>
      `При таком темпе выручка за год — ${annual}. Это выше лимита упрощёнки — 600 000 МРП (${lim}) в год: с таким доходом нужен общеустановленный режим.`,
    disclaimer:
      'Расчёт по ставкам 2026 года (НК № 214-VIII, МЗП 85 000 ₸). Ставку региона уточните в решении маслихата. Это ориентир, а не налоговая консультация. Подробный разбор —',
    guideLink: 'в гайде о налогах ИП',
    guideHref: '/guides/nalogi-ip-uproshchenka-2026',
    schetLink: 'Выставить счёт онлайн →',
    faqTitle: 'Частые вопросы',
    faq: [
      {
        q: 'Какой налог платит ИП на упрощёнке в 2026 году?',
        a: 'С 1 января 2026 года по новому Налоговому кодексу — 4% от дохода, без вычета расходов. Маслихат региона может менять ставку в пределах ±50%, то есть от 2% до 6%.',
      },
      {
        q: 'Когда платить налог и взносы?',
        a: 'Налог — раз в полугодие: декларацию 910 сдают до 15 августа и до 15 февраля, налог платят до 25 августа и до 25 февраля. Взносы за себя (ОПВ, ОПВР, СО, ВОСМС) — ежемесячно, до 25 числа следующего месяца.',
      },
      {
        q: 'Какие взносы ИП платит за себя?',
        a: 'ОПВ 10% и ОПВР 3,5% (для родившихся в 1975 году и позже) от заявленного дохода, но с базы не выше 50 МЗП; СО 5% с базы от 1 до 7 МЗП (мы считаем СО от заявленного дохода за вычетом ОПВ, как в разъяснениях Государственного фонда социального страхования (ГФСС); по буквальному тексту закона вычета нет, второе толкование показано под расчётом); ВОСМС — фиксированно 5 950 ₸ в месяц.',
      },
      {
        q: 'Что платить, если дохода в месяце не было?',
        a: 'ОПВ, ОПВР и СО за месяц без дохода можно не платить, а ВОСМС 5 950 ₸ платится всё равно. Налог с нулевой выручки равен нулю.',
      },
      {
        q: 'До какого дохода можно оставаться на упрощёнке?',
        a: 'Лимит — 600 000 МРП в год: при МРП 2026 года 4 325 ₸ это 2 595 000 000 ₸.',
      },
    ],
  },

  kk: {
    seo: {
      title: 'ЖК салығының калькуляторы 2026 — оңайлатылған 4%',
      description:
        '2026 жылы оңайлатылған декларациядағы ЖК салығы: табыстан 4%, өзі үшін МЗЖ, ЖМЗЖ, ӘА және МӘМС. Айлық және жартыжылдық сомаңызды есептеңіз — тегін.',
      keywords:
        'жк салығы калькулятор, жк салықтары 2026, оңайлатылған декларация 4 пайыз, жк қанша салық төлейді, жк өзі үшін жарналар 2026, мзж әа мәмс жк, 910 нысаны қанша төлеу, жаңа салық кодексі 2026 жк',
      ogTitle: 'ЖК салығының калькуляторы 2026 — 4% және жарналар',
      ogDescription: 'Жаңа Салық кодексі 2026 бойынша 4% салық және өзі үшін жарналар. Тегін, тіркелусіз.',
      ogImageAlt: 'ЖК салығының калькуляторы — invoices.kz',
    },
    h1: 'Оңайлатылған декларациядағы ЖК салықтары — 2026',
    intro: {
      pre: 'Жаңа Салық кодексі бойынша: табыстан ',
      b: '4%',
      post: ' салық (өңірде 2–6% болуы мүмкін) және «өзі үшін» жарналар. Сандарды енгізіңіз — айына және жарты жылға қанша кететінін көресіз.',
    },
    incomeLabel: 'Айлық табыс (түсім), ₸',
    rateLabel: 'Өңіріңіздегі салық мөлшерлемесі, %',
    rateOption: {
      '2': '2% — мәслихат аралығының ең төменгісі',
      '3': '3%',
      '4': '4% — кодекстегі базалық мөлшерлеме',
      '5': '5%',
      '6': '6% — аралықтың ең жоғарысы',
    },
    baseLabel: '«Өзі үшін» жарналарға арналған табыс, айына ₸',
    baseHint: mzp => `Оны өзіңіз мәлімдейсіз, есептеу үшін ең азы — 1 ЕТЖ (${mzp}). 0 — табыс болмаған.`,
    baseRaisedToMin: a => `Бұл 1 ЕТЖ-ден аз — жарналарды ең төменгі базадан есептейміз: ${a}.`,
    baseSoCapped: a => `ӘА МЗЖ шегерілген табыстан және 7 ЕТЖ-ден (${a}) аспайтын базадан есептеледі.`,
    basePensionCapped: a => `МЗЖ мен ЖМЗЖ 50 ЕТЖ-ден (${a}) аспайтын базадан есептеледі.`,
    before1975: '1975 жылға дейін туғанмын — ЖМЗЖ төлемеймін',
    totalTitle: 'Айына барлығы',
    effective: p => `түсімнің ${p}%-ы`,
    noIncome: 'түсім көрсетілмеген',
    decimalSeparator: ',',
    taxRow: r => `Оңайлатылған режим салығы (${r}%)`,
    opvRow: 'МЗЖ — зейнетақы жарнасы, 10%',
    opvrRow: 'ЖМЗЖ — 3,5% (1975 жылы және одан кейін туғандар)',
    soRow: 'ӘА — әлеуметтік аударымдар, 5%',
    vosmsRow: 'МӘМС — медициналық сақтандыру, тіркелген сома',
    contributionsRow: 'Өзі үшін жарналар, барлығы',
    formula: {
      hint: 'Жолды меңзеңіз не басыңыз — формуласын көрсетеміз',
      noIncome: 'жарнаға табыс болмады — төлемеуге болады',
      before1975: '1975 жылға дейін туғансыз — ЖМЗЖ төленбейді',
      fixed: 'табысқа байланысты емес',
      pensionCorridor: 'база 1–50 ЕТЖ аралығында',
      soCorridor: 'база 1–7 ЕТЖ аралығында',
      entered: a => `енгізілгені ${a}`,
      soAfterOpv: (d, o) => `${d} минус МЗЖ ${o}`,
    },
    halfYear: a => ({
      pre: 'Салық 910 нысанымен жарты жылда бір рет төленеді: осындай табыспен 6 айға — ',
      b: a,
      post: ' (25 тамызға және 25 ақпанға дейін). Жарналар — ай сайын, 25-іне дейін.',
    }),
    soNote: {
      title: 'ӘА базасы: екі түсіндіру бар',
      other: (so, total, m, h) =>
        `Басқа түсіндіру де бар: заңның тікелей мәтіні бойынша ӘА-ны бүкіл табыстан есептейді: ӘА ${so}, жарналар барлығы ${total}, айырмашылық айына ${m}, жарты жылға ${h}.`,
      reason:
        'Жоғарыдағы есеп Мемлекеттік әлеуметтік сақтандыру қоры (ГФСС) 17.03.2026 және 04.05.2026 жылғы түсіндірмелері бойынша жасалған: ӘА МЗЖ шегерілген табыстан есептеледі. Әлеуметтік кодекстің 245-бабы 2-тармағының тікелей мәтіні бойынша ЖК үшін тәртіп реттелмеген.',
      advice:
        'Артық төленген ӘА өтініш бойынша қайтарылуға жатады: тәртібін ГФСС-тен немесе бухгалтерден нақтылаңыз.',
      same: 'Мұндай базада екі түсіндіру де ӘА-ның бірдей сомасын береді.',
      corridor:
        '1 және 7 ЕТЖ шектерін МЗЖ шегерілген базаға қолданамыз: шектерді осылай оқимыз. Табыс шамамен 595 000 ₸-ден жоғары болса, тәртібін ГФСС-тен нақтылаңыз.',
      more: 'Толығырақ және дереккөздер нұсқаулықта',
    },
    vatWarning: (annual, thr) =>
      `Осы қарқынмен жылдық түсім — ${annual}. Бұл ҚҚС бойынша есепке тұру шегінен жоғары — жылына 10 000 АЕК (${thr}). Сізге қатысы бар-жоғын бухгалтерден нақтылаңыз.`,
    limitWarning: (annual, lim) =>
      `Осы қарқынмен жылдық түсім — ${annual}. Бұл оңайлатылған декларация шегінен асады — жылына 600 000 АЕК (${lim}): мұндай табыспен жалпыға бірдей режим қажет.`,
    disclaimer:
      '2026 жылғы мөлшерлемелер бойынша есептелді (СК № 214-VIII, ЕТЖ 85 000 ₸). Өңіріңіздің мөлшерлемесін мәслихат шешімінен тексеріңіз. Бұл бағдар ғана, салық кеңесі емес. Толық талдау —',
    guideLink: 'ЖК салықтары туралы нұсқаулықта',
    guideHref: '/guides/kk/nalogi-ip-uproshchenka-2026',
    schetLink: 'Онлайн шот жазу →',
    faqTitle: 'Жиі қойылатын сұрақтар',
    faq: [
      {
        q: '2026 жылы оңайлатылған декларациядағы ЖК қандай салық төлейді?',
        a: '2026 жылғы 1 қаңтардан бастап жаңа Салық кодексі бойынша — табыстан 4%, шығыстар шегерілмейді. Өңірдің мәслихаты мөлшерлемені ±50% шегінде, яғни 2%-дан 6%-ға дейін өзгерте алады.',
      },
      {
        q: 'Салық пен жарналарды қашан төлеу керек?',
        a: 'Салық жарты жылда бір рет төленеді: 910 декларациясы 15 тамызға және 15 ақпанға дейін тапсырылады, салық 25 тамызға және 25 ақпанға дейін төленеді. Өзі үшін жарналар (МЗЖ, ЖМЗЖ, ӘА, МӘМС) — ай сайын, келесі айдың 25-іне дейін.',
      },
      {
        q: 'ЖК өзі үшін қандай жарналар төлейді?',
        a: 'Мәлімделген табыстан МЗЖ 10% және ЖМЗЖ 3,5% (1975 жылы және одан кейін туғандар үшін), база 50 ЕТЖ-ден аспайды; ӘА 5% — 1-ден 7 ЕТЖ-ге дейінгі базадан (ӘА-ны мәлімделген табыстан МЗЖ шегеріп есептейміз, Мемлекеттік әлеуметтік сақтандыру қорының (ГФСС) түсіндірмелеріндегідей; заңның тікелей мәтінінде шегеру жоқ, екінші түсіндіру есептің астында көрсетілген); МӘМС — айына тіркелген 5 950 ₸.',
      },
      {
        q: 'Айда табыс болмаса, не төлеу керек?',
        a: 'Табыс болмаған ай үшін МЗЖ, ЖМЗЖ және ӘА төлемеуге болады, ал МӘМС 5 950 ₸ бәрібір төленеді. Нөлдік түсімнен салық та нөлге тең.',
      },
      {
        q: 'Оңайлатылған режимде қандай табысқа дейін қалуға болады?',
        a: 'Шек — жылына 600 000 АЕК: 2026 жылғы АЕК 4 325 ₸ болғанда бұл 2 595 000 000 ₸.',
      },
    ],
  },

  en: {
    seo: {
      title: 'Kazakhstan Sole Proprietor Tax Calculator 2026',
      description:
        'Kazakhstan sole proprietor (IE) tax in 2026, simplified regime: 4% of income plus pension, social and health contributions. Free monthly totals.',
      keywords:
        'kazakhstan tax calculator, kazakhstan individual entrepreneur tax, sole proprietor tax kazakhstan 2026, kazakhstan simplified tax regime 4%, ip tax kazakhstan, form 910 kazakhstan, kazakhstan self-employed pension contributions, kazakhstan new tax code 2026',
      ogTitle: 'Kazakhstan Sole Proprietor Tax Calculator 2026',
      ogDescription: 'The 4% simplified-regime tax and contributions for yourself under Kazakhstan’s 2026 Tax Code. Free, no sign-up.',
      ogImageAlt: 'Kazakhstan sole proprietor tax calculator — invoices.kz',
    },
    h1: 'Kazakhstan sole proprietor taxes — simplified regime 2026',
    intro: {
      pre: 'Under Kazakhstan’s new Tax Code, an individual entrepreneur (IE) on the simplified declaration pays ',
      b: '4%',
      post: ' of income (2–6% depending on the region) plus contributions for themselves. Enter your figures to see what goes out each month and each half-year.',
    },
    incomeLabel: 'Monthly income (revenue), ₸',
    rateLabel: 'Tax rate in your region, %',
    rateOption: {
      '2': '2% — lowest rate a local council can set',
      '3': '3%',
      '4': '4% — standard rate in the Tax Code',
      '5': '5%',
      '6': '6% — highest rate allowed',
    },
    baseLabel: 'Declared income for your contributions, ₸ per month',
    baseHint: mzp => `You choose this amount yourself; the minimum is 1 minimum wage (${mzp}). Enter 0 if you had no income.`,
    baseRaisedToMin: a => `That is below 1 minimum wage, so contributions are calculated from the minimum base of ${a}.`,
    baseSoCapped: a => `SO is calculated on income minus OPV, capped at a base of 7 minimum wages (${a}).`,
    basePensionCapped: a => `OPV and OPVR are capped at a base of 50 minimum wages (${a}).`,
    before1975: 'Born before 1975 — no OPVR',
    totalTitle: 'Total per month',
    effective: p => `${p}% of revenue`,
    noIncome: 'no revenue entered',
    decimalSeparator: '.',
    taxRow: r => `Simplified-regime tax (${r}%)`,
    opvRow: 'OPV — mandatory pension, 10%',
    opvrRow: 'OPVR — additional pension, 3.5% (born 1975 or later)',
    soRow: 'SO — social contributions, 5%',
    vosmsRow: 'VOSMS — health insurance, fixed',
    contributionsRow: 'Contributions for yourself, total',
    formula: {
      hint: 'Hover or tap a line to see the formula',
      noIncome: 'no income declared for contributions, can be skipped',
      before1975: 'born before 1975, no OPVR',
      fixed: 'does not depend on income',
      pensionCorridor: 'base kept within 1 to 50 minimum wages',
      soCorridor: 'base kept within 1 to 7 minimum wages',
      entered: a => `you entered ${a}`,
      soAfterOpv: (d, o) => `${d} minus OPV ${o}`,
    },
    halfYear: a => ({
      pre: 'The tax is paid every six months with form 910: for 6 months at this income it comes to ',
      b: a,
      post: ' (due by 25 August and 25 February). Contributions are paid monthly by the 25th.',
    }),
    soNote: {
      title: 'SO base: there are two readings',
      other: (so, total, m, h) =>
        `There is another reading: by the literal text of the law, SO is calculated on the whole income: SO ${so}, contributions in total ${total}, a difference of ${m} a month, ${h} per half-year.`,
      reason:
        'The calculation above follows the clarifications of the State Social Insurance Fund (GFSS) of 17 March 2026 and 4 May 2026: SO is calculated on income minus OPV. By the literal text of article 245, paragraph 2 of the Social Code, the procedure for an IE is not settled.',
      advice:
        'Overpaid SO is subject to refund on application: check the procedure with the GFSS or your accountant.',
      same: 'At this base both readings give the same SO amount.',
      corridor:
        'We apply the limits of 1 and 7 minimum wages to the base after the OPV deduction: that is how we read the limits. If your income is above about 595 000 ₸, check the procedure with the GFSS.',
      more: 'Details and sources in our guide (in Russian)',
    },
    vatWarning: (annual, thr) =>
      `At this pace your annual revenue is ${annual}. That is above the VAT registration threshold of 10 000 MCI (${thr}) a year. Check with an accountant whether it applies to you.`,
    limitWarning: (annual, lim) =>
      `At this pace your annual revenue is ${annual}. That is above the simplified-regime limit of 600 000 MCI (${lim}) a year: with this income you need the general tax regime.`,
    disclaimer:
      'Based on 2026 rates (Tax Code No. 214-VIII, minimum wage 85 000 ₸; MCI is the monthly calculation index, 4 325 ₸). Check your region’s rate in the local council (maslikhat) decision. This is an estimate, not tax advice. Full breakdown —',
    guideLink: 'in our guide to IE taxes (in Russian)',
    guideHref: '/guides/nalogi-ip-uproshchenka-2026',
    schetLink: 'Create an invoice online →',
    faqTitle: 'Frequently asked questions',
    faq: [
      {
        q: 'What tax does a sole proprietor on the simplified regime pay in Kazakhstan in 2026?',
        a: 'From 1 January 2026, under the new Tax Code, it is 4% of income with no deduction for expenses. The regional council (maslikhat) can move the rate by up to ±50%, so it ranges from 2% to 6%.',
      },
      {
        q: 'When are the tax and contributions due?',
        a: 'The tax is paid every six months: the form 910 declaration is filed by 15 August and 15 February, and the tax is paid by 25 August and 25 February. Contributions for yourself (OPV, OPVR, SO, VOSMS) are paid monthly, by the 25th of the following month.',
      },
      {
        q: 'Which contributions does an IE pay for themselves?',
        a: 'OPV (mandatory pension) 10% and OPVR (additional pension) 3.5% for those born in 1975 or later, on declared income with a base of at most 50 minimum wages; SO (social contributions) 5% on a base between 1 and 7 minimum wages (we calculate SO on declared income minus OPV, as in the clarifications of the State Social Insurance Fund (GFSS); the literal text of the law has no deduction, and that second reading is shown under the result); VOSMS (compulsory social health insurance) is a fixed 5 950 ₸ a month.',
      },
      {
        q: 'What do I pay in a month with no income?',
        a: 'OPV, OPVR and SO can be skipped for a month with no income, but the 5 950 ₸ VOSMS payment is still due. The tax on zero revenue is zero.',
      },
      {
        q: 'What is the income limit for the simplified regime?',
        a: 'The limit is 600 000 MCI a year: at the 2026 MCI of 4 325 ₸ that is 2 595 000 000 ₸.',
      },
    ],
  },
}

/**
 * schema.org FAQPage для языковой версии — вопросы те же, что видны на
 * странице (Google требует, чтобы разметка совпадала с видимым текстом).
 * '<' экранирован — строку можно вставлять в <script> как есть.
 */
export function nalogiFaqJsonLd(lang: ToolLang): string {
  const t = nalogiDict[lang]
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: TOOL_LOCALE[lang],
    mainEntity: t.faq.map(item => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
