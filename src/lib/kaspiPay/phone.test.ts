import { describe, it, expect } from 'vitest'
import { normalizeKzPhone } from './phone'

describe('normalizeKzPhone', () => {
  it('strips the display formatting the profile page produces', () => {
    expect(normalizeKzPhone('+7 777 123 45 67')).toBe('77771234567')
  })

  it('accepts an already-normalized number unchanged', () => {
    expect(normalizeKzPhone('77071234567')).toBe('77071234567')
  })

  it('accepts the domestic 8-prefix form', () => {
    expect(normalizeKzPhone('8 707 123 45 67')).toBe('77071234567')
  })

  it('adds the country code to a bare 10-digit number', () => {
    expect(normalizeKzPhone('7071234567')).toBe('77071234567')
  })

  it('tolerates arbitrary separators', () => {
    expect(normalizeKzPhone('+7 (707) 123-45-67')).toBe('77071234567')
  })

  it('rejects numbers that are too short or too long', () => {
    expect(normalizeKzPhone('770712345')).toBeNull()
    expect(normalizeKzPhone('770712345678')).toBeNull()
  })

  it('rejects a non-Kazakhstani country code', () => {
    expect(normalizeKzPhone('+1 202 555 0100')).toBeNull()
  })

  it('rejects empty and junk input', () => {
    expect(normalizeKzPhone('')).toBeNull()
    expect(normalizeKzPhone('not a phone')).toBeNull()
    expect(normalizeKzPhone(undefined as any)).toBeNull()
  })
})
