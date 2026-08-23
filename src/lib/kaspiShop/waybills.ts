import { PDFDocument } from 'pdf-lib'
import JSZip from 'jszip'

// CONFIRMED live 2026-08-23 (real order in "Передача" on merchant 30067228):
// накладные are not fetched per order. The cabinet's "Распечатать все
// накладные" button hits this merchant-wide endpoint, which returns a ZIP of
// every currently print-ready waybill as individual `KASPI_SHOP-{orderCode}.pdf`
// entries -- there is no per-order query param. Replaces the earlier
// unconfirmed `.../orders/{orderId}/waybill` guess (404'd for real, see
// docs/superpowers/specs/2026-08-13-kaspi-orders-api-findings.md section 5).
async function fetchWaybillsZip(sessionCookies: string, merchantId: string): Promise<JSZip> {
  const res = await fetch(`https://mc.shop.kaspi.kz/order/view/mc/order/waybill?merchantId=${encodeURIComponent(merchantId)}`, {
    headers: { 'x-auth-version': '3', 'cookie': sessionCookies, 'origin': 'https://kaspi.kz', 'referer': 'https://kaspi.kz/' },
  })
  if (!res.ok) throw new Error(`Waybill fetch failed for merchant ${merchantId}: HTTP ${res.status}`)
  const arrayBuffer = await res.arrayBuffer()
  return JSZip.loadAsync(arrayBuffer)
}

export async function fetchWaybillPdfs(sessionCookies: string, merchantId: string, orderCodes: string[]): Promise<Buffer[]> {
  const zip = await fetchWaybillsZip(sessionCookies, merchantId)
  const pdfs: Buffer[] = []
  for (const orderCode of orderCodes) {
    const entry = Object.values(zip.files).find(f => !f.dir && f.name.includes(orderCode))
    if (!entry) throw new Error(`Накладная для заказа ${orderCode} не найдена в архиве — заказ ещё не готов к передаче`)
    pdfs.push(await entry.async('nodebuffer'))
  }
  return pdfs
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
