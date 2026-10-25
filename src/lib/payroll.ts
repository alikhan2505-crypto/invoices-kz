// Расчёт зарплаты работника в Казахстане на 2026 год: «начислено -> на руки»,
// «на руки -> начислено», нагрузка на работодателя (инструмент /tools/zarplata).
//
// Чистая целочисленная арифметика: без дат на уровне модуля, без случайности,
// без Date. Деньги нигде не вшиты: все суммы выводятся из МРП и МЗП, которые
// импортируются из '@/lib/mrp' (третьей копии не заводим).
//
// Первоисточники (сверено 24.10.2026, см. PAYROLL_CHECKED):
//   Закон РК от 8 декабря 2025 года № 239-VIII «О республиканском бюджете на
//     2026-2028 годы», ст. 7 (пп. 1 МЗП 85 000, пп. 4 МРП 4 325).
//   Налоговый кодекс РК от 18 июля 2025 года № 214-VIII (действует с 01.01.2026):
//     ст. 363 пп. 1 (ставка ИПН 10% до 8 500 МРП в год, 15% сверх),
//     ст. 401 п. 3 (порядок вычетов: ст. 402, затем 403, затем 404),
//     ст. 403 (базовый вычет 30 МРП за каждый календарный месяц),
//     ст. 404 п. 1 пп. 1-2 (социальный вычет: 5 000 МРП для лиц с инвалидностью
//       I и II группы, 882 МРП для III группы),
//     ст. 441 (ИПН с дохода работника считается нарастающим итогом за год),
//     ст. 555 п. 2 пп. 1 (на упрощённой декларации социальный налог не платится),
//     ст. 556 п. 2-3 (объект СН и пол 14 МРП), ст. 557 п. 1 (ставка СН 6%),
//     ст. 558 п. 1 пп. 2 (база пола);
//     ст. 556 п. 1 (последний абзац) и п. 4, ст. 557 п. 3, ст. 558 п. 2: ИП и лицо
//       частной практики на общеустановленном порядке платят СН не 6%, а фиксированно
//       1 МРП (на дату уплаты) за каждого работника, без пола 14 МРП; при нулевой
//       начисленной суммы СН не начисляется (п. 4, нет объекта обложения).
//   Социальный кодекс РК: ст. 207, 243 (пенсионер освобождён от СО), ст. 244 п. 1
//     (ставка СО 5%), ст. 245 п. 1 (база СО: доход минус ОПВ, от 1 МЗП до 7 МЗП),
//     ст. 248 п. 3 и п. 6 (кому ОПВ и ОПВР не платятся; п. 6 пп. 6: ОПВР не платится
//     за работников, родившихся до 01.01.1975, флаг bornBefore1975), ст. 249 п. 1 пп. 1
//     (ОПВ 10%, потолок 50 МЗП), ст. 251 п. 1-2 (ОПВР 3,5% в 2026 году, от 1 МЗП
//     до 50 МЗП).
//   Закон РК «Об обязательном социальном медицинском страховании»: ст. 26 п. 1
//     (освобождения), ст. 27 п. 1, п. 2-2, п. 3 (ООСМС 3%, потолок 40 МЗП),
//     ст. 28 п. 1, п. 5-2, п. 7 (ВОСМС 2%, потолок 20 МЗП).
//   Правила СО п. 8 и п. 14; Правила ОСМС (приказ Минздрава № 478) п. 39.
//
// Округление по платежам (SPEC раздел 3.1): ВОСМС и ООСМС половина вверх
// (п. 39 Правил ОСМС); ОПВ, ОПВР, ИПН, СН половина вверх (допускается ведомствами,
// нормы в Кодексе нет); СО до целого тенге, направление спорное, ПРЕДПОЛОЖЕНИЕ
// «вверх» (SO_ROUNDING, меняется одной константой). Промежуточные налоговые
// суммы нарастающим итогом не округляются: ИПН за месяц равен
// round_half_up(налог(cum) - налог(prior)).

import { MRP_2026, MZP_2026 } from '@/lib/mrp'

export { MRP_2026, MZP_2026 }

/** Дата сверки с первоисточниками (ISO). Выводится на страницу через formatIsoDate. */
export const PAYROLL_CHECKED = '2026-10-24'

/** Округление СО: 'ceil' вверх до целого тенге (ПРЕДПОЛОЖЕНИЕ, п. 14 Правил СО), 'half' половина вверх. */
export type SoRounding = 'ceil' | 'half'
export const SO_ROUNDING = 'ceil' as SoRounding

// ---------------------------------------------------------------------------
// Константы (все выводятся из МРП и МЗП)
// ---------------------------------------------------------------------------

