import { PDFDocument, PageSizes, degrees } from 'pdf-lib'
import JSZip from 'jszip'

// CONFIRMED live 2026-08-23 (real order in "Передача" on merchant 30067228):
// накладные are not fetched per order. The cabinet's "Распечатать все
// накладные" button hits this merchant-wide endpoint, which returns a ZIP of
// every currently print-ready waybill as individual `KASPI_SHOP-{orderCode}.pdf`
// entries -- there is no per-order query param. Replaces the earlier
// unconfirmed `.../orders/{orderId}/waybill` guess (404'd for real, see
// docs/superpowers/specs/2026-08-13-kaspi-orders-api-findings.md section 5).
// Kaspi answers HTTP 200 with a 0-byte body when the merchant has no
// print-ready waybills at all (seen live 2026-08-25: merchant with orders
// only in Упаковка/Переданы на доставку got an empty 200, while the same
// endpoint returned a real ZIP on 2026-08-23 with an order in Передача).
// Fed straight to JSZip that surfaced as the cryptic "End of data reached
// (data length = 0, asked index = 4). Corrupted zip ?" -- translate the
// empty and non-zip cases into actionable Russian before JSZip speaks.
export async function parseWaybillsZip(data: ArrayBuffer): Promise<JSZip> {
  if (data.byteLength === 0) {
    throw new Error('Kaspi вернул пустой архив — накладные для выбранных заказов ещё не готовы. Накладная появляется после завершения упаковки, когда заказ переходит в «Передачу».')
  }
  try {
    return await JSZip.loadAsync(data)
  } catch {
    throw new Error('Kaspi вернул неожиданный ответ вместо архива накладных. Попробуйте ещё раз, а если повторится — переподключите кабинет.')
  }
}

async function fetchWaybillsZip(sessionCookies: string, merchantId: string): Promise<JSZip> {
  // Весь архив мерчанта качается одним запросом: без таймаута зависший ответ Kaspi
  // держал функцию до лимита Vercel.
  const res = await fetch(`https://mc.shop.kaspi.kz/order/view/mc/order/waybill?merchantId=${encodeURIComponent(merchantId)}`, {
    headers: { 'x-auth-version': '3', 'cookie': sessionCookies, 'origin': 'https://kaspi.kz', 'referer': 'https://kaspi.kz/' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`Waybill fetch failed for merchant ${merchantId}: HTTP ${res.status}`)
  return parseWaybillsZip(await res.arrayBuffer())
}

// Сколько заказов можно просить за один раз и какой длины бывает код. Реальные коды
// Kaspi это цифры (9-10 знаков); границы нужны, чтобы тело запроса не было ни
// пустой строкой (совпадала с первым попавшимся файлом), ни мегабайтным массивом.
export const MAX_WAYBILL_ORDER_CODES = 200
const ORDER_CODE_RE = /^[A-Za-z0-9_-]{1,40}$/

// Приводит тело запроса к списку кодов или возвращает текст ошибки.
export function normalizeOrderCodes(raw: unknown): { codes: string[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'orderCodes обязателен и не должен быть пустым' }
  if (raw.length > MAX_WAYBILL_ORDER_CODES) return { error: `Не больше ${MAX_WAYBILL_ORDER_CODES} заказов за один раз` }
  const codes: string[] = []
  for (const c of raw) {
    if (typeof c !== 'string' || !ORDER_CODE_RE.test(c.trim())) return { error: 'orderCodes должен содержать только номера заказов' }
    const code = c.trim()
    if (!codes.includes(code)) codes.push(code)
  }
  return { codes }
}

// Имя файла в архиве Kaspi: KASPI_SHOP-{orderCode}.pdf (возможно внутри папки).
// Сравнение ТОЧНОЕ: подстрока .includes(orderCode) принимала 105012450 за часть
// 1050124508 и отдавала накладную чужого покупателя (аудит, минор по Заказам).
export function findWaybillEntry(zip: JSZip, orderCode: string): JSZip.JSZipObject | undefined {
  const wanted = `KASPI_SHOP-${orderCode}.pdf`.toLowerCase()
  return Object.values(zip.files).find(f => {
    if (f.dir) return false
    const base = f.name.slice(f.name.lastIndexOf('/') + 1).toLowerCase()
    return base === wanted
  })
}

// Накладные, найденные в архиве, и коды, для которых накладной ещё нет (5-минутная
// задержка Kaspi после «Я упаковал»). Раньше первая ненайденная валила печать всех
// и называла один заказ.
export async function collectWaybillPdfs(zip: JSZip, orderCodes: string[]): Promise<{ pdfs: Buffer[]; missing: string[] }> {
  const pdfs: Buffer[] = []
  const missing: string[] = []
  for (const orderCode of orderCodes) {
    const entry = findWaybillEntry(zip, orderCode)
    if (!entry) { missing.push(orderCode); continue }
    pdfs.push(await entry.async('nodebuffer'))
  }
  return { pdfs, missing }
}

export async function fetchWaybillPdfs(sessionCookies: string, merchantId: string, orderCodes: string[]): Promise<{ pdfs: Buffer[]; missing: string[] }> {
  const zip = await fetchWaybillsZip(sessionCookies, merchantId)
  return collectWaybillPdfs(zip, orderCodes)
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
      // Kaspi's own накладная PDF wraps its actual label content (barcode,
      // addresses, QR) inside just the TOP-LEFT QUARTER of a full-А4-sized
      // MediaBox -- confirmed live 2026-08-26 by decoding a real captured
      // накладная's content stream: every drawn operator's coordinates
      // stayed within x:[11,286] of 595 and y:[429,831] of 842, i.e. one
      // А6-sized cell with ~11pt margins: the rest of the page is blank
      // canvas. Embedding the FULL MediaBox (the previous bug, caught live
      // by the founder -- both А4 and А6 output looked "совсем не то")
      // scaled that blank canvas down too, shrinking the actual label into
      // a tiny corner of each output cell. Cropping to this quarter before
      // measuring/scaling is what makes А6 fill the whole page and А4 tile
      // 4 real labels per sheet, exactly as Kaspi's own cabinet does.
      const { width: mediaWidth, height: mediaHeight } = sourcePage.getSize()
      const contentBox = { left: 0, bottom: mediaHeight / 2, right: mediaWidth / 2, top: mediaHeight }
      // Kaspi's label PDF may carry a /Rotate entry (e.g. a landscape-
      // authored page meant to be VIEWED as portrait) -- embedPage/drawPage
      // read the raw MediaBox only and ignore /Rotate entirely (confirmed
      // against the installed pdf-lib: PDFPageEmbedder's fullPageBoundingBox
      // uses only MediaBox), so it must be compensated for explicitly or a
      // rotated label would render sideways and undersized.
      const rotation = ((sourcePage.getRotation().angle % 360) + 360) % 360
      const embeddedPage = await output.embedPage(sourcePage, contentBox)
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
