import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// generateInvoicePDF тянет imageResize (Image/canvas, в node нет); картинок в
// образце нет, подмена нужна только чтобы модуль загрузился.
vi.mock('@/lib/imageResize', () => ({ resizeToFit: async (url: string) => url }))

import { generateInvoicePDF } from '@/lib/generatePDF'
import { KAZAKHSTAN_BANKS } from '@/lib/kazakhstanBanks'
import { TOOL_LANGS } from '@/lib/tools-i18n'
import { formatSampleMoney } from '@/lib/tools-i18n/toolSample'
import ToolSample from '@/components/tools/ToolSample'
import { documentRows } from './calc'
import { schetDict } from './dict'
import {
  buildSchetSampleDoc, schetGuidePath, schetSampleCopy, SAMPLE_BUYER, SAMPLE_DATE, SAMPLE_NUMBER,
  SAMPLE_ROWS, SAMPLE_SUPPLIER, SAMPLE_TOTAL, SAMPLE_TOTAL_WORDS, SAMPLE_VAT, SAMPLE_VAT_RATE, SAMPLE_VAT_TYPE,
} from './sample'

const L = 'A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі'
const RU_ABBR_ON_KK = new RegExp(`(?<![${L}])(БИН|ИИН|НДС|ИП|ТОО|АВР|КП|КГД|ЭСФ|БИК|ИИК|КНП)(?![${L}])`)

describe('schet sample: arithmetic', () => {
  it('recomputes the total from the rows independently of calc.ts', () => {
    const byHand = SAMPLE_ROWS.reduce((s, r) => s + Number(r.qty) * Number(r.price), 0)
    expect(byHand).toBe(149400)
    expect(SAMPLE_TOTAL).toBe(byHand)
  })

  it('extracts 16% VAT from the total (prices include VAT): total * 16 / 116', () => {
    expect(SAMPLE_VAT_TYPE).toBe('vat_16')
    expect(SAMPLE_VAT_RATE).toBe(16)
    expect(SAMPLE_VAT).toBe(Math.round((SAMPLE_TOTAL * 16) / 116))
    expect(SAMPLE_VAT).toBe(20607)
    // Не «добавили 16% сверху»: НДС меньше 16% от итога.
    expect(SAMPLE_VAT).toBeLessThan(SAMPLE_TOTAL * 0.16)
  })

  it('has line amounts in the table that add up to the total shown', () => {
    const rows = documentRows(SAMPLE_ROWS)
    expect(rows).toHaveLength(2)
    expect(rows.reduce((s, r) => s + r.qty * r.price, 0)).toBe(SAMPLE_TOTAL)
    const doc = buildSchetSampleDoc()
    expect(doc.rows).toHaveLength(2)
    expect(doc.rows[0].cells).toEqual(['1', 'Консультационные услуги', '1', 'услуга', formatSampleMoney(120000), formatSampleMoney(120000)])
    expect(doc.rows[1].cells[5]).toBe(formatSampleMoney(12 * 2450))
    expect(doc.totals).toEqual([
      { label: 'Итого:', value: formatSampleMoney(SAMPLE_TOTAL) },
      { label: 'В том числе НДС 16%:', value: formatSampleMoney(SAMPLE_VAT) },
    ])
    expect(doc.summaryLines[0]).toBe(`Всего наименований 2, на сумму ${formatSampleMoney(SAMPLE_TOTAL)} KZT`)
    for (const row of doc.rows) expect(row.cells).toHaveLength(doc.columns.length)
  })

  it('formats money like the generator: spaces and a decimal comma', () => {
    expect(formatSampleMoney(149400).replace(/\s/g, ' ')).toBe('149 400,00')
    expect(formatSampleMoney(20607).replace(/\s/g, ' ')).toBe('20 607,00')
  })
})

describe('schet sample: matches what generateInvoicePDF really prints', () => {
  it('prints the same title, total, VAT, amount in words and bank block', async () => {
    const s = SAMPLE_SUPPLIER
    const html = await generateInvoicePDF({
      autoPrint: false,
      number: SAMPLE_NUMBER,
      date: SAMPLE_DATE,
      clientName: SAMPLE_BUYER.name,
      clientBin: SAMPLE_BUYER.bin,
      clientEmail: '',
      services: documentRows(SAMPLE_ROWS),
      total: SAMPLE_TOTAL,
      vatType: SAMPLE_VAT_TYPE,
      profile: { company_name: s.name, bin_iin: s.bin, address: s.address, director_name: s.director },
      bank: { bank_name: s.bankName, iik: s.iik, bik: s.bik, kbe: s.kbe },
    })
    const doc = buildSchetSampleDoc()
    expect(html).toContain(doc.title)
    expect(html).toContain(`Всего к оплате: ${SAMPLE_TOTAL_WORDS}`)
    expect(html).toContain(formatSampleMoney(SAMPLE_TOTAL))
    expect(html).toContain(formatSampleMoney(SAMPLE_VAT))
    expect(html).toContain('В том числе НДС 16%:')
    expect(html).toContain(doc.summaryLines[0])
    for (const key of [s.iik, s.bik, s.kbe, s.knp, s.bin]) expect(html).toContain(key)
    for (const row of doc.rows) expect(html).toContain(row.cells[1])
    for (const col of doc.columns) expect(html).toContain(col)
  })
})

