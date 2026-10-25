import { describe, it, expect } from 'vitest'
import {
  BASE_DEDUCTION,
  BASE_DEDUCTION_YEAR_CAP,
  CAP_20_MZP,
  CAP_40_MZP,
  CAP_50_MZP,
  CAP_7_MZP,
  FLOOR_1_MZP,
  IPN_THRESHOLD_YEAR,
  MAX_GROSS,
  MRP_2026,
  MZP_2026,
  PAYROLL_CATEGORIES,
  PAYROLL_CHECKED,
  SN_FLOOR_OBJECT,
  SN_SOLE_FIXED,
  SOCIAL_DEDUCTION,
  SO_ROUNDING,
  calculatePayroll,
  firstGrossWithIpn,
  firstMonthOverThreshold,
  grossFromNet,
  ipnBaseZeroUpTo,
  minGrossReachingThreshold,
  type EmployerRegime,
  type PayrollCategory,
  type PayrollInput,
  type PayrollResult,
  type PayrollWarningCode,
  type ReverseOptions,
} from './payroll'
import { MRP_2026 as MRP_FROM_MRP_TS, MZP_2026 as MZP_FROM_MRP_TS } from './mrp'
import { MRP_2026 as MRP_FROM_IP, MZP_2026 as MZP_FROM_IP } from './ipTaxes'
import vectors from './payrollVectors.json'

// Числа в payrollVectors.json получены независимым целочисленным эталоном
// (scratchpad/payroll/final_ref.py + vectors.json), каждая строка сверена с
// таблицами SPEC.md разделы 6.1-6.4. Здесь цифры не вычисляются.

type Expected = {
  opv: number
  vosms: number
  ipn: number
  net: number
  opvr: number
  so: number
  sn: number
  oosms: number
  employerCost: number
  totalToState: number
}
type Vec = { id: string; input: PayrollInput; expected: Expected; altInput?: PayrollInput; flag?: string; base?: number; expectedIfHalfUp?: Expected }

const EXPECTED_KEYS: (keyof Expected)[] = ['opv', 'vosms', 'ipn', 'net', 'opvr', 'so', 'sn', 'oosms', 'employerCost', 'totalToState']

function pick(r: PayrollResult): Expected {
  const o = {} as Expected
  for (const k of EXPECTED_KEYS) o[k] = r[k]
  return o
}

const main = vectors.main as unknown as Vec[]
const extra = vectors.extra as unknown as Vec[]
const boundary = vectors.boundary as unknown as Vec[]
const reverse = vectors.reverse as unknown as { id: string; net: number; params: ReverseOptions; gross: number; alternatives: number[] }[]
const thresholds = vectors.thresholds as Record<string, number>

// детерминированный генератор
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('payroll: constants', () => {
  it('MRP and MZP are the same as in mrp.ts and ipTaxes.ts, and the 2026 law values', () => {
    expect(MRP_2026).toBe(MRP_FROM_MRP_TS)
    expect(MZP_2026).toBe(MZP_FROM_MRP_TS)
    expect(MRP_2026).toBe(MRP_FROM_IP)
    expect(MZP_2026).toBe(MZP_FROM_IP)
    expect(MRP_2026).toBe(4_325)
    expect(MZP_2026).toBe(85_000)
  })

  it('derived constants follow the articles', () => {
    expect(BASE_DEDUCTION).toBe(129_750)
    expect(BASE_DEDUCTION_YEAR_CAP).toBe(1_557_000)
    expect(IPN_THRESHOLD_YEAR).toBe(36_762_500)
    expect(SN_FLOOR_OBJECT).toBe(60_550)
    expect(CAP_50_MZP).toBe(4_250_000)
    expect(CAP_7_MZP).toBe(595_000)
    expect(CAP_20_MZP).toBe(1_700_000)
    expect(CAP_40_MZP).toBe(3_400_000)
    expect(FLOOR_1_MZP).toBe(85_000)
    expect(SOCIAL_DEDUCTION.disabled12Indefinite).toBe(21_625_000)
    expect(SOCIAL_DEDUCTION.disabled12Term).toBe(21_625_000)
    expect(SOCIAL_DEDUCTION.disabled3).toBe(3_814_650)
    expect(PAYROLL_CHECKED).toBe('2026-10-24')
    expect(SO_ROUNDING).toBe('ceil')
  })
})

describe('payroll: main vectors (V01-V12, S01, S02)', () => {
  for (const v of main) {
    it(`${v.id} gross ${v.input.gross}`, () => {
      expect(pick(calculatePayroll(v.input))).toEqual(v.expected)
    })
  }

  it('V12 gives the same numbers via manual prior cumulative income as via month 4', () => {
    const v = main.find((x) => x.id === 'V12')!
    expect(v.input.monthIndex).toBe(4)
    expect(v.altInput?.priorTaxableCum).toBe(28_233_750)
    const viaPrior = calculatePayroll(v.altInput!)
    expect(pick(viaPrior)).toEqual(v.expected)
    expect(viaPrior.ipnDetail.mode).toBe('manualPrior')
    // порог 15% пересекается внутри месяца: 8 528 750 по 10% и 882 500 по 15%
    expect(viaPrior.ipnDetail.base10).toBe(8_528_750)
    expect(viaPrior.ipnDetail.base15).toBe(882_500)
  })
})

