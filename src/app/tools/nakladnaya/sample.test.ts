import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// generateNakladnaya тянет imageResize (Image/canvas, в node нет); картинок в
// образце нет, подмена нужна только чтобы модуль загрузился.
vi.mock('@/lib/imageResize', () => ({ resizeToFit: async (url: string) => url }))

import { buildNakladnayaHtml } from '@/lib/generateNakladnaya'
import { TOOL_LANGS, toolGuidePath } from '@/lib/tools-i18n'
import { formatSampleMoney } from '@/lib/tools-i18n/toolSample'
import ToolSample from '@/components/tools/ToolSample'
import NakladnayaSample, { NakladnayaSampleLink, NAKLADNAYA_GUIDE_SLUG } from './NakladnayaSample'
import { documentRows } from './calc'
import { nakladnayaDict } from './dict'
import {
  buildNakladnayaSampleDoc, lineVat, nakladnayaSampleAnchorLabel, nakladnayaSampleCopy, SAMPLE_ANCHOR_ID, SAMPLE_BUYER, SAMPLE_COUNT_WORDS,
  SAMPLE_DATE, SAMPLE_NUMBER, SAMPLE_ROWS, SAMPLE_SUPPLIER, SAMPLE_TOTAL, SAMPLE_TOTAL_WORDS, SAMPLE_VAT, SAMPLE_VAT_RATE, SAMPLE_VAT_TYPE,
} from './sample'

const L = 'A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі'
const RU_ABBR_ON_KK = new RegExp(`(?<![${L}])(БИН|ИИН|НДС|ИП|ТОО|АВР|КП|КГД|ЭСФ|БИК|ИИК|КНП)(?![${L}])`)

describe('nakladnaya sample: arithmetic', () => {
  it('recomputes the total from the rows independently of calc.ts', () => {
    const byHand = SAMPLE_ROWS.reduce((s, r) => s + Number(r.qty) * Number(r.price), 0)
    expect(byHand).toBe(12 * 2450 + 2 * 27800)
    expect(byHand).toBe(85000)
    expect(SAMPLE_TOTAL).toBe(byHand)
  })

  it('extracts 16% VAT from the total (prices include VAT): total * 16 / 116', () => {
    expect(SAMPLE_VAT_TYPE).toBe('vat_16')
    expect(SAMPLE_VAT_RATE).toBe(16)
    expect(SAMPLE_VAT).toBe(Math.round((SAMPLE_TOTAL * 16) / 116))
    expect(SAMPLE_VAT).toBe(11724)
    // Не «добавили 16% сверху»: НДС меньше 16% от итога.
    expect(SAMPLE_VAT).toBeLessThan(SAMPLE_TOTAL * 0.16)
  })

  it('has line amounts and line VAT in the table that add up to the totals shown', () => {
    const rows = documentRows(SAMPLE_ROWS)
    expect(rows).toHaveLength(2)
    expect(rows.reduce((s, r) => s + r.qty * r.price, 0)).toBe(SAMPLE_TOTAL)
    const doc = buildNakladnayaSampleDoc()
    // 2 товара + строка «Итого»
    expect(doc.rows).toHaveLength(3)
    expect(doc.rows[0].cells).toEqual([
      '1', 'Бумага офисная А4, 500 листов', '1', 'упак.', '12', '12',
      formatSampleMoney(2450), formatSampleMoney(29400), formatSampleMoney(4055),
    ])
    expect(doc.rows[1].cells).toEqual([
      '2', 'Картридж для лазерного принтера', '2', 'шт', '2', '2',
      formatSampleMoney(27800), formatSampleMoney(55600), formatSampleMoney(7669),
    ])
    expect(lineVat(29400) + lineVat(55600)).toBe(SAMPLE_VAT)
    expect(doc.rows[2].cells).toEqual(['', 'Итого', '', '', 'x', 'x', 'x', formatSampleMoney(85000), formatSampleMoney(11724)])
    for (const row of doc.rows) expect(row.cells).toHaveLength(doc.columns.length)
    expect(doc.columns).toHaveLength(9)
    expect(doc.summaryLines[0]).toBe(`Всего отпущено количество запасов (прописью): ${SAMPLE_COUNT_WORDS}`)
  })

  it('formats money like the generator: spaces and a decimal comma', () => {
    expect(formatSampleMoney(85000).replace(/\s/g, ' ')).toBe('85 000,00')
    expect(formatSampleMoney(11724).replace(/\s/g, ' ')).toBe('11 724,00')
  })
})