/** Базовый вычет за месяц, 30 МРП (НК ст. 403). */
export const BASE_DEDUCTION = 30 * MRP_2026
/** Годовой предел базового вычета, 360 МРП (НК ст. 403). В расчёте не нужен, нужен для справки. */
export const BASE_DEDUCTION_YEAR_CAP = 360 * MRP_2026
/** Порог ставки ИПН 15% за год, 8 500 МРП нарастающим итогом (НК ст. 363 пп. 1, ст. 441). */
export const IPN_THRESHOLD_YEAR = 8_500 * MRP_2026
/** Пол объекта обложения социальным налогом, 14 МРП (НК ст. 556 п. 3, ст. 558 п. 1 пп. 2). */
export const SN_FLOOR_OBJECT = 14 * MRP_2026
/** Потолок ОПВ и ОПВР, 50 МЗП (Соц.К. ст. 249 п. 1 пп. 1; ст. 251 п. 2). */
export const CAP_50_MZP = 50 * MZP_2026
/** Потолок базы СО, 7 МЗП (Соц.К. ст. 245 п. 1). */
export const CAP_7_MZP = 7 * MZP_2026
/** Потолок ВОСМС, 20 МЗП (Закон об ОСМС ст. 28 п. 5-2). */
export const CAP_20_MZP = 20 * MZP_2026
/** Потолок ООСМС, 40 МЗП (Закон об ОСМС ст. 27 п. 2-2). */
export const CAP_40_MZP = 40 * MZP_2026
/** Пол базы СО и ОПВР, 1 МЗП (Соц.К. ст. 245 п. 1 ч. 4; ст. 251 п. 2). */
export const FLOOR_1_MZP = 1 * MZP_2026

/** Годовой социальный вычет лиц с инвалидностью (НК ст. 404 п. 1 пп. 1-2): I-II группа 5 000 МРП, III группа 882 МРП. */
export const SOCIAL_DEDUCTION = {
  disabled12Indefinite: 5_000 * MRP_2026,
  disabled12Term: 5_000 * MRP_2026,
  disabled3: 882 * MRP_2026,
} as const

/** Ставки как целые дроби: [числитель, знаменатель]. Без float. */
export const RATE_OPV: readonly [number, number] = [10, 100] // Соц.К. ст. 249 п. 1 пп. 1
export const RATE_VOSMS: readonly [number, number] = [2, 100] // Закон об ОСМС ст. 28 п. 1
export const RATE_OOSMS: readonly [number, number] = [3, 100] // Закон об ОСМС ст. 27 п. 1
export const RATE_OPVR: readonly [number, number] = [35, 1000] // Соц.К. ст. 251 п. 1, ставка 2026 года
export const RATE_SO: readonly [number, number] = [5, 100] // Соц.К. ст. 244 п. 1
export const RATE_SN: readonly [number, number] = [6, 100] // НК ст. 557 п. 1 (ТОО, АО и прочие юридические лица)
/** СН ИП на общеустановленном порядке за одного работника в месяц: 1 МРП (НК ст. 557 п. 3, ст. 558 п. 2). */
export const SN_SOLE_FIXED = 1 * MRP_2026
/** ИПН как налог x 100 на единицу базы: 10 до порога и 15 сверх (НК ст. 363 пп. 1). */
export const IPN_PCT_LOW = 10
export const IPN_PCT_HIGH = 15

/** Верхняя граница ввода начисленной суммы за месяц (9 знаков). */
export const MAX_GROSS = 999_999_999

// ---------------------------------------------------------------------------
// Типы
// ---------------------------------------------------------------------------

export type PayrollCategory =
  | 'standard'
  | 'pensioner'
  | 'disabled12Indefinite'
  | 'disabled12Term'
  | 'disabled3'

/**
 * Режим работодателя:
 *   'general'     юридическое лицо (ТОО, АО) на общеустановленном порядке: СН 6% (по умолчанию);
 *   'soleGeneral' ИП или лицо частной практики на общеустановленном порядке: СН фиксированно 1 МРП на работника;
 *   'simplified'  упрощённая декларация: СН не платится.
 */
export type EmployerRegime = 'general' | 'soleGeneral' | 'simplified'

export const PAYROLL_CATEGORIES: readonly PayrollCategory[] = [
  'standard',
  'pensioner',
  'disabled12Indefinite',
  'disabled12Term',
  'disabled3',
]

/** Коды предупреждений (SPEC раздел 5.1). Тексты подбирает слой UI. */
export type PayrollWarningCode =
  | 'w1'
  | 'w2'
  | 'w3'
  | 'w4'
  | 'w5'
  | 'w6'
  | 'w7'
  | 'w8'
  | 'w9'
  | 'w10'
  | 'w11'

