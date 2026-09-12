export interface EsfInvoiceInput {
  num: string // digits only, 1-30 chars per InvoiceV2.xsd's num pattern
  date: string // DD.MM.YYYY
  turnoverDate: string // DD.MM.YYYY
  operatorFullname: string
  seller: {
    name: string
    tin: string
    address?: string
    bank?: string
    bik?: string
    iik?: string
    kbe?: string
    vatCertificateNum?: string | null
    vatCertificateSeries?: string | null
  }
  customer: {
    name: string
    tin: string
    address?: string
    countryCode: string
  }
  lines: Array<{
    description: string
    quantity: number
    unitPrice: number // price WITHOUT tax, per unit
    unitCode: string
    unitNomenclature: string
    ndsRate: number // 0-100, integer
  }>
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function money(n: number): string {
  return n.toFixed(2)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function buildLine(line: EsfInvoiceInput['lines'][number]) {
  const rawPriceWithoutTax = line.quantity * line.unitPrice
  const rawNdsAmount = rawPriceWithoutTax * (line.ndsRate / 100)
  // Round each displayed money value first, then derive priceWithTax from the
  // already-rounded parts. This guarantees a single line's three fields tie
  // out exactly, and (since totals below sum these same rounded numbers)
  // that productSet totals always equal the sum of the visible line items.
  const priceWithoutTax = round2(rawPriceWithoutTax)
  const ndsAmount = round2(rawNdsAmount)
  const priceWithTax = round2(priceWithoutTax + ndsAmount)
  return {
    xml: `
                    <product>
                        <catalogTruId>1</catalogTruId>
                        <description>${escapeXml(line.description)}</description>
                        <ndsAmount>${money(ndsAmount)}</ndsAmount>
                        <ndsRate>${line.ndsRate}</ndsRate>
                        <priceWithTax>${money(priceWithTax)}</priceWithTax>
                        <priceWithoutTax>${money(priceWithoutTax)}</priceWithoutTax>
                        <quantity>${line.quantity}</quantity>
                        <turnoverSize>${money(priceWithoutTax)}</turnoverSize>
                        <unitCode>${escapeXml(line.unitCode)}</unitCode>
                        <unitNomenclature>${escapeXml(line.unitNomenclature)}</unitNomenclature>
                        <unitPrice>${money(line.unitPrice)}</unitPrice>
                    </product>`,
    priceWithoutTax,
    ndsAmount,
    priceWithTax,
  }
}

export function buildInvoiceXml(input: EsfInvoiceInput): string {
  const built = input.lines.map(buildLine)
  const totalPriceWithoutTax = built.reduce((sum, b) => sum + b.priceWithoutTax, 0)
  const totalNdsAmount = built.reduce((sum, b) => sum + b.ndsAmount, 0)
  const totalPriceWithTax = built.reduce((sum, b) => sum + b.priceWithTax, 0)

  const sellerFields = [
    input.seller.address ? `<address>${escapeXml(input.seller.address)}</address>` : '',
    input.seller.bank ? `<bank>${escapeXml(input.seller.bank)}</bank>` : '',
    input.seller.bik ? `<bik>${escapeXml(input.seller.bik)}</bik>` : '',
    input.seller.vatCertificateNum ? `<certificateNum>${escapeXml(input.seller.vatCertificateNum)}</certificateNum>` : '',
    input.seller.vatCertificateSeries ? `<certificateSeries>${escapeXml(input.seller.vatCertificateSeries)}</certificateSeries>` : '',
    input.seller.iik ? `<iik>${escapeXml(input.seller.iik)}</iik>` : '',
    input.seller.kbe ? `<kbe>${escapeXml(input.seller.kbe)}</kbe>` : '',
    `<name>${escapeXml(input.seller.name)}</name>`,
    `<tin>${escapeXml(input.seller.tin)}</tin>`,
  ].filter(Boolean).join('\n                    ')

  const customerFields = [
    input.customer.address ? `<address>${escapeXml(input.customer.address)}</address>` : '',
    `<countryCode>${escapeXml(input.customer.countryCode)}</countryCode>`,
    `<name>${escapeXml(input.customer.name)}</name>`,
    `<tin>${escapeXml(input.customer.tin)}</tin>`,
  ].filter(Boolean).join('\n                    ')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<esf:invoiceContainer xmlns:esf="esf">
    <invoiceSet>
        <v2:invoice xmlns:a="abstractInvoice.esf" xmlns:v2="v2.esf">
            <date>${input.date}</date>
            <invoiceType>ORDINARY_INVOICE</invoiceType>
            <num>${escapeXml(input.num)}</num>
            <operatorFullname>${escapeXml(input.operatorFullname)}</operatorFullname>
            <turnoverDate>${input.turnoverDate}</turnoverDate>
            <customers>
                <customer>
                    ${customerFields}
                </customer>
            </customers>
            <productSet>
                <currencyCode>KZT</currencyCode>
                <products>${built.map(b => b.xml).join('')}
                </products>
                <totalExciseAmount>${money(0)}</totalExciseAmount>
                <totalNdsAmount>${money(totalNdsAmount)}</totalNdsAmount>
                <totalPriceWithTax>${money(totalPriceWithTax)}</totalPriceWithTax>
                <totalPriceWithoutTax>${money(totalPriceWithoutTax)}</totalPriceWithoutTax>
                <totalTurnoverSize>${money(totalPriceWithoutTax)}</totalTurnoverSize>
            </productSet>
            <sellers>
                <seller>
                    ${sellerFields}
                </seller>
            </sellers>
        </v2:invoice>
    </invoiceSet>
</esf:invoiceContainer>`
}
