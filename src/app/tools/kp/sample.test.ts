import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// generateKP тянет imageResize (Image/canvas, в node нет); картинок в образце
// нет, подмена нужна только чтобы модуль загрузился.
vi.mock('@/lib/imageResize', () => ({ resizeToFit: async (url: string) => url }))

import { buildKPHtml } from '@/lib/generateKP'
import { KAZAKHSTAN_BANKS } from '@/lib/kazakhstanBanks'
import { TOOL_LANGS } from '@/lib/tools-i18n'
import { formatSampleMoney } from '@/lib/tools-i18n/toolSample'
import ToolSample from '@/components/tools/ToolSample'
import KpSample, { KpSampleLink } from './KpSample'
import { kpLines } from './calc'
import { kpDict } from './dict'
import {
  buildKpSampleDoc, kpGuidePath, kpSampleAnchorLabel, kpSampleCopy, SAMPLE_ANCHOR_ID, SAMPLE_BUYER, SAMPLE_DATE, SAMPLE_NET, SAMPLE_NOTE,
  SAMPLE_NUMBER, SAMPLE_ROWS, SAMPLE_SUPPLIER, SAMPLE_TOTAL, SAMPLE_VALID_UNTIL, SAMPLE_VAT, SAMPLE_VAT_RATE,
} from './sample'

const L = 'A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі'
const RU_ABBR_ON_KK = new RegExp(`(?<![${L}])(БИН|ИИН|НДС|ИП|ТОО|АВР|КП|КГД|ЭСФ|БИК|ИИК|КНП)(?![${L}])`)
const tenge = (n: number) => `${formatSampleMoney(n)} ₸`

describe('kp sample: arithmetic', () => {
  it('recomputes the total from the rows independently of calc.ts', () => {
    const byHand = SAMPLE_ROWS.reduce((s, r) => s + Number(r.qty) * Number(r.price), 0)
    expect(byHand).toBe(175000)
    expect(SAMPLE_TOTAL).toBe(byHand)
  })

  it('splits 16% VAT out of a VAT-inclusive total the way generateKP does', () => {
    // 175000 / 1.16 = 150862,07 -> 150862; НДС = 175000 - 150862,07 = 24137,93 -> 24138.
    expect(SAMPLE_VAT_RATE).toBe(16)
    expect(SAMPLE_NET).toBe(Math.round(175000 / 1.16))
    expect(SAMPLE_NET).toBe(150862)
    expect(SAMPLE_VAT).toBe(Math.round(175000 - 175000 / 1.16))
    expect(SAMPLE_VAT).toBe(24138)
    expect(SAMPLE_NET + SAMPLE_VAT).toBe(SAMPLE_TOTAL)
    // Не «добавили 16% сверху»: НДС меньше 16% от итога.
    expect(SAMPLE_VAT).toBeLessThan(SAMPLE_TOTAL * 0.16)
  })

  it('has line amounts in the table that add up to the total shown', () => {
    const lines = kpLines(SAMPLE_ROWS)
    expect(lines).toHaveLength(2)
    expect(lines.reduce((s, l) => s + l.qty * l.price, 0)).toBe(SAMPLE_TOTAL)
    const doc = buildKpSampleDoc()
    expect(doc.rows).toHaveLength(2)
    expect(doc.rows[0].cells).toEqual(['1', 'Разработка логотипа и фирменного стиля', '1', 'услуга', tenge(150000), tenge(150000)])
    expect(doc.rows[1].cells).toEqual(['2', 'Визитки, печать 500 шт.', '2', 'упак.', tenge(12500), tenge(25000)])
    expect(doc.totals).toEqual([
      { label: 'Итого без НДС:', value: tenge(150862) },
      { label: 'НДС 16%:', value: tenge(24138) },
      { label: 'ИТОГО К ОПЛАТЕ:', value: tenge(175000) },
    ])
    for (const row of doc.rows) expect(row.cells).toHaveLength(doc.columns.length)
  })

  it('formats money like the generator: spaces and a decimal comma', () => {
    expect(formatSampleMoney(175000).replace(/\s/g, ' ')).toBe('175 000,00')
    expect(formatSampleMoney(24138).replace(/\s/g, ' ')).toBe('24 138,00')
  })

  it('shows a 30-day validity period, as the tool does by default', () => {
    const [d, m, y] = SAMPLE_DATE.split('.').map(Number)
    const end = new Date(Date.UTC(y, m - 1, d + 30))
    const p = (n: number) => String(n).padStart(2, '0')
    expect(`${p(end.getUTCDate())}.${p(end.getUTCMonth() + 1)}.${end.getUTCFullYear()}`).toBe(SAMPLE_VALID_UNTIL)
  })
})