export interface PayrollInput {
  /** Начисленная сумма за месяц, целое 0 .. MAX_GROSS. 0 даёт нулевой результат. */
  gross: number
  /** По умолчанию 'standard'. */
  category?: PayrollCategory
  /** Базовый вычет 30 МРП, по умолчанию true. */
  baseDeduction?: boolean
  /** Режим работодателя, по умолчанию 'general'. */
  employerRegime?: EmployerRegime
  /** Месяц найма или увольнения: пол СН не применяется. По умолчанию false. */
  hireOrFireMonth?: boolean
  /**
   * Работник родился до 01.01.1975: работодатель не платит за него ОПВР
   * (Соц.К. ст. 248 п. 6 пп. 6). Меняет только ОПВР, стоимость работника и
   * итого в бюджет; на руки и ИПН не затрагивает. По умолчанию false.
   */
  bornBefore1975?: boolean
  /** Номер месяца 1..12, зарплата одинакова с января. По умолчанию 1. */
  monthIndex?: number
  /**
   * Ручной ввод облагаемого дохода прошлых месяцев (нарастающим итогом). Для
   * категорий с инвалидностью игнорируется; тогда monthIndex не используется.
   */
  priorTaxableCum?: number
}

export interface NormalizedPayrollInput {
  gross: number
  category: PayrollCategory
  baseDeduction: boolean
  employerRegime: EmployerRegime
  hireOrFireMonth: boolean
  bornBefore1975: boolean
  monthIndex: number
  /** undefined, если ручной ввод не задан или не применим к категории. */
  priorTaxableCum: number | undefined
}

export interface PayrollResult {
  input: NormalizedPayrollInput
  gross: number
  /** Удерживается с работника. */
  opv: number
  vosms: number
  ipn: number
  /** На руки. */
  net: number
  /** Платит работодатель сверх зарплаты. */
  opvr: number
  so: number
  sn: number
  oosms: number
  /** opv + vosms + ipn. */
  withheld: number
  /** gross + opvr + so + sn + oosms. */
  employerCost: number
  /** opv + opvr + vosms + oosms + so + sn + ipn. Всегда employerCost - net. */
  totalToState: number

  /** Базы платежей (для пояснений «формула с числами»). */
  bases: {
    opv: number
    vosms: number
    oosms: number
    opvr: number
    so: number
    /** База СН: gross - opv - vosms либо пол SN_FLOOR_OBJECT; 0 на упрощённой декларации и у ИП (фиксированная сумма). */
    sn: number
  }
  /**
   * Платёж обнулён категорией работника или годом рождения (причина для пояснения).
   * opvr: true и по категории, и по флагу «родился до 1975». opvrBorn1975: true,
   * только когда единственная причина флаг (категория сама ОПВР не отменяет).
   */
  exempt: { opv: boolean; vosms: boolean; oosms: boolean; opvr: boolean; so: boolean; opvrBorn1975: boolean }
  /** Платёж упёрся в потолок. */
  capped: { opv: boolean; opvr: boolean; vosms: boolean; oosms: boolean }
  /** Применён пол СН 14 МРП (3 633 ₸). */
  snFloorApplied: boolean
  /** СН ИП на общеустановленном порядке: фиксированно 1 МРП на работника (true только когда СН начислен). */
  snFixed: boolean

  ipnDetail: {
    /** Применённый базовый вычет в месяц (0, если выключен). */
    baseDeduction: number
    /** gross - opv - vosms - вычет, не меньше нуля, до социального вычета. */
    baseBeforeSocial: number
    /** Годовой социальный вычет категории (0 для остальных). */
    socialLimit: number
    /** Облагаемый доход нарастающим итогом до этого месяца. */
    priorCum: number
    /** Облагаемый доход нарастающим итогом включая этот месяц. */
    cum: number
    /** База ИПН этого месяца после социального вычета (cum - priorCum). */
    base: number
    /** Часть базы месяца по ставке 10% и 15%. */
    base10: number
    base15: number
    /** Сколько социального вычета ушло в этом месяце. */
    socialApplied: number
    mode: 'equalSalary' | 'manualPrior'
  }
  /** Первый месяц 1..12, где облагаемый доход нарастающим итогом выше порога 15% (зарплата одинакова); null, если нет или ручной ввод. */
  thresholdMonth: number | null
  warnings: PayrollWarningCode[]
}

export interface ReverseOptions {
  category?: PayrollCategory
  baseDeduction?: boolean
  employerRegime?: EmployerRegime
  hireOrFireMonth?: boolean
  /** Родился до 01.01.1975: ОПВР не платится. На сумму на руки не влияет, обратный расчёт его только пробрасывает. */
  bornBefore1975?: boolean
  monthIndex?: number
  priorTaxableCum?: number
}

export interface ReverseResult {
  target: number
  /** Наименьшая начисленная сумма с точно такой суммой на руки; null, если слишком большая. */
  gross: number | null
  /** Остальные начисленные суммы с той же суммой на руки (W9). */
  alternatives: number[]
  /** false: точной суммы нет, взято ближайшее наименьшее значение с net >= target (W11). */
  exact: boolean
  tooLarge: boolean
  result: PayrollResult | null
  /** Предупреждения результата плюс w9 и w11. */
  warnings: PayrollWarningCode[]
}

