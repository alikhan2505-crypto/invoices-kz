import { describe, it, expect } from 'vitest'
import { calculateIpTaxes, MZP_2026, VOSMS_MONTHLY_2026 } from './ipTaxes'

// Контрольные цифры — из сверки 12.10.2026 (ставки 2026: ОПВ 10%,
// ОПВР 3,5%, СО 5%, ВОСМС 5 950 ₸; упрощёнка 4%).
describe('calculateIpTaxes (2026)', () => {
  it('типовой кейс: база 300 000 ₸ — как в контрольной таблице', () => {
    const r = calculateIpTaxes({ monthlyIncome: 1_000_000, contributionBase: 300_000, bornBefore1975: false, taxRatePercent: 4 })
    expect(r.opv).toBe(30_000)
    expect(r.opvr).toBe(10_500)
    expect(r.so).toBe(13_500)        // основной вариант (ГФСС): 5% от (300 000 - 30 000)
    expect(r.vosms).toBe(5_950)
    expect(r.contributionsMonthly).toBe(59_950)
    expect(r.taxMonthly).toBe(40_000)
    expect(r.taxHalfYear).toBe(240_000)
  })

  it('потолок СО: при базе 1 000 000 ₸ СО упирается в 7 МЗП', () => {
    const r = calculateIpTaxes({ monthlyIncome: 0, contributionBase: 1_000_000, bornBefore1975: false, taxRatePercent: 4 })
    expect(r.so).toBe(29_750)        // (1 000 000 - 100 000) = 900 000 упирается в 7 МЗП, 5% от 595 000
    expect(r.opv).toBe(100_000)      // 10% без потолка на этом уровне
    expect(r.opvr).toBe(35_000)
    expect(r.contributionsMonthly).toBe(170_700)
  })

  it('база ниже МЗП подтягивается к МЗП', () => {
    const r = calculateIpTaxes({ monthlyIncome: 0, contributionBase: 50_000, bornBefore1975: false, taxRatePercent: 4 })
    expect(r.opv).toBe(Math.round(MZP_2026 * 0.10))   // 8 500
    expect(r.so).toBe(Math.round(MZP_2026 * 0.05))    // 4 250
    expect(r.opvr).toBe(Math.round(MZP_2026 * 0.035)) // 2 975
  })

  it('родившиеся до 1975 года не платят ОПВР', () => {
    const r = calculateIpTaxes({ monthlyIncome: 0, contributionBase: 300_000, bornBefore1975: true, taxRatePercent: 4 })
    expect(r.opvr).toBe(0)
    expect(r.contributionsMonthly).toBe(30_000 + 13_500 + VOSMS_MONTHLY_2026)
  })

  it('нулевой доход: только ВОСМС, налога нет, эффективная ставка null', () => {
    const r = calculateIpTaxes({ monthlyIncome: 0, contributionBase: 0, bornBefore1975: false, taxRatePercent: 4 })
    expect(r.taxMonthly).toBe(0)
    expect(r.opv).toBe(0)
    expect(r.opvr).toBe(0)
    expect(r.so).toBe(0)
    expect(r.vosms).toBe(VOSMS_MONTHLY_2026)
    expect(r.totalMonthly).toBe(VOSMS_MONTHLY_2026)
    expect(r.effectivePercent).toBeNull()
  })

  it('региональная ставка 2% и 6% применяется к выручке', () => {
    expect(calculateIpTaxes({ monthlyIncome: 500_000, contributionBase: 0, bornBefore1975: false, taxRatePercent: 2 }).taxMonthly).toBe(10_000)
    expect(calculateIpTaxes({ monthlyIncome: 500_000, contributionBase: 0, bornBefore1975: false, taxRatePercent: 6 }).taxMonthly).toBe(30_000)
  })

  it('эффективная нагрузка считается от выручки', () => {
    const r = calculateIpTaxes({ monthlyIncome: 1_000_000, contributionBase: 85_000, bornBefore1975: false, taxRatePercent: 4 })
    // 40 000 налога + 8 500 + 2 975 + 4 250 + 5 950 = 61 675 → 6,2%
    expect(r.totalMonthly).toBe(61_675)
    expect(r.effectivePercent).toBe(6.2)
  })

  it('основной вариант по умолчанию: ГФСС, СО считается за вычетом ОПВ', () => {
    const r = calculateIpTaxes({ monthlyIncome: 0, contributionBase: 300_000, bornBefore1975: false, taxRatePercent: 4 })
    expect(r.so).toBe(13_500)
    expect(r.soBase).toBe(270_000)
    expect(r.contributionsMonthly).toBe(59_950)
    expect(r.soLaw).toBe(15_000)
    expect(r.contributionsLaw).toBe(61_450)
  })
})