describe('payroll: supplementary vectors (categories, regimes, manual prior, assumptions)', () => {
  for (const v of extra) {
    it(`${v.id}${v.flag ? ' (' + v.flag + ')' : ''}`, () => {
      const r = calculatePayroll(v.input)
      expect(pick(r)).toEqual(v.expected)
      if (v.base !== undefined) expect(r.ipnDetail.base).toBe(v.base)
    })
  }

  it('ASSUMPTION_SO_ROUNDING vectors differ from half-up only in SO and what depends on it', () => {
    const flagged = extra.filter((v) => v.flag === 'ASSUMPTION_SO_ROUNDING')
    expect(flagged.length).toBeGreaterThan(0)
    for (const v of flagged) {
      const half = v.expectedIfHalfUp!
      expect(v.expected.so).toBe(half.so + 1) // вверх на 1 ₸ выше половины вверх
      expect(v.expected.employerCost).toBe(half.employerCost + 1)
      expect(v.expected.totalToState).toBe(half.totalToState + 1)
      for (const k of ['opv', 'vosms', 'ipn', 'net', 'opvr', 'sn', 'oosms'] as const) expect(v.expected[k]).toBe(half[k])
    }
  })

  it('T2 documents the non-monotone SN floor (3 633 at 60 550, 3 197 at 60 551)', () => {
    expect(calculatePayroll({ gross: 60_550 }).sn).toBe(3_633)
    expect(calculatePayroll({ gross: 60_551 }).sn).toBe(3_197)
  })
})

describe('payroll: boundary table', () => {
  for (const v of boundary) {
    it(v.id, () => {
      expect(pick(calculatePayroll(v.input))).toEqual(v.expected)
    })
  }
})

describe('payroll: input handling', () => {
  it('gross 0 gives an all-zero result without warnings', () => {
    const r = calculatePayroll({ gross: 0 })
    expect(pick(r)).toEqual({ opv: 0, vosms: 0, ipn: 0, net: 0, opvr: 0, so: 0, sn: 0, oosms: 0, employerCost: 0, totalToState: 0 })
    expect(r.warnings).toEqual([])
  })

  it('rejects invalid input', () => {
    expect(() => calculatePayroll({ gross: -1 })).toThrow(RangeError)
    expect(() => calculatePayroll({ gross: 1.5 })).toThrow(RangeError)
    expect(() => calculatePayroll({ gross: Number.NaN })).toThrow(RangeError)
    expect(() => calculatePayroll({ gross: MAX_GROSS + 1 })).toThrow(RangeError)
    expect(() => calculatePayroll({ gross: 1000, monthIndex: 0 })).toThrow(RangeError)
    expect(() => calculatePayroll({ gross: 1000, monthIndex: 13 })).toThrow(RangeError)
    expect(() => calculatePayroll({ gross: 1000, priorTaxableCum: -5 })).toThrow(RangeError)
    expect(() => calculatePayroll({ gross: 1000, category: 'nope' as PayrollCategory })).toThrow(RangeError)
    expect(() => calculatePayroll({ gross: 1000, employerRegime: 'nope' as EmployerRegime })).toThrow(RangeError)
  })

  it('manual prior income is ignored for disabled categories', () => {
    const a = calculatePayroll({ gross: 600_000, category: 'disabled3', monthIndex: 10, priorTaxableCum: 5_000_000 })
    const b = calculatePayroll({ gross: 600_000, category: 'disabled3', monthIndex: 10 })
    expect(pick(a)).toEqual(pick(b))
    expect(a.input.priorTaxableCum).toBeUndefined()
  })

  it('exposes which payments are exempt by category and which hit a cap', () => {
    const p = calculatePayroll({ gross: 300_000, category: 'pensioner' })
    expect(p.exempt).toEqual({ opv: true, vosms: true, oosms: true, opvr: true, so: true, opvrBorn1975: false })
    const d = calculatePayroll({ gross: 300_000, category: 'disabled12Term' })
    expect(d.exempt).toEqual({ opv: false, vosms: true, oosms: true, opvr: false, so: false, opvrBorn1975: false })
    const hi = calculatePayroll({ gross: 10_000_000 })
    expect(hi.capped).toEqual({ opv: true, opvr: true, vosms: true, oosms: true })
    expect(hi.bases.opv).toBe(CAP_50_MZP)
    expect(hi.bases.so).toBe(CAP_7_MZP)
  })

  it('SN floor flag and bases', () => {
    const lo = calculatePayroll({ gross: 60_000 })
    expect(lo.snFloorApplied).toBe(true)
    expect(lo.bases.sn).toBe(SN_FLOOR_OBJECT)
    const hf = calculatePayroll({ gross: 60_000, hireOrFireMonth: true })
    expect(hf.snFloorApplied).toBe(false)
    expect(hf.bases.sn).toBe(60_000 - 6_000 - 1_200)
    const simp = calculatePayroll({ gross: 300_000, employerRegime: 'simplified' })
    expect(simp.sn).toBe(0)
    expect(simp.bases.sn).toBe(0)
  })
})

