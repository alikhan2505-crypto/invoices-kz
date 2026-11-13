import { describe, expect, it } from 'vitest'
import { TOOL_CHROME } from './index'
import { anonymousToolHref } from './signedInDestination'
import { isToolEventTool, TOOL_EVENT_MEDIUMS } from '@/lib/toolEvents/schema'
import { parseToolEventPayload } from '@/lib/toolEvents/validate'

describe('приглашение после документа (13.11.2026)', () => {
  it('ссылка идёт через /login с отдельной меткой after_doc и инструментом', () => {
    for (const tool of ['avr', 'kp', 'nakladnaya', 'schet']) {
      expect(isToolEventTool(tool)).toBe(true)
      expect(anonymousToolHref(tool, 'after_doc')).toBe(`/login?utm_source=tools&utm_medium=after_doc&utm_campaign=${tool}`)
    }
  })

  it('after_doc входит в словарь меток, и сервер принимает такое событие', () => {
    expect(TOOL_EVENT_MEDIUMS).toContain('after_doc')
    const row = parseToolEventPayload({ event: 'cta', tool: 'avr', visitor: 'a1b2c3d4-e5f6', medium: 'after_doc' })
    expect(row).toMatchObject({ event: 'cta', tool: 'avr', medium: 'after_doc' })
  })

  it('тексты есть на трёх языках; в ru и en нет тире; kk берёт уже вычитанные строки', () => {
    for (const lang of ['ru', 'kk', 'en'] as const) {
      const c = TOOL_CHROME[lang]
      for (const v of [c.afterDocTitle, c.afterDocBody, c.afterDocButton]) expect(v.trim().length).toBeGreaterThan(3)
    }
    for (const lang of ['ru', 'en'] as const) {
      const c = TOOL_CHROME[lang]
      for (const v of [c.afterDocTitle, c.afterDocBody, c.afterDocButton]) expect(v).not.toMatch(/[—–]/)
    }
    expect(TOOL_CHROME.kk.afterDocTitle).toBe(TOOL_CHROME.kk.ctaTitle)
    expect(TOOL_CHROME.kk.afterDocBody).toBe(TOOL_CHROME.kk.ctaBody)
    expect(TOOL_CHROME.kk.afterDocButton).toBe(TOOL_CHROME.kk.ctaButton)
  })
})
