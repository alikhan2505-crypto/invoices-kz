// src/lib/esfXml/client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createEsfSession, syncInvoice } from './client'

describe('createEsfSession', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    process.env.ESF_SOAP_BASE_URL = 'https://test3.esf.kgd.gov.kz:8443/esf-web/ws/api1'
  })

  it('parses sessionId out of a successful SOAP response', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      text: async () => `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body><esf:createSessionResponse xmlns:esf="esf"><sessionId>abc-123</sessionId></esf:createSessionResponse></soap:Body>
      </soap:Envelope>`,
    })
    const sessionId = await createEsfSession('123456789021', 'pass', 'BASE64CERT')
    expect(sessionId).toBe('abc-123')
  })

  it('throws when the SOAP response has no sessionId', async () => {
    (fetch as any).mockResolvedValue({ ok: true, text: async () => '<soap:Envelope><soap:Body/></soap:Envelope>' })
    await expect(createEsfSession('123456789021', 'pass', 'BASE64CERT')).rejects.toThrow('sessionId')
  })
})

describe('syncInvoice', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    process.env.ESF_SOAP_BASE_URL = 'https://test3.esf.kgd.gov.kz:8443/esf-web/ws/api1'
  })

  // Fixtures below mirror the real UploadInvoiceService.wsdl SyncInvoiceResponse /
  // StandardResponse shape (acceptedSet and declinedSet both hold <standardResponse>
  // elements; there is no <declinedResponse> element, and errors live under
  // <errors><error><property/><errorCode/><text/></error></errors>).
  it('reports accepted with the registration id and num', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      text: async () => `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body><esf:syncInvoiceResponse xmlns:esf="esf">
          <acceptedSet><standardResponse><id>999</id><num>1</num><date>12.09.2026</date></standardResponse></acceptedSet>
          <declinedSet/>
        </esf:syncInvoiceResponse></soap:Body>
      </soap:Envelope>`,
    })
    const result = await syncInvoice('session-1', '<invoice/>', 'SIGBASE64', 'CERTBASE64')
    expect(result).toEqual({ accepted: true, registrationId: '999', num: '1' })
  })

  it('trims whitespace around a pretty-printed acceptedSet response', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      text: async () => `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body><esf:syncInvoiceResponse xmlns:esf="esf">
          <ns2:acceptedSet>
            <ns2:standardResponse>
              <ns2:id>\n  999\n  </ns2:id>
              <ns2:num>\n  1\n  </ns2:num>
              <ns2:date>12.09.2026</ns2:date>
            </ns2:standardResponse>
          </ns2:acceptedSet>
          <ns2:declinedSet/>
        </esf:syncInvoiceResponse></soap:Body>
      </soap:Envelope>`,
    })
    const result = await syncInvoice('session-1', '<invoice/>', 'SIGBASE64', 'CERTBASE64')
    expect(result).toEqual({ accepted: true, registrationId: '999', num: '1' })
  })

  it('reports declined with the error code and description from a single error', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      text: async () => `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body><esf:syncInvoiceResponse xmlns:esf="esf">
          <acceptedSet/>
          <declinedSet><standardResponse>
            <errors><error><property>buyer.tin</property><errorCode>INVALID_TIN</errorCode><text>БИН покупателя не найден</text></error></errors>
            <num>1</num>
            <date>12.09.2026</date>
          </standardResponse></declinedSet>
        </esf:syncInvoiceResponse></soap:Body>
      </soap:Envelope>`,
    })
    const result = await syncInvoice('session-1', '<invoice/>', 'SIGBASE64', 'CERTBASE64')
    expect(result).toEqual({ accepted: false, errorCode: 'INVALID_TIN', errorDescription: 'БИН покупателя не найден' })
  })

  it('joins multiple error texts when a declined response has more than one error', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      text: async () => `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body><esf:syncInvoiceResponse xmlns:esf="esf">
          <acceptedSet/>
          <declinedSet><standardResponse>
            <errors>
              <error><property>buyer.tin</property><errorCode>INVALID_TIN</errorCode><text>БИН покупателя не найден</text></error>
              <error><property>total</property><errorCode>SUM_MISMATCH</errorCode><text>Сумма не совпадает</text></error>
            </errors>
            <num>1</num>
            <date>12.09.2026</date>
          </standardResponse></declinedSet>
        </esf:syncInvoiceResponse></soap:Body>
      </soap:Envelope>`,
    })
    const result = await syncInvoice('session-1', '<invoice/>', 'SIGBASE64', 'CERTBASE64')
    expect(result).toEqual({
      accepted: false,
      errorCode: 'INVALID_TIN',
      errorDescription: 'БИН покупателя не найден; Сумма не совпадает',
    })
  })

  it('tolerates namespace prefixes on the declinedSet/standardResponse boundary tags', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      text: async () => `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body><esf:syncInvoiceResponse xmlns:esf="esf">
          <ns2:acceptedSet/>
          <ns2:declinedSet><ns3:standardResponse>
            <ns3:errors><ns3:error><ns3:property>buyer.tin</ns3:property><ns3:errorCode>INVALID_TIN</ns3:errorCode><ns3:text>БИН покупателя не найден</ns3:text></ns3:error></ns3:errors>
            <ns3:num>1</ns3:num>
          </ns3:standardResponse></ns2:declinedSet>
        </esf:syncInvoiceResponse></soap:Body>
      </soap:Envelope>`,
    })
    const result = await syncInvoice('session-1', '<invoice/>', 'SIGBASE64', 'CERTBASE64')
    expect(result).toEqual({ accepted: false, errorCode: 'INVALID_TIN', errorDescription: 'БИН покупателя не найден' })
  })
})
