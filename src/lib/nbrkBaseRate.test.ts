import { describe, it, expect } from 'vitest'
import { NBRK_BASE_RATE, formatPercent, formatRateFraction, formatTenge, legalPenalty } from './nbrkBaseRate'

describe('базовая ставка НБ РК для гайда о пене', () => {
  it('числа примера из гайда: 1 000 000 ₸, 60 дней - около 25 890 ₸, полгода - около 78 000 ₸', () => {
    expect(NBRK_BASE_RATE.percent).toBe(15.75)
    expect(legalPenalty(1_000_000, 60)).toBe(25_890)
    expect(Math.round(legalPenalty(1_000_000, 180) / 1000) * 1000).toBe(78_000)
  })

  it('форматы: 15,75 и 0,1575 с запятой, суммы с пробелом', () => {
    expect(formatPercent(15.75)).toBe('15,75')
    expect(formatRateFraction(15.75)).toBe('0,1575')
    expect(formatRateFraction(16.25)).toBe('0,1625')
    expect(formatRateFraction(9)).toBe('0,09')
    expect(formatTenge(25890)).toBe('25 890')
    expect(formatTenge(1_000_000)).toBe('1 000 000')
  })

  it('ставка другая - итог другой (формула берёт переданный процент)', () => {
    expect(legalPenalty(1_000_000, 60, 16.25)).toBe(26_712)
    expect(legalPenalty(0, 60)).toBe(0)
    expect(legalPenalty(1_000_000, 0)).toBe(0)
  })

  it('даты записаны ДД.ММ.ГГГГ и идут по порядку', () => {
    const d = (s: string) => { const [dd, mm, yy] = s.split('.').map(Number); return Date.UTC(yy, mm - 1, dd) }
    const { decisionDate, effectiveFrom, nextDecision, verifiedOn } = NBRK_BASE_RATE
    for (const s of [decisionDate, effectiveFrom, nextDecision, verifiedOn]) expect(s).toMatch(/^\d{2}\.\d{2}\.\d{4}$/)
    expect(d(decisionDate)).toBeLessThan(d(effectiveFrom))
    expect(d(effectiveFrom)).toBeLessThan(d(nextDecision))
  })
})