describe('payroll: sole proprietor on the general regime (NK art. 556 p. 1 and 4, art. 557 p. 3, art. 558 p. 2)', () => {
  const sole = (i: PayrollInput) => calculatePayroll({ ...i, employerRegime: 'soleGeneral' })

  it('SN is a fixed 1 MRP per employee, derived from the MRP constant', () => {
    expect(SN_SOLE_FIXED).toBe(MRP_2026)
    expect(SN_SOLE_FIXED).toBe(4_325)
  })

  it('gross 300 000: SN 4 325, employer cost 337 325, everything else as for the legal-entity regime', () => {
    const r = sole({ gross: 300_000 })
    const gen = calculatePayroll({ gross: 300_000 })
    expect(r.sn).toBe(4_325)
    expect(r.snFixed).toBe(true)
    expect(r.snFloorApplied).toBe(false)
    expect(r.bases.sn).toBe(0)
    // 300 000 + ОПВР 10 500 + СО 13 500 + ООСМС 9 000 + СН 4 325
    expect(r.employerCost).toBe(300_000 + 10_500 + 13_500 + 9_000 + 4_325)
    expect(r.employerCost).toBe(337_325)
    // 30 000 + 10 500 + 6 000 + 9 000 + 13 500 + 4 325 + 13 425
    expect(r.totalToState).toBe(86_750)
    expect(r.net + r.totalToState).toBe(r.employerCost)
    for (const k of ['opv', 'vosms', 'ipn', 'net', 'opvr', 'so', 'oosms'] as const) expect(r[k]).toBe(gen[k])
    expect(gen.sn).toBe(15_840)
    expect(gen.snFixed).toBe(false)
  })

  it('SN does not depend on the salary and has no 14 MRP floor', () => {
    for (const g of [1, 1_000, 60_000, SN_FLOOR_OBJECT, SN_FLOOR_OBJECT + 1, 300_000, 10_000_000, MAX_GROSS]) {
      const r = sole({ gross: g })
      expect(r.sn, `gross ${g}`).toBe(4_325)
      expect(r.snFloorApplied, `gross ${g}`).toBe(false)
      expect(r.warnings, `gross ${g}`).not.toContain('w6')
    }
  })

  it('hire or fire month changes nothing for SN', () => {
    expect(sole({ gross: 60_000, hireOrFireMonth: true }).sn).toBe(4_325)
    expect(sole({ gross: 60_000, hireOrFireMonth: false }).sn).toBe(4_325)
    expect(sole({ gross: 300_000, hireOrFireMonth: true }).sn).toBe(4_325)
  })

  it('gross 0: nothing is accrued (art. 556 p. 4, no object of taxation)', () => {
    const r = sole({ gross: 0 })
    expect(r.sn).toBe(0)
    expect(r.snFixed).toBe(false)
    expect(pick(r)).toEqual({ opv: 0, vosms: 0, ipn: 0, net: 0, opvr: 0, so: 0, sn: 0, oosms: 0, employerCost: 0, totalToState: 0 })
    expect(r.warnings).toEqual([])
  })

  it('the employer regime never changes the employee side, for every category', () => {
    for (const category of PAYROLL_CATEGORIES) {
      for (const g of [50_000, 300_000, 2_000_000]) {
        const a = calculatePayroll({ gross: g, category })
        const b = sole({ gross: g, category })
        const c = calculatePayroll({ gross: g, category, employerRegime: 'simplified' })
        for (const k of ['opv', 'vosms', 'ipn', 'net', 'opvr', 'so', 'oosms'] as const) {
          expect(b[k]).toBe(a[k])
          expect(c[k]).toBe(a[k])
        }
      }
    }
  })

  it('reverse mode: the same gross for a given net under all three regimes', () => {
    const a = grossFromNet(300_000)
    const b = grossFromNet(300_000, { employerRegime: 'soleGeneral' })
    expect(b.gross).toBe(a.gross)
    expect(b.result?.sn).toBe(4_325)
    expect(b.result?.input.employerRegime).toBe('soleGeneral')
  })
})

