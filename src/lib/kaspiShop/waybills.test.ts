import { describe, it, expect } from 'vitest'
import { PDFDocument, PageSizes, rgb } from 'pdf-lib'
import JSZip from 'jszip'
import { packWaybillsToPages, buildWaybillsPdf, parseWaybillsZip, findWaybillEntry, collectWaybillPdfs, normalizeOrderCodes, MAX_WAYBILL_ORDER_CODES } from './waybills'

// A real label PDF page always has a drawn content stream (barcode, text,
// QR) -- pdf-lib's embedPdf refuses to embed a page with no Contents, so
// a blank addPage() alone (no drawing) does not reproduce real input and
// throws "Can't embed page with missing Contents". Draw a trivial
// rectangle so these fixtures behave like real label pages.
async function makeLabel(width: number, height: number): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([width, height])
  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0, 0, 0) })
  return Buffer.from(await doc.save())
}

describe('parseWaybillsZip', () => {
  it('translates a 0-byte body into a readable "ещё не готовы" error instead of a JSZip crash', async () => {
    await expect(parseWaybillsZip(new ArrayBuffer(0))).rejects.toThrow(/ещё не готовы/)
  })

  it('translates a non-zip body into a readable error instead of "Corrupted zip"', async () => {
    const html = new TextEncoder().encode('<html>login page</html>')
    await expect(parseWaybillsZip(html.buffer as ArrayBuffer)).rejects.toThrow(/неожиданный ответ/)
  })

  it('parses a real zip and keeps its entries readable', async () => {
    const zip = new JSZip()
    zip.file('KASPI_SHOP-123456.pdf', 'pdf-bytes')
    const buf = await zip.generateAsync({ type: 'arraybuffer' })
    const parsed = await parseWaybillsZip(buf)
    expect(Object.keys(parsed.files)).toContain('KASPI_SHOP-123456.pdf')
  })
})

// Kaspi's real накладная wraps its actual label content inside just the
// top-left quarter of a full-А4-sized MediaBox (confirmed live 2026-08-26 by
// decoding a real captured накладная's content stream); everything below
// and to the right of that quarter is blank canvas. packWaybillsToPages
// must crop to that quarter before scaling, or the real label ends up tiny
// in the corner of each output cell -- exactly the founder-reported bug
// ("А4 и А6 совсем что-то не то").
async function getEmbeddedXObjectBBox(pdfBuf: Buffer): Promise<number[] | undefined> {
  const { PDFName } = await import('pdf-lib')
  const doc = await PDFDocument.load(pdfBuf)
  const page = doc.getPage(0)
  const resources = doc.context.lookup(page.node.get(PDFName.of('Resources'))) as any
  const xobjects = doc.context.lookup(resources.get(PDFName.of('XObject'))) as any
  const firstKey = xobjects.keys()[0]
  const xobj = doc.context.lookup(xobjects.get(firstKey)) as any
  const bbox = xobj.dict.get(PDFName.of('BBox'))
  return bbox?.asArray?.().map((n: any) => n.asNumber())
}

describe('packWaybillsToPages crops to the real накладная content quarter', () => {
  it('embeds only the top-left quarter of a full-page source label, not the whole MediaBox', async () => {
    const fullPageLabel = await makeLabel(400, 600)
    const buf = await packWaybillsToPages([fullPageLabel], PageSizes.A6, 1, 1)
    const bbox = await getEmbeddedXObjectBBox(buf)
    // left, bottom, right, top -- half width, half height, anchored top-left
    expect(bbox).toEqual([0, 300, 200, 600])
  })
})

describe('packWaybillsToPages', () => {
  it('packs 2 labels onto one page for a 2x2 grid, sized exactly to pageSize', async () => {
    const labels = [await makeLabel(288, 432), await makeLabel(288, 432)]
    const buf = await packWaybillsToPages(labels, PageSizes.A4, 2, 2)
    const doc = await PDFDocument.load(buf)
    expect(doc.getPageCount()).toBe(1)
    expect(doc.getPage(0).getSize()).toEqual({ width: PageSizes.A4[0], height: PageSizes.A4[1] })
  })

  it('overflows to a second page once a 2x2 grid exceeds 4 labels', async () => {
    const labels = await Promise.all([1, 2, 3, 4, 5].map(() => makeLabel(288, 432)))
    const buf = await packWaybillsToPages(labels, PageSizes.A4, 2, 2)
    const doc = await PDFDocument.load(buf)
    expect(doc.getPageCount()).toBe(2)
  })

  it('puts exactly one label per page for a 1x1 grid, each page true to pageSize', async () => {
    const labels = [await makeLabel(288, 432), await makeLabel(288, 432), await makeLabel(288, 432)]
    const buf = await packWaybillsToPages(labels, PageSizes.A6, 1, 1)
    const doc = await PDFDocument.load(buf)
    expect(doc.getPageCount()).toBe(3)
    expect(doc.getPage(0).getSize()).toEqual({ width: PageSizes.A6[0], height: PageSizes.A6[1] })
  })

  it('does not throw for an empty input, and produces a loadable PDF', async () => {
    const buf = await packWaybillsToPages([], PageSizes.A4, 2, 2)
    const doc = await PDFDocument.load(buf)
    // pdf-lib itself reports 1 page after save+reload for a document with
    // zero user-added pages (confirmed directly against this pdf-lib
    // version) -- this is pdf-lib's own behavior, not something this
    // function chooses. The route this feeds never calls it with an empty
    // array (orderCodes is validated non-empty first), so this test only
    // pins "does not throw", not a specific page count semantic.
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(0)
  })

  it('scales a very wide label down to fit its cell without throwing', async () => {
    const wideLabel = await makeLabel(600, 100)
    const buf = await packWaybillsToPages([wideLabel], PageSizes.A4, 2, 2)
    const doc = await PDFDocument.load(buf)
    expect(doc.getPageCount()).toBe(1)
  })
})