describe('schet sample: fictional data only', () => {
  const everything = JSON.stringify([SAMPLE_SUPPLIER, SAMPLE_BUYER, buildSchetSampleDoc(), SAMPLE_ROWS])

  it('uses obviously fake identifiers', () => {
    expect(SAMPLE_SUPPLIER.bin).toMatch(/^0{12}$/)
    expect(SAMPLE_BUYER.bin).toMatch(/^0{11}1$/)
    expect(SAMPLE_SUPPLIER.iik).toMatch(/^KZ0{18}$/)
    expect(SAMPLE_SUPPLIER.iik).toHaveLength(20)
    expect(SAMPLE_SUPPLIER.bik).toHaveLength(8)
    expect(SAMPLE_SUPPLIER.name).toMatch(/Пример/)
    expect(SAMPLE_BUYER.name).toMatch(/Образец/)
  })

  it('never reuses a real bank BIK or any other real 12-digit number', () => {
    for (const b of KAZAKHSTAN_BANKS) expect(everything).not.toContain(b.bik)
    // Единственные 12-значные числа — нулевые БИН.
    const twelve = everything.match(/\d{12}/g) ?? []
    for (const n of twelve) expect(n).toMatch(/^0{11}[01]$/)
  })
})

describe('schet sample: copy on every language', () => {
  it('defines identical keys and non-empty strings for ru, kk and en', () => {
    const keys = Object.keys(schetSampleCopy.ru).sort()
    for (const lang of TOOL_LANGS) {
      const c = schetSampleCopy[lang]
      expect(Object.keys(c).sort()).toEqual(keys)
      for (const [k, v] of Object.entries(c)) {
        if (Array.isArray(v)) {
          expect(v.length, `${lang}.${k}`).toBe(schetSampleCopy.ru.points.length)
          for (const item of v) expect(item.trim(), `${lang}.${k}`).not.toBe('')
        } else {
          expect((v as string).trim(), `${lang}.${k}`).not.toBe('')
        }
      }
    }
    expect(schetSampleCopy.ru.points.length).toBeGreaterThanOrEqual(3)
    expect(schetSampleCopy.ru.points.length).toBeLessThanOrEqual(4)
  })

  it('labels the card as an example in each language', () => {
    expect(schetSampleCopy.ru.ribbon).toBe('Пример')
    expect(schetSampleCopy.kk.ribbon).toBe('Мысал')
    expect(schetSampleCopy.en.ribbon).toBe('Example')
  })

  it('keeps en free of Cyrillic and kk free of Russian abbreviations', () => {
    expect(JSON.stringify(schetSampleCopy.en)).not.toMatch(/[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/)
    expect(JSON.stringify(schetSampleCopy.kk)).not.toMatch(RU_ABBR_ON_KK)
    expect(JSON.stringify(schetSampleCopy.kk)).toMatch(/БСН/)
  })

  it('says the data is fictional and that the form is Russian on kk/en', () => {
    expect(schetSampleCopy.ru.caption).toMatch(/вымышленн/)
    expect(schetSampleCopy.kk.caption).toMatch(/орыс тілінде/)
    expect(schetSampleCopy.en.caption).toMatch(/in Russian/)
  })

  it('points to the requisites guide (kk has its own, en falls back to ru)', () => {
    expect(schetGuidePath('ru')).toBe('/guides/kak-vystavit-schet-ip')
    expect(schetGuidePath('kk')).toBe('/guides/kk/kak-vystavit-schet-ip')
    expect(schetGuidePath('en')).toBe('/guides/kak-vystavit-schet-ip')
  })
})

describe('ToolSample renders into server HTML', () => {
  for (const lang of TOOL_LANGS) {
    it(`${lang}: real text, ribbon, scroll wrapper and guide link, no hidden attribute`, () => {
      const html = renderToStaticMarkup(
        createElement(ToolSample, {
          idPrefix: 'sc-sample',
          copy: schetSampleCopy[lang],
          doc: buildSchetSampleDoc(),
          guide: { href: schetGuidePath(lang), label: schetDict[lang].guideLink },
        }),
      )
      const c = schetSampleCopy[lang]
      expect(html).toContain(c.heading)
      expect(html).toContain(c.ribbon)
      expect(html).toContain(c.intro)
      for (const p of c.points) expect(html).toContain(p)
      expect(html).toContain('<table')
      expect(html).toContain(`href="${schetGuidePath(lang)}"`)
      expect(html).toContain('overflow-x-auto')
      expect(html).toContain('role="region"')
      expect(html).toContain('lang="ru"')
      expect(html).toContain(SAMPLE_TOTAL_WORDS)
      expect(html).toContain('Образец платежного поручения')
      expect(html).not.toMatch(/\shidden[\s=>]/)
      expect(html).not.toContain('<img')
      // Цвета — только переменные темы.
      expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(html).not.toMatch(/rgba?\(/)
    })
  }
})