describe('payroll: employee born before 01.01.1975 (Social Code art. 248 p. 6 sub-p. 6: no OPVR)', () => {
  const born = (i: PayrollInput) => calculatePayroll({ ...i, bornBefore1975: true })
  const SAME = ['opv', 'vosms', 'ipn', 'net', 'so', 'sn', 'oosms'] as const

  it('gross 300 000, legal-entity regime: OPVR 10 500 is removed, employer cost 338 340 (was 348 840)', () => {
    const off = calculatePayroll({ gross: 300_000 })
    const on = born({ gross: 300_000 })
    expect(off.opvr).toBe(10_500)
    expect(off.employerCost).toBe(348_840)
    expect(on.opvr).toBe(0)
    // 300 000 + СО 13 500 + СН 15 840 + ООСМС 9 000
    expect(on.employerCost).toBe(300_000 + 13_500 + 15_840 + 9_000)
    expect(on.employerCost).toBe(338_340)
    // ОПВ 30 000 + ВОСМС 6 000 + ИПН 13 425 + СО 13 500 + СН 15 840 + ООСМС 9 000
    expect(on.totalToState).toBe(87_765)
    expect(on.net + on.totalToState).toBe(on.employerCost)
    expect(on.net).toBe(250_575)
    expect(on.input.bornBefore1975).toBe(true)
    expect(off.input.bornBefore1975).toBe(false)
    expect(on.exempt.opvr).toBe(true)
    expect(on.exempt.opvrBorn1975).toBe(true)
    expect(off.exempt.opvrBorn1975).toBe(false)
  })

  it('the flag is off by default and false/undefined behave the same', () => {
    const a = calculatePayroll({ gross: 300_000 })
    const b = calculatePayroll({ gross: 300_000, bornBefore1975: false })
    expect(b).toEqual(a)
  })

  it('other regimes: only the OPVR amount leaves the employer cost', () => {
    const sole = born({ gross: 300_000, employerRegime: 'soleGeneral' })
    expect(sole.employerCost).toBe(300_000 + 13_500 + 4_325 + 9_000) // 326 825
    expect(sole.totalToState).toBe(30_000 + 6_000 + 13_425 + 13_500 + 4_325 + 9_000)
    const simp = born({ gross: 300_000, employerRegime: 'simplified' })
    expect(simp.employerCost).toBe(300_000 + 13_500 + 9_000) // 322 500
    expect(simp.employerCost).toBe(322_500)
  })

  it('the OPVR base follows the MZP floor and the 50 MZP cap, the flag zeroes both', () => {
    // 60 000 < МЗП: ОПВР без флага считается от 85 000 = 2 975
    expect(calculatePayroll({ gross: 60_000 }).opvr).toBe(2_975)
    expect(born({ gross: 60_000 }).opvr).toBe(0)
    // 1 000 000 x 3,5% = 35 000; 10 000 000 упирается в 50 МЗП: 4 250 000 x 3,5% = 148 750
    expect(calculatePayroll({ gross: 1_000_000 }).opvr).toBe(35_000)
    expect(calculatePayroll({ gross: 10_000_000 }).opvr).toBe(148_750)
    expect(born({ gross: 1_000_000 }).opvr).toBe(0)
    expect(born({ gross: 10_000_000 }).opvr).toBe(0)
    expect(born({ gross: 10_000_000 }).capped.opvr).toBe(false)
    expect(born({ gross: 10_000_000 }).capped.opv).toBe(true)
  })

  it('changes nothing but OPVR, employer cost and total to the state (every category, regime and gross)', () => {
    for (const category of PAYROLL_CATEGORIES) {
      for (const employerRegime of EMPLOYER_REGIMES) {
        for (const g of [1, 60_000, 85_000, 147_444, 300_000, 1_000_000, 4_250_000, 12_000_000]) {
          const off = calculatePayroll({ gross: g, category, employerRegime })
          const on = born({ gross: g, category, employerRegime })
          const tag = `${category} ${employerRegime} ${g}`
          for (const k of SAME) expect(on[k], tag).toBe(off[k])
          expect(on.opvr, tag).toBe(0)
          expect(on.employerCost, tag).toBe(off.employerCost - off.opvr)
          expect(on.totalToState, tag).toBe(off.totalToState - off.opvr)
          expect(on.net + on.totalToState, tag).toBe(on.employerCost)
          expect(on.ipnDetail, tag).toEqual(off.ipnDetail)
        }
      }
    }
  })

  it('pensioner and permanent disability I-II already pay no OPVR: the flag changes nothing at all there', () => {
    for (const category of ['pensioner', 'disabled12Indefinite'] as const) {
      for (const g of [60_000, 300_000, 2_000_000]) {
        const off = calculatePayroll({ gross: g, category })
        const on = born({ gross: g, category })
        expect(off.opvr).toBe(0)
        expect(on.opvr).toBe(0)
        expect(pick(on)).toEqual(pick(off))
        expect(on.warnings).toEqual(off.warnings)
        expect(on.exempt.opvr).toBe(true)
        // причина «категория», а не флаг: пояснение остаётся про категорию
        expect(on.exempt.opvrBorn1975).toBe(false)
      }
    }
  })

  it('fixed-term disability I-II and group III (OPVR paid by category): the flag removes it, the social deduction is untouched', () => {
    for (const category of ['disabled12Term', 'disabled3'] as const) {
      const off = calculatePayroll({ gross: 300_000, category })
      const on = born({ gross: 300_000, category })
      expect(off.opvr).toBe(10_500)
      expect(on.opvr).toBe(0)
      expect(on.exempt.opvrBorn1975).toBe(true)
      expect(on.ipnDetail.socialApplied).toBe(off.ipnDetail.socialApplied)
      expect(on.ipn).toBe(off.ipn)
      expect(on.employerCost).toBe(off.employerCost - 10_500)
    }
    // группа III платит ОПВ, СО и СН (ВОСМС и ООСМС нет): СН от 300 000 - 30 000 = 270 000 x 6% = 16 200
    const g3 = born({ gross: 300_000, category: 'disabled3' })
    expect(g3.opv).toBe(30_000)
    expect(g3.so).toBe(13_500)
    expect(g3.sn).toBe(16_200)
    expect(g3.employerCost).toBe(300_000 + 13_500 + 16_200)
  })

  it('warnings: OPVR cap and the below-MZP warning follow the effective OPVR exemption', () => {
    // ниже МЗП: СО всё ещё считается от МЗП, w1 остаётся
    expect(calculatePayroll({ gross: 60_000, bornBefore1975: true }).warnings).toContain('w1')
    // у инвалида III группы с флагом ОПВР не платится, СО платится: w1 остаётся (причина СО)
    expect(calculatePayroll({ gross: 60_000, bornBefore1975: true, category: 'disabled3' }).warnings).toContain('w1')
    // пенсионер не платит ни СО, ни ОПВР: w1 нет ни с флагом, ни без
    expect(calculatePayroll({ gross: 60_000, bornBefore1975: true, category: 'pensioner' }).warnings).not.toContain('w1')
    // потолок 50 МЗП: ОПВ упирается в него, ОПВР не начисляется
    const hi = calculatePayroll({ gross: 4_250_000, bornBefore1975: true })
    expect(hi.warnings).toContain('w4')
    expect(hi.capped).toEqual({ opv: true, opvr: false, vosms: true, oosms: true })
  })

  it('gross 0 stays all zero with the flag', () => {
    const r = born({ gross: 0 })
    expect(pick(r)).toEqual({ opv: 0, vosms: 0, ipn: 0, net: 0, opvr: 0, so: 0, sn: 0, oosms: 0, employerCost: 0, totalToState: 0 })
    expect(r.warnings).toEqual([])
  })

  it('random inputs: the flag zeroes OPVR and shifts cost and state total by exactly that amount (3000 cases)', () => {
    const rand = rng(1975)
    for (let k = 0; k < 3000; k++) {
      const i = randomInput(rand)
      const off = calculatePayroll({ ...i, bornBefore1975: false })
      const on = calculatePayroll({ ...i, bornBefore1975: true })
      for (const key of SAME) expect(on[key]).toBe(off[key])
      expect(on.opvr).toBe(0)
      expect(on.employerCost).toBe(off.employerCost - off.opvr)
      expect(on.totalToState).toBe(off.totalToState - off.opvr)
      expect(on.net + on.totalToState).toBe(on.employerCost)
      expect(on.ipnDetail).toEqual(off.ipnDetail)
    }
  })

  it('reverse mode: the flag is passed through and does not change the gross, the alternatives or the net', () => {
    const a = grossFromNet(300_000)
    const b = grossFromNet(300_000, { bornBefore1975: true })
    expect(b.gross).toBe(a.gross)
    expect(b.alternatives).toEqual(a.alternatives)
    expect(b.exact).toBe(a.exact)
    expect(b.result?.net).toBe(300_000)
    expect(b.result?.opvr).toBe(0)
    expect(b.result?.input.bornBefore1975).toBe(true)
    expect(a.result?.input.bornBefore1975).toBe(false)
    expect(b.result!.employerCost).toBe(a.result!.employerCost - a.result!.opvr)
    // R5: три начисленные с одной суммой на руки
    const r5 = grossFromNet(1_000_000, { bornBefore1975: true })
    expect([r5.gross, ...r5.alternatives]).toEqual([1_246_243, 1_246_244, 1_246_245])
    for (const category of PAYROLL_CATEGORIES) {
      for (const monthIndex of [1, 11]) {
        for (const target of [50_000, 740_000, 5_000_000]) {
          const x = grossFromNet(target, { category, monthIndex })
          const y = grossFromNet(target, { category, monthIndex, bornBefore1975: true })
          expect(y.gross, `${category} ${monthIndex} ${target}`).toBe(x.gross)
          expect(y.alternatives).toEqual(x.alternatives)
          expect(y.exact).toBe(x.exact)
          expect(y.result?.net).toBe(x.result?.net)
        }
      }
    }
  })
})

