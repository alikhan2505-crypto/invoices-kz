// Server-side helpers for SIGEX's document-registry API (distinct from the
// egovQr signing flow, which runs client-side via the `sigex-qr-signing-client`
// package). This is the layer that gives a signed document a permanent,
// third-party-verifiable record: SIGEX stores the document + signatures under
// a `documentId` indefinitely, and `buildDDC` returns a copy of the PDF with
// verification QR codes burned into it (the "Карточка") — the artifact a
// government office, police, or a court can check independently of
// invoices.kz. Docs: https://sigex.kz/support/developers/api-documents/
const SIGEX_BASE = 'https://sigex.kz'

async function sigexJson(path: string, body: unknown) {
  const res = await fetch(`${SIGEX_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.message) {
    throw new Error(data.message || `SIGEX ${path} failed: ${res.status}`)
  }
  return data
}

export async function sigexRegisterDocument(title: string, ownerSignatureCms: string) {
  const data = await sigexJson('/api', { title, signature: ownerSignatureCms, signType: 'cms' })
  return { documentId: data.documentId as string, signId: data.signId as string }
}

export async function sigexAddSignature(sigexDocumentId: string, signatureCms: string) {
  const data = await sigexJson(`/api/${sigexDocumentId}`, { signature: signatureCms, signType: 'cms' })
  return { signId: data.signId as string }
}

export async function sigexUploadDocumentData(sigexDocumentId: string, bytes: Uint8Array) {
  const res = await fetch(`${SIGEX_BASE}/api/${sigexDocumentId}/data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: Buffer.from(bytes),
  })
  if (!res.ok) throw new Error(`SIGEX document data upload failed: ${res.status}`)
}

// Best-effort — callers should catch and continue without a DDC rather than
// fail the whole signing flow, since the underlying CMS signatures (the
// legally meaningful part) are already safely captured by this point.
export async function sigexBuildDDC(sigexDocumentId: string, bytes: Uint8Array): Promise<Buffer> {
  const params = new URLSearchParams({
    fileName: 'signed.pdf',
    language: 'ru',
    qrWithIDLink: 'true',
  })
  const res = await fetch(`${SIGEX_BASE}/api/${sigexDocumentId}/buildDDC?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: Buffer.from(bytes),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.message || !data.ddc) {
    throw new Error(data.message || `SIGEX buildDDC failed: ${res.status}`)
  }
  return Buffer.from(data.ddc, 'base64')
}
