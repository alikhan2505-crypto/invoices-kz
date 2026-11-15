import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TOOL_EVENT_MEDIUMS } from '@/lib/toolEvents/schema'
import { parseToolEventPayload } from '@/lib/toolEvents/validate'
import {
  buildHandoff, consumeHandoff, DOC_NEXT, HANDOFF_KEY, HANDOFF_TTL_MS, mergeHandoff, parseHandoff,
  resetHandoffMemo, saveHandoff, toolPagePath, type DocTool,
} from './docHandoff'
import { nextDocCopy } from './nextDoc'
import ToolNextDocCard from './ToolNextDocCard'

const ALL: DocTool[] = ['avr', 'kp', 'schet', 'nakladnaya']

const form = {
  clientName: 'ТОО «Образец»', clientBin: '000000000001', clientAddress: 'г. Пример', vatType: 'vat_16',
  rows: [
    { name: 'Консультация', qty: '2', unit: 'час', price: '5000' },
    { name: '   ', qty: '1', unit: 'шт', price: '10' },
    { name: 'Бумага', qty: '3', unit: 'выдуманная', price: '2450' },
  ],
}

describe('перенос клиента и позиций между документами (15.11.2026)', () => {
  it('buildHandoff: пустые позиции выброшены, чужая единица и НДС заменены на безопасные', () => {
    const h = buildHandoff('schet', 'avr', { ...form, vatType: 'hack' }, 1000)
    expect(h.rows.map(r => r.name)).toEqual(['Консультация', 'Бумага'])
    expect(h.rows[1].unit).toBe('')
    expect(h.vatType).toBe('no_vat')
    expect(h).toMatchObject({ from: 'schet', to: 'avr', at: 1000, clientName: 'ТОО «Образец»', clientBin: '000000000001' })
  })

  it('parseHandoff: просроченное, из будущего, с чужим инструментом и мусор отбрасываются', () => {
    const now = 1_000_000
    const good = JSON.stringify(buildHandoff('kp', 'schet', form, now - 1000))
    expect(parseHandoff(good, now)).not.toBeNull()
    expect(parseHandoff(JSON.stringify(buildHandoff('kp', 'schet', form, now - HANDOFF_TTL_MS - 1)), now)).toBeNull()
    expect(parseHandoff(JSON.stringify(buildHandoff('kp', 'schet', form, now + 5000)), now)).toBeNull()
    expect(parseHandoff(JSON.stringify({ ...JSON.parse(good), to: 'evil' }), now)).toBeNull()
    expect(parseHandoff('не json', now)).toBeNull()
    expect(parseHandoff(null, now)).toBeNull()
    expect(parseHandoff('[]', now)).toBeNull()
  })

  it('mergeHandoff кладёт клиента, НДС и позиции; адрес только туда, где есть такое поле', () => {
    const h = buildHandoff('schet', 'avr', form)
    const withAddress = mergeHandoff({ clientName: '', clientBin: '', clientAddress: '', vatType: 'no_vat', rows: [{ name: '', qty: '1', unit: 'шт', price: '' }] }, h)
    expect(withAddress.applied).toBe(true)
    expect(withAddress.form).toMatchObject({ clientName: 'ТОО «Образец»', clientBin: '000000000001', clientAddress: 'г. Пример', vatType: 'vat_16' })
    expect(withAddress.form.rows).toEqual([
      { name: 'Консультация', qty: '2', unit: 'час', price: '5000' },
      { name: 'Бумага', qty: '3', unit: 'шт', price: '2450' },
    ])
    const noAddressField = mergeHandoff({ clientName: '', clientBin: '', vatType: 'no_vat', rows: [] as Array<{ name: string; qty: string; price: string }> }, h)
    expect('clientAddress' in noAddressField.form).toBe(false)
  })

  it('mergeHandoff без переноса или с пустым клиентом и позициями ничего не меняет', () => {
    const f = { clientName: 'Свой', clientBin: '', vatType: 'no_vat', rows: [{ name: 'x', qty: '1', price: '1' }] }
    expect(mergeHandoff(f, null)).toEqual({ form: f, applied: false })
    expect(mergeHandoff(f, buildHandoff('kp', 'schet', { clientName: '', rows: [] })).applied).toBe(false)
  })

  it('цепочка: у каждого документа есть следующий, все цели существуют и не совпадают с источником', () => {
    for (const tool of ALL) {
      expect(DOC_NEXT[tool].length, tool).toBeGreaterThan(0)
      for (const target of DOC_NEXT[tool]) {
        expect(ALL).toContain(target)
        expect(target).not.toBe(tool)
      }
    }
    expect(DOC_NEXT.kp).toEqual(['schet'])
    expect(DOC_NEXT.schet).toEqual(['avr', 'nakladnaya'])
  })

  it('адреса страниц: русская без префикса, остальные с языком', () => {
    expect(toolPagePath('schet', 'ru')).toBe('/tools/schet')
    expect(toolPagePath('avr', 'kk')).toBe('/tools/kk/avr')
    expect(toolPagePath('nakladnaya', 'en')).toBe('/tools/en/nakladnaya')
  })

  it('тексты ru, en и kk без тире и эмодзи', () => {
    for (const lang of ['ru', 'en', 'kk'] as const) {
      const c = nextDocCopy(lang)
      for (const s of [c.title, c.body, ...Object.values(c.buttons)]) {
        expect(s.length).toBeGreaterThan(0)
        expect(s).not.toMatch(/[—–]/)
        expect(s).not.toMatch(/\p{Extended_Pictographic}/u)
      }
      expect(Object.keys(c.buttons).sort()).toEqual([...ALL].sort())
    }
    expect(nextDocCopy('kk').title).toBe('Осы клиентке тағы бір құжат керек пе?')
  })

  it('метка next_doc входит в словарь и принимается сервером', () => {
    expect(TOOL_EVENT_MEDIUMS).toContain('next_doc')
    for (const tool of ALL) {
      expect(parseToolEventPayload({ event: 'cta', tool, visitor: 'a1b2c3d4-e5f6', medium: 'next_doc' })).toMatchObject({ event: 'cta', tool, medium: 'next_doc' })
    }
  })

  it('карточка: после документа ведёт к нужным страницам (ru, en, kk), до документа её нет', () => {
    const html = renderToStaticMarkup(createElement(ToolNextDocCard, { source: 'schet', lang: 'ru', show: true, getForm: () => form }))
    expect(html).toContain('data-testid="tool-next-doc"')
    expect(html).toContain('href="/tools/avr"')
    expect(html).toContain('href="/tools/nakladnaya"')
    expect(renderToStaticMarkup(createElement(ToolNextDocCard, { source: 'kp', lang: 'en', show: true, getForm: () => form }))).toContain('href="/tools/en/schet"')
    expect(renderToStaticMarkup(createElement(ToolNextDocCard, { source: 'schet', lang: 'ru', show: false, getForm: () => form }))).not.toContain('tool-next-doc"')
    const kk = renderToStaticMarkup(createElement(ToolNextDocCard, { source: 'schet', lang: 'kk', show: true, getForm: () => form }))
    expect(kk).toContain('tool-next-doc"')
    expect(kk).toContain('href="/tools/kk/avr"')
    expect(kk).toContain('Орындалған жұмыстар актісін жасау')
  })
})