describe('kp sample: matches what generateKP really prints', () => {
  it('prints the same header, parties, columns, rows, totals, note, signature and validity', () => {
    const s = SAMPLE_SUPPLIER
    const html = buildKPHtml({
      number: SAMPLE_NUMBER,
      date: SAMPLE_DATE,
      validUntil: SAMPLE_VALID_UNTIL,
      clientName: SAMPLE_BUYER.name,
      clientBin: SAMPLE_BUYER.bin,
      note: SAMPLE_NOTE,
      services: kpLines(SAMPLE_ROWS),
      total: SAMPLE_TOTAL,
      vatType: 'vat_16',
      profile: { company_name: s.name, bin_iin: s.bin, address: s.address, phone: s.phone, email: s.email, director_name: s.director },
    })
    const doc = buildKpSampleDoc()
    expect(html).toContain('КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ')
    expect(html).toContain(`№ ${SAMPLE_NUMBER}`)
    expect(html).toContain(`от ${SAMPLE_DATE}`)
    expect(doc.title).toBe(`Коммерческое предложение № ${SAMPLE_NUMBER} от ${SAMPLE_DATE}`)
    expect(html).toContain(`${tenge(SAMPLE_NET)}`)
    expect(html).toContain(tenge(SAMPLE_VAT))
    expect(html).toContain(tenge(SAMPLE_TOTAL))
    for (const t of doc.totals) expect(html).toContain(t.label)
    for (const col of doc.columns) expect(html).toContain(col)
    for (const row of doc.rows) for (const cell of row.cells.slice(1)) expect(html).toContain(cell)
    for (const p of doc.parties) expect(html).toContain(p.label)
    for (const v of [s.name, s.bin, s.address, s.phone, s.email, s.director, SAMPLE_BUYER.name, SAMPLE_BUYER.bin]) expect(html).toContain(v)
    expect(html).toContain('Примечание')
    expect(html).toContain(SAMPLE_NOTE)
    expect(html).toContain(doc.signatureLabel)
    expect(html).toContain('Дата составления')
    expect(html).toContain('Действителен до')
    expect(html).toContain(SAMPLE_VALID_UNTIL)
    // КП из инструмента печатается без банка и без колонки «Код» — образец тоже.
    expect(html).not.toContain('Банковские реквизиты')
    expect(html).not.toContain('>Код<')
    expect(JSON.stringify(doc)).not.toMatch(/Банк|ИИК|БИК|Код/)
  })
})

