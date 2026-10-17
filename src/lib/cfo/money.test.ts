import { describe, it, expect } from 'vitest'
import { formatNumber, formatTenge, parseAmountInput, shortTenge, toDbAmount, toTiyn } from './money'

const sp = (s: string) => s.replace(/\s/g, ' ')

describe('money', () => {
  it('toTiyn converts db numerics without float drift', () => {
    expect(toTiyn('1234.50')).toBe(123450)
    expect(toTiyn(0.29)).toBe(29)
    expect(toTiyn('-150000.00')).toBe(-15000000)
  })

  it('parseAmountInput accepts spaces and a comma', () => {
    expect(parseAmountInput('1 250,5')).toBe(125050)
    expect(parseAmountInput('1 000')).toBe(100000)
    expect(parseAmountInput('99.99')).toBe(9999)
  })

  it('parseAmountInput rejects junk, extra decimals and negatives unless allowed', () => {
    expect(parseAmountInput('')).toBeNull()
    expect(parseAmountInput('12,345')).toBeNull()
    expect(parseAmountInput('abc')).toBeNull()
    expect(parseAmountInput('-500')).toBeNull()
    expect(parseAmountInput('-500', { allowNegative: true })).toBe(-50000)
    expect(parseAmountInput('−500', { allowNegative: true })).toBe(-50000) // типографский минус из формы тоже
  })

  it('formatTenge groups thousands with a comma decimal', () => {
    expect(sp(formatTenge(123456789))).toBe('1 234 567,89 ₸')
    expect(sp(formatTenge(500000))).toBe('5 000 ₸')
  })

  it('formatTenge keeps two decimals when there are kopecks (P2-7: «1 250,50 ₸», not «1 250,5 ₸»)', () => {
    expect(sp(formatTenge(125050))).toBe('1 250,50 ₸')
    expect(sp(formatTenge(100000050))).toBe('1 000 000,50 ₸')
    expect(sp(formatTenge(1))).toBe('0,01 ₸')
    expect(sp(formatTenge(0))).toBe('0 ₸')
  })

  it('formatTenge uses one typographic minus everywhere', () => {
    expect(sp(formatTenge(-125050))).toBe('−1 250,50 ₸')
    expect(sp(formatTenge(-500000))).toBe('−5 000 ₸')
    expect(formatTenge(-1)).not.toContain('-')
  })

  it('formatNumber groups thousands (P3: «65 901 132 дн.»)', () => {
    expect(sp(formatNumber(65901132))).toBe('65 901 132')
    expect(formatNumber(12)).toBe('12')
    expect(sp(formatNumber(-1500))).toBe('−1 500')
  })

  it('shortTenge compacts tile amounts without eating zeros (P2-7)', () => {
    expect(shortTenge(125000000)).toBe('+1,25 млн')
    expect(shortTenge(1_000_000_00)).toBe('+1 млн')
    expect(shortTenge(10_000_000_00)).toBe('+10 млн')
    expect(shortTenge(20_000_000_00)).toBe('+20 млн')
    expect(shortTenge(100_000_000_00)).toBe('+100 млн')
    expect(shortTenge(1_000_000_000_00)).toBe('+1 млрд')
    expect(shortTenge(-2_500_000_000_00)).toBe('−2,5 млрд')
    expect(shortTenge(45_000_00)).toBe('+45 тыс')
    expect(shortTenge(-900_00)).toBe('−900')
  })

  it('shortTenge rounds before picking the unit: no «1000 тыс» / «1000 млн» at tier boundaries', () => {
    expect(shortTenge(999_999_00)).toBe('+1 млн')
    expect(shortTenge(999_500_00)).toBe('+1 млн')
    expect(shortTenge(999_499_00)).toBe('+999 тыс')
    expect(shortTenge(999_999_999_00)).toBe('+1 млрд')
    expect(shortTenge(999_400_000_00)).toBe('+999 млн')
    expect(shortTenge(999_50)).toBe('+1 тыс')
    expect(shortTenge(999_00)).toBe('+999')
    expect(shortTenge(9_995_000_00)).toMatch(/^\+(9,99|10) млн$/)
  })

  it('toDbAmount keeps two decimals', () => {
    expect(toDbAmount(125050)).toBe('1250.50')
    expect(toDbAmount(-15000000)).toBe('-150000.00')
  })
})
