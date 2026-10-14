import { describe, it, expect } from 'vitest'
import { toolMetadata } from '@/lib/tools-i18n'
import { kpDict } from './dict'
import { kpLines, kpRowProblem, kpTotal, kpVatIncluded, localIsoDate, ruDate } from './calc'

describe('kp calc', () => {
  it('totals only the rows that reach the document', () => {
    const rows = [
      { name: 'Дизайн', qty: '2', price: '10000' },
      { name: '', qty: '1', price: '5000' }, // без названия — в КП не попадёт
    ]
    expect(kpLines(rows)).toEqual([{ name: 'Дизайн', qty: 2, price: 10000 }])
    expect(kpTotal(rows)).toBe(20000)
  })

  it('flags a priced row without a name and a named row without quantity', () => {
    expect(kpRowProblem([{ name: 'A', qty: '1', price: '1' }, { name: ' ', qty: '1', price: '500' }]))
      .toEqual({ kind: 'rowName', n: 2 })
    expect(kpRowProblem([{ name: 'A', qty: '', price: '100' }])).toEqual({ kind: 'rowQty', n: 1 })
    expect(kpRowProblem([{ name: 'A', qty: '0', price: '100' }])).toEqual({ kind: 'rowQty', n: 1 })
  })

  it('ignores untouched empty rows but needs at least one item', () => {
    expect(kpRowProblem([{ name: 'A', qty: '1', price: '100' }, { name: '', qty: '1', price: '' }])).toBeNull()
    expect(kpRowProblem([{ name: '', qty: '1', price: '' }])).toEqual({ kind: 'noRows' })
  })

  it('extracts VAT the same way the printed proposal does', () => {
    expect(kpVatIncluded(116000)).toBe(16000)
    expect(kpVatIncluded(10000)).toBe(Math.round(10000 - 10000 / 1.16))
  })

  it('uses the visitor-local calendar day and prints dd.mm.yyyy', () => {
    expect(localIsoDate(new Date(2026, 9, 14, 1, 30))).toBe('2026-10-14')
    expect(ruDate('2026-10-04')).toBe('04.10.2026')
  })
})

describe('kp dictionary', () => {
  it('has the same keys and FAQ length in every language', () => {
    const keys = (o: object) => Object.keys(o).sort()
    expect(keys(kpDict.kk)).toEqual(keys(kpDict.ru))
    expect(keys(kpDict.en)).toEqual(keys(kpDict.ru))
    expect(keys(kpDict.kk.seo)).toEqual(keys(kpDict.ru.seo))
    expect(kpDict.kk.faq).toHaveLength(kpDict.ru.faq.length)
    expect(kpDict.en.faq).toHaveLength(kpDict.ru.faq.length)
  })

  it('keeps the ru title exactly as it was before the split', () => {
    expect(toolMetadata('kp', 'ru', kpDict.ru.seo).title)
      .toBe('Коммерческое предложение онлайн — КП бесплатно за минуту | invoices.kz')
  })

  it('warns about the Russian document only on kk/en', () => {
    expect(kpDict.ru.docLangNote).toBe('')
    expect(kpDict.kk.docLangNote).not.toBe('')
    expect(kpDict.en.docLangNote).not.toBe('')
  })

  it('uses Kazakh terms, not Russian abbreviations, on the kk page', () => {
    const kk = JSON.stringify(kpDict.kk, (_k, v) => (typeof v === 'function' ? v(2, 3) : v))
    expect(kk).not.toMatch(/БИН|ИИН|НДС|АВР|КП|(^|[^А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі])(ИП|ТОО)([^А-Яа-яЁё]|$)/)
    expect(kk).toMatch(/БСН/)
    expect(kk).toMatch(/ҚҚС/)
    expect(kk).toMatch(/КҰ/)
    expect(kk).toMatch(/жүкқұжат/)
  })
})