describe('kp sample: fictional data only', () => {
  const everything = JSON.stringify([SAMPLE_SUPPLIER, SAMPLE_BUYER, buildKpSampleDoc(), SAMPLE_ROWS, SAMPLE_NOTE])

  it('uses obviously fake identifiers', () => {
    expect(SAMPLE_SUPPLIER.bin).toMatch(/^0{12}$/)
    expect(SAMPLE_BUYER.bin).toMatch(/^0{11}1$/)
    expect(SAMPLE_SUPPLIER.phone).toMatch(/^\+7[ 0]+$/)
    expect(SAMPLE_SUPPLIER.email).toMatch(/@example\.com$/)
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

describe('kp sample: copy on every language', () => {
  it('defines identical keys and non-empty strings for ru, kk and en', () => {
    const keys = Object.keys(kpSampleCopy.ru).sort()
    for (const lang of TOOL_LANGS) {
      const c = kpSampleCopy[lang]
      expect(Object.keys(c).sort()).toEqual(keys)
      for (const [k, v] of Object.entries(c)) {
        if (Array.isArray(v)) {
          expect(v.length, `${lang}.${k}`).toBe(kpSampleCopy.ru.points.length)
          for (const item of v) expect(item.trim(), `${lang}.${k}`).not.toBe('')
        } else {
          expect((v as string).trim(), `${lang}.${k}`).not.toBe('')
        }
      }
    }
    expect(kpSampleCopy.ru.points.length).toBeGreaterThanOrEqual(3)
    expect(kpSampleCopy.ru.points.length).toBeLessThanOrEqual(4)
  })

  it('labels the card as an example in each language', () => {
    expect(kpSampleCopy.ru.ribbon).toBe('Пример')
    expect(kpSampleCopy.kk.ribbon).toBe('Мысал')
    expect(kpSampleCopy.en.ribbon).toBe('Example')
  })

  it('keeps en free of Cyrillic and kk free of Russian abbreviations', () => {
    expect(JSON.stringify(kpSampleCopy.en)).not.toMatch(/[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/)
    expect(JSON.stringify(kpSampleCopy.kk)).not.toMatch(RU_ABBR_ON_KK)
    expect(JSON.stringify(kpSampleCopy.kk)).toMatch(/БСН/)
    expect(JSON.stringify(kpSampleCopy.kk)).toMatch(/КҰ/)
    expect(JSON.stringify(kpSampleCopy.kk)).toMatch(/ҚҚС/)
  })

  it('says the data is fictional and that the form is Russian on kk/en', () => {
    expect(kpSampleCopy.ru.caption).toMatch(/вымышленн/)
    expect(kpSampleCopy.kk.caption).toMatch(/орыс тілінде/)
    expect(kpSampleCopy.en.caption).toMatch(/in Russian/)
  })

  it('states only what the tool page already says (30 days, VAT 16% label, stamp not required)', () => {
    // Те же формулировки, что в dict.ts: «Не указали — 30 дней», «С НДС 16%».
    expect(kpDict.ru.validHint).toMatch(/30/)
    expect(kpDict.ru.vat16).toBe('С НДС 16%')
    expect(kpSampleCopy.ru.points.join(' ')).toContain('30 дней')
    expect(kpSampleCopy.ru.points.join(' ')).toContain(`«${kpDict.ru.vat16}»`)
    expect(kpSampleCopy.kk.points.join(' ')).toContain(`«${kpDict.kk.vat16}»`)
    expect(kpSampleCopy.kk.points.join(' ')).toContain('30 күн')
    expect(kpSampleCopy.en.points.join(' ')).toContain(`“${kpDict.en.vat16}”`)
    expect(kpSampleCopy.en.points.join(' ')).toContain('30 days')
  })

  it('points to the documents guide (kk has its own, en falls back to ru)', () => {
    expect(kpGuidePath('ru')).toBe('/guides/dokumenty-ip-kazakhstan')
    expect(kpGuidePath('kk')).toBe('/guides/kk/dokumenty-ip-kazakhstan')
    expect(kpGuidePath('en')).toBe('/guides/dokumenty-ip-kazakhstan')
  })
})

describe('ToolSample renders the kp sample into server HTML', () => {
  for (const lang of TOOL_LANGS) {
    it(`${lang}: real text, ribbon, scroll wrapper and guide link, no hidden attribute`, () => {
      const html = renderToStaticMarkup(
        createElement(ToolSample, {
          idPrefix: 'kp-sample',
          copy: kpSampleCopy[lang],
          doc: buildKpSampleDoc(),
          guide: { href: kpGuidePath(lang), label: kpDict[lang].guideLink },
        }),
      )
      const c = kpSampleCopy[lang]
      expect(html).toContain(c.heading)
      expect(html).toContain(c.ribbon)
      expect(html).toContain(c.intro)
      for (const p of c.points) expect(html).toContain(p)
      expect(html).toContain('<table')
      expect(html).toContain(`href="${kpGuidePath(lang)}"`)
      expect(html).toContain('overflow-x-auto')
      expect(html).toContain('role="region"')
      expect(html).toContain('lang="ru"')
      expect(html).toContain('ИТОГО К ОПЛАТЕ:')
      expect(html).toContain(tenge(SAMPLE_TOTAL))
      expect(html).toContain(`Действителен до: ${SAMPLE_VALID_UNTIL}`)
      expect(html).not.toMatch(/\shidden[\s=>]/)
      expect(html).not.toContain('<img')
      // Цвета — только переменные темы.
      expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(html).not.toMatch(/rgba?\(/)
    })
  }
})

describe('sample anchor link above the form', () => {
  it('defines the anchor text on every language', () => {
    expect(kpSampleAnchorLabel.ru).toBe('Смотреть образец КП ↓')
    expect(kpSampleAnchorLabel.kk).toBe('КҰ үлгісін көру ↓')
    expect(kpSampleAnchorLabel.en).toBe('See the sample offer ↓')
    for (const lang of TOOL_LANGS) expect(kpSampleAnchorLabel[lang].trim()).not.toBe('')
  })

  for (const lang of TOOL_LANGS) {
    it(`${lang}: link href matches an existing id in the rendered sample, plain server <a>`, () => {
      const link = renderToStaticMarkup(createElement(KpSampleLink, { lang }))
      const sample = renderToStaticMarkup(createElement(KpSample, { lang }))
      expect(SAMPLE_ANCHOR_ID).toBe('obrazec')
      expect(link).toContain(`<a href="#${SAMPLE_ANCHOR_ID}"`)
      expect(link).toContain(kpSampleAnchorLabel[lang])
      expect(sample).toContain(`id="${SAMPLE_ANCHOR_ID}"`)
      // Цвета только из переменных темы, без tabindex=-1 (ссылка фокусируется).
      expect(link).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(link).not.toContain('tabindex')
    })
  }
})