describe('payroll: warnings', () => {
  const w =(i: PayrollInput): PayrollWarningCode[] => calculatePayroll(i).warnings

  it('w1: below MZP and the category pays OPVR or SO', () => {
    expect(w({ gross: 60_000 })).toContain('w1')
    expect(w({ gross: 60_000, category: 'pensioner' })).not.toContain('w1')
    expect(w({ gross: 60_000, category: 'disabled12Indefinite' })).toContain('w1') // платит СО
    expect(w({ gross: 85_000 })).toContain('w1') // доход минус ОПВ 76 500 ниже МЗП: база СО поднята до МЗП
    expect(w({ gross: 94_443 })).toContain('w1') // ОПВ 9 444, остаётся 84 999
    expect(w({ gross: 94_444 })).not.toContain('w1') // ОПВ 9 444, остаётся ровно 85 000
    expect(w({ gross: 100_000 })).not.toContain('w1')
    expect(calculatePayroll({ gross: 90_000 }).bases.so).toBe(MZP_2026)
    expect(calculatePayroll({ gross: 94_444 }).bases.so).toBe(MZP_2026)
    expect(calculatePayroll({ gross: 94_446 }).bases.so).toBe(94_446 - 9_445) // выше МЗП: база СО уже не поднимается
    // пенсионер не платит СО, инвалид I-II группы бессрочно не платит ОПВ: второго случая нет
    expect(w({ gross: 90_000, category: 'pensioner' })).not.toContain('w1')
    expect(w({ gross: 90_000, category: 'disabled12Indefinite' })).not.toContain('w1')
  })

  it('w2: base deduction on and ipn is zero (not for disabled categories)', () => {
    expect(w({ gross: 100_000 })).toContain('w2')
    expect(w({ gross: 300_000 })).not.toContain('w2')
    expect(w({ gross: 100_000, baseDeduction: false })).not.toContain('w2')
    expect(w({ gross: 100_000, category: 'disabled3' })).not.toContain('w2')
  })

  it('w3: base deduction off', () => {
    expect(w({ gross: 300_000, baseDeduction: false })).toContain('w3')
    expect(w({ gross: 300_000 })).not.toContain('w3')
  })

  it('w4: a payment sits on its cap', () => {
    expect(w({ gross: 1_700_000 })).toContain('w4') // ВОСМС 20 МЗП
    expect(w({ gross: 1_699_999 })).not.toContain('w4')
    expect(w({ gross: 3_400_000 })).toContain('w4')
    expect(w({ gross: 4_250_000 })).toContain('w4')
    expect(w({ gross: 4_250_000, category: 'disabled12Indefinite' })).not.toContain('w4')
  })

  it('w5: SO base above 7 MZP', () => {
    expect(w({ gross: 661_111 })).not.toContain('w5') // ровно 595 000 после ОПВ
    expect(w({ gross: 661_112 })).toContain('w5') // 661 112 - 66 111 = 595 001
    expect(w({ gross: 700_000 })).toContain('w5')
    expect(w({ gross: 700_000, category: 'pensioner' })).not.toContain('w5')
  })

  it('w6: SN floor zone', () => {
    expect(w({ gross: 60_550 })).toContain('w6')
    expect(w({ gross: 60_551 })).not.toContain('w6')
    expect(w({ gross: 60_000, hireOrFireMonth: true })).not.toContain('w6')
    expect(w({ gross: 60_000, employerRegime: 'simplified' })).not.toContain('w6')
    expect(w({ gross: 60_000, employerRegime: 'soleGeneral' })).not.toContain('w6')
    expect(w({ gross: 60_550, employerRegime: 'general' })).toContain('w6')
  })

  it('w7: 15% threshold reached within the year or via manual prior', () => {
    expect(w({ gross: 10_000_000 })).toContain('w7')
    expect(w({ gross: 300_000 })).not.toContain('w7')
    expect(w({ gross: 1_000_000, priorTaxableCum: 36_500_000 })).toContain('w7')
    expect(w({ gross: 1_000_000, priorTaxableCum: 1_000_000 })).not.toContain('w7')
  })

  it('w8: any non-standard category', () => {
    for (const c of PAYROLL_CATEGORIES) {
      expect(w({ gross: 300_000, category: c }).includes('w8')).toBe(c !== 'standard')
    }
  })

  it('w10: disabled categories whenever the social deduction is applied (SPEC 5.1: socialApplied > 0 or base above 1/12 of the limit)', () => {
    expect(w({ gross: 100_000, category: 'disabled3' })).not.toContain('w10') // база ИПН равна нулю, вычет не применялся
    expect(w({ gross: 300_000, category: 'disabled3' })).toContain('w10') // вычет применён (140 250), хотя ниже 1/12 лимита
    expect(w({ gross: 600_000, category: 'disabled3' })).toContain('w10')
    expect(w({ gross: 600_000, category: 'disabled3', monthIndex: 10 })).toContain('w10')
    expect(w({ gross: 600_000 })).not.toContain('w10')
  })

  it('w9 and w11 belong to the reverse mode only', () => {
    for (const v of main) expect(w(v.input)).not.toContain('w9')
    const r5 = grossFromNet(1_000_000)
    expect(r5.warnings).toContain('w9')
    expect(r5.warnings).not.toContain('w11')
    const r1 = grossFromNet(74_800)
    expect(r1.warnings).not.toContain('w9')
  })

  it('warnings are sorted and unique', () => {
    const r = grossFromNet(8_555_750, { monthIndex: 4 })
    const nums = r.warnings.map((x) => Number(x.slice(1)))
    expect([...nums].sort((a, b) => a - b)).toEqual(nums)
    expect(new Set(nums).size).toBe(nums.length)
  })
})

