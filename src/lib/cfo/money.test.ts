import { describe, it, expect } from 'vitest'
import { formatTenge, parseAmountInput, toDbAmount, toTiyn } from './money'

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
  })

  it('formatTenge groups thousands with a comma decimal', () => {
    expect(formatTenge(123456789).replace(/\s/g, ' ')).toBe('1 234 567,89 ₸')
    expect(formatTenge(500000).replace(/\s/g, ' ')).toBe('5 000 ₸')
  })

  it('toDbAmount keeps two decimals', () => {
    expect(toDbAmount(125050)).toBe('1250.50')
    expect(toDbAmount(-15000000)).toBe('-150000.00')
  })
})
