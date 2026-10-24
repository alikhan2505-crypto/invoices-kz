// Данные и расчёты гайда «Форма 910.00: как заполнить и когда сдавать»
// (/guides/forma-910-uproshchenka-2026, ru + kk).
//
// Все даты, ставки и цифры примера лежат здесь, страницы только выводят их.
// Размер МРП и МЗП берётся из mrp.ts (одна константа на весь сайт).
//
// Проверено 24.10.2026 (F910_CHECKED). Первичные тексты читались по копиям
// ИПС «Әділет» (adilet.zan.kz и gov.kz из рабочей среды не открывались):
//   Налоговый кодекс РК от 18.07.2025 № 214-VIII (действует с 01.01.2026):
//     - ст. 64, п. 2 и п. 4: срок, выпавший на нерабочий день, оканчивается в
//       ближайший следующий рабочий день; в электронном виде можно до 24:00
//       последнего дня; сдача отчётности это налоговое обязательство;
//     - ст. 114, п. 3: вид декларации (первоначальная только за первый период,
//       когда возникла обязанность, очередная за последующие);
//     - ст. 115, п. 2, 5, 6, 9 и ст. 116, п. 1: статус «Документ принят»,
//       автоматическая нулевая отчётность (только если форма внесена в перечень
//       форм в кабинете, п. 2), отзыв невозможен, дополнительная отчётность;
//     - ст. 445, п. 1: форма 200.00 сдаётся ежеквартально не позднее 15 числа
//       второго месяца после квартала;
//     - ст. 716, п. 7, 11 и 12: утрата права на режим, уведомление в течение
//       пяти рабочих дней (при ожидаемом превышении по сделке до получения дохода
//       по ней); возврат на упрощёнку только при обоих условиях п. 7;
//     - ст. 717: специальное мобильное приложение остаётся способом сдачи;
//     - ст. 722 (период полугодие, нет соцналога и НДС), ст. 723 (кто вправе;
//       лимит 600 000 МРП), ст. 724 (объект: доход без расходов, вычет расходов
//       работодателя после 24 000 МРП), ст. 726 (ставка 4%, вилка маслихата
//       не более 50%), ст. 727 (сдача до 15-го, уплата до 25-го числа второго
//       месяца после периода, одним платежом в виде ИПН).
//   Социальный кодекс № 224-VII: ст. 246 п. 1, ст. 248 п. 9 (взносы за себя
//     до 25-го числа следующего месяца), ст. 256 (пеня за просрочку социальных
//     отчислений, СО). Закон об ОСМС № 405-V: ст. 30 п. 6.
//   КоАП РК № 235-V, ст. 272: ч. 1 предупреждение, ч. 2 штраф 30 МРП для
//     субъектов малого предпринимательства, в том числе ИП (доход до 300 000 МРП
//     в год, иначе 45 МРП для среднего). ПЕРЕД ПУБЛИКАЦИЕЙ ПЕРЕПРОВЕРИТЬ текст
//     ст. 272: Минфин сообщал о планах отказаться от штрафов за несдачу, источники
//     до мая 2026 года ещё показывали прежнюю редакцию.
//   Приказ Минфина РК от 12.11.2025 № 695 (форма 910.00 и приложение 910.01,
//     правила составления в Приложении 27), действует с 01.01.2026. Названия
//     строк даны по пересказу Приложения 27 (pro1c.kz): текст приказа на
//     adilet из рабочей среды не открывался.
//
// Сознательно НЕ входит (не подтверждено): автозаполнение полей в кабинете,
// перенос срока соцплатежей на выходной, производственный календарь на 2027 год,
// штраф за занижение налога, способы входа в кабинет, значение строки 910.00.005
// при вычете ОПВ из базы СО (база СО не урегулирована, решение основателя
// 24.10.2026: основной расчёт по разъяснению ГФСС, СО от дохода минус ОПВ;
// по буквальному тексту ст. 245 п. 2 порядок для ИП не урегулирован; страница
// так и пишет и ведёт на калькулятор с обоими вариантами; пример только на
// базе 85 000, где варианты совпадают).
// Входит с оговорками на странице: код валюты («по классификатору», значение не
// называем), условие ОПВР «не платят родившиеся до 1975 года» (СК, ст. 248, п. 6).
//
// Страницы статичные: «ближайший срок» зашит в константы. Чтобы он не устарел
// молча, forma910.test.ts падает после NEXT_FILING_910 и после последней строки
// календаря: тогда обновить даты, F910_CHECKED и календарь.

