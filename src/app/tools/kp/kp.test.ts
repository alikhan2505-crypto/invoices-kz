import { describe, it, expect } from 'vitest'
import { toolMetadata } from '@/lib/tools-i18n'
import { kpDict, quarterStartLabel } from './dict'
import { UNIT_LABELS } from '@/lib/tools-i18n/units'
import { kpLines, kpRowProblem, kpTotal, kpVatIncluded, localIsoDate, ruDate, KP_UNITS } from './calc'

describe('kp calc', () => {
  it('totals only the rows that reach the document', () => {
    const rows = [
      { name: 'Дизайн', qty: '2', price: '10000' },
      { name: '', qty: '1', price: '5000' }, // без названия — в КП не попадёт
    ]
    // Без выбранной единицы (старый черновик) — «шт».
    expect(kpLines(rows)).toEqual([{ name: 'Дизайн', qty: 2, unit: 'шт', price: 10000 }])
    expect(kpTotal(rows)).toBe(20000)
  })

  it('passes the chosen unit to the document and labels every unit in every language', () => {
    expect(kpLines([{ name: 'Кирпич', qty: '3', unit: 'т', price: '40000' }])).toEqual([{ name: 'Кирпич', qty: 3, unit: 'т', price: 40000 }])
    for (const lang of ['ru', 'kk', 'en'] as const) {
      for (const u of KP_UNITS) expect(UNIT_LABELS[lang][u]).toBeTruthy()
    }
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

  it('describes the limit per quarter, never per day, in every language', () => {
    expect(kpDict.ru.remaining(2, 3)).toBe('Осталось 2 из 3 бесплатных КП в этом квартале')
    expect(kpDict.kk.remaining(2, 3)).toMatch(/тоқсан/)
    expect(kpDict.en.remaining(2, 3)).toMatch(/this quarter/)
    for (const lang of ['ru', 'kk', 'en'] as const) {
      const d = kpDict[lang]
      const limitTexts = [d.seo.description, d.intro, d.remaining(1, 3), d.limitTitle(3), d.limitReset('2027-01-01')].join(' ')
      expect(limitTexts).not.toMatch(/в день|сегодня|күніне|бүгін|a day|today/i)
    }
  })

  it('names the quarter reset date in words', () => {
    expect(quarterStartLabel('ru', '2027-01-01')).toBe('1 января')
    expect(quarterStartLabel('kk', '2026-10-01')).toBe('1 қазанда')
    expect(quarterStartLabel('en', '2027-04-01')).toBe('1 April')
    expect(kpDict.ru.limitReset('2027-07-01')).toBe('Новые бесплатные КП откроются 1 июля.')
    expect(quarterStartLabel('ru', 'garbage')).toBe('garbage')
  })
})