// ---------------------------------------------------------------------------
// Целочисленные округления. n >= 0, d > 0, оба целые. Через остаток, не через Math.round.
// ---------------------------------------------------------------------------

function idiv(n: number, d: number): number {
  return (n - (n % d)) / d
}

/** Половина вверх: round(n / d). */
function roundHalfUp(n: number, d: number): number {
  return idiv(2 * n + d, 2 * d)
}

/** Вверх: ceil(n / d). */
function ceilDiv(n: number, d: number): number {
  return idiv(n + d - 1, d)
}

function rate(amount: number, r: readonly [number, number]): number {
  return roundHalfUp(amount * r[0], r[1])
}

/** Налог x 100 нарастающим итогом, точно (НК ст. 363 пп. 1). */
function tax100(cum: number): number {
  return IPN_PCT_LOW * Math.min(cum, IPN_THRESHOLD_YEAR) + IPN_PCT_HIGH * Math.max(cum - IPN_THRESHOLD_YEAR, 0)
}

// ---------------------------------------------------------------------------
// Категории
// ---------------------------------------------------------------------------

function isDisabled(c: PayrollCategory): c is keyof typeof SOCIAL_DEDUCTION {
  return c === 'disabled12Indefinite' || c === 'disabled12Term' || c === 'disabled3'
}

// Соц.К. ст. 248 п. 3 и п. 6 (ОПВ и ОПВР), ст. 243 (СО), Закон об ОСМС ст. 26 п. 1, ст. 27 п. 3, ст. 28 п. 7.
function exemptions(c: PayrollCategory) {
  const osms = c !== 'standard'
  const opv = c === 'pensioner' || c === 'disabled12Indefinite'
  return { osms, opv, opvr: opv, so: c === 'pensioner' }
}

// ---------------------------------------------------------------------------
// Нормализация и проверка входа
// ---------------------------------------------------------------------------

function isNonNegInt(x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x) && x >= 0
}

function normalize(i: PayrollInput | (ReverseOptions & { gross: number })): NormalizedPayrollInput {
  const gross = i.gross
  if (!isNonNegInt(gross) || gross > MAX_GROSS) {
    throw new RangeError(`payroll: gross must be an integer 0..${MAX_GROSS}`)
  }
  const category = i.category ?? 'standard'
  if (!PAYROLL_CATEGORIES.includes(category)) throw new RangeError('payroll: unknown category')
  const regime = i.employerRegime ?? 'general'
  if (regime !== 'general' && regime !== 'soleGeneral' && regime !== 'simplified') throw new RangeError('payroll: unknown employerRegime')
  const monthIndex = i.monthIndex ?? 1
  if (!Number.isInteger(monthIndex) || monthIndex < 1 || monthIndex > 12) {
    throw new RangeError('payroll: monthIndex must be an integer 1..12')
  }
  let prior = i.priorTaxableCum
  if (prior !== undefined) {
    if (!isNonNegInt(prior) || prior > 1e12) throw new RangeError('payroll: priorTaxableCum must be an integer >= 0')
    if (isDisabled(category)) prior = undefined // ручной ввод запрещён для категорий с инвалидностью
  }
  return {
    gross,
    category,
    baseDeduction: i.baseDeduction ?? true,
    employerRegime: regime,
    hireOrFireMonth: i.hireOrFireMonth ?? false,
    bornBefore1975: i.bornBefore1975 === true,
    monthIndex,
    priorTaxableCum: prior,
  }
}

// ---------------------------------------------------------------------------
// Ядро. Без проверки диапазона (используется и обратным расчётом).
// ---------------------------------------------------------------------------

/** Взносы работника, от которых зависит база ИПН: ОПВ и ВОСМС (с округлением, как в расчётном листке). */
function employeeContributions(g: number, category: PayrollCategory) {
  const ex = exemptions(category)
  const opv = ex.opv ? 0 : rate(Math.min(g, CAP_50_MZP), RATE_OPV)
  const vosms = ex.osms ? 0 : rate(Math.min(g, CAP_20_MZP), RATE_VOSMS)
  return { opv, vosms }
}

/** Месячная база ИПН до социального вычета: gross - opv - vosms - базовый вычет, не ниже нуля. */
function monthlyBase(g: number, category: PayrollCategory, baseDeduction: boolean): number {
  const { opv, vosms } = employeeContributions(g, category)
  return Math.max(g - opv - vosms - (baseDeduction ? BASE_DEDUCTION : 0), 0)
}

/** Облагаемый доход нарастающим итогом через m месяцев одинаковой зарплаты (с социальным вычетом). */
function cumulativeAfter(m: number, b: number, category: PayrollCategory): number {
  return isDisabled(category) ? Math.max(m * b - SOCIAL_DEDUCTION[category], 0) : m * b
}