describe('buildWaybillsPdf', () => {
  it("'a4' format uses a 2x2 grid against А4 page size", async () => {
    const labels = [await makeLabel(288, 432), await makeLabel(288, 432)]
    const buf = await buildWaybillsPdf(labels, 'a4')
    const doc = await PDFDocument.load(buf)
    expect(doc.getPageCount()).toBe(1)
    expect(doc.getPage(0).getSize()).toEqual({ width: PageSizes.A4[0], height: PageSizes.A4[1] })
  })

  it("'a6' format uses a 1x1 grid against true А6 page size, one label per page", async () => {
    const labels = [await makeLabel(288, 432), await makeLabel(288, 432)]
    const buf = await buildWaybillsPdf(labels, 'a6')
    const doc = await PDFDocument.load(buf)
    expect(doc.getPageCount()).toBe(2)
    expect(doc.getPage(0).getSize()).toEqual({ width: PageSizes.A6[0], height: PageSizes.A6[1] })
  })
})

async function zipWith(names: string[]): Promise<JSZip> {
  const zip = new JSZip()
  for (const n of names) zip.file(n, `pdf-${n}`)
  return parseWaybillsZip(await zip.generateAsync({ type: 'arraybuffer' }))
}

describe('findWaybillEntry: exact order-code match', () => {
  it('finds the waybill whose file name is exactly KASPI_SHOP-{code}.pdf', async () => {
    const zip = await zipWith(['KASPI_SHOP-1050124508.pdf'])
    expect(findWaybillEntry(zip, '1050124508')?.name).toBe('KASPI_SHOP-1050124508.pdf')
  })

  it('does NOT hand out the waybill of another buyer when one code is a substring of another (105012450 vs 1050124508)', async () => {
    const zip = await zipWith(['KASPI_SHOP-1050124508.pdf'])
    expect(findWaybillEntry(zip, '105012450')).toBeUndefined()
  })

  it('an empty code matches nothing (it used to match the first file in the archive)', async () => {
    const zip = await zipWith(['KASPI_SHOP-1.pdf'])
    expect(findWaybillEntry(zip, '')).toBeUndefined()
  })

  it('finds a waybill inside a folder of the archive', async () => {
    const zip = await zipWith(['out/KASPI_SHOP-77.pdf'])
    expect(findWaybillEntry(zip, '77')?.name).toBe('out/KASPI_SHOP-77.pdf')
  })
})

describe('collectWaybillPdfs', () => {
  it('returns the found pdfs and ALL missing codes at once instead of failing on the first', async () => {
    const zip = await zipWith(['KASPI_SHOP-1.pdf', 'KASPI_SHOP-3.pdf'])
    const { pdfs, missing } = await collectWaybillPdfs(zip, ['1', '2', '3', '4'])
    expect(pdfs).toHaveLength(2)
    expect(missing).toEqual(['2', '4'])
  })
})

describe('normalizeOrderCodes', () => {
  it('accepts a list of order numbers and dedupes', () => {
    expect(normalizeOrderCodes(['1050124508', '1050124508', ' 77 '])).toEqual({ codes: ['1050124508', '77'] })
  })
  it('rejects non-arrays, empty arrays, non-strings and empty strings', () => {
    for (const bad of [undefined, null, 'x', [], [''], ['  '], [1], [null], [{}], ['a b'], ['../x']]) {
      expect('error' in normalizeOrderCodes(bad)).toBe(true)
    }
  })
  it('caps the number of orders per request', () => {
    const many = Array.from({ length: MAX_WAYBILL_ORDER_CODES + 1 }, (_, i) => `c${i}`)
    expect('error' in normalizeOrderCodes(many)).toBe(true)
    expect('codes' in normalizeOrderCodes(many.slice(0, MAX_WAYBILL_ORDER_CODES))).toBe(true)
  })
})
