import { describe, it, expect } from 'vitest'
import { calculateIpTaxes, MZP_2026, VOSMS_MONTHLY_2026 } from './ipTaxes'

// Контрольные цифры — из сверки 12.10.2026 (ставки 2026: ОПВ 10%,
// ОПВР 3,5%, СО 5%, ВОСМС 5 950 ₸; упрощёнка 4%).
describe('calculateIpTaxes (2026)', () => {
  it('типовой кейс: база 300 000 ₸ — как в контрольной таблице', () => {
    const r = calculateIpTaxes({ monthlyIncome: 1_000_000, contributionBase: 300_000, bornBefore1975: false, taxRatePercent: 4 })
    expect(r.opv).toBe(30_000)
    expect(r.opvr).toBe(10_500)
    expect(r.so).toBe(15_000)
    expect(r.vosms).toBe(5_950)
    expect(r.contributionsMonthly).toBe(61_450)
    expect(r.taxMonthly).toBe(40_000)
    expect(r.taxHalfYear).toBe(240_000)
  })

  it('потолок СО: при базе 1 000 000 ₸ СО упирается в 7 МЗП', () => {
    const r = calculateIpTaxes({ monthlyIncome: 0, contributionBase: 1_000_000, bornBefore1975: false, taxRatePercent: 4 })
    expect(r.so).toBe(29_750)        // 5% от 595 000
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
    expect(r.contributionsMonthly).toBe(30_000 + 15_000 + VOSMS_MONTHLY_2026)
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
})
