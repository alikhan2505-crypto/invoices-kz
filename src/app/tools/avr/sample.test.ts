import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// buildAVRHtml тянет imageResize (Image/canvas, в node нет); картинок в образце
// нет, подмена нужна только чтобы модуль загрузился.
vi.mock('@/lib/imageResize', () => ({ resizeToFit: async (url: string) => url }))

import { buildAVRHtml } from '@/lib/generateAVR'
import { KAZAKHSTAN_BANKS } from '@/lib/kazakhstanBanks'
import { TOOL_LANGS } from '@/lib/tools-i18n'
import { formatSampleMoney } from '@/lib/tools-i18n/toolSample'
import ToolSample from '@/components/tools/ToolSample'
import AvrSample, { AvrSampleLink } from './AvrSample'
import { documentRows } from './calc'
import { avrDict } from './dict'
import {
  AVR_GUIDE_SLUG, avrGuidePath, avrSampleAnchorLabel, avrSampleCopy, buildAvrSampleDoc, SAMPLE_ANCHOR_ID, SAMPLE_CONTRACT_DATE,
  SAMPLE_CONTRACT_NUMBER, SAMPLE_CUSTOMER, SAMPLE_DATE, SAMPLE_EXECUTOR, SAMPLE_NUMBER, SAMPLE_ROWS, SAMPLE_TOTAL, SAMPLE_VAT_IF_PAYER,
  SAMPLE_TOTAL_WORDS, SAMPLE_VAT_TYPE,
} from './sample'

const L = 'A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі'
const RU_ABBR_ON_KK = new RegExp(`(?<![${L}])(БИН|ИИН|НДС|ИП|ТОО|АВР|КП|КГД|ЭСФ|БИК|ИИК|КНП)(?![${L}])`)

// Те же данные, что идут в бланк, но через настоящий генератор акта.
function realHtml(vatType: 'no_vat' | 'vat_16' = 'no_vat') {
  const e = SAMPLE_EXECUTOR
  const c = SAMPLE_CUSTOMER
  const html = buildAVRHtml({
    number: SAMPLE_NUMBER,
    date: SAMPLE_DATE,
    contractNumber: SAMPLE_CONTRACT_NUMBER,
    contractDate: SAMPLE_CONTRACT_DATE,
    clientName: c.name,
    clientBin: c.bin,
    clientAddress: c.address,
    services: documentRows(SAMPLE_ROWS),
    total: SAMPLE_TOTAL,
    vatType,
    profile: { company_name: e.name, bin_iin: e.bin, address: e.address, director_name: e.director },
  })
  expect(html).not.toBeNull()
  return html as string
}

describe('avr sample: arithmetic', () => {
  it('recomputes the total from the rows independently of calc.ts', () => {
    const byHand = SAMPLE_ROWS.reduce((s, r) => s + Number(r.qty) * Number(r.price), 0)
    expect(byHand).toBe(120000 * 1 + 8 * 5000)
    expect(byHand).toBe(160000)
    expect(SAMPLE_TOTAL).toBe(byHand)
  })

  it('shows the form default: no VAT, so there is no tax line under the total', () => {
    expect(SAMPLE_VAT_TYPE).toBe('no_vat')
    const doc = buildAvrSampleDoc()
    expect(doc.totals).toEqual([{ label: 'Итого', value: formatSampleMoney(160000) }])
    expect(JSON.stringify(doc)).not.toMatch(/НДС/)
  })

  it('extracts 16% VAT for a payer as total - total / 1.16 (= total * 16 / 116), not 16% on top', () => {
    expect(SAMPLE_VAT_IF_PAYER).toBe(Math.round(SAMPLE_TOTAL - SAMPLE_TOTAL / 1.16))
    expect(SAMPLE_VAT_IF_PAYER).toBe(Math.round((SAMPLE_TOTAL * 16) / 116))
    expect(SAMPLE_VAT_IF_PAYER).toBe(22069)
    expect(SAMPLE_VAT_IF_PAYER).toBeLessThan(SAMPLE_TOTAL * 0.16)
  })

  it('has line amounts in the table that add up to the total shown', () => {
    const rows = documentRows(SAMPLE_ROWS)
    expect(rows).toHaveLength(2)
    expect(rows.reduce((s, r) => s + r.qty * r.price, 0)).toBe(SAMPLE_TOTAL)
    const doc = buildAvrSampleDoc()
    expect(doc.rows).toHaveLength(2)
    expect(doc.rows[0].cells).toEqual([
      '1', 'Консультационные услуги по бухгалтерскому учёту', SAMPLE_DATE, '—', 'услуга', '1', formatSampleMoney(120000), formatSampleMoney(120000),
    ])
    expect(doc.rows[1].cells).toEqual([
      '2', 'Обучение сотрудников работе с отчётностью', SAMPLE_DATE, '—', 'час', '8', formatSampleMoney(5000), formatSampleMoney(8 * 5000),
    ])
    for (const row of doc.rows) expect(row.cells).toHaveLength(doc.columns.length)
    // Сумма по строкам в таблице = итог под таблицей.
    const parse = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'))
    expect(doc.rows.reduce((s, r) => s + parse(r.cells[7]), 0)).toBe(parse(doc.totals[0].value))
  })

  it('formats money like the generator: spaces and a decimal comma', () => {
    expect(formatSampleMoney(160000).replace(/\s/g, ' ')).toBe('160 000,00')
    expect(formatSampleMoney(22069).replace(/\s/g, ' ')).toBe('22 069,00')
  })
})

