import { describe, it, expect } from 'vitest'
import { taxRegimeName, taxRegimesText, unreliableCategoriesText, elicenseSearchUrl } from './binRiskText'
import type { TaxRegime, UnreliableCategory } from './kgdTaxpayer'

const CYR = /[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/
const ALL: UnreliableCategory[] = ['inactive', 'bankrupt', 'registrationInvalid', 'reregistrationInvalid', 'other']
const regime = (over: Partial<TaxRegime> = {}): TaxRegime => ({
  type: 'SNR_SIMPLIFIED_DECLARATION', nameRu: 'Упрощенная декларация', nameKk: null, nameEn: null,
  beginDate: '2026-01-01', endDate: null, ...over,
})
const fmt = (iso: string | null) => (iso ? iso.split('-').reverse().join('.') : null)
const phrases = { since: (d: string) => `since ${d}`, until: (d: string) => `until ${d}` }

describe('unreliableCategoriesText', () => {
  it('names every category in every language; en has no Cyrillic', () => {
    for (const lang of ['ru', 'kk', 'en'] as const) {
      const text = unreliableCategoriesText(ALL, lang)
      expect(text.split('; ')).toHaveLength(ALL.length)
      if (lang === 'en') expect(text).not.toMatch(CYR)
      expect(text).not.toMatch(/[–—]/)
    }
  })
  it('kk does not use Russian abbreviations', () => {
    expect(unreliableCategoriesText(ALL, 'kk')).not.toMatch(/(^|[^А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі])(КГД|НДС|БИН|ИП)($|[^А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі])/)
  })
  it('empty or missing list gives an empty string, never the word undefined', () => {
    expect(unreliableCategoriesText([], 'ru')).toBe('')
    expect(unreliableCategoriesText(null, 'ru')).toBe('')
    expect(unreliableCategoriesText(undefined, 'en')).toBe('')
  })
})

describe('taxRegimeName', () => {
  it('known regimes get the same name logic on every language, en without Cyrillic', () => {
    expect(taxRegimeName(regime(), 'ru')).toBe('Упрощённая декларация')
    expect(taxRegimeName(regime(), 'en')).toBe('Simplified declaration')
    expect(taxRegimeName(regime({ type: 'SNR_GENERAL_ORDER' }), 'en')).toBe('General regime')
    expect(taxRegimeName(regime({ type: 'SNR_GENERAL_ORDER' }), 'kk')).toMatch(CYR)
  })
  it('an unseen regime keeps its own name from КГД on ru and kk', () => {
    const r = regime({ type: 'SNR_NEW', nameRu: 'Новый режим', nameKk: 'Жаңа режим' })
    expect(taxRegimeName(r, 'ru')).toBe('Новый режим')
    expect(taxRegimeName(r, 'kk')).toBe('Жаңа режим')
  })
  it('an unseen regime never leaks Cyrillic into en', () => {
    expect(taxRegimeName(regime({ type: 'SNR_NEW', nameRu: 'Новый режим', nameEn: null }), 'en')).not.toMatch(CYR)
    expect(taxRegimeName(regime({ type: 'SNR_NEW', nameRu: 'Новый режим', nameEn: 'Все по-русски' }), 'en')).not.toMatch(CYR)
    expect(taxRegimeName(regime({ type: 'SNR_NEW', nameRu: 'Новый режим', nameEn: 'New regime' }), 'en')).toBe('New regime')
  })
  it('an unseen regime with no names at all still shows something', () => {
    expect(taxRegimeName(regime({ type: 'SNR_X', nameRu: null }), 'ru').length).toBeGreaterThan(3)
  })
})

describe('taxRegimesText', () => {
  it('joins regimes with their dates, skipping dates КГД does not publish', () => {
    const text = taxRegimesText(
      [regime(), regime({ type: 'SNR_GENERAL_ORDER', beginDate: null, endDate: '2025-12-31' })],
      'en', fmt, phrases,
    )
    expect(text).toBe('Simplified declaration since 01.01.2026; General regime until 31.12.2025')
  })
  it('no dates gives just the name', () => {
    expect(taxRegimesText([regime({ type: 'SNR_GENERAL_ORDER', beginDate: null })], 'en', fmt, phrases)).toBe('General regime')
  })
})

describe('elicenseSearchUrl', () => {
  it('encodes the БИН and keeps the equality mode', () => {
    expect(elicenseSearchUrl('123456789012')).toContain('IinBinStr=123456789012&IinBinEquality=1')
    expect(elicenseSearchUrl('1 2&x=y')).not.toContain('&x=y')
  })
})