import type { Guide } from './guides'
import { MZP_2026, formatNumber, formatTenge, mrpToTenge } from './mrp'
import { formatKkDate, formatRuDate } from './seoLaunch'

export const F910_SLUG = 'forma-910-uproshchenka-2026'
/** Дата проверки данных (ISO). */
export const F910_CHECKED = '2026-10-24'

// --- Ставка, пороги -------------------------------------------------------

/** Базовая ставка ИПН на упрощёнке, % (НК, ст. 726, ч. 1). */
export const F910_BASE_RATE_PERCENT = 4
/** Маслихат вправе менять ставку не более чем на 50% (НК, ст. 726). Нижняя граница, %. */
export const F910_RATE_MIN_PERCENT = F910_BASE_RATE_PERCENT * 0.5
/** Верхняя граница ставки с учётом решения маслихата, %. */
export const F910_RATE_MAX_PERCENT = F910_BASE_RATE_PERCENT * 1.5
/** Порог вычета расходов работодателя, в МРП на 1 января (НК, ст. 724, п. 1). */
export const PAYROLL_DEDUCTION_THRESHOLD_MRP = 24_000
export const PAYROLL_DEDUCTION_THRESHOLD_TENGE = mrpToTenge(PAYROLL_DEDUCTION_THRESHOLD_MRP)
/** Штраф за повторную несдачу в течение года для ИП (малое предпринимательство), в МРП (КоАП, ст. 272, ч. 2). */
export const LATE_FILING_FINE_MRP = 30
export const LATE_FILING_FINE_TENGE = mrpToTenge(LATE_FILING_FINE_MRP)
/** Штраф 30 МРП относится к малому предпринимательству: доход до 300 000 МРП в год (Предпринимательский кодекс, ст. 24, п. 3). */
export const SMALL_BUSINESS_INCOME_LIMIT_MRP = 300_000
/** Для среднего предпринимательства (доход выше порога выше) КоАП, ст. 272, ч. 2 даёт 45 МРП. */
export const LATE_FILING_FINE_MEDIUM_MRP = 45
export const LATE_FILING_FINE_MEDIUM_TENGE = mrpToTenge(LATE_FILING_FINE_MEDIUM_MRP)

/** День сдачи декларации и форм 200.00 (НК, ст. 727 п. 1, ст. 445 п. 1). */
export const FILING_DAY = 15
/** День уплаты налога по 910 (НК, ст. 727 п. 2) и взносов ИП за себя (Соцкодекс ст. 246 п. 1). */
export const PAYMENT_DAY = 25

// --- Ставки взносов ИП за себя (как в калькуляторе /tools/nalogi, см. ipTaxes.ts) ---

export const OPV_RATE = 0.1
export const OPVR_RATE = 0.035
export const SO_RATE = 0.05
export const VOSMS_RATE = 0.05
export const VOSMS_BASE_IN_MZP = 1.4

// --- Даты и перенос срока -------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0')

