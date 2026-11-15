import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Образцы тянут генераторы документов с imageResize (в node нет canvas): подмена только для загрузки модулей.
vi.mock('@/lib/imageResize', () => ({ resizeToFit: async (url: string) => url }))

import { buildAVRHtml } from '@/lib/generateAVR'
import { buildKPHtml } from '@/lib/generateKP'
import { generateInvoicePDF } from '@/lib/generatePDF'
import { buildNakladnayaHtml } from '@/lib/generateNakladnaya'
import * as avr from '@/app/tools/avr/sample'
import * as kp from '@/app/tools/kp/sample'
import * as schet from '@/app/tools/schet/sample'
import * as nak from '@/app/tools/nakladnaya/sample'
import { documentRows as avrRows } from '@/app/tools/avr/calc'
import { documentRows as schetRows } from '@/app/tools/schet/calc'
import { documentRows as nakRows } from '@/app/tools/nakladnaya/calc'
import { kpLines } from '@/app/tools/kp/calc'
import AvrSample from '@/app/tools/avr/AvrSample'
import KpSample from '@/app/tools/kp/KpSample'
import SchetSample from '@/app/tools/schet/SchetSample'
import NakladnayaSample from '@/app/tools/nakladnaya/NakladnayaSample'
import type { SampleDoc } from './toolSample'
import { SAMPLE_DEFAULT_VAT, SAMPLE_VATS, type SampleVat } from './sampleVat'

// Переключатель НДС над образцом (15.11.2026): обе версии образца на странице
// обязаны совпадать с тем, что печатает настоящий генератор в этом режиме.

/** Текст без тегов; неразрывные пробелы (toLocaleString даёт их в суммах) приведены к обычным. */
const norm = (v: string) => v.replace(/[  ]/g, ' ')
const text = (html: string) =>
  norm(html).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')

/** Всё, что образец показывает в итогах и строках, должно быть в тексте настоящего документа. */
function expectDocInside(doc: SampleDoc, real: string, label: string) {
  const t = text(real)
  for (const tl of doc.totals) {
    expect(t, `${label}: «${tl.label}»`).toContain(norm(tl.label))
    expect(t, `${label}: ${tl.value}`).toContain(norm(tl.value))
  }
  for (const row of doc.rows) {
    for (const cell of row.cells) if (cell) expect(t, `${label}: ячейка «${cell}»`).toContain(norm(cell))
  }
}

describe('образец и настоящий документ совпадают в обоих режимах НДС', () => {
  it('акт', () => {
    for (const vat of SAMPLE_VATS) {
      const e = avr.SAMPLE_EXECUTOR, c = avr.SAMPLE_CUSTOMER
      const real = buildAVRHtml({
        number: avr.SAMPLE_NUMBER, date: avr.SAMPLE_DATE, contractNumber: avr.SAMPLE_CONTRACT_NUMBER, contractDate: avr.SAMPLE_CONTRACT_DATE,
        clientName: c.name, clientBin: c.bin, clientAddress: c.address, services: avrRows(avr.SAMPLE_ROWS), total: avr.SAMPLE_TOTAL, vatType: vat,
        profile: { company_name: e.name, bin_iin: e.bin, address: e.address, director_name: e.director },
      })!
      const doc = avr.buildAvrSampleDoc(vat)
      expectDocInside(doc, real, `avr ${vat}`)
      expect(doc.totals.length).toBe(vat === 'vat_16' ? 2 : 1)
      expect(text(real).includes('В том числе НДС 16%')).toBe(vat === 'vat_16')
    }
  })

  it('счёт', async () => {
    for (const vat of SAMPLE_VATS) {
      const e = schet.SAMPLE_SUPPLIER
      const real = await generateInvoicePDF({
        autoPrint: false, number: schet.SAMPLE_NUMBER, date: schet.SAMPLE_DATE, clientName: schet.SAMPLE_BUYER.name, clientBin: schet.SAMPLE_BUYER.bin,
        clientEmail: '', services: schetRows(schet.SAMPLE_ROWS), total: schet.SAMPLE_TOTAL, vatType: vat,
        profile: { company_name: e.name, bin_iin: e.bin, address: e.address, director_name: e.director },
        bank: { bank_name: e.bankName, iik: e.iik, bik: e.bik, kbe: e.kbe }, showWatermark: true,
      } as Parameters<typeof generateInvoicePDF>[0])
      const doc = schet.buildSchetSampleDoc(vat)
      expectDocInside(doc, real, `schet ${vat}`)
      expect(doc.totals.length).toBe(vat === 'vat_16' ? 2 : 1)
      expect(text(real).includes('В том числе НДС 16%')).toBe(vat === 'vat_16')
    }
  })

  it('накладная: НДС по строкам и в итоге', () => {
    for (const vat of SAMPLE_VATS) {
      const e = nak.SAMPLE_SUPPLIER
      const real = buildNakladnayaHtml({
        number: nak.SAMPLE_NUMBER, date: nak.SAMPLE_DATE, clientName: nak.SAMPLE_BUYER.name, clientBin: nak.SAMPLE_BUYER.bin,
        services: nakRows(nak.SAMPLE_ROWS).map(r => ({ ...r, type: 'product' as const })), total: nak.SAMPLE_TOTAL, vatType: vat,
        profile: { company_name: e.name, bin_iin: e.bin, address: e.address, director_name: e.director },
      })!
      const doc = nak.buildNakladnayaSampleDoc(vat)
      expectDocInside(doc, real, `nakladnaya ${vat}`)
      const vatColumn = doc.rows.map(r => r.cells[r.cells.length - 1])
      expect(norm(vatColumn[vatColumn.length - 1])).toBe(vat === 'vat_16' ? '11 724,00' : '0,00')
      if (vat === 'no_vat') expect(vatColumn.every(c => c === '0,00')).toBe(true)
    }
  })

  it('КП на русском и английском', () => {
    for (const lang of ['ru', 'en'] as const) {
      for (const vat of SAMPLE_VATS) {
        const d = kp.SAMPLE_BY_LANG[lang]
        const real = buildKPHtml({
          lang, number: kp.SAMPLE_NUMBER, date: kp.SAMPLE_DATE, validUntil: kp.SAMPLE_VALID_UNTIL, clientName: d.buyerName, clientBin: kp.SAMPLE_BUYER.bin,
          note: d.note, services: kpLines(d.rows), total: kp.SAMPLE_TOTAL, vatType: vat,
          profile: { company_name: d.supplier.name, bin_iin: kp.SAMPLE_SUPPLIER.bin, address: d.supplier.address, phone: kp.SAMPLE_SUPPLIER.phone, email: kp.SAMPLE_SUPPLIER.email, director_name: d.supplier.director },
        })
        const doc = kp.buildKpSampleDoc(lang, vat)
        expectDocInside(doc, real, `kp ${lang} ${vat}`)
        expect(doc.totals).toHaveLength(3)
        // Итог к оплате один и тот же в обоих режимах: цены уже с налогом.
        expect(doc.totals[2].value).toBe(doc.totals[vat === 'vat_16' ? 2 : 0].value)
      }
    }
  })
})

