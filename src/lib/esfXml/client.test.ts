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

  it('reports declined with the error code and description', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      text: async () => `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body><esf:syncInvoiceResponse xmlns:esf="esf">
          <acceptedSet/>
          <declinedSet><declinedResponse><num>1</num><errorCode>INVALID_TIN</errorCode><errorDescription>БИН покупателя не найден</errorDescription></declinedResponse></declinedSet>
        </esf:syncInvoiceResponse></soap:Body>
      </soap:Envelope>`,
    })
    const result = await syncInvoice('session-1', '<invoice/>', 'SIGBASE64', 'CERTBASE64')
    expect(result).toEqual({ accepted: false, errorCode: 'INVALID_TIN', errorDescription: 'БИН покупателя не найден' })
  })
})