function core(n: NormalizedPayrollInput): PayrollResult {
  const g = n.gross
  const cat = n.category
  const ex = exemptions(cat)
  const disabled = isDisabled(cat)
  const idle = g === 0

  // --- взносы. ОПВ и ВОСМС округляются ДО того, как попадают в базы.
  const { opv, vosms } = employeeContributions(g, cat)
  const oosms = ex.osms ? 0 : rate(Math.min(g, CAP_40_MZP), RATE_OOSMS)
  const opvrBase = Math.min(Math.max(g, FLOOR_1_MZP), CAP_50_MZP)
  // Соц.К. ст. 248 п. 6 пп. 6: ОПВР не платится за работников, родившихся до 01.01.1975
  // (платится за 1975 г. р. и моложе). Складывается с категорией по «или»: у пенсионера и
  // у инвалида I-II группы бессрочно ОПВР и так ноль. На ОПВ, ВОСМС, ИПН, СО, СН, ООСМС не влияет.
  const opvrExempt = ex.opvr || n.bornBefore1975
  const opvr = idle || opvrExempt ? 0 : rate(opvrBase, RATE_OPVR)
  // Соц.К. ст. 245 п. 1: доход минус ОПВ (ВОСМС не вычитается), от 1 МЗП до 7 МЗП.
  const soBase = Math.min(Math.max(g - opv, FLOOR_1_MZP), CAP_7_MZP)
  const soRaw = soBase * RATE_SO[0]
  const so = idle || ex.so ? 0 : SO_ROUNDING === 'ceil' ? ceilDiv(soRaw, RATE_SO[1]) : roundHalfUp(soRaw, RATE_SO[1])

  // --- СН (НК ст. 555-558)
  let sn = 0
  let snBase = 0
  let snFloorApplied = false
  let snFixed = false
  if (n.employerRegime === 'simplified' || idle) {
    sn = 0 // НК ст. 555 п. 2 пп. 1; при нулевой начисленной нет объекта обложения (ст. 556 п. 4)
  } else if (n.employerRegime === 'soleGeneral') {
    sn = SN_SOLE_FIXED // НК ст. 556 п. 1, п. 4, ст. 557 п. 3, ст. 558 п. 2: 1 МРП на работника, без пола 14 МРП и без зависимости от дохода
    snFixed = true
  } else if (!n.hireOrFireMonth && g >= 1 && g <= SN_FLOOR_OBJECT) {
    snBase = SN_FLOOR_OBJECT // ст. 556 п. 3, ст. 558 п. 1 пп. 2: ОПВ и ВОСМС не вычитаются
    sn = rate(snBase, RATE_SN)
    snFloorApplied = true
  } else {
    snBase = g - opv - vosms // ст. 556 п. 2, ст. 557 п. 1; на СО не уменьшается
    sn = rate(snBase, RATE_SN)
  }

  // --- ИПН (НК ст. 401 п. 3, ст. 441: нарастающим итогом, налог(cum) - налог(prior) без промежуточного округления)
  const dedApplied = n.baseDeduction ? BASE_DEDUCTION : 0
  const b = Math.max(g - opv - vosms - dedApplied, 0)
  const m = n.monthIndex
  const L = disabled ? SOCIAL_DEDUCTION[cat] : 0
  let priorCum: number
  let cum: number
  let mode: 'equalSalary' | 'manualPrior' = 'equalSalary'
  if (disabled) {
    priorCum = Math.max((m - 1) * b - L, 0)
    cum = Math.max(m * b - L, 0)
  } else if (n.priorTaxableCum !== undefined) {
    mode = 'manualPrior'
    priorCum = n.priorTaxableCum
    cum = priorCum + b
  } else {
    priorCum = (m - 1) * b
    cum = m * b
  }
  const ipn = roundHalfUp(tax100(cum) - tax100(priorCum), 100)
  const ipnBase = cum - priorCum
  const base10 = Math.min(cum, IPN_THRESHOLD_YEAR) - Math.min(priorCum, IPN_THRESHOLD_YEAR)
  const base15 = Math.max(cum - IPN_THRESHOLD_YEAR, 0) - Math.max(priorCum - IPN_THRESHOLD_YEAR, 0)
  const socialApplied = disabled ? b - ipnBase : 0

  // --- итоги
  const net = g - opv - vosms - ipn
  const withheld = opv + vosms + ipn
  const employerCost = g + opvr + so + sn + oosms
  const totalToState = opv + opvr + vosms + oosms + so + sn + ipn

  // --- первый месяц, где нарастающая база выше порога 15% (зарплата одинакова с января)
  let thresholdMonth: number | null = null
  if (mode === 'equalSalary') {
    for (let k = 1; k <= 12; k++) {
      if (cumulativeAfter(k, b, cat) > IPN_THRESHOLD_YEAR) {
        thresholdMonth = k
        break
      }
    }
  }

  const capped = {
    opv: !ex.opv && g >= CAP_50_MZP,
    opvr: !opvrExempt && g >= CAP_50_MZP,
    vosms: !ex.osms && g >= CAP_20_MZP,
    oosms: !ex.osms && g >= CAP_40_MZP,
  }

  // --- предупреждения (SPEC 5.1); w9 и w11 добавляет обратный расчёт
  const w: PayrollWarningCode[] = []
  if (!idle) {
    // Ниже МЗП: ОПВР и СО считаются от МЗП. От МЗП до МЗП + ОПВ: начислено выше МЗП,
    // но доход минус ОПВ ниже МЗП, и база СО тоже поднимается до МЗП (Соц.К. ст. 245 п. 1).
    if ((g < MZP_2026 && (!opvrExempt || !ex.so)) || (!ex.so && g >= MZP_2026 && g - opv < FLOOR_1_MZP)) w.push('w1')
    if (n.baseDeduction && ipn === 0 && g > 0 && !disabled) w.push('w2')
    if (!n.baseDeduction) w.push('w3')
    if (capped.opv || capped.opvr || capped.vosms || capped.oosms) w.push('w4')
    if (g - opv > CAP_7_MZP && !ex.so) w.push('w5')
    if (n.employerRegime === 'general' && !n.hireOrFireMonth && g >= 1 && g <= SN_FLOOR_OBJECT) w.push('w6')
    if (thresholdMonth !== null || (mode === 'manualPrior' && cum > IPN_THRESHOLD_YEAR)) w.push('w7')
    if (cat !== 'standard') w.push('w8')
    if (disabled && (socialApplied > 0 || b * 12 > L)) w.push('w10')
  }

  return {
    input: n,
    gross: g,
    opv,
    vosms,
    ipn,
    net,
    opvr,
    so,
    sn,
    oosms,
    withheld,
    employerCost,
    totalToState,
    bases: {
      opv: Math.min(g, CAP_50_MZP),
      vosms: Math.min(g, CAP_20_MZP),
      oosms: Math.min(g, CAP_40_MZP),
      opvr: idle ? 0 : opvrBase,
      so: idle ? 0 : soBase,
      sn: snBase,
    },
    exempt: { opv: ex.opv, vosms: ex.osms, oosms: ex.osms, opvr: opvrExempt, so: ex.so, opvrBorn1975: n.bornBefore1975 && !ex.opvr },
    capped,
    snFloorApplied,
    snFixed,
    ipnDetail: {
      baseDeduction: dedApplied,
      baseBeforeSocial: b,
      socialLimit: L,
      priorCum,
      cum,
      base: ipnBase,
      base10,
      base15,
      socialApplied,
      mode,
    },
    thresholdMonth,
    warnings: w,
  }
}

