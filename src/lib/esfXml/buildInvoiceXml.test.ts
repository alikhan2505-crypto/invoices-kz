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

  it('escapes all 5 XML special characters in free-text fields', () => {
    const input: EsfInvoiceInput = {
      ...SAMPLE_INPUT,
      customer: { ...SAMPLE_INPUT.customer, name: `ТОО "Ромашка & Ко" <тест> 'ИП'` },
    }
    const xml = buildInvoiceXml(input)
    expect(xml).toContain('ТОО &quot;Ромашка &amp; Ко&quot; &lt;тест&gt; &apos;ИП&apos;')
    expect(xml).not.toContain(`ТОО "Ромашка & Ко" <тест> 'ИП'`)
  })

  it('always sets catalogTruId to "1", matching the government reference sample', () => {
    const xml = buildInvoiceXml(SAMPLE_INPUT)
    expect(xml).toContain('<catalogTruId>1</catalogTruId>')
  })

  it('rounds each line before summing, so productSet totals tie out to the sum of the rounded per-line values (round(sum) vs sum(round))', () => {
    // Both lines have a raw (unrounded) priceWithoutTax of 10.004ish, which each
    // independently rounds DOWN to 10.00. Their raw sum is ~20.009, which on its
    // own would round to 20.01 -- one cent more than 10.00 + 10.00. The fix must
    // sum the already-rounded per-line values so the total is exactly 20.00.
    const input: EsfInvoiceInput = {
      ...SAMPLE_INPUT,
      lines: [
        { description: 'Товар A', quantity: 4, unitPrice: 2.501, unitCode: '3004200002', unitNomenclature: '796', ndsRate: 12 },
        { description: 'Товар B', quantity: 3, unitPrice: 3.335, unitCode: '3004200002', unitNomenclature: '796', ndsRate: 12 },
      ],
    }
    const xml = buildInvoiceXml(input)

    // Each line displays as 10.00 / 1.20 / 11.20, not a raw-rounded 10.01 etc.
    const lineMatches = [...xml.matchAll(/<priceWithoutTax>([\d.]+)<\/priceWithoutTax>/g)].map(m => m[1])
    expect(lineMatches).toEqual(['10.00', '10.00'])

    // The totals must equal the exact sum of the (rounded) per-line values above,
    // not the round(sum) of the raw unrounded values (which would be 20.01).
    expect(xml).toContain('<totalPriceWithoutTax>20.00</totalPriceWithoutTax>')
    expect(xml).toContain('<totalNdsAmount>2.40</totalNdsAmount>')
    expect(xml).toContain('<totalPriceWithTax>22.40</totalPriceWithTax>')
    expect(xml).not.toContain('<totalPriceWithoutTax>20.01</totalPriceWithoutTax>')
  })

  it('omits optional seller/customer fields cleanly when left undefined', () => {
    const input: EsfInvoiceInput = {
      ...SAMPLE_INPUT,
      seller: {
        name: SAMPLE_INPUT.seller.name,
        tin: SAMPLE_INPUT.seller.tin,
        // address, bank, bik, iik, kbe, vatCertificateNum, vatCertificateSeries all omitted
      },
      customer: {
        name: SAMPLE_INPUT.customer.name,
        tin: SAMPLE_INPUT.customer.tin,
        countryCode: SAMPLE_INPUT.customer.countryCode,
        // address omitted
      },
    }
    const xml = buildInvoiceXml(input)

    expect(xml).not.toContain('undefined')
    expect(xml).not.toContain('<address></address>')
    expect(xml).not.toContain('<bank></bank>')
    expect(xml).not.toContain('<bik></bik>')
    expect(xml).not.toContain('<iik></iik>')
    expect(xml).not.toContain('<kbe></kbe>')
    expect(xml).not.toContain('<certificateNum></certificateNum>')
    expect(xml).not.toContain('<certificateSeries></certificateSeries>')
    expect(xml).not.toContain('<address>')
    expect(xml).not.toContain('<bank>')
    expect(xml).not.toContain('<bik>')
    expect(xml).not.toContain('<iik>')
    expect(xml).not.toContain('<kbe>')
    expect(xml).not.toContain('<certificateNum>')
    expect(xml).not.toContain('<certificateSeries>')

    // Required fields are still present.
    expect(xml).toContain(`<name>${SAMPLE_INPUT.seller.name}</name>`)
    expect(xml).toContain(`<tin>${SAMPLE_INPUT.seller.tin}</tin>`)
    expect(xml).toContain(`<countryCode>${SAMPLE_INPUT.customer.countryCode}</countryCode>`)
  })
})
