import { describe, it, expect } from 'vitest'
import { TOOL_LANGS } from './index'
import { lookupAriaLabel, NAME_LOOKUP_TEXT, parseNameLookupResponse } from './nameLookup'

describe('parseNameLookupResponse', () => {
  it('returns the trimmed name only when found', () => {
    expect(parseNameLookupResponse(true, { found: true, name: '  ТОО «Ромашка» ', source: 'cache' }))
      .toEqual({ status: 'found', name: 'ТОО «Ромашка»' })
    expect(parseNameLookupResponse(true, { found: true, name: '   ' })).toEqual({ status: 'unavailable', name: null })
  })

  it('maps the miss reasons', () => {
    expect(parseNameLookupResponse(true, { found: false, reason: 'not_found' }).status).toBe('miss')
    expect(parseNameLookupResponse(true, { found: false, reason: 'limit' }).status).toBe('limit')
    expect(parseNameLookupResponse(true, { found: false, reason: 'busy' }).status).toBe('unavailable')
    expect(parseNameLookupResponse(true, { found: false, reason: 'unavailable' }).status).toBe('unavailable')
  })

  it('treats HTTP errors and junk as unavailable', () => {
    expect(parseNameLookupResponse(false, { found: true, name: 'X' })).toEqual({ status: 'unavailable', name: null })
    expect(parseNameLookupResponse(false, { error: 'rate_limited' }).status).toBe('unavailable')
    expect(parseNameLookupResponse(true, null).status).toBe('unavailable')
    expect(parseNameLookupResponse(true, 'oops').status).toBe('unavailable')
  })
})

describe('name lookup copy', () => {
  it('has every message on every language, Kazakh without Russian abbreviations', () => {
    for (const lang of TOOL_LANGS) {
      for (const v of Object.values(NAME_LOOKUP_TEXT[lang])) expect(v.trim(), lang).not.toBe('')
    }
    expect(NAME_LOOKUP_TEXT.kk.button).toBe('Табу')
    expect(Object.values(NAME_LOOKUP_TEXT.kk).join(' ')).not.toMatch(/БИН|ИИН/)
    expect(Object.values(NAME_LOOKUP_TEXT.en).join(' ')).not.toMatch(/[А-Яа-яЁё]/)
  })

  it('builds a distinct screen-reader label from the field label', () => {
    expect(lookupAriaLabel('Найти', 'БИН / ИИН *')).toBe('Найти: БИН / ИИН')
    expect(lookupAriaLabel('Find', 'Customer BIN / IIN')).toBe('Find: Customer BIN / IIN')
  })
})
