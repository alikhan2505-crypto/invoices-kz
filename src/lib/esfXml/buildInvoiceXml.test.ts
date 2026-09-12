import { describe, it, expect } from 'vitest'
import { buildInvoiceXml, EsfInvoiceInput } from './buildInvoiceXml'

const SAMPLE_INPUT: EsfInvoiceInput = {
  num: '1',
  date: '12.09.2026',
  turnoverDate: '12.09.2026',
  operatorFullname: 'Абильбаев Алихан',
  seller: {
    name: 'ИП First Project',
    tin: '890525350143',
    address: 'г. Астана',
    bank: 'АО Kaspi Bank',
    bik: 'CASPKZKA',
    iik: 'KZ00000000000000000',
    kbe: '19',
    vatCertificateNum: '1234567',
    vatCertificateSeries: '12345',
  },
  customer: {
    name: 'ТОО Ромашка',
    tin: '123456789012',
    address: 'г. Алматы',
    countryCode: 'KZ',
  },
  lines: [
    { description: 'Консультационные услуги', quantity: 1, unitPrice: 10000, unitCode: '3004200002', unitNomenclature: '796', ndsRate: 12 },
  ],
}

describe('buildInvoiceXml', () => {
  it('produces well-formed XML with the required root elements', () => {
    const xml = buildInvoiceXml(SAMPLE_INPUT)
    expect(xml).toContain('<esf:invoiceContainer xmlns:esf="esf">')
    expect(xml).toContain('<invoiceType>ORDINARY_INVOICE</invoiceType>')
    expect(xml).toContain('<num>1</num>')
  })

  it('computes per-line NDS amount from price and rate, rounded to 2 decimals', () => {
    const xml = buildInvoiceXml(SAMPLE_INPUT)
    // 10000 at 12% NDS-inclusive-in-total pricing: price without tax = 10000,
    // NDS = 10000 * 0.12 = 1200.00, price with tax = 11200.00
    expect(xml).toContain('<priceWithoutTax>10000.00</priceWithoutTax>')
    expect(xml).toContain('<ndsAmount>1200.00</ndsAmount>')
    expect(xml).toContain('<priceWithTax>11200.00</priceWithTax>')
  })

  it('sums line totals into the productSet totals', () => {
    const xml = buildInvoiceXml(SAMPLE_INPUT)
    expect(xml).toContain('<totalPriceWithoutTax>10000.00</totalPriceWithoutTax>')
    expect(xml).toContain('<totalNdsAmount>1200.00</totalNdsAmount>')
    expect(xml).toContain('<totalPriceWithTax>11200.00</totalPriceWithTax>')
    expect(xml).toContain('<totalExciseAmount>0.00</totalExciseAmount>')
  })

  it('escapes XML special characters in free-text fields', () => {
    const input: EsfInvoiceInput = {
      ...SAMPLE_INPUT,
      customer: { ...SAMPLE_INPUT.customer, name: 'ТОО "Ромашка & Ко"' },
    }
    const xml = buildInvoiceXml(input)
    expect(xml).toContain('ТОО &quot;Ромашка &amp; Ко&quot;')
    expect(xml).not.toContain('ТОО "Ромашка & Ко"')
  })

  it('always sets catalogTruId to "1", matching the government reference sample', () => {
    const xml = buildInvoiceXml(SAMPLE_INPUT)
    expect(xml).toContain('<catalogTruId>1</catalogTruId>')
  })
})
