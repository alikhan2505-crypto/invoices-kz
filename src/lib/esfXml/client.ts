// src/lib/esfXml/client.ts

// Both hosts come from the SDK's own PDF documentation
// (esf-sdk-2025.zip, "Документация по API ЭСФ.pdf") -- production is
// shown there as an example IP, sandbox as test3.esf.kgd.gov.kz. Neither
// has been confirmed by an actual successful call yet (Task 10 does
// that) -- kept as env vars specifically so a wrong host is a config
// fix, not a code change.
function baseUrl(): string {
  const url = process.env.ESF_SOAP_BASE_URL
  if (!url) throw new Error('ESF_SOAP_BASE_URL is not configured')
  return url
}

function extractTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<(?:\\w+:)?${tag}>([^<]*)</(?:\\w+:)?${tag}>`))
  return match ? match[1].trim() : null
}

async function soapCall(service: string, action: string, bodyXml: string, headerXml = ''): Promise<string> {
  const envelope = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:esf="esf">
  <soapenv:Header>${headerXml}</soapenv:Header>
  <soapenv:Body>${bodyXml}</soapenv:Body>
</soapenv:Envelope>`
  const res = await fetch(`${baseUrl()}/${service}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: action },
    body: envelope,
    signal: AbortSignal.timeout(30000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`ЭСФ SOAP call to ${service} failed: HTTP ${res.status}: ${text.slice(0, 500)}`)
  return text
}

// The government sample request for createSession carries a WS-Security
// UsernameToken header (login as username, the ИС ЭСФ password as
// PasswordText) alongside the body's own tin/x509Certificate -- copied
// verbatim in shape from "Документация по API ЭСФ.pdf" section 3.1.1.
// syncInvoice's own sample shows an EMPTY header (the sessionId returned
// by createSession carries the auth context for every call after), so
// this header is only ever built for createSession, never passed to
// other soapCall() invocations.
function usernameTokenHeader(login: string, password: string): string {
  return `<wsse:Security soapenv:mustUnderstand="1" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
    <wsse:UsernameToken>
      <wsse:Username>${login}</wsse:Username>
      <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${password}</wsse:Password>
    </wsse:UsernameToken>
  </wsse:Security>`
}

export async function createEsfSession(login: string, password: string, authCertificateBase64: string): Promise<string> {
  const bodyXml = `<esf:createSessionRequest>
      <tin>${login}</tin>
      <x509Certificate>${authCertificateBase64}</x509Certificate>
    </esf:createSessionRequest>`
  const responseXml = await soapCall('SessionService', 'createSession', bodyXml, usernameTokenHeader(login, password))
  const sessionId = extractTag(responseXml, 'sessionId')
  if (!sessionId) throw new Error(`ЭСФ createSession did not return a sessionId: ${responseXml.slice(0, 500)}`)
  return sessionId
}

export type EsfSyncResult =
  | { accepted: true; registrationId: string; num: string }
  | { accepted: false; errorCode: string; errorDescription: string }

export async function syncInvoice(
  sessionId: string,
  invoiceXml: string,
  signatureBase64: string,
  signingCertificateBase64: string
): Promise<EsfSyncResult> {
  const bodyXml = `<esf:syncInvoiceRequest>
      <sessionId>${sessionId}</sessionId>
      <invoiceUploadInfoList>
        <invoiceUploadInfo>
          <invoiceBody><![CDATA[${invoiceXml}]]></invoiceBody>
          <version>InvoiceV2</version>
          <signature>${signatureBase64}</signature>
          <signatureType>COMPANY</signatureType>
        </invoiceUploadInfo>
      </invoiceUploadInfoList>
      <x509Certificate>${signingCertificateBase64}</x509Certificate>
    </esf:syncInvoiceRequest>`
  const responseXml = await soapCall('UploadInvoiceService', 'syncInvoice', bodyXml)

  // Per the real UploadInvoiceService.wsdl (SyncInvoiceResponse / StandardResponse
  // complex types), acceptedSet and declinedSet both hold the SAME element,
  // <standardResponse>, of type StandardResponse -- there is no separate
  // <declinedResponse> element. A StandardResponse always carries <num> (and
  // <date>); it carries <id> only once the ЭСФ is registered (accepted), and
  // carries an <errors><error>...</error></errors> list only when declined for
  // ФЛК validation errors, each <error> having <property>, <errorCode>, <text>.
  const acceptedMatch = responseXml.match(/<(?:\w+:)?acceptedSet>[\s\S]*?<(?:\w+:)?standardResponse>[\s\S]*?<\/(?:\w+:)?standardResponse>[\s\S]*?<\/(?:\w+:)?acceptedSet>/)
  if (acceptedMatch) {
    const registrationId = extractTag(acceptedMatch[0], 'id')
    const num = extractTag(acceptedMatch[0], 'num')
    if (registrationId && num) return { accepted: true, registrationId, num }
  }

  const declinedMatch = responseXml.match(/<(?:\w+:)?declinedSet>[\s\S]*?<(?:\w+:)?standardResponse>[\s\S]*?<\/(?:\w+:)?standardResponse>[\s\S]*?<\/(?:\w+:)?declinedSet>/)
  if (declinedMatch) {
    const errorBlocks = declinedMatch[0].match(/<(?:\w+:)?error>[\s\S]*?<\/(?:\w+:)?error>/g) || []
    const errorCode = (errorBlocks[0] && extractTag(errorBlocks[0], 'errorCode')) || 'UNKNOWN'
    // StandardResponse.errors can carry multiple <error> entries (one per failed
    // ФЛК validation rule); EsfSyncResult only has room for one description
    // string, so join every error's <text> into one semicolon-separated message
    // rather than dropping all but the first.
    const errorTexts = errorBlocks.map((block) => extractTag(block, 'text')).filter((text): text is string => !!text)
    const errorDescription = errorTexts.length > 0 ? errorTexts.join('; ') : responseXml.slice(0, 500)
    return { accepted: false, errorCode, errorDescription }
  }

  throw new Error(`ЭСФ syncInvoice response matched neither accepted nor declined shape: ${responseXml.slice(0, 500)}`)
}