describe('avr sample: matches what the real generator prints', () => {
  it('prints the same header, parties, contract, columns, rows and total', () => {
    const html = realHtml()
    const doc = buildAvrSampleDoc()
    for (const part of ['Приложение 50', 'от 20 декабря 2012 года № 562', 'Форма Р-1']) {
      expect(html).toContain(part)
      expect(doc.bankCaption).toContain(part)
    }
    expect(html).toContain(doc.title)
    expect(html).toContain(`${SAMPLE_CUSTOMER.name}, ${SAMPLE_CUSTOMER.address}`)
    expect(html).toContain(`${SAMPLE_EXECUTOR.name}, ${SAMPLE_EXECUTOR.address}`)
    expect(html).toContain(SAMPLE_CUSTOMER.bin)
    expect(html).toContain(SAMPLE_EXECUTOR.bin)
    for (const p of doc.parties) expect(p.label).toMatch(/^(Заказчик|Исполнитель)$/)
    for (const label of ['Заказчик', 'Исполнитель', 'Договор', 'Номер', 'Дата']) expect(html).toContain(label)
    expect(html).toContain(`№${SAMPLE_CONTRACT_NUMBER} от ${SAMPLE_CONTRACT_DATE} года`)
    expect(doc.bankRows[0][0].value).toBe(`№${SAMPLE_CONTRACT_NUMBER} от ${SAMPLE_CONTRACT_DATE} года`)
    for (const col of ['Наименование работ (услуг)', 'Дата выполнения работ', 'Сведения об отчёте', 'Единица измерения', 'количество', 'цена за единицу', 'стоимость']) {
      expect(html.toLowerCase()).toContain(col.toLowerCase())
    }
    expect(doc.columns).toHaveLength(8)
    for (const row of doc.rows) {
      expect(html).toContain(row.cells[1])
      expect(html).toContain(row.cells[7])
      expect(html).toContain(row.cells[6])
    }
    expect(html).toContain(formatSampleMoney(SAMPLE_TOTAL))
    expect(html).toContain('Итого')
    expect(html).toContain(SAMPLE_EXECUTOR.director)
  })

  it('prints the total in words under the table, same string as the sample', () => {
    const html = realHtml()
    expect(SAMPLE_TOTAL_WORDS).toBe('сто шестьдесят тысяч тенге 00 тиын')
    expect(html).toContain(`Всего оказано услуг на сумму: <u>${SAMPLE_TOTAL_WORDS}</u>`)
    expect(buildAvrSampleDoc().summaryLines[0]).toBe(`Всего оказано услуг на сумму: ${SAMPLE_TOTAL_WORDS}`)
  })

  it('prints the footer lines and both signature blocks that the sample shows', () => {
    const html = realHtml()
    const doc = buildAvrSampleDoc()
    // В генераторе в этой строке опечатка («заказчик___»), в образце слово дописано.
    expect(html).toContain('Сведения об использовании запасов, полученных от заказчик')
    expect(doc.summaryLines[1]).toContain('Сведения об использовании запасов, полученных от заказчика')
    expect(html).toContain('Приложение: Перечень документации, в том числе отчёт(ы) о маркетинговых, научных исследованиях, консультационных и прочих услугах (обязательны при их наличии) на _____ страниц')
    expect(doc.summaryLines[2]).toContain('Приложение: Перечень документации, в том числе отчёт(ы) о маркетинговых, научных исследованиях, консультационных и прочих услугах (обязательны при их наличии) на _____ страниц')
    for (const part of ['Принял (Заказчик)', 'должность', 'подпись', 'расшифровка подписи', 'М.П.', 'Дата подписания (принятия) работ (услуг):']) {
      expect(html).toContain(part)
      expect(doc.summaryLines[3]).toContain(part)
    }
    expect(html).toContain(doc.signatureLabel)
  })

  it('has no VAT line without VAT (the default) and the same VAT amount as the generator when the payer picks 16%', () => {
    expect(realHtml('no_vat')).not.toContain('В том числе НДС')
    const withVat = realHtml('vat_16')
    expect(withVat).toContain('В том числе НДС 16%:')
    expect(withVat).toContain(formatSampleMoney(SAMPLE_VAT_IF_PAYER))
  })
})