describe('переключатель НДС на странице', () => {
  const SAMPLES = { avr: AvrSample, kp: KpSample, schet: SchetSample, nakladnaya: NakladnayaSample }

  it('на всех трёх языках есть две кнопки, режим по умолчанию нажат и совпадает с прежним образцом', () => {
    for (const tool of Object.keys(SAMPLES) as Array<keyof typeof SAMPLES>) {
      for (const lang of ['ru', 'en', 'kk'] as const) {
        const html = renderToStaticMarkup(createElement(SAMPLES[tool], { lang }))
        expect(html, `${tool} ${lang}`).toContain('data-testid="sample-vat-switch"')
        const def: SampleVat = SAMPLE_DEFAULT_VAT[tool]
        const other: SampleVat = def === 'no_vat' ? 'vat_16' : 'no_vat'
        expect(html, `${tool} ${lang}`).toMatch(new RegExp(`aria-pressed="true"[^>]*data-testid="sample-vat-${def}"`))
        expect(html, `${tool} ${lang}`).toMatch(new RegExp(`aria-pressed="false"[^>]*data-testid="sample-vat-${other}"`))
      }
    }
  })

  it('подписи кнопок те же слова, что в списке НДС формы (на kk уже вычитаны)', () => {
    const ru = renderToStaticMarkup(createElement(AvrSample, { lang: 'ru' }))
    expect(ru).toContain('Без НДС')
    expect(ru).toContain('С НДС 16%')
    const kk = renderToStaticMarkup(createElement(AvrSample, { lang: 'kk' }))
    expect(kk).toContain('ҚҚС-сыз')
    expect(kk).toContain('ҚҚС 16% қоса алғанда')
    const en = renderToStaticMarkup(createElement(SchetSample, { lang: 'en' }))
    expect(en).toContain('No VAT')
    expect(en).toContain('VAT 16% included')
  })

  it('серверный HTML содержит текст образца режима по умолчанию', () => {
    expect(renderToStaticMarkup(createElement(AvrSample, { lang: 'ru' }))).not.toContain('В том числе НДС 16%')
    expect(renderToStaticMarkup(createElement(SchetSample, { lang: 'ru' }))).toContain('В том числе НДС 16%')
    expect(norm(renderToStaticMarkup(createElement(NakladnayaSample, { lang: 'ru' })))).toContain('11 724,00')
    expect(renderToStaticMarkup(createElement(KpSample, { lang: 'ru' }))).toContain('НДС 16%:')
  })
})