describe('payroll: reverse vectors (R1-R14)', () => {
  for (const v of reverse) {
    it(`${v.id} net ${v.net}`, () => {
      const r = grossFromNet(v.net, v.params)
      expect(r.exact).toBe(true)
      expect(r.tooLarge).toBe(false)
      expect(r.gross).toBe(v.gross)
      expect(r.alternatives).toEqual(v.alternatives)
      expect(r.result?.net).toBe(v.net)
      const fwd = calculatePayroll({ ...v.params, gross: v.gross })
      expect(fwd.net).toBe(v.net)
      for (const a of v.alternatives) expect(calculatePayroll({ ...v.params, gross: a }).net).toBe(v.net)
    })
  }

  it('R5 lists three gross values with the same net, smallest first', () => {
    const r = grossFromNet(1_000_000)
    expect([r.gross, ...r.alternatives]).toEqual([1_246_243, 1_246_244, 1_246_245])
  })

  it('too large target is flagged, not thrown', () => {
    const r = grossFromNet(900_000_000)
    expect(r.tooLarge).toBe(true)
    expect(r.gross).toBeNull()
    expect(r.result).toBeNull()
    const top = calculatePayroll({ gross: MAX_GROSS }).net
    const ok = grossFromNet(top)
    expect(ok.tooLarge).toBe(false)
    expect(ok.gross).toBeLessThanOrEqual(MAX_GROSS)
    expect(ok.result?.net).toBe(top)
  })

  it('target 0 gives gross 0; invalid targets throw', () => {
    expect(grossFromNet(0).gross).toBe(0)
    expect(() => grossFromNet(-1)).toThrow(RangeError)
    expect(() => grossFromNet(1.5)).toThrow(RangeError)
  })

  it('employer regime does not change net, so not the reverse result either', () => {
    const a = grossFromNet(300_000)
    const b = grossFromNet(300_000, { employerRegime: 'simplified' })
    const c = grossFromNet(300_000, { employerRegime: 'soleGeneral' })
    expect(b.gross).toBe(a.gross)
    expect(c.gross).toBe(a.gross)
    expect(b.result?.sn).toBe(0)
    expect(c.result?.sn).toBe(4_325)
  })
})