// База СО юридически не урегулирована. Основной вариант: разъяснения ГФСС
// 17.03.2026 / 04.05.2026 (СО = 5% от дохода минус ОПВ). Второй: буква ст. 245
// п. 2 (без вычета ОПВ). Решение основателя 24.10.2026.
describe('calculateIpTaxes: ГФСС по умолчанию и вариант «по тексту закона»', () => {
  const calc = (contributionBase: number, extra: { bornBefore1975?: boolean; monthlyIncome?: number } = {}) =>
    calculateIpTaxes({ monthlyIncome: 0, contributionBase, bornBefore1975: false, taxRatePercent: 4, ...extra })

  // Сетка: заявленный доход, ОПВ, ОПВР, СО основной, СО по тексту закона,
  // взносы всего (основной / по тексту закона). Посчитано руками:
  // СО осн. = 5% от (доход - ОПВ) в коридоре 85 000 ... 595 000.
  const GRID: Array<{ base: number; opv: number; opvr: number; so: number; soLaw: number; total: number; totalLaw: number }> = [
    { base: 85_000,    opv: 8_500,   opvr: 2_975,  so: 4_250,  soLaw: 4_250,  total: 21_675,  totalLaw: 21_675 },
    { base: 150_000,   opv: 15_000,  opvr: 5_250,  so: 6_750,  soLaw: 7_500,  total: 32_950,  totalLaw: 33_700 },
    { base: 300_000,   opv: 30_000,  opvr: 10_500, so: 13_500, soLaw: 15_000, total: 59_950,  totalLaw: 61_450 },
    { base: 500_000,   opv: 50_000,  opvr: 17_500, so: 22_500, soLaw: 25_000, total: 95_950,  totalLaw: 98_450 },
    { base: 595_000,   opv: 59_500,  opvr: 20_825, so: 26_775, soLaw: 29_750, total: 113_050, totalLaw: 116_025 },
    { base: 661_111,   opv: 66_111,  opvr: 23_139, so: 29_750, soLaw: 29_750, total: 124_950, totalLaw: 124_950 },
    { base: 700_000,   opv: 70_000,  opvr: 24_500, so: 29_750, soLaw: 29_750, total: 130_200, totalLaw: 130_200 },
    { base: 1_000_000, opv: 100_000, opvr: 35_000, so: 29_750, soLaw: 29_750, total: 170_700, totalLaw: 170_700 },
  ]

  for (const g of GRID) {
    it(`доход для взносов ${g.base}: основной ${g.total}, по тексту закона ${g.totalLaw}`, () => {
      const r = calc(g.base)
      expect(r.opv).toBe(g.opv)
      expect(r.opvr).toBe(g.opvr)
      expect(r.so).toBe(g.so)
      expect(r.soLaw).toBe(g.soLaw)
      expect(r.contributionsMonthly).toBe(g.total)
      expect(r.contributionsLaw).toBe(g.totalLaw)
      expect(r.difference).toBe(g.soLaw - g.so)
      expect(r.differenceHalfYear).toBe((g.soLaw - g.so) * 6)
      expect(r.contributionsLaw - r.contributionsMonthly).toBe(r.difference)
    })
  }

  it('85 000 (минимум): варианты совпадают, разницы нет', () => {
    const r = calc(85_000)
    expect(r.soBase).toBe(85_000)
    expect(r.soBaseLaw).toBe(85_000)
    expect(r.difference).toBe(0)
    expect(r.totalLaw).toBe(r.totalMonthly)
  })

  it('300 000: 59 950 по ГФСС (основной) и 61 450 по тексту закона (цифры письма 17.03.2026)', () => {
    const r = calc(300_000)
    expect(r.contributionsMonthly).toBe(59_950)
    expect(r.contributionsLaw).toBe(61_450)
    expect(r.difference).toBe(1_500)
    expect(r.differenceHalfYear).toBe(9_000)
  })

  it('допущение про границы: коридор 1-7 МЗП применяется к базе после вычета ОПВ', () => {
    // 650 000: ОПВ 65 000, база 585 000 внутри коридора, СО 29 250 (а не потолок 29 750)
    const r = calc(650_000)
    expect(r.soBase).toBe(585_000)
    expect(r.so).toBe(29_250)
    expect(r.soBaseLaw).toBe(595_000)
    expect(r.soLaw).toBe(29_750)
    expect(r.difference).toBe(500)
    // потолок основного варианта достигается около 661 111
    expect(calc(661_000).so).toBe(29_745)
    expect(calc(661_111).so).toBe(29_750)
  })

  it('границы действуют для обоих вариантов: ни ниже 4 250, ни выше 29 750', () => {
    for (const base of [1, 20_000, 85_000, 100_000, 300_000, 595_000, 661_111, 700_000, 5_000_000]) {
      const r = calc(base)
      for (const v of [r.so, r.soLaw]) {
        expect(v).toBeGreaterThanOrEqual(4_250)
        expect(v).toBeLessThanOrEqual(29_750)
      }
      expect(r.so).toBeLessThanOrEqual(r.soLaw)
    }
  })

  it('база ниже МЗП: оба варианта подтягиваются к 4 250', () => {
    const r = calc(50_000)
    expect(r.so).toBe(4_250)
    expect(r.soLaw).toBe(4_250)
    expect(r.difference).toBe(0)
  })

  it('нулевая база: оба СО равны нулю, разницы нет', () => {
    const r = calc(0)
    expect(r.so).toBe(0)
    expect(r.soLaw).toBe(0)
    expect(r.soBase).toBe(0)
    expect(r.soBaseLaw).toBe(0)
    expect(r.difference).toBe(0)
  })

  it('итог с налогом: totalMonthly основной, totalLaw рядом; эффективная ставка по основному', () => {
    const r = calc(300_000, { monthlyIncome: 1_000_000 })
    expect(r.totalMonthly).toBe(40_000 + 59_950)
    expect(r.totalLaw).toBe(40_000 + 61_450)
    expect(r.effectivePercent).toBe(10)
  })

  it('ОПВР (1975 г.р. и старше) на разницу не влияет', () => {
    const r = calc(300_000, { bornBefore1975: true })
    expect(r.difference).toBe(1_500)
    expect(r.contributionsMonthly).toBe(30_000 + 13_500 + 5_950)
    expect(r.contributionsLaw).toBe(30_000 + 15_000 + 5_950)
  })
})
