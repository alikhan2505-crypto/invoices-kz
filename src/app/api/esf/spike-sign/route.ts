import { NextRequest, NextResponse } from 'next/server'

// Verbatim from esf-sdk-2025.zip's "sdk/XML templates/One InvoiceV2.xml"
// (Kazakhstan government's own reference sample) -- used here only as a
// realistic payload to sign, not submitted anywhere. TEMPORARY: this route
// exists only for the Task 1 GOST-signing spike (docs/superpowers/plans/
// 2026-09-12-esf-electronic-invoice.md) and is deleted once resolved.
const SAMPLE_INVOICE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<esf:invoiceContainer xmlns:esf="esf">
    <invoiceSet>
        <v2:invoice xmlns:a="abstractInvoice.esf" xmlns:v2="v2.esf">
            <date>03.10.2017</date>
            <invoiceType>ORDINARY_INVOICE</invoiceType>
            <num>2038556421124573223</num>
            <operatorFullname>Иванов Иван Иванович</operatorFullname>
            <turnoverDate>02.10.2017</turnoverDate>
            <customers>
                <customer>
                    <address>Казахстан, Акмолинская обл., г. Астана, ул. ПРОСПЕКТ РАКЫМЖАН КОШКАРБАЕВ, д. 66</address>
                    <countryCode>KZ</countryCode>
                    <name>ИП БРЮС УЭЙН</name>
                    <tin>123456789011</tin>
                </customer>
            </customers>
            <productSet>
                <currencyCode>KZT</currencyCode>
                <products>
                    <product>
                        <catalogTruId>1</catalogTruId>
                        <description>Тестовый товар</description>
                        <ndsAmount>468</ndsAmount>
                        <ndsRate>12</ndsRate>
                        <priceWithTax>4368</priceWithTax>
                        <priceWithoutTax>3900</priceWithoutTax>
                        <quantity>1</quantity>
                        <turnoverSize>3900</turnoverSize>
                        <unitCode>3004200002</unitCode>
                        <unitNomenclature>796</unitNomenclature>
                        <unitPrice>3900</unitPrice>
                    </product>
                </products>
                <totalExciseAmount>0</totalExciseAmount>
                <totalNdsAmount>468</totalNdsAmount>
                <totalPriceWithTax>4368</totalPriceWithTax>
                <totalPriceWithoutTax>3900</totalPriceWithoutTax>
                <totalTurnoverSize>3900</totalTurnoverSize>
            </productSet>
            <sellers>
                <seller>
                    <name>ТОО "АСЕМ-2"</name>
                    <tin>123456789021</tin>
                </seller>
            </sellers>
        </v2:invoice>
    </invoiceSet>
</esf:invoiceContainer>`

export async function GET(_req: NextRequest) {
  return NextResponse.json({ sampleXml: SAMPLE_INVOICE_XML })
}