describe('payroll: thresholds and hints computed by code', () => {
  it('minGrossReachingThreshold', () => {
    expect(minGrossReachingThreshold()).toBe(thresholds.minGrossReachingThresholdStandardDeduction)
    expect(minGrossReachingThreshold({ baseDeduction: false })).toBe(thresholds.minGrossReachingThresholdStandardNoDeduction)
    expect(minGrossReachingThreshold()).toBe(3_585_880)
    expect(minGrossReachingThreshold({ baseDeduction: false })).toBe(3_441_713)
    // сама граница действительно меняет предупреждение
    const g = minGrossReachingThreshold()!
    expect(firstMonthOverThreshold({ gross: g })).toBe(12)
    expect(firstMonthOverThreshold({ gross: g - 1 })).toBeNull()
  })

  it('ipnBaseZeroUpTo and firstGrossWithIpn', () => {
    expect(ipnBaseZeroUpTo()).toBe(thresholds.ipnBaseZeroUpToStandardDeduction)
    expect(ipnBaseZeroUpTo()).toBe(147_443)
    expect(ipnBaseZeroUpTo({ baseDeduction: false })).toBe(0)
    expect(firstGrossWithIpn()).toBe(thresholds.firstGrossWithIpn1StandardDeduction)
    expect(firstGrossWithIpn()).toBe(147_449)
    expect(calculatePayroll({ gross: 147_443 }).ipnDetail.baseBeforeSocial).toBe(0)
    expect(calculatePayroll({ gross: 147_444 }).ipnDetail.baseBeforeSocial).toBeGreaterThan(0)
  })

  it('firstMonthOverThreshold for equal salary', () => {
    expect(firstMonthOverThreshold({ gross: 10_000_000 })).toBe(4) // 4 x 9 411 250 > 36 762 500
    expect(firstMonthOverThreshold({ gross: 300_000 })).toBeNull()
    expect(firstMonthOverThreshold({ gross: 10_000_000, category: 'disabled12Indefinite' })).not.toBeNull()
  })

  it('hints work for every category without throwing', () => {
    for (const category of PAYROLL_CATEGORIES) {
      for (const baseDeduction of [true, false]) {
        const m = minGrossReachingThreshold({ category, baseDeduction })
        if (m !== null) expect(firstMonthOverThreshold({ gross: m, category, baseDeduction })).toBe(12)
        expect(ipnBaseZeroUpTo({ category, baseDeduction })).toBeGreaterThanOrEqual(0)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Свойства
// ---------------------------------------------------------------------------

const EMPLOYER_REGIMES = ['general', 'soleGeneral', 'simplified'] as const

function randomInput(rand: () => number): PayrollInput {
  const bucket = rand()
  const gross =
    bucket < 0.25
      ? 1 + Math.floor(rand() * 150_000)
      : bucket < 0.7
        ? 1 + Math.floor(rand() * 1_000_000)
        : bucket < 0.95
          ? 1 + Math.floor(rand() * 12_000_000)
          : 1 + Math.floor(rand() * MAX_GROSS)
  const category = PAYROLL_CATEGORIES[Math.floor(rand() * PAYROLL_CATEGORIES.length)]
  const input: PayrollInput = {
    gross,
    category,
    baseDeduction: rand() < 0.7,
    employerRegime: EMPLOYER_REGIMES[Math.floor(rand() * EMPLOYER_REGIMES.length)],
    hireOrFireMonth: rand() < 0.2,
    monthIndex: 1 + Math.floor(rand() * 12),
    bornBefore1975: rand() < 0.3,
  }
  if (!category.startsWith('disabled') && rand() < 0.15) {
    input.priorTaxableCum = Math.floor(rand() * 40_000_000)
  }
  return input
}

describe('payroll: properties', () => {
  it('net + everything paid = employer cost, and the pieces add up (6000 random inputs)', () => {
    const rand = rng(20261024)
    for (let k = 0; k < 6000; k++) {
      const i = randomInput(rand)
      const r = calculatePayroll(i)
      expect(r.net + r.totalToState).toBe(r.employerCost)
      expect(r.employerCost - r.net).toBe(r.totalToState)
      expect(r.net + r.withheld).toBe(r.gross)
      expect(r.withheld).toBe(r.opv + r.vosms + r.ipn)
      expect(r.totalToState).toBe(r.opv + r.opvr + r.vosms + r.oosms + r.so + r.sn + r.ipn)
      expect(r.net).toBeGreaterThan(0)
      for (const key of EXPECTED_KEYS) {
        expect(Number.isInteger(r[key])).toBe(true)
        expect(r[key]).toBeGreaterThanOrEqual(0)
      }
      // ИПН-база месяца равна разности нарастающих
      expect(r.ipnDetail.base).toBe(r.ipnDetail.cum - r.ipnDetail.priorCum)
      expect(r.ipnDetail.base10 + r.ipnDetail.base15).toBe(r.ipnDetail.base)
    }
  }, 30000)

  it('is deterministic', () => {
    const rand = rng(7)
    for (let k = 0; k < 200; k++) {
      const i = randomInput(rand)
      expect(calculatePayroll(i)).toEqual(calculatePayroll({ ...i }))
    }
  })

  // Список порогов и их соседей: ничего не пропустить на границах.
  function thresholdGrosses(): number[] {
    const anchors = [
      1,
      SN_FLOOR_OBJECT,
      MZP_2026,
      ipnBaseZeroUpTo(),
      firstGrossWithIpn()!,
      minGrossReachingThreshold()!,
      minGrossReachingThreshold({ baseDeduction: false })!,
      CAP_7_MZP,
      CAP_7_MZP + Math.round(CAP_7_MZP / 10), // база СО после ОПВ упирается в 7 МЗП
      CAP_20_MZP,
      CAP_40_MZP,
      CAP_50_MZP,
      661_111,
      BASE_DEDUCTION,
      MAX_GROSS,
    ]
    const out = new Set<number>()
    for (const a of anchors) for (let d = -3; d <= 3; d++) if (a + d >= 1 && a + d <= MAX_GROSS) out.add(a + d)
    return [...out]
  }

  const REVERSE_CONFIGS: { opts: ReverseOptions }[] = [
    { opts: {} },
    { opts: { baseDeduction: false } },
    { opts: { monthIndex: 4 } },
    { opts: { monthIndex: 12 } },
    { opts: { category: 'pensioner' } },
    { opts: { category: 'disabled12Indefinite', monthIndex: 11 } },
    { opts: { category: 'disabled12Term', monthIndex: 12 } },
    { opts: { category: 'disabled3', monthIndex: 10 } },
    { opts: { priorTaxableCum: 36_500_000 } },
    { opts: { bornBefore1975: true } },
    { opts: { bornBefore1975: true, category: 'disabled3', monthIndex: 12 } },
  ]

  it('reverse(forward(g)) finds g or an equal-net alternative, for 2000 values including all thresholds', () => {
    const rand = rng(424242)
    const grosses = thresholdGrosses()
    while (grosses.length < 2000) {
      const bucket = rand()
      grosses.push(
        bucket < 0.4
          ? 1 + Math.floor(rand() * 200_000)
          : bucket < 0.85
            ? 1 + Math.floor(rand() * 5_000_000)
            : 1 + Math.floor(rand() * MAX_GROSS),
      )
    }
    expect(grosses.length).toBeGreaterThanOrEqual(2000)
    let exactBack = 0
    grosses.forEach((g, k) => {
      const opts = REVERSE_CONFIGS[k % REVERSE_CONFIGS.length].opts
      const fwd = calculatePayroll({ ...opts, gross: g })
      const back = grossFromNet(fwd.net, opts)
      expect(back.exact).toBe(true)
      expect(back.tooLarge).toBe(false)
      expect(back.gross).not.toBeNull()
      expect(back.gross!).toBeLessThanOrEqual(g) // наименьшая из подходящих
      expect(calculatePayroll({ ...opts, gross: back.gross! }).net).toBe(fwd.net)
      // g либо найдена, либо есть среди альтернатив с той же суммой на руки.
      // У категорий с инвалидностью на участке исчерпания соцвычета net почти
      // плоская или убывает, там равные суммы на руки лежат далеко друг от друга.
      if (!opts.category?.startsWith('disabled')) {
        expect(back.gross === g || back.alternatives.includes(g)).toBe(true)
      }
      if (back.gross === g) exactBack++
    })
    // g восстанавливается один в один всюду, где соседняя меньшая начисленная даёт другую сумму на руки
    // (шаг net(g) - net(g-1) равен 0 примерно в каждом шестом случае из-за округлений)
    expect(exactBack / grosses.length).toBeGreaterThan(0.7)
  })

  it('forward(reverse(target)).net === target for 3000 random targets over categories, deduction and months', () => {
    const rand = rng(99)
    const monthPool = [1, 4, 12]
    for (let k = 0; k < 3000; k++) {
      const category = PAYROLL_CATEGORIES[k % PAYROLL_CATEGORIES.length]
      const opts: ReverseOptions = {
        category,
        baseDeduction: rand() < 0.5,
        monthIndex: monthPool[Math.floor(rand() * 3)],
        bornBefore1975: rand() < 0.3,
      }
      const bucket = rand()
      const target = bucket < 0.3 ? 1 + Math.floor(rand() * 3000) : bucket < 0.8 ? 1 + Math.floor(rand() * 800_000) : 1 + Math.floor(rand() * 12_000_000)
      const r = grossFromNet(target, opts)
      expect(r.exact).toBe(true)
      expect(r.gross).not.toBeNull()
      expect(calculatePayroll({ ...opts, gross: r.gross! }).net).toBe(target)
      // наименьшая: на единицу меньше уже не даёт нужную сумму (для категорий с
      // инвалидностью net на участке соцвычета почти плоская, там не проверяем)
      if (r.gross! > 1 && !category.startsWith('disabled')) {
        expect(calculatePayroll({ ...opts, gross: r.gross! - 1 }).net).not.toBe(target)
      }
      for (const a of r.alternatives) {
        expect(a).toBeGreaterThan(r.gross!)
        expect(calculatePayroll({ ...opts, gross: a }).net).toBe(target)
      }
    }
  })

  it('every integer net target up to 6 000 is reachable, for every category', () => {
    for (const category of PAYROLL_CATEGORIES) {
      for (let t = 1; t <= 6_000; t++) {
        const r = grossFromNet(t, { category })
        if (!r.exact || calculatePayroll({ category, gross: r.gross! }).net !== t) {
          throw new Error(`unreachable target ${t} for ${category}`)
        }
      }
    }
  }, 60_000)

  it('disabled categories in months 11 and 12 (net falls while the social deduction runs out): the first crossing is returned', () => {
    // g = 2 107 232 лежит внутри участка исчерпания вычета, net(g) = 2 094 502 ниже, чем в начале участка.
    const opts: ReverseOptions = { category: 'disabled12Indefinite', monthIndex: 11 }
    const inBand = calculatePayroll({ ...opts, gross: 2_107_232 }).net
    const back = grossFromNet(inBand, opts)
    expect(back.exact).toBe(true)
    expect(back.gross!).toBeLessThan(2_107_232)
    expect(calculatePayroll({ ...opts, gross: back.gross! }).net).toBe(inBand)
    // выше участка net снова растёт: цель выше начала участка находится после него
    const after = calculatePayroll({ ...opts, gross: 2_400_000 }).net
    const back2 = grossFromNet(after, opts)
    expect(back2.exact).toBe(true)
    expect(back2.gross!).toBeLessThanOrEqual(2_400_000)
    expect(calculatePayroll({ ...opts, gross: back2.gross! }).net).toBe(after)
  })

  it('net grows with gross up to rounding: each step is within -2..+1, and +100 always adds', () => {
    const rand = rng(31337)
    const samples = thresholdGrosses().filter((g) => g < MAX_GROSS - 200)
    for (let k = 0; k < 2000; k++) samples.push(1 + Math.floor(rand() * 8_000_000))
    for (const g of samples) {
      for (const category of PAYROLL_CATEGORIES) {
        const a = calculatePayroll({ gross: g, category }).net
        const b = calculatePayroll({ gross: g + 1, category }).net
        expect(b - a).toBeGreaterThanOrEqual(-2)
        expect(b - a).toBeLessThanOrEqual(1)
        const c = calculatePayroll({ gross: g + 100, category }).net
        expect(c).toBeGreaterThan(a)
      }
    }
  })

  it('net is not strictly monotone (documented rounding effect), reverse takes the smallest gross', () => {
    // 1 246 243, 1 246 244, 1 246 245 дают одну и ту же сумму на руки
    const nets = [1_246_243, 1_246_244, 1_246_245].map((g) => calculatePayroll({ gross: g }).net)
    expect(new Set(nets).size).toBe(1)
  })

  it('more months of equal pay never lower the cumulative tax-year effect on net at the same gross', () => {
    // при росте месяца ИПН месяца не убывает: нарастающая шкала 10% -> 15% только растёт
    for (const g of [300_000, 3_000_000, 10_000_000]) {
      let prev = -1
      for (let m = 1; m <= 12; m++) {
        const ipn = calculatePayroll({ gross: g, monthIndex: m }).ipn
        expect(ipn).toBeGreaterThanOrEqual(prev - 1) // допуск на округление в 1 ₸
        prev = ipn
      }
    }
  })
})