describe('avr sample: fictional data only', () => {
  const everything = JSON.stringify([SAMPLE_EXECUTOR, SAMPLE_CUSTOMER, buildAvrSampleDoc(), SAMPLE_ROWS])

  it('uses obviously fake identifiers', () => {
    expect(SAMPLE_EXECUTOR.bin).toMatch(/^0{12}$/)
    expect(SAMPLE_CUSTOMER.bin).toMatch(/^0{11}1$/)
    expect(SAMPLE_EXECUTOR.name).toMatch(/Пример/)
    expect(SAMPLE_CUSTOMER.name).toMatch(/Образец/)
    expect(SAMPLE_EXECUTOR.address).toMatch(/Пример/)
    expect(SAMPLE_CUSTOMER.address).toMatch(/Пример/)
  })

  it('never reuses a real bank BIK or any other real 12-digit number, and shows no phone or email', () => {
    for (const b of KAZAKHSTAN_BANKS) expect(everything).not.toContain(b.bik)
    const twelve = everything.match(/\d{12}/g) ?? []
    for (const n of twelve) expect(n).toMatch(/^0{11}[01]$/)
    expect(everything).not.toMatch(/@|\+7|тел:|8\s?\(?\d{3}/)
  })
})

describe('avr sample: copy on every language', () => {
  it('defines identical keys and non-empty strings for ru, kk and en', () => {
    const keys = Object.keys(avrSampleCopy.ru).sort()
    for (const lang of TOOL_LANGS) {
      const c = avrSampleCopy[lang]
      expect(Object.keys(c).sort()).toEqual(keys)
      for (const [k, v] of Object.entries(c)) {
        if (Array.isArray(v)) {
          expect(v.length, `${lang}.${k}`).toBe(avrSampleCopy.ru.points.length)
          for (const item of v) expect(item.trim(), `${lang}.${k}`).not.toBe('')
        } else {
          expect((v as string).trim(), `${lang}.${k}`).not.toBe('')
        }
      }
    }
    expect(avrSampleCopy.ru.points.length).toBeGreaterThanOrEqual(3)
    expect(avrSampleCopy.ru.points.length).toBeLessThanOrEqual(4)
  })

  it('labels the card as an example in each language', () => {
    expect(avrSampleCopy.ru.ribbon).toBe('Пример')
    expect(avrSampleCopy.kk.ribbon).toBe('Мысал')
    expect(avrSampleCopy.en.ribbon).toBe('Example')
  })

  it('keeps en free of Cyrillic and kk free of Russian abbreviations, with the tool dictionary terms', () => {
    expect(JSON.stringify(avrSampleCopy.en)).not.toMatch(/[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/)
    const kk = JSON.stringify(avrSampleCopy.kk)
    expect(kk).not.toMatch(RU_ABBR_ON_KK)
    expect(kk).not.toMatch(/выполненн|оказанн/i)
    expect(kk).toMatch(/БСН/)
    expect(kk).toMatch(/ҚҚС/)
    expect(kk).toMatch(/ОЖА/)
    expect(kk).toMatch(/Орындалған жұмыстар/)
    expect(kk).toMatch(/тапсырыс беруші/i)
    expect(avrSampleCopy.kk.points[2]).toContain(avrDict.kk.vatOptions.vat_16)
    expect(avrSampleCopy.en.points[2]).toContain(avrDict.en.vatOptions.vat_16)
    expect(avrSampleCopy.ru.points[2]).toContain(avrDict.ru.vatOptions.vat_16)
  })

  it('says the data is fictional and that the form is Russian on kk/en', () => {
    expect(avrSampleCopy.ru.caption).toMatch(/вымышленн/)
    expect(avrSampleCopy.kk.caption).toMatch(/орыс тілінде/)
    expect(avrSampleCopy.en.caption).toMatch(/in Russian/)
  })

  it('no longer hides the amount in words: the generator prints it, so the copy may mention it', () => {
    expect(avrSampleCopy.ru.intro).toMatch(/прописью/)
    expect(avrSampleCopy.ru.points[2]).toMatch(/прописью/)
  })

  it('points to the documents guide (kk has its own, en falls back to ru)', () => {
    expect(AVR_GUIDE_SLUG).toBe('dokumenty-ip-kazakhstan')
    expect(avrGuidePath('ru')).toBe('/guides/dokumenty-ip-kazakhstan')
    expect(avrGuidePath('kk')).toBe('/guides/kk/dokumenty-ip-kazakhstan')
    expect(avrGuidePath('en')).toBe('/guides/dokumenty-ip-kazakhstan')
  })
})

describe('ToolSample renders the avr sample into server HTML', () => {
  for (const lang of TOOL_LANGS) {
    it(`${lang}: real text, ribbon, scroll wrapper and guide link, no hidden attribute`, () => {
      const html = renderToStaticMarkup(
        createElement(ToolSample, {
          idPrefix: 'avr-sample',
          copy: avrSampleCopy[lang],
          doc: buildAvrSampleDoc(),
          guide: { href: avrGuidePath(lang), label: avrDict[lang].guideLink },
        }),
      )
      const c = avrSampleCopy[lang]
      expect(html).toContain(c.heading)
      expect(html).toContain(c.ribbon)
      expect(html).toContain('<table')
      expect(html).toContain(`href="${avrGuidePath(lang)}"`)
      expect(html).toContain(avrDict[lang].guideLink)
      expect(html).toContain('overflow-x-auto')
      expect(html).toContain('role="region"')
      expect(html).toContain('lang="ru"')
      expect(html).toContain('АКТ ВЫПОЛНЕННЫХ РАБОТ (ОКАЗАННЫХ УСЛУГ)')
      expect(html).toContain('Форма Р-1')
      expect(html).toContain('Консультационные услуги по бухгалтерскому учёту')
      expect(html).toContain('<th scope="col"')
      expect(html).toContain(SAMPLE_CUSTOMER.bin)
      expect(html).not.toMatch(/\shidden[\s=>]/)
      expect(html).not.toContain('<img')
      // Цвета — только переменные темы.
      expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(html).not.toMatch(/rgba?\(/)
    })
  }

  it('renders the intro, every bullet and the caption as real text on every language (HTML-escaped)', () => {
    for (const lang of TOOL_LANGS) {
      const html = renderToStaticMarkup(createElement(AvrSample, { lang }))
      const c = avrSampleCopy[lang]
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
      expect(html, `${lang} intro`).toContain(esc(c.intro))
      for (const p of c.points) expect(html, `${lang} point`).toContain(esc(p))
      expect(html).toContain(esc(c.caption))
    }
  })
})

describe('avr sample anchor link above the form', () => {
  it('defines the anchor text on every language', () => {
    expect(avrSampleAnchorLabel.ru).toBe('Смотреть образец акта ↓')
    expect(avrSampleAnchorLabel.kk).toBe('Акт үлгісін көру ↓')
    expect(avrSampleAnchorLabel.en).toBe('See the sample act ↓')
    for (const lang of TOOL_LANGS) expect(avrSampleAnchorLabel[lang].trim()).not.toBe('')
  })

  for (const lang of TOOL_LANGS) {
    it(`${lang}: link href matches an existing id in the rendered sample, plain server <a>`, () => {
      const link = renderToStaticMarkup(createElement(AvrSampleLink, { lang }))
      const sample = renderToStaticMarkup(createElement(AvrSample, { lang }))
      expect(SAMPLE_ANCHOR_ID).toBe('obrazec')
      expect(link).toContain(`<a href="#${SAMPLE_ANCHOR_ID}"`)
      expect(link).toContain(avrSampleAnchorLabel[lang])
      expect(sample).toContain(`<section id="${SAMPLE_ANCHOR_ID}"`)
      // Ровно один такой id в блоке, цвета — из переменных темы, tabindex у ссылки нет.
      expect(sample.match(new RegExp(`id="${SAMPLE_ANCHOR_ID}"`, 'g'))).toHaveLength(1)
      expect(link).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(link).not.toContain('tabindex')
    })
  }
})
