import { describe, it, expect } from 'vitest'
import { binControlDigit, validateBinIin, isValidBinIin, normalizeIik, ibanMod97, validateIik, isValidIik } from './kzIdentifiers'

describe('validateBinIin', () => {
  it('accepts real valid BIN/IIN examples', () => {
    for (const value of ['040340001997', '890525350143', '870318401846', '990740000683']) {
      expect(validateBinIin(value)).toBeNull()
      expect(isValidBinIin(value)).toBe(true)
    }
  })

  it('accepts spaces and dashes typed around the digits', () => {
    expect(validateBinIin('0403 4000 1997')).toBeNull()
    expect(validateBinIin(' 890525-350143 ')).toBeNull()
  })

  it('rejects a wrong control digit (typo)', () => {
    expect(validateBinIin('040340001996')).toBe('checksum')
    expect(validateBinIin('890525350144')).toBe('checksum')
    expect(validateBinIin('123456789012')).toBe('checksum')
  })

  it('rejects all-same-digit numbers even when the arithmetic works out', () => {
    expect(validateBinIin('000000000000')).toBe('checksum')
    expect(validateBinIin('111111111111')).toBe('checksum')
  })

  it('reports empty and wrong length separately', () => {
    expect(validateBinIin('')).toBe('empty')
    expect(validateBinIin(null)).toBe('empty')
    expect(validateBinIin('   ')).toBe('empty')
    expect(validateBinIin('04034000199')).toBe('length')
    expect(validateBinIin('0403400019970')).toBe('length')
    expect(validateBinIin('04034000199a')).toBe('chars')
    expect(validateBinIin('0403400019a97')).toBe('chars')
  })

  it('accepts common separators around the 12 digits', () => {
    expect(validateBinIin('040.340.001.997')).toBeNull()
    expect(validateBinIin('040340001997/')).toBeNull()
    expect(validateBinIin('0403-4000-1997')).toBeNull()
  })

  it('uses the second weight set when the first pass gives 10', () => {
    // Ищем перебором номер, где первый проход даёт 10: контрольная цифра
    // должна прийти из второго набора весов.
    let found = false
    for (let n = 0; n < 2000 && !found; n++) {
      const first11 = String(10000000000 + n).slice(0, 11)
      const digits = first11.split('').map(Number)
      const firstPass = digits.reduce((acc, d, i) => acc + d * (i + 1), 0) % 11
      if (firstPass !== 10) continue
      const w2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2]
      const secondPass = digits.reduce((acc, d, i) => acc + d * w2[i], 0) % 11
      expect(binControlDigit(first11)).toBe(secondPass === 10 ? null : secondPass)
      found = true
    }
    expect(found).toBe(true)
  })
})

describe('validateIik', () => {
  it('accepts valid Kazakhstan IBANs, with spaces and lower case on input', () => {
    expect(validateIik('KZ86125KZT5004100100')).toBeNull()
    expect(validateIik('KZ75125KZT2069100100')).toBeNull()
    expect(validateIik('kz86 125k zt50 0410 0100')).toBeNull()
    expect(isValidIik('KZ563190000012344567')).toBe(true)
  })

  it('normalizes to upper case without spaces', () => {
    expect(normalizeIik(' kz86 125k zt50 0410 0100 ')).toBe('KZ86125KZT5004100100')
  })

  it('rejects a typo via mod-97', () => {
    expect(ibanMod97('KZ86125KZT5004100100')).toBe(1)
    expect(validateIik('KZ86125KZT5004100101')).toBe('checksum')
    expect(validateIik('KZ12345678901234567890')).not.toBeNull()
  })

  it('reports prefix, length and characters', () => {
    expect(validateIik('')).toBe('empty')
    expect(validateIik('RU86125KZT5004100100')).toBe('prefix')
    expect(validateIik('KZ86125KZT500410010')).toBe('length')
    expect(validateIik('KZ86125KZT50041001000')).toBe('length')
    expect(validateIik('KZ86125KZT50041001-0')).toBe('chars')
    expect(validateIik('KZAB125KZT5004100100')).toBe('chars')
  })
})