function isoToMs(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new Error(`Bad ISO date: ${iso}`)
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function msToIso(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** День недели по ISO-дате: 0 воскресенье ... 6 суббота. Не зависит от часового пояса. */
export function weekdayOf(iso: string): number {
  return new Date(isoToMs(iso)).getUTCDay()
}

export const WEEKDAYS_RU: readonly string[] = [
  'воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота',
]
export const WEEKDAYS_KK: readonly string[] = [
  'жексенбі', 'дүйсенбі', 'сейсенбі', 'сәрсенбі', 'бейсенбі', 'жұма', 'сенбі',
]

/**
 * Государственные праздники и перенесённые выходные, которые код учитывает
 * помимо субботы и воскресенья. Пусто намеренно: производственный календарь
 * на 2027 год не проверялся. Страница об этом предупреждает.
 */
export const EXTRA_NON_WORKING_DAYS: readonly string[] = []

/**
 * Срок по НК, ст. 64, п. 2: если последний день выпал на нерабочий день, срок
 * оканчивается в ближайший следующий рабочий день.
 */
export function shiftToWorkday(iso: string, extraNonWorking: readonly string[] = EXTRA_NON_WORKING_DAYS): string {
  let ms = isoToMs(iso)
  for (let i = 0; i < 14; i++) {
    const wd = new Date(ms).getUTCDay()
    if (wd !== 0 && wd !== 6 && !extraNonWorking.includes(msToIso(ms))) return msToIso(ms)
    ms += 86_400_000
  }
  throw new Error(`No working day within 14 days after ${iso}`)
}

export interface Deadline {
  /** Дата по тексту закона (15-е или 25-е число). */
  nominal: string
  /** Фактический последний день после переноса с нерабочего дня. */
  effective: string
  shifted: boolean
  /** День недели фактической даты (0 воскресенье). */
  weekday: number
}

export function makeDeadline(nominal: string, extraNonWorking: readonly string[] = EXTRA_NON_WORKING_DAYS): Deadline {
  const effective = shiftToWorkday(nominal, extraNonWorking)
  return { nominal, effective, shifted: effective !== nominal, weekday: weekdayOf(effective) }
}

/** Сдача 910.00 за полугодие: 15-е число второго месяца после периода (ст. 727, п. 1). */
export function filing910Deadline(year: number, half: 1 | 2): Deadline {
  return makeDeadline(half === 1 ? `${year}-08-${pad(FILING_DAY)}` : `${year + 1}-02-${pad(FILING_DAY)}`)
}

/** Уплата налога по 910 за полугодие: 25-е число второго месяца после периода (ст. 727, п. 2). */
export function payment910Deadline(year: number, half: 1 | 2): Deadline {
  return makeDeadline(half === 1 ? `${year}-08-${pad(PAYMENT_DAY)}` : `${year + 1}-02-${pad(PAYMENT_DAY)}`)
}

/** Сдача формы 200.00 за квартал: 15-е число второго месяца после квартала (ст. 445, п. 1). */
export function filing200Deadline(year: number, quarter: 1 | 2 | 3 | 4): Deadline {
  const month = quarter * 3 + 2
  const y = month > 12 ? year + 1 : year
  const m = month > 12 ? month - 12 : month
  return makeDeadline(`${y}-${pad(m)}-${pad(FILING_DAY)}`)
}

/** Ближайшие сроки от даты проверки. */
export const NEXT_FILING_910 = filing910Deadline(2026, 2)
export const NEXT_PAYMENT_910 = payment910Deadline(2026, 2)
export const FOLLOWING_FILING_910 = filing910Deadline(2027, 1)
export const FOLLOWING_PAYMENT_910 = payment910Deadline(2027, 1)
export const FILING_200_Q3_2026 = filing200Deadline(2026, 3)
export const FILING_200_Q4_2026 = filing200Deadline(2026, 4)
/** Для сравнения (срок уже прошёл): за I полугодие 2026 года. */
export const PAST_FILING_910_H1_2026 = filing910Deadline(2026, 1)
export const PAST_PAYMENT_910_H1_2026 = payment910Deadline(2026, 1)

export type DeadlineKind = 'file200' | 'file910' | 'pay910'
export interface CalendarRow {
  kind: DeadlineKind
  /** Отчётный период, к которому относится срок. */
  period: { type: 'half' | 'quarter'; year: number; n: 1 | 2 | 3 | 4 }
  deadline: Deadline
}

/** Календарь ближайших сроков в хронологическом порядке. */
export const F910_CALENDAR: readonly CalendarRow[] = [
  { kind: 'file200', period: { type: 'quarter', year: 2026, n: 3 }, deadline: FILING_200_Q3_2026 },
  { kind: 'file910', period: { type: 'half', year: 2026, n: 2 }, deadline: NEXT_FILING_910 },
  { kind: 'file200', period: { type: 'quarter', year: 2026, n: 4 }, deadline: FILING_200_Q4_2026 },
  { kind: 'pay910', period: { type: 'half', year: 2026, n: 2 }, deadline: NEXT_PAYMENT_910 },
  { kind: 'file910', period: { type: 'half', year: 2027, n: 1 }, deadline: FOLLOWING_FILING_910 },
  { kind: 'pay910', period: { type: 'half', year: 2027, n: 1 }, deadline: FOLLOWING_PAYMENT_910 },
]

// --- Падежи казахских месяцев для «до» ------------------------------------

const KK_MONTHS_DATIVE = [
  'қаңтарға', 'ақпанға', 'наурызға', 'сәуірге', 'мамырға', 'маусымға',
  'шілдеге', 'тамызға', 'қыркүйекке', 'қазанға', 'қарашаға', 'желтоқсанға',
]

/** '2027-02-15' -> '2027 жылғы 15 ақпанға' (для оборота «... дейін»). */
export function formatKkDateDative(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new Error(`Bad ISO date: ${iso}`)
  return `${m[1]} жылғы ${Number(m[3])} ${KK_MONTHS_DATIVE[Number(m[2]) - 1]}`
}

// --- Расчёт налоговой части: приложение 910.01 и строки 910.00.001-004 ----

export interface Appendix01Place {
  /** Столбец G: ставка в этом месте осуществления деятельности, %. */
  ratePercent: number
  /** Столбец H: доход по ст. 724 с корректировками по п. 7, ₸. */
  income: number
}

export interface Appendix01Row {
  g: number
  h: number
  /** Столбец I: доля H в итоге H, %. */
  i: number
  /** Столбец J: часть 910.01.001, приходящаяся на строку, ₸. */
  j: number
  /** Столбец K: доход для налога, K = H - J. */
  k: number
  /** Столбец L: налог, L = K * G / 100. */
  l: number
}

export interface Form910Taxes {
  rows: Appendix01Row[]
  /** 910.00.001: итог столбца H. */
  line001: number
  /** 910.00.002: сумма к уменьшению (910.01.001), расходы работодателя после порога 24 000 МРП. */
  line002: number
  /** 910.00.003 = 001 - 002. */
  line003: number
  /** 910.00.004: итог столбца L, ИПН к уплате. */
  line004: number
}

/**
 * Налоговая часть формы по формулам приложения 910.01 и раздела «Исчисленные
 * налоги». Округление до целого тенге в каждой строке: допущение модуля, на
 * числа примера не влияет (там всё делится нацело).
 */
export function form910Taxes(places: readonly Appendix01Place[], payrollReduction = 0): Form910Taxes {
  const totalH = places.reduce((s, p) => s + p.income, 0)
  const rows = places.map(p => {
    const share = totalH > 0 ? p.income / totalH : 0
    const j = Math.round(payrollReduction * share)
    const k = p.income - j
    return {
      g: p.ratePercent,
      h: p.income,
      i: share * 100,
      j,
      k,
      l: Math.round((k * p.ratePercent) / 100),
    }
  })
  const line001 = totalH
  const line002 = payrollReduction
  return {
    rows,
    line001,
    line002,
    line003: line001 - line002,
    line004: rows.reduce((s, r) => s + r.l, 0),
  }
}

// --- Взносы ИП за себя при минимальной заявленной базе --------------------
//
// Только минимальная база (1 МЗП): на ней оба способа расчёта СО (основной, по
// разъяснению ГФСС с вычетом ОПВ, и по буквальному тексту ст. 245 п. 2 без
// вычета) дают 4 250. Для другой базы страница отсылает к калькулятору
// /tools/nalogi (там основной расчёт ГФСС и второй вариант, ipTaxes.ts) и к
// гайду nalogi-ip-uproshchenka-2026.

export interface ContributionLine {
  /** Номер строки формы 910.00. */
  line: string
  key: 'soIncome' | 'so' | 'pensionIncome' | 'opv' | 'opvr' | 'vosms'
  /** Сумма за каждый месяц полугодия (I-VI). */
  months: number[]
  /** VII: сумма I-VI. */
  total: number
}

export const VOSMS_MONTHLY = Math.round(VOSMS_BASE_IN_MZP * MZP_2026 * VOSMS_RATE)

export function minimumBaseMonthly() {
  const base = MZP_2026
  const opv = Math.round(base * OPV_RATE)
  const opvr = Math.round(base * OPVR_RATE)
  const so = Math.round(base * SO_RATE)
  const vosms = VOSMS_MONTHLY
  return { base, opv, opvr, so, vosms, total: opv + opvr + so + vosms }
}

export function minimumBaseContributionLines(months = 6): ContributionLine[] {
  const m = minimumBaseMonthly()
  const make = (line: string, key: ContributionLine['key'], value: number): ContributionLine => {
    const arr = Array.from({ length: months }, () => value)
    return { line, key, months: arr, total: arr.reduce((s, v) => s + v, 0) }
  }
  return [
    make('910.00.005', 'soIncome', m.base),
    make('910.00.006', 'so', m.so),
    make('910.00.007', 'pensionIncome', m.base),
    make('910.00.008', 'opv', m.opv),
    make('910.00.009', 'opvr', m.opvr),
    make('910.00.010', 'vosms', m.vosms),
  ]
}

// --- Пример (выдуманные данные) --------------------------------------------

/** Условный доход ИП без работников за полугодие, ₸. Поступал поровну по 1 000 000 в месяц. */
export const EXAMPLE_HALF_YEAR_INCOME = 6_000_000
export const EXAMPLE_MONTHS = 6

export function formaExample() {
  const places: Appendix01Place[] = [{ ratePercent: F910_BASE_RATE_PERCENT, income: EXAMPLE_HALF_YEAR_INCOME }]
  const taxes = form910Taxes(places)
  const contributionLines = minimumBaseContributionLines(EXAMPLE_MONTHS)
  const monthly = minimumBaseMonthly()
  const contributionsHalfYear = monthly.total * EXAMPLE_MONTHS
  return {
    income: EXAMPLE_HALF_YEAR_INCOME,
    monthlyIncome: EXAMPLE_HALF_YEAR_INCOME / EXAMPLE_MONTHS,
    taxes,
    contributionLines,
    monthly,
    contributionsHalfYear,
    grandTotal: taxes.line004 + contributionsHalfYear,
  }
}

// --- Тексты реестра гайдов (подставляют числа и даты из констант) ----------

const RATE = `${F910_BASE_RATE_PERCENT}%`
const RATE_MIN = String(F910_RATE_MIN_PERCENT)
const RATE_MAX = String(F910_RATE_MAX_PERCENT)
const FINE = formatTenge(LATE_FILING_FINE_TENGE)
const SMALL_LIMIT = formatNumber(SMALL_BUSINESS_INCOME_LIMIT_MRP)

const RU = {
  nextFile: formatRuDate(NEXT_FILING_910.effective),
  nextPay: formatRuDate(NEXT_PAYMENT_910.effective),
  followFile: formatRuDate(FOLLOWING_FILING_910.effective),
  pastFile: formatRuDate(PAST_FILING_910_H1_2026.effective),
}
const KK = {
  nextFileDat: formatKkDateDative(NEXT_FILING_910.effective),
  nextPayDat: formatKkDateDative(NEXT_PAYMENT_910.effective),
  followFile: formatKkDate(FOLLOWING_FILING_910.effective),
  pastFile: formatKkDate(PAST_FILING_910_H1_2026.effective),
  pastFileDat: formatKkDateDative(PAST_FILING_910_H1_2026.effective),
}

export const FORMA910_GUIDE: Guide = {
  slug: F910_SLUG,
  updated: F910_CHECKED,
  relatedTools: ['nalogi', 'schet'],
  relatedGuides: ['nalogi-ip-uproshchenka-2026', 'mrp-2026', 'kak-otkryt-ip-2026'],
  ru: {
    shortTitle: 'Форма 910.00: как заполнить',
    title: 'Форма 910.00 в 2026: как заполнить и когда сдавать',
    description: `Форма 910.00 на упрощёнке в 2026: сдача до 15 августа и 15 февраля, оплата до 25-го. Заполнение по строкам, пример с цифрами и ближайшие сроки.`,
    summary: `Форму 910.00 ИП на упрощёнке сдаёт раз в полугодие: до 15 августа и до 15 февраля, а налог ${RATE} платит до 25-го числа того же месяца. Ближайший срок: сдача за II полугодие 2026 до ${RU.nextFile}, уплата до ${RU.nextPay}. Форма подаётся в новом кабинете knp.kgd.gov.kz, взносы за себя платятся каждый месяц отдельно.`,
    faq: [
      {
        q: 'Когда сдавать форму 910.00 в 2026 и 2027 году?',
        a: `По Налоговому кодексу декларацию сдают не позднее 15 числа второго месяца после полугодия, а налог платят не позднее 25 числа: за I полугодие это 15 и 25 августа, за II полугодие 15 и 25 февраля. За II полугодие 2026 года сдать форму нужно до ${RU.nextFile}, заплатить до ${RU.nextPay}.`,
      },
      {
        q: 'Что делать, если срок сдачи выпал на выходной?',
        a: `Если последний день срока приходится на нерабочий день, срок оканчивается в ближайший следующий рабочий день (статья 64 НК). В 2026 году 15 августа было субботой, поэтому форму за I полугодие сдавали до ${RU.pastFile}, а в 2027 году 15 августа придётся на воскресенье и срок сдвинется на ${RU.followFile}. В электронном виде можно сдать до 24:00 последнего дня.`,
      },
      {
        q: 'Сколько платить по форме 910.00 и уменьшают ли налог взносы ИП?',
        a: `Налог равен ${RATE} от дохода за полугодие без вычета расходов, а решением маслихата ставка в регионе может быть от ${RATE_MIN}% до ${RATE_MAX}%. Взносы ИП за себя налог в 2026 году не уменьшают: нормы о таком вычете в статьях 722-727 НК нет, а социального налога на режиме тоже нет. Налог платится одним платежом в виде ИПН.`,
      },
      {
        q: 'Что будет, если не сдать форму 910.00 в срок или ошибиться?',
        a: `За первую несдачу в срок КоАП (статья 272) предусматривает предупреждение, а при повторном нарушении в течение года ИП как субъекту малого предпринимательства грозит штраф ${LATE_FILING_FINE_MRP} МРП, то есть ${FINE}, при доходе до ${SMALL_LIMIT} МРП в год (иначе ${LATE_FILING_FINE_MEDIUM_MRP} МРП для среднего предпринимательства). Принятую форму отозвать нельзя: ошибку исправляют дополнительной формой. Нулевую форму после срока система формирует сама, только если форма 910.00 внесена в перечень форм в кабинете (статья 115, пункт 2), поэтому полагаться на это не стоит; при наличии дохода нужно подать дополнительную.`,
      },
      {
        q: 'Где сдавать форму 910.00 за 2026 год?',
        a: `Форма 910.00 на 2026 год доступна в новом Кабинете налогоплательщика ИСНА по адресу knp.kgd.gov.kz с 6 февраля 2026 года, сдача через вход в кабинет. В старом кабинете КНП и в СОНО этой формы за 2026 год нет. Бумажная подача допускается, но форма считается сданной только со статусом «Документ принят».`,
      },
    ],
  },
  kk: {
    shortTitle: '910.00 нысаны: қалай толтыру',
    title: '910.00 нысаны 2026: қалай толтыру және қашан тапсыру',
    description: `Оңайлатылған декларациядағы 910.00 нысаны 2026 жылы: 15 тамыз бен 15 ақпанға дейін тапсыру, 25-ке дейін төлеу. Жолдар бойынша толтыру, мысал, мерзімдер.`,
    summary: `910.00 нысанын оңайлатылған декларациядағы ЖК жарты жылда бір рет тапсырады: 15 тамызға және 15 ақпанға дейін, ал ${RATE} салықты сол айдың 25-іне дейін төлейді. Ең жақын мерзім: 2026 жылғы II жартыжылдық үшін ${KK.nextFileDat} дейін тапсыру, ${KK.nextPayDat} дейін төлеу. Нысан knp.kgd.gov.kz жаңа кабинетінде тапсырылады, өзі үшін жарналар ай сайын бөлек төленеді.`,
    faq: [
      {
        q: '2026 және 2027 жылы 910.00 нысанын қашан тапсыру керек?',
        a: `Салық кодексі бойынша декларацияны жартыжылдықтан кейінгі екінші айдың 15-інен кешіктірмей тапсырады, ал салықты 25-інен кешіктірмей төлейді: I жартыжылдық үшін бұл 15 және 25 тамыз, II жартыжылдық үшін 15 және 25 ақпан. 2026 жылғы II жартыжылдық үшін нысанды ${KK.nextFileDat} дейін тапсырып, ${KK.nextPayDat} дейін төлеу керек.`,
      },
      {
        q: 'Тапсыру мерзімі демалыс күніне түссе, не істеу керек?',
        a: `Мерзімнің соңғы күні жұмыс істемейтін күнге түссе, мерзім ең жақын келесі жұмыс күні аяқталады (СК 64-бабы). 2026 жылы 15 тамыз сенбі болды, сондықтан I жартыжылдық үшін нысанды ${KK.pastFileDat} дейін тапсырды, ал 2027 жылы 15 тамыз жексенбіге түседі де, мерзім ${KK.followFile} күніне ауысады. Электронды түрде соңғы күннің 24:00-не дейін тапсыруға болады.`,
      },
      {
        q: '910.00 нысаны бойынша қанша төлеу керек және ЖК жарналары салықты азайта ма?',
        a: `Салық шығыстарды шегермей, жарты жылдағы табыстан ${RATE} тең, ал мәслихат шешімімен өңірдегі мөлшерлеме ${RATE_MIN}%-дан ${RATE_MAX}%-ға дейін болуы мүмкін. ЖК-нің өзі үшін жарналары 2026 жылы салықты азайтпайды: СК 722-727 баптарында мұндай шегеру нормасы жоқ, режимде әлеуметтік салық та жоқ. Салық ЖТС түрінде бір төлеммен төленеді.`,
      },
      {
        q: '910.00 нысанын мерзімінде тапсырмаса немесе қателессе, не болады?',
        a: `Мерзімінде тапсырмағаны үшін алғашқыда ӘҚБтК (272-бап) ескерту көздейді, ал бір жыл ішінде қайталанса, шағын кәсіпкерлік субъектісі ретінде ЖК-ге ${LATE_FILING_FINE_MRP} АЕК айыппұл салынады, яғни ${FINE}; бұл жылдық табыс ${SMALL_LIMIT} АЕК-ке дейін болғанда, әйтпесе орта кәсіпкерлік үшін ${LATE_FILING_FINE_MEDIUM_MRP} АЕК. Қабылданған нысанды кері қайтарып алуға болмайды: қатені қосымша нысанмен түзетеді. Мерзімнен кейін жүйе нөлдік нысанды 910.00 нысаны кабинеттегі нысандар тізбесіне енгізілген болса ғана өзі қалыптастырады (115-баптың 2-тармағы), сондықтан бұған сенбеңіз; табыс болса, қосымша нысан тапсыру керек.`,
      },
      {
        q: '2026 жылға 910.00 нысанын қайда тапсыру керек?',
        a: `2026 жылға 910.00 нысаны ИСНА салық төлеушінің жаңа кабинетінде knp.kgd.gov.kz мекенжайында 2026 жылғы 6 ақпаннан бастап қолжетімді, тапсыру кабинетке кіру арқылы жүзеге асады. Ескі КНП кабинетінде және СОНО-да 2026 жылға бұл нысан жоқ. Қағаз түрінде тапсыруға болады, бірақ нысан «Құжат қабылданды» мәртебесімен ғана тапсырылған болып саналады.`,
      },
    ],
  },
}

/** Ссылка на гайд для других модулей. */
export const F910_URL_RU = `/guides/${F910_SLUG}`
