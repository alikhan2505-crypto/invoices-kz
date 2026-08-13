import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { mergeWaybillPdfs } from './waybills'

async function makeTestPdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) doc.addPage([200, 200])
  return Buffer.from(await doc.save())
}

describe('mergeWaybillPdfs', () => {
  it('merges multiple PDFs into one containing all pages, in order', async () => {
    const pdf1 = await makeTestPdf(2)
    const pdf2 = await makeTestPdf(3)
    const merged = await mergeWaybillPdfs([pdf1, pdf2])
    const mergedDoc = await PDFDocument.load(merged)
    expect(mergedDoc.getPageCount()).toBe(5)
  })

  it('returns a valid single-page PDF when given just one', async () => {
    const pdf1 = await makeTestPdf(1)
    const merged = await mergeWaybillPdfs([pdf1])
    const mergedDoc = await PDFDocument.load(merged)
    expect(mergedDoc.getPageCount()).toBe(1)
  })
})
