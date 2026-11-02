import { describe, it, expect } from 'vitest'
import { parseDecimalText } from './DecimalField'

describe('parseDecimalText', () => {
  it.each([
    ['', 0], ['0', 0], ['0,', 0], ['0,5', 0.5], ['0.5', 0.5], ['.5', 0.5], ['5.', 5], ['1 250', 1250], ['1 250,50', 1250.5],
    ['1 000', 1000], ['150000', 150000], ['12,345', 12.345],
  ])('%j -> %s', (raw, n) => { expect(parseDecimalText(raw)).toBe(n) })

  it.each([['abc'], ['1e5'], ['-5'], ['1,2,3'], ['1..2'], ['₸5'], ['5 т']])('мусор %j -> NaN', (raw) => {
    expect(Number.isNaN(parseDecimalText(raw))).toBe(true)
  })
})