describe('хранилище переноса (sessionStorage)', () => {
  const store = new Map<string, string>()
  beforeEach(() => {
    store.clear()
    resetHandoffMemo()
    ;(globalThis as unknown as { window: unknown }).window = {
      sessionStorage: {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => { store.set(k, v) },
        removeItem: (k: string) => { store.delete(k) },
      },
    }
  })
  afterEach(() => { delete (globalThis as unknown as { window?: unknown }).window })

  it('читается один раз для своей страницы и удаляется; повторный вызов (dev, два эффекта) отдаёт то же', () => {
    expect(saveHandoff(buildHandoff('schet', 'avr', form))).toBe(true)
    const first = consumeHandoff('avr')
    expect(first?.clientName).toBe('ТОО «Образец»')
    expect(store.has(HANDOFF_KEY)).toBe(false)
    expect(consumeHandoff('avr')).toBe(first)
  })

  it('чужая страница запись не забирает', () => {
    saveHandoff(buildHandoff('schet', 'avr', form))
    expect(consumeHandoff('kp')).toBeNull()
    expect(store.has(HANDOFF_KEY)).toBe(true)
  })

  it('недоступное хранилище не ломает страницу', () => {
    ;(globalThis as unknown as { window: unknown }).window = { sessionStorage: { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => { throw new Error('blocked') } } }
    expect(saveHandoff(buildHandoff('schet', 'avr', form))).toBe(false)
    expect(consumeHandoff('avr')).toBeNull()
  })
})
