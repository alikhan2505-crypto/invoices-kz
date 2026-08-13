import { PDFDocument } from 'pdf-lib'

// The real накладная endpoint was never observed live -- the test account
// used for this session's captures has zero orders in every status,
// including "Передача" (see docs/superpowers/specs/2026-08-13-kaspi-orders-
// api-findings.md, section 5). This is a placeholder shape, not a confirmed
// one -- confirm against a real order the first time one reaches "Передача"
// on a connected seller's account, and update this comment + the URL/parsing
// below once confirmed.
export async function fetchWaybillPdf(sessionCookies: string, orderCode: string): Promise<Buffer> {
  const res = await fetch(`https://mc.shop.kaspi.kz/mc/facade/orders/${encodeURIComponent(orderCode)}/waybill`, {
    headers: { 'x-auth-version': '3', 'cookie': sessionCookies, 'origin': 'https://kaspi.kz', 'referer': 'https://kaspi.kz/' },
  })
  if (!res.ok) throw new Error(`Waybill fetch failed for order ${orderCode}: HTTP ${res.status}`)
  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

// Pure -- no network, no Kaspi-specific assumptions beyond "these are all
// valid PDF byte buffers". Combines every page of every input PDF, in the
// order given, into one PDF.
export async function mergeWaybillPdfs(pdfBuffers: Buffer[]): Promise<Buffer> {
  const merged = await PDFDocument.create()
  for (const buf of pdfBuffers) {
    const doc = await PDFDocument.load(buf)
    const pages = await merged.copyPages(doc, doc.getPageIndices())
    pages.forEach(p => merged.addPage(p))
  }
  return Buffer.from(await merged.save())
}