/** Прямой расчёт: из начисленной суммы за месяц в «на руки» и стоимость работника. */
export function calculatePayroll(input: PayrollInput): PayrollResult {
  return core(normalize(input))
}

// ---------------------------------------------------------------------------
// Обратный расчёт («на руки» -> «начислено»)
// ---------------------------------------------------------------------------

/**
 * Та же формула без округлений (float), строго возрастающая по g.
 * Нужна только как оценка для окна точного поиска, результат не показывается.
 */
function smoothNet(g: number, n: NormalizedPayrollInput): number {
  const cat = n.category
  const ex = exemptions(cat)
  const opv = ex.opv ? 0 : (RATE_OPV[0] / RATE_OPV[1]) * Math.min(g, CAP_50_MZP)
  const vos = ex.osms ? 0 : (RATE_VOSMS[0] / RATE_VOSMS[1]) * Math.min(g, CAP_20_MZP)
  const b = Math.max(g - opv - vos - (n.baseDeduction ? BASE_DEDUCTION : 0), 0)
  const m = n.monthIndex
  let pc: number
  let cc: number
  if (isDisabled(cat)) {
    const L = SOCIAL_DEDUCTION[cat]
    pc = Math.max((m - 1) * b - L, 0)
    cc = Math.max(m * b - L, 0)
  } else if (n.priorTaxableCum !== undefined) {
    pc = n.priorTaxableCum
    cc = pc + b
  } else {
    pc = (m - 1) * b
    cc = m * b
  }
  const t = (c: number) => 0.1 * Math.min(c, IPN_THRESHOLD_YEAR) + 0.15 * Math.max(c - IPN_THRESHOLD_YEAR, 0)
  return g - opv - vos - (t(cc) - t(pc))
}

function sortWarnings(w: PayrollWarningCode[]): PayrollWarningCode[] {
  return [...new Set(w)].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
}

const REVERSE_WINDOW = 10
const REVERSE_WIDE_WINDOW = 1000
const REVERSE_FORWARD_SCAN = 200_000
const SMOOTH_UPPER = 2_000_000_000
/** Допуск сравнения гладкой функции: на плоских участках float шумит на ~1e-7. */
const SMOOTH_EPS = 1e-6

const breakpointCache = new Map<string, number[]>()