describe('nakladnaya sample: matches what generateNakladnaya really prints', () => {
  const s = SAMPLE_SUPPLIER
  const html = buildNakladnayaHtml({
    number: SAMPLE_NUMBER,
    date: SAMPLE_DATE,
    clientName: SAMPLE_BUYER.name,
    clientBin: SAMPLE_BUYER.bin,
    services: documentRows(SAMPLE_ROWS).map(r => ({ ...r, type: 'product' as const })),
    total: SAMPLE_TOTAL,
    vatType: SAMPLE_VAT_TYPE,
    profile: { company_name: s.name, bin_iin: s.bin, address: s.address, director_name: s.director },
  }) as string

  it('builds a document at all', () => {
    expect(html).not.toBeNull()
  })

  it('prints the same title, amount in words, count in words and signature', () => {
    const doc = buildNakladnayaSampleDoc()
    expect(html).toContain(doc.title)
    expect(html).toContain(`<u>${SAMPLE_TOTAL_WORDS}</u>`)
    expect(html).toContain(`<u>${SAMPLE_COUNT_WORDS}</u>`)
    expect(html).toContain('Всего отпущено количество запасов (прописью)')
    expect(html).toContain('на сумму (прописью), в KZT')
    // Шапка формы у генератора разбита <br> по строкам; в образце она в одну строку.
    const caption = doc.bankCaption.replace('. Форма З-2', '')
    expect(caption).toBe('Приложение 26 к приказу Министра финансов Республики Казахстан от 20 декабря 2012 года № 562')
    for (const part of ['Приложение 26', 'к приказу Министра финансов', 'Республики Казахстан', 'от 20 декабря 2012 года № 562']) {
      expect(html).toContain(part)
      expect(caption).toContain(part)
    }
    expect(html).toContain('<strong>Форма З-2</strong>')
    expect(html).toContain(doc.signatureLabel)
    expect(html).toContain(s.director)
    expect(html).toContain(doc.bankRows[0][0].label)
  })

  it('prints every number the sample shows, row by row', () => {
    const doc = buildNakladnayaSampleDoc()
    for (const row of doc.rows) {
      for (const cell of row.cells) if (cell && cell !== 'x') expect(html).toContain(`>${cell}<`)
    }
    expect(html).toContain(`>${formatSampleMoney(SAMPLE_TOTAL)}<`)
    expect(html).toContain(`>${formatSampleMoney(SAMPLE_VAT)}<`)
  })

  it('prints the sender, recipient, number, date and the headers of the goods table', () => {
    const doc = buildNakladnayaSampleDoc()
    expect(html).toContain(`БИН: ${s.bin}`)
    expect(html).toContain(`БИН: ${SAMPLE_BUYER.bin}`)
    expect(html).toContain(SAMPLE_BUYER.name)
    expect(html).toContain(`>${SAMPLE_NUMBER}<`)
    expect(html).toContain(SAMPLE_DATE)
    // Два столбца «Количество» у генератора — подзаголовки, в образце они плоские
    // («Кол-во, …»); слово «Номенкла-турный» у генератора с переносом.
    const generatorHeaders = [
      'Наименование, характеристика', 'Номенкла-турный номер', 'Единица измерения', 'подлежит отпуску', 'отпущено',
      'Цена за единицу, в KZT', 'Сумма с НДС, в KZT', 'Сумма НДС, в KZT',
    ]
    for (const h of generatorHeaders) expect(html).toContain(h)
    for (const c of ['Наименование, характеристика', 'Цена за единицу, в KZT', 'Сумма с НДС, в KZT', 'Сумма НДС, в KZT', 'Единица измерения', 'Номенкла-турный номер']) {
      expect(doc.columns).toContain(c)
    }
    expect(doc.columns.some(c => c.endsWith('подлежит отпуску'))).toBe(true)
    expect(doc.columns.some(c => c.endsWith('отпущено'))).toBe(true)
  })

  it('the amount in words is grammatical (generator declines only 1-9 thousand correctly)', () => {
    expect(SAMPLE_TOTAL_WORDS).not.toMatch(/(один|два|три|четыре) тысяч/)
  })
})

