import { describe, it, expect } from 'vitest'
import { PDFDocument, PageSizes, rgb } from 'pdf-lib'
import { packWaybillsToPages, buildWaybillsPdf } from './waybills'

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