/**
 * Точки излома гладкой функции net(g) (в тенге начисленной). Между соседними
 * точками net(g) линейна, поэтому первое пересечение цели ищется надёжно.
 * Для категорий с инвалидностью начиная с 11-го месяца net на участке «социальный
 * вычет исчерпывается» убывает (предельная ставка ИПН m x 10% выше 100%),
 * то есть бисекция по всей оси была бы неверной.
 */
function smoothBreakpoints(n: NormalizedPayrollInput): number[] {
  const key = [n.category, n.baseDeduction ? 1 : 0, n.monthIndex, n.priorTaxableCum ?? 'x'].join('|')
  const hit = breakpointCache.get(key)
  if (hit) return hit
  const ex = exemptions(n.category)
  const ded = n.baseDeduction ? BASE_DEDUCTION : 0
  const rawB = (g: number) =>
    g - (ex.opv ? 0 : (RATE_OPV[0] / RATE_OPV[1]) * Math.min(g, CAP_50_MZP)) - (ex.osms ? 0 : (RATE_VOSMS[0] / RATE_VOSMS[1]) * Math.min(g, CAP_20_MZP)) - ded
  const gOfB = (x: number) => {
    let lo = 0
    let hi = SMOOTH_UPPER
    for (let k = 0; k < 100; k++) {
      const mid = (lo + hi) / 2
      if (rawB(mid) >= x) hi = mid
      else lo = mid
    }
    return hi
  }
  const m = n.monthIndex
  const xs: number[] = [0]
  if (isDisabled(n.category)) {
    const L = SOCIAL_DEDUCTION[n.category]
    xs.push(L / m, (IPN_THRESHOLD_YEAR + L) / m)
    if (m > 1) xs.push(L / (m - 1), (IPN_THRESHOLD_YEAR + L) / (m - 1))
  } else if (n.priorTaxableCum !== undefined) {
    xs.push(Math.max(IPN_THRESHOLD_YEAR - n.priorTaxableCum, 0))
  } else {
    xs.push(IPN_THRESHOLD_YEAR / m)
    if (m > 1) xs.push(IPN_THRESHOLD_YEAR / (m - 1))
  }
  const pts = new Set<number>([0, SMOOTH_UPPER, CAP_20_MZP, CAP_50_MZP])
  for (const x of xs) {
    const g = gOfB(x)
    if (Number.isFinite(g) && g > 0 && g < SMOOTH_UPPER) pts.add(g)
  }
  const sorted = [...pts].sort((a, b) => a - b)
  if (breakpointCache.size > 64) breakpointCache.clear()
  breakpointCache.set(key, sorted)
  return sorted
}

/**
 * Обратный расчёт. `net(gross)` из-за округления не монотонна (шаг +1 к начисленной
 * может дать от -2 до +1 на руки), а у категорий с инвалидностью с 11-го месяца
 * ещё и убывает на участке исчерпания социального вычета. Поэтому: находим
 * ПЕРВОЕ пересечение цели гладкой функцией (между точками излома она линейна),
 * затем точный целочисленный перебор окна ±10. Берётся наименьшая подходящая
 * начисленная, остальные из окна идут в `alternatives` (W9).
 */
export function grossFromNet(target: number, opts: ReverseOptions = {}): ReverseResult {
  if (!isNonNegInt(target)) throw new RangeError('payroll: target net must be an integer >= 0')
  // Нормализуем настройки с «пустой» начисленной; gross подставим на каждом шаге.
  const base = normalize({ ...opts, gross: 0 })
  const at = (g: number) => core({ ...base, gross: g })

  if (target === 0) {
    const r = at(0)
    return { target, gross: 0, alternatives: [], exact: true, tooLarge: false, result: r, warnings: r.warnings }
  }

  const f = (g: number) => smoothNet(g, base)
  const pts = smoothBreakpoints(base)
  let seg: [number, number] | null = null
  for (let k = 1; k < pts.length; k++) {
    if (f(pts[k]) >= target - SMOOTH_EPS) {
      seg = [pts[k - 1], pts[k]]
      break
    }
  }
  const tooLargeResult: ReverseResult = { target, gross: null, alternatives: [], exact: true, tooLarge: true, result: null, warnings: [] }
  if (seg === null) return tooLargeResult
  let lo = seg[0]
  let hi = seg[1]
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2
    if (f(mid) >= target - SMOOTH_EPS) hi = mid
    else lo = mid
  }
  const est = Math.floor(hi)
  if (est - REVERSE_WINDOW > MAX_GROSS) return tooLargeResult

  const scan = (from: number, to: number, stopAtFirst: boolean): number[] => {
    const found: number[] = []
    for (let g = Math.max(from, 1); g <= Math.min(to, MAX_GROSS); g++) {
      if (at(g).net === target) {
        found.push(g)
        if (stopAtFirst) break
      }
    }
    return found
  }

  let cands = scan(est - REVERSE_WINDOW, est + REVERSE_WINDOW, false)
  let exact = true
  let gross: number | null = null
  if (cands.length === 0) cands = scan(est - REVERSE_WIDE_WINDOW, est + REVERSE_WIDE_WINDOW, false)
  // Плоский участок (цель равна уровню плато): точное значение может лежать дальше по участку.
  if (cands.length === 0) cands = scan(est - REVERSE_WINDOW, Math.min(Math.ceil(seg[1]) + REVERSE_WINDOW, est + REVERSE_FORWARD_SCAN), true)
  if (cands.length > 0) {
    gross = cands[0]
  } else {
    // Предохранитель: на проверенных областях не срабатывает (SPEC раздел 4).
    exact = false
    for (let g = Math.max(est - REVERSE_WIDE_WINDOW, 1); g <= Math.min(est + REVERSE_WIDE_WINDOW, MAX_GROSS); g++) {
      if (at(g).net >= target) {
        gross = g
        break
      }
    }
    cands = gross === null ? [] : [gross]
  }

  if (gross === null || gross > MAX_GROSS) return { ...tooLargeResult, exact }

  const alternatives = exact ? cands.filter((g) => g !== gross && g <= est + REVERSE_WINDOW) : []
  const result = at(gross)
  const warnings = [...result.warnings] as PayrollWarningCode[]
  if (alternatives.length > 0) warnings.push('w9')
  if (!exact) warnings.push('w11')
  return { target, gross, alternatives, exact, tooLarge: false, result, warnings: sortWarnings(warnings) }
}

