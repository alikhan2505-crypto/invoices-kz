import { describe, expect, it } from 'vitest'
import { TOOL_LANGS } from './index'
import { FORM_TEXT, hasAnyValue, hintPart, moreExpanded, moreHint, nextMoreState } from './moreFields'
import { NAME_LOOKUP_TEXT } from './nameLookup'

describe('блок «Дополнительно»: раскрытие', () => {
  it('stays collapsed with no values and no error', () => {
    expect(nextMoreState(null, false)).toBeNull()
    expect(moreExpanded(null, false)).toBe(false)
  })
  it('opens by itself when a value is present and stays open after the value is erased (sticky)', () => {
    const s1 = nextMoreState(null, true)
    expect(s1).toBe(true)
    expect(moreExpanded(nextMoreState(s1, false), false)).toBe(true)
  })
  it('respects an explicit collapse by the person', () => {
    expect(nextMoreState(false, true)).toBe(false)
    expect(moreExpanded(false, false)).toBe(false)
  })
  it('a validation error always opens the block', () => {
    expect(moreExpanded(null, true)).toBe(true)
    expect(moreExpanded(false, true)).toBe(true)
  })
  it('hasAnyValue ignores blanks', () => {
    expect(hasAnyValue(['', '  ', undefined, null])).toBe(false)
    expect(hasAnyValue(['', 'Алматы'])).toBe(true)
  })
})

describe('подсказка внутри кнопки', () => {
  it('lower-cases labels, drops stars and brackets, keeps acronyms', () => {
    expect(hintPart('Ваш email (необязательно)')).toBe('ваш email')
    expect(hintPart('КБе')).toBe('КБе')
    expect(hintPart('Номер *')).toBe('номер')
    expect(moreHint(['КБе', 'Руководитель', 'Адрес'])).toBe('КБе, руководитель, адрес')
  })
  it('puts the lead (number and date) first', () => {
    expect(moreHint(['Срок оплаты'], '№ 1, 29.10.2026')).toBe('№ 1, 29.10.2026 · срок оплаты')
    expect(moreHint([], '№ 7, 01.01.2027')).toBe('№ 7, 01.01.2027')
  })
})

describe('тексты форм', () => {
  it('every language has every string and no long dash in the new copy', () => {
    for (const lang of TOOL_LANGS) {
      for (const v of Object.values(FORM_TEXT[lang])) {
        expect(v.trim(), lang).not.toBe('')
        expect(v).not.toContain('—')
      }
      expect(NAME_LOOKUP_TEXT[lang].invalid.trim()).not.toBe('')
      expect(NAME_LOOKUP_TEXT[lang].invalid).not.toContain('—')
    }
  })
  it('kk has no Russian abbreviations, en has no Cyrillic', () => {
    expect([...Object.values(FORM_TEXT.kk), NAME_LOOKUP_TEXT.kk.invalid].join(' ')).not.toMatch(/БИН|ИИН/)
    expect([...Object.values(FORM_TEXT.en), NAME_LOOKUP_TEXT.en.invalid].join(' ')).not.toMatch(/[А-Яа-яЁё]/)
  })
})