describe('nakladnaya sample: fictional data only', () => {
  const everything = JSON.stringify([SAMPLE_SUPPLIER, SAMPLE_BUYER, buildNakladnayaSampleDoc(), SAMPLE_ROWS])

  it('uses obviously fake identifiers', () => {
    expect(SAMPLE_SUPPLIER.bin).toMatch(/^0{12}$/)
    expect(SAMPLE_BUYER.bin).toMatch(/^0{11}1$/)
    expect(SAMPLE_SUPPLIER.name).toMatch(/Пример/)
    expect(SAMPLE_BUYER.name).toMatch(/Образец/)
  })

  it('has no other 12-digit number, IBAN, phone or email', () => {
    // Единственные 12-значные числа — нулевые БИН.
    const twelve = everything.match(/\d{12}/g) ?? []
    for (const n of twelve) expect(n).toMatch(/^0{11}[01]$/)
    expect(everything).not.toMatch(/KZ\d{2}/)
    expect(everything).not.toMatch(/\+?7[\s(-]*\d{3}[\s)-]*\d{3}/)
    expect(everything).not.toMatch(/@/)
  })
})

describe('nakladnaya sample: copy on every language', () => {
  it('defines identical keys and non-empty strings for ru, kk and en', () => {
    const keys = Object.keys(nakladnayaSampleCopy.ru).sort()
    for (const lang of TOOL_LANGS) {
      const c = nakladnayaSampleCopy[lang]
      expect(Object.keys(c).sort()).toEqual(keys)
      for (const [k, v] of Object.entries(c)) {
        if (Array.isArray(v)) {
          expect(v.length, `${lang}.${k}`).toBe(nakladnayaSampleCopy.ru.points.length)
          for (const item of v) expect(item.trim(), `${lang}.${k}`).not.toBe('')
        } else {
          expect((v as string).trim(), `${lang}.${k}`).not.toBe('')
        }
      }
    }
    expect(nakladnayaSampleCopy.ru.points.length).toBeGreaterThanOrEqual(3)
    expect(nakladnayaSampleCopy.ru.points.length).toBeLessThanOrEqual(4)
  })

  it('labels the card as an example in each language', () => {
    expect(nakladnayaSampleCopy.ru.ribbon).toBe('Пример')
    expect(nakladnayaSampleCopy.kk.ribbon).toBe('Мысал')
    expect(nakladnayaSampleCopy.en.ribbon).toBe('Example')
  })

  it('keeps en free of Cyrillic and kk free of Russian abbreviations', () => {
    expect(JSON.stringify(nakladnayaSampleCopy.en)).not.toMatch(/[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/)
    expect(JSON.stringify(nakladnayaSampleCopy.kk)).not.toMatch(RU_ABBR_ON_KK)
    expect(JSON.stringify(nakladnayaSampleCopy.kk)).toMatch(/БСН/)
  })

  it('says the data is fictional and that the form is Russian on kk/en', () => {
    expect(nakladnayaSampleCopy.ru.caption).toMatch(/вымышленн/)
    expect(nakladnayaSampleCopy.kk.caption).toMatch(/орыс тілінде/)
    expect(nakladnayaSampleCopy.en.caption).toMatch(/in Russian/)
  })

  it('uses the kk word of the tool dictionary for the waybill', () => {
    expect(nakladnayaDict.kk.docTitle).toBe('Жүкқұжат')
    expect(nakladnayaSampleAnchorLabel.kk.startsWith(nakladnayaDict.kk.docTitle)).toBe(true)
    expect(nakladnayaSampleCopy.kk.heading).toMatch(/жүкқұжат/)
  })

  it('only restates facts the tool page already gives (16/116, both sides sign, optional recipient BIN)', () => {
    const faq = nakladnayaDict.ru.faq.map(f => f.a).join(' ')
    expect(faq).toContain('итог × 16 / 116')
    expect(faq).toContain('её подписывают обе стороны')
    expect(nakladnayaDict.ru.errors.clientBin).toContain('или оставьте пустым')
    expect(nakladnayaSampleCopy.ru.points.join(' ')).toContain('итог × 16 / 116')
    expect(nakladnayaSampleCopy.ru.points.join(' ')).toContain('обе стороны')
  })

  it('points to the documents guide (kk has its own, en falls back to ru) with the tool guide label', () => {
    expect(NAKLADNAYA_GUIDE_SLUG).toBe('dokumenty-ip-kazakhstan')
    expect(toolGuidePath(NAKLADNAYA_GUIDE_SLUG, 'ru')).toBe('/guides/dokumenty-ip-kazakhstan')
    expect(toolGuidePath(NAKLADNAYA_GUIDE_SLUG, 'kk')).toBe('/guides/kk/dokumenty-ip-kazakhstan')
    expect(toolGuidePath(NAKLADNAYA_GUIDE_SLUG, 'en')).toBe('/guides/dokumenty-ip-kazakhstan')
  })
})

describe('ToolSample renders the waybill into server HTML', () => {
  for (const lang of TOOL_LANGS) {
    it(`${lang}: real text, ribbon, scroll wrapper and guide link, no hidden attribute`, () => {
      const html = renderToStaticMarkup(createElement(NakladnayaSample, { lang }))
      const c = nakladnayaSampleCopy[lang]
      expect(html).toContain(c.heading)
      expect(html).toContain(c.ribbon)
      expect(html).toContain(c.intro)
      for (const p of c.points) expect(html).toContain(p)
      expect(html).toContain('<table')
      expect(html).toContain(`href="${toolGuidePath(NAKLADNAYA_GUIDE_SLUG, lang)}"`)
      expect(html).toContain(nakladnayaDict[lang].guideLink)
      expect(html).toContain('overflow-x-auto')
      expect(html).toContain('role="region"')
      expect(html).toContain('lang="ru"')
      expect(html).toContain(SAMPLE_TOTAL_WORDS)
      expect(html).toContain('НАКЛАДНАЯ НА ОТПУСК ЗАПАСОВ НА СТОРОНУ')
      expect(html).toContain('Бумага офисная А4, 500 листов')
      expect(html).toContain('Картридж для лазерного принтера')
      expect(html).toContain('Отпуск разрешил')
      expect(html).toContain(formatSampleMoney(SAMPLE_TOTAL))
      expect(html).not.toMatch(/\shidden[\s=>]/)
      expect(html).not.toContain('<img')
      // Цвета — только переменные темы.
      expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(html).not.toMatch(/rgba?\(/)
    })
  }

  it('renders a header cell for every column', () => {
    const doc = buildNakladnayaSampleDoc()
    const html = renderToStaticMarkup(createElement(ToolSample, { idPrefix: 'x', copy: nakladnayaSampleCopy.ru, doc }))
    expect((html.match(/<th /g) ?? []).length).toBe(doc.columns.length)
  })
})

describe('sample anchor link above the form', () => {
  it('defines the anchor text on every language', () => {
    expect(nakladnayaSampleAnchorLabel.ru).toBe('Смотреть образец накладной ↓')
    expect(nakladnayaSampleAnchorLabel.kk).toBe('Жүкқұжат үлгісін көру ↓')
    expect(nakladnayaSampleAnchorLabel.en).toBe('See the sample delivery note ↓')
    for (const lang of TOOL_LANGS) expect(nakladnayaSampleAnchorLabel[lang].trim()).not.toBe('')
  })

  for (const lang of TOOL_LANGS) {
    it(`${lang}: link href matches an existing id in the rendered sample, plain server <a>`, () => {
      const link = renderToStaticMarkup(createElement(NakladnayaSampleLink, { lang }))
      const sample = renderToStaticMarkup(createElement(NakladnayaSample, { lang }))
      expect(SAMPLE_ANCHOR_ID).toBe('obrazec')
      expect(link).toContain(`<a href="#${SAMPLE_ANCHOR_ID}"`)
      expect(link).toContain(nakladnayaSampleAnchorLabel[lang])
      expect(sample).toContain(`id="${SAMPLE_ANCHOR_ID}"`)
      // Один такой id на странице.
      expect(sample.match(new RegExp(`id="${SAMPLE_ANCHOR_ID}"`, 'g'))).toHaveLength(1)
      // Цвета только из переменных темы, без tabindex=-1 (ссылка фокусируется).
      expect(link).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(link).not.toContain('tabindex')
    })
  }
})
