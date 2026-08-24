import { PDFDocument, PageSizes, degrees } from 'pdf-lib'
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

const CELL_MARGIN = 10

// Pure -- no network. Packs each input PDF's first page (every Kaspi label
// is confirmed single-page, "1/1") into a grid of cols x rows cells per
// output page, scaled uniformly (never distorted independently per axis --
// barcodes/QR codes must stay scannable) to fit each cell and centered.
// cols=1,rows=1 puts one label per page (А6 mode); cols=2,rows=2 puts up
// to 4 per page (А4 mode), filled left-to-right then top-to-bottom.
export async function packWaybillsToPages(
  pdfBuffers: Buffer[],
  pageSize: [number, number],
  cols: number,
  rows: number
): Promise<Buffer> {
  const output = await PDFDocument.create()
  const [pageWidth, pageHeight] = pageSize
  const cellWidth = pageWidth / cols
  const cellHeight = pageHeight / rows
  const perPage = cols * rows

  for (let i = 0; i < pdfBuffers.length; i += perPage) {
    const page = output.addPage(pageSize)
    const batch = pdfBuffers.slice(i, i + perPage)
    for (let j = 0; j < batch.length; j++) {
      const sourceDoc = await PDFDocument.load(batch[j])
      const sourcePage = sourceDoc.getPage(0)
      // Kaspi's label PDF may carry a /Rotate entry (e.g. a landscape-
      // authored page meant to be VIEWED as portrait) -- embedPage/drawPage
      // read the raw MediaBox only and ignore /Rotate entirely (confirmed
      // against the installed pdf-lib: PDFPageEmbedder's fullPageBoundingBox
      // uses only MediaBox), so it must be compensated for explicitly or a
      // rotated label would render sideways and undersized.
      const rotation = ((sourcePage.getRotation().angle % 360) + 360) % 360
      const embeddedPage = await output.embedPage(sourcePage)
      const swapped = rotation === 90 || rotation === 270
      const visualWidth = swapped ? embeddedPage.height : embeddedPage.width
      const visualHeight = swapped ? embeddedPage.width : embeddedPage.height

      const col = j % cols
      const row = Math.floor(j / cols)
      const cellX = col * cellWidth
      const cellY = pageHeight - (row + 1) * cellHeight
      const availableWidth = cellWidth - CELL_MARGIN * 2
      const availableHeight = cellHeight - CELL_MARGIN * 2
      const scale = Math.min(availableWidth / visualWidth, availableHeight / visualHeight)
      const drawnWidth = visualWidth * scale
      const drawnHeight = visualHeight * scale
      const originX = cellX + (cellWidth - drawnWidth) / 2
      const originY = cellY + (cellHeight - drawnHeight) / 2

      // Compensating (x, y, pdf-lib rotate angle) per source /Rotate value --
      // verified by explicit CTM matrix derivation (translate . rotate . scale
      // applied to the source page's 4 corners lands exactly on
      // [originX, originX+drawnWidth] x [originY, originY+drawnHeight] in
      // every case; pdf-lib's `rotate` option is a CCW rotation for a
      // positive angle, while a PDF /Rotate value is the CW display
      // rotation, hence the sign flip between source rotation 90 <->
      // pdf-lib rotate -90, and source rotation 270 <-> pdf-lib rotate 90).
      if (rotation === 0) {
        page.drawPage(embeddedPage, { x: originX, y: originY, width: drawnWidth, height: drawnHeight })
      } else if (rotation === 90) {
        page.drawPage(embeddedPage, { x: originX, y: originY + drawnHeight, xScale: scale, yScale: scale, rotate: degrees(-90) })
      } else if (rotation === 180) {
        page.drawPage(embeddedPage, { x: originX + drawnWidth, y: originY + drawnHeight, xScale: scale, yScale: scale, rotate: degrees(180) })
      } else {
        page.drawPage(embeddedPage, { x: originX + drawnWidth, y: originY, xScale: scale, yScale: scale, rotate: degrees(90) })
      }
    }
  }

  return Buffer.from(await output.save())
}

export type WaybillFormat = 'a4' | 'a6'

// А6 mode normalizes every label to true А6 dimensions (105x148mm) rather
// than whatever raw page size Kaspi's own generated PDF happens to use --
// that raw size has never been directly confirmed live.
export async function buildWaybillsPdf(pdfBuffers: Buffer[], format: WaybillFormat): Promise<Buffer> {
  if (format === 'a4') return packWaybillsToPages(pdfBuffers, PageSizes.A4, 2, 2)
  return packWaybillsToPages(pdfBuffers, PageSizes.A6, 1, 1)
}
