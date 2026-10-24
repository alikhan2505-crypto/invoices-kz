// Налоги и взносы ИП на упрощённой декларации — 2026 год, новый Налоговый
// кодекс № 214-VIII (действует с 01.01.2026). Константы и границы выверены
// 12.10.2026 (см. гайд /guides/nalogi-ip-uproshchenka-2026 и memory
// state_2026_10_12): МРП 4 325 ₸, МЗП 85 000 ₸, базовая ставка упрощёнки 4%
// (маслихат региона может менять в пределах 2–6%).
//
// Взносы «за себя», помесячно, база — заявляемый доход для взносов:
//   ОПВ   10%   от базы, база ограничена коридором [1 МЗП, 50 МЗП];
//   ОПВР  3,5%  от той же базы — только для родившихся в 1975+;
//   СО    5%    от базы, коридор [1 МЗП, 7 МЗП]; основной вариант: база = заявленный
//               доход МИНУС ОПВ (разъяснения ГФСС, см. ниже);
//   ВОСМС 5%    от 1,4 МЗП — фиксированные 5 950 ₸, от дохода не зависят.
// Суммы округляются до целого тенге; копейки здесь намеренно не живут.
//
// База СО юридически не урегулирована (решение основателя 24.10.2026):
//   ОСНОВНОЙ вариант (`so`, `contributionsMonthly`, `totalMonthly`): разъяснения
//     ГФСС (письма 17.03.2026 № ЖТ-2026-00856138 и 04.05.2026 № ЖТ-2026-01734988):
//     СО = 5% от (заявленный доход минус ОПВ);
//   ВТОРОЙ вариант (`soLaw`, `contributionsLaw`, `totalLaw`): буквальный текст
//     ст. 245 п. 2 Соцкодекса, СО = 5% от заявленного дохода без вычета ОПВ
//     (для ИП порядок прямо не урегулирован).
// Расчёт всегда возвращает оба; `difference` = на сколько вариант «по тексту
// закона» дороже основного (не меньше 0).
//
// ДОПУЩЕНИЕ про границы (так читаем, в тексте гайда и калькулятора это
// раскрыто словами «так читаем границы; при доходе выше ~595 000 уточните у
// ГФСС»): коридор СО [1 МЗП, 7 МЗП] в основном варианте применяется к базе
// ПОСЛЕ вычета ОПВ. Поэтому потолок СО 29 750 достигается при заявленном доходе
// от 661 111 ₸ (661 111 - 66 111 = 595 000), а не от 595 000; на минимальной базе
// 85 000 оба варианта совпадают (4 250). В варианте «по тексту закона» коридор
// применяется к заявленному доходу, потолок с 595 000.

export const MRP_2026 = 4_325
export const MZP_2026 = 85_000
export const VOSMS_MONTHLY_2026 = Math.round(1.4 * MZP_2026 * 0.05) // 5 950 ₸, от дохода не зависит

export interface IpTaxInput {
  /** Выручка в месяц, ₸ — база налога по упрощёнке. */
  monthlyIncome: number
  /** Заявляемый доход для взносов «за себя», ₸ в месяц. 0 = дохода не было. */
  contributionBase: number
  /** ОПВР платят только родившиеся в 1975 году и позже. */
  bornBefore1975: boolean
  /** Ставка упрощёнки в регионе, % (база 4, вилка маслихата 2–6). */
  taxRatePercent: number
}

export interface IpTaxResult {
  taxMonthly: number
  taxHalfYear: number
  opv: number
  opvr: number
  /** СО, основной вариант (ГФСС): 5% от (заявленный доход минус ОПВ), коридор 1-7 МЗП после вычета. */
  so: number
  vosms: number
  /** Взносы за себя в месяц, основной вариант (ГФСС). */
  contributionsMonthly: number
  /** Налог плюс взносы в месяц, основной вариант (ГФСС). */
  totalMonthly: number
  /** Доля всех платежей от выручки, % (null при нулевой выручке). */
  effectivePercent: number | null
  /** Базы, которые расчёт реально взял (после коридоров МЗП) для показа формулы. */
  pensionBase: number
  /** База основного СО: заявленный доход минус ОПВ, затем коридор 1-7 МЗП. */
  soBase: number
  /** СО по буквальному тексту ст. 245 п. 2: 5% от заявленного дохода без вычета ОПВ. */
  soLaw: number
  /** База СО по тексту закона (заявленный доход в коридоре 1-7 МЗП). */
  soBaseLaw: number
  /** Взносы за себя в месяц, вариант «по тексту закона». */
  contributionsLaw: number
  /** Налог плюс взносы в месяц, вариант «по тексту закона». */
  totalLaw: number
  /** Насколько вариант «по тексту закона» дороже основного в месяц, ₸ (не меньше 0). */
  difference: number
  /** Та же разница за 6 месяцев. */
  differenceHalfYear: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function calculateIpTaxes(input: IpTaxInput): IpTaxResult {
  const income = Math.max(0, input.monthlyIncome || 0)
  const base = Math.max(0, input.contributionBase || 0)
  const rate = clamp(input.taxRatePercent || 4, 0, 100)

  const taxMonthly = Math.round(income * rate / 100)

  // Если дохода в месяце не было, ОПВ/ОПВР/СО можно не платить — а ВОСМС
  // платится всё равно. При доходе ниже МЗП база подтягивается к МЗП
  // (разрешено и с фактической суммы, но минимальная граница — обычный выбор).
  const pensionBase = base > 0 ? clamp(base, MZP_2026, 50 * MZP_2026) : 0

  const opv = Math.round(pensionBase * 0.10)
  const opvr = input.bornBefore1975 ? 0 : Math.round(pensionBase * 0.035)
  const vosms = VOSMS_MONTHLY_2026

  // Основной вариант (ГФСС): из заявленного дохода вычитается ОПВ, затем коридор 1-7 МЗП.
  const soBase = base > 0 ? clamp(base - opv, MZP_2026, 7 * MZP_2026) : 0
  const so = Math.round(soBase * 0.05)

  // Второй вариант (буквальный текст ст. 245 п. 2): без вычета ОПВ.
  const soBaseLaw = base > 0 ? clamp(base, MZP_2026, 7 * MZP_2026) : 0
  const soLaw = Math.round(soBaseLaw * 0.05)

  const contributionsMonthly = opv + opvr + so + vosms
  const totalMonthly = taxMonthly + contributionsMonthly
  const contributionsLaw = opv + opvr + soLaw + vosms
  const difference = Math.max(0, soLaw - so)

  return {
    taxMonthly,
    taxHalfYear: taxMonthly * 6,
    opv,
    opvr,
    so,
    vosms,
    contributionsMonthly,
    totalMonthly,
    effectivePercent: income > 0 ? Math.round(totalMonthly / income * 1000) / 10 : null,
    pensionBase,
    soBase,
    soLaw,
    soBaseLaw,
    contributionsLaw,
    totalLaw: taxMonthly + contributionsLaw,
    difference,
    differenceHalfYear: difference * 6,
  }
}
