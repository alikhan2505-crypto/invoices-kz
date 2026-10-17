import { describe, it, expect } from 'vitest'
import { UNIT_OPTIONS, unitLabel } from './units'

describe('unitLabel', () => {
  it('keeps Russian as stored', () => {
    for (const u of UNIT_OPTIONS) expect(unitLabel(u, 'ru')).toBe(u)
  })
  it('translates every option into kk and en', () => {
    for (const u of UNIT_OPTIONS) {
      expect(unitLabel(u, 'en')).not.toMatch(/[а-яё]/i)
    }
    expect(unitLabel('день', 'kk')).toBe('күн')
    expect(unitLabel('час', 'en')).toBe('hour')
    expect(unitLabel('услуга', 'kk')).toBe('қызмет')
  })
  it('leaves free-text units untouched', () => {
    expect(unitLabel('упаковка', 'en')).toBe('упаковка')
  })
})