// ---------------------------------------------------------------------------
// Подсказки и границы (все вычисляются кодом, в тексты числа не вписываются)
// ---------------------------------------------------------------------------

/** Первый месяц 1..12, где нарастающая облагаемая база выше порога 15% при одинаковой зарплате; null, если нет. */
export function firstMonthOverThreshold(input: PayrollInput): number | null {
  const n = normalize({ ...input, priorTaxableCum: undefined })
  return core(n).thresholdMonth
}

/**
 * Наименьшая начисленная сумма, при которой за 12 месяцев одинаковой зарплаты
 * облагаемая база выше порога 15% (подсказка «влияет от начисленной X»). Для
 * обычного работника с вычетом это 3 585 880 ₸, без вычета 3 441 713 ₸. null, если
 * в пределах ввода недостижимо.
 */
export function minGrossReachingThreshold(opts: { category?: PayrollCategory; baseDeduction?: boolean } = {}): number | null {
  const cat = opts.category ?? 'standard'
  const ded = opts.baseDeduction ?? true
  const pred = (g: number) => cumulativeAfter(12, monthlyBase(g, cat, ded), cat) > IPN_THRESHOLD_YEAR
  return smallestSatisfying(pred, 1, MAX_GROSS)
}

/**
 * Наибольшая начисленная сумма, при которой база ИПН (после взносов и базового
 * вычета, до социального) равна нулю. Для обычного работника с вычетом 147 443 ₸.
 * 0, если база положительна уже при 1 ₸ (вычет выключен).
 */
export function ipnBaseZeroUpTo(opts: { category?: PayrollCategory; baseDeduction?: boolean } = {}): number {
  const cat = opts.category ?? 'standard'
  const ded = opts.baseDeduction ?? true
  const first = smallestSatisfying((g) => monthlyBase(g, cat, ded) > 0, 1, MAX_GROSS)
  if (first === null) return MAX_GROSS
  let best = first - 1
  for (let g = first; g < first + LOCAL_WINDOW && g <= MAX_GROSS; g++) {
    if (monthlyBase(g, cat, ded) === 0) best = g
  }
  return best
}

/** Наименьшая начисленная, при которой ИПН первого месяца не меньше 1 ₸ (обычный работник; 147 449 ₸ с вычетом). */
export function firstGrossWithIpn(opts: { category?: PayrollCategory; baseDeduction?: boolean } = {}): number | null {
  const category = opts.category ?? 'standard'
  const baseDeduction = opts.baseDeduction ?? true
  return smallestSatisfying((g) => core(normalize({ gross: g, category, baseDeduction })).ipn >= 1, 1, MAX_GROSS)
}

const LOCAL_WINDOW = 60

/**
 * Наименьшее целое g в [lo; hi], для которого pred истинно. Предикат почти
 * монотонен (округления дают локальный шум в 1 ₸), поэтому после бисекции
 * проверяется окно ниже найденной точки.
 */
function smallestSatisfying(pred: (g: number) => boolean, lo: number, hi: number): number | null {
  if (!pred(hi)) return null
  let a = lo
  let b = hi
  while (a < b) {
    const mid = Math.floor((a + b) / 2)
    if (pred(mid)) b = mid
    else a = mid + 1
  }
  let best = a
  for (let g = Math.max(lo, a - LOCAL_WINDOW); g < a; g++) {
    if (pred(g)) {
      best = g
      break
    }
  }
  return best
}
