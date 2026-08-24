# Накладная Print Layout (А4/А6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a seller choose А4 (up to 4 накладные per sheet, regular printer) or А6 (one накладная per page, true label-printer size) when downloading накладные for selected orders.

**Architecture:** One pure grid-imposition primitive, `packWaybillsToPages`, built on `pdf-lib`'s `embedPdf`/`drawPage` — it packs each input PDF's first page into a `cols`×`rows` grid of cells per output page, scaling each label uniformly (never distorting aspect ratio) to fit its cell and centering it. А6 mode is `cols=1,rows=1` against true А6 dimensions; А4 mode is `cols=2,rows=2` against А4. A thin `buildWaybillsPdf(buffers, format)` wrapper picks the right page size/grid. The API route gains a required `format` field; the frontend replaces the single print button with two.

**Tech Stack:** `pdf-lib` (already a dependency), Next.js API route, React (client component), Vitest.

## Global Constraints

- Labels are never stretched/distorted independently per axis — uniform scale only, so barcodes/QR codes stay scannable.
- А6 output pages use `PageSizes.A6` (true 105×148mm), not whatever raw page size Kaspi's own generated label PDF happens to be (never confirmed) — same for А4 using `PageSizes.A4`.
- Each grid cell reserves a 10pt margin on every side.
- No remembered format preference — two explicit buttons, per the design's UI decision.

---

### Task 1: `packWaybillsToPages` + `buildWaybillsPdf` in `waybills.ts`

**Files:**
- Modify: `src/lib/kaspiShop/waybills.ts`
- Modify (rewrite): `src/lib/kaspiShop/waybills.test.ts`

**Interfaces:**
- Produces: `packWaybillsToPages(pdfBuffers: Buffer[], pageSize: [number, number], cols: number, rows: number): Promise<Buffer>` (exported)
- Produces: `type WaybillFormat = 'a4' | 'a6'` (exported)
- Produces: `buildWaybillsPdf(pdfBuffers: Buffer[], format: WaybillFormat): Promise<Buffer>` (exported)
- Removes: `mergeWaybillPdfs` (no longer used by any caller after Task 2)

The existing `fetchWaybillPdfs` function in this file is unchanged and out of scope for this task.

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `src/lib/kaspiShop/waybills.test.ts` with:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/kaspiShop/waybills.test.ts`
Expected: FAIL — `packWaybillsToPages`/`buildWaybillsPdf` are not exported from `./waybills` (the module currently only exports `fetchWaybillPdfs` and `mergeWaybillPdfs`)

- [ ] **Step 3: Replace `mergeWaybillPdfs` with the new functions**

In `src/lib/kaspiShop/waybills.ts`, change the import line:

```ts
import { PDFDocument } from 'pdf-lib'
```

to:

```ts
import { PDFDocument, PageSizes } from 'pdf-lib'
```

Then replace this block (the current final function in the file):

```ts
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
```

with:

```ts
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
      const [embeddedPage] = await output.embedPdf(batch[j])
      const col = j % cols
      const row = Math.floor(j / cols)
      const cellX = col * cellWidth
      const cellY = pageHeight - (row + 1) * cellHeight
      const availableWidth = cellWidth - CELL_MARGIN * 2
      const availableHeight = cellHeight - CELL_MARGIN * 2
      const scale = Math.min(availableWidth / embeddedPage.width, availableHeight / embeddedPage.height)
      const drawnWidth = embeddedPage.width * scale
      const drawnHeight = embeddedPage.height * scale
      page.drawPage(embeddedPage, {
        x: cellX + (cellWidth - drawnWidth) / 2,
        y: cellY + (cellHeight - drawnHeight) / 2,
        width: drawnWidth,
        height: drawnHeight,
      })
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/kaspiShop/waybills.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/kaspiShop/waybills.ts src/lib/kaspiShop/waybills.test.ts
git commit -m "feat(kaspi-shop): А4/А6 grid-imposition for накладная printing"
```

---

### Task 2: `format` field on the waybills API route

**Files:**
- Modify: `src/app/api/kaspi-shop/orders/waybills/route.ts`

**Interfaces:**
- Consumes: `buildWaybillsPdf(pdfBuffers, format)`, `type WaybillFormat` from Task 1
- Produces: `POST /api/kaspi-shop/orders/waybills` now requires `{ orderCodes: string[], format: 'a4' | 'a6' }` in the JSON body; response filename becomes `nakladnye_a4.pdf` / `nakladnye_a6.pdf`

- [ ] **Step 1: Update the route**

Replace:

```ts
import { fetchWaybillPdfs, mergeWaybillPdfs } from '@/lib/kaspiShop/waybills'
```

with:

```ts
import { fetchWaybillPdfs, buildWaybillsPdf, type WaybillFormat } from '@/lib/kaspiShop/waybills'
```

Replace:

```ts
  const orderCodes: string[] = body?.orderCodes
  if (!Array.isArray(orderCodes) || orderCodes.length === 0) {
    return NextResponse.json({ error: 'orderCodes обязателен и не должен быть пустым' }, { status: 400 })
  }

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён' }, { status: 400 })
  }

  let pdfs: Buffer[]
  try {
    pdfs = await fetchWaybillPdfs(connection.sessionCookies, connection.merchantId, orderCodes)
  } catch (err: any) {
    return NextResponse.json({ error: `Не удалось получить накладную: ${err.message}` }, { status: 502 })
  }

  const merged = await mergeWaybillPdfs(pdfs)
  return new NextResponse(new Uint8Array(merged), {
    status: 200,
    headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="nakladnye.pdf"' },
  })
```

with:

```ts
  const orderCodes: string[] = body?.orderCodes
  if (!Array.isArray(orderCodes) || orderCodes.length === 0) {
    return NextResponse.json({ error: 'orderCodes обязателен и не должен быть пустым' }, { status: 400 })
  }
  const format: WaybillFormat = body?.format
  if (format !== 'a4' && format !== 'a6') {
    return NextResponse.json({ error: "format обязателен и должен быть 'a4' или 'a6'" }, { status: 400 })
  }

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён' }, { status: 400 })
  }

  let pdfs: Buffer[]
  try {
    pdfs = await fetchWaybillPdfs(connection.sessionCookies, connection.merchantId, orderCodes)
  } catch (err: any) {
    return NextResponse.json({ error: `Не удалось получить накладную: ${err.message}` }, { status: 502 })
  }

  const merged = await buildWaybillsPdf(pdfs, format)
  return new NextResponse(new Uint8Array(merged), {
    status: 200,
    headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="nakladnye_${format}.pdf"` },
  })
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/kaspi-shop/orders/waybills/route.ts
git commit -m "feat(kaspi-shop): waybills route accepts format (a4/a6)"
```

---

### Task 3: Two print buttons on the Orders page

**Files:**
- Modify: `src/app/kaspi-shop/orders/page.tsx`

**Interfaces:**
- Consumes: `POST /api/kaspi-shop/orders/waybills` with `{ orderCodes, format }` (Task 2)

- [ ] **Step 1: Change `printWaybills` to take a format argument**

Replace:

```ts
  async function printWaybills() {
    if (selected.size === 0) return
    setPrinting(true)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/orders/waybills', {
        method: 'POST', headers, body: JSON.stringify({ orderCodes: Array.from(selected) }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setLoadError(data.error || 'Не удалось получить накладные')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'nakladnye.pdf'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally {
      setPrinting(false)
    }
  }
```

with:

```ts
  async function printWaybills(format: 'a4' | 'a6') {
    if (selected.size === 0) return
    setPrinting(true)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/orders/waybills', {
        method: 'POST', headers, body: JSON.stringify({ orderCodes: Array.from(selected), format }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setLoadError(data.error || 'Не удалось получить накладные')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `nakladnye_${format}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally {
      setPrinting(false)
    }
  }
```

- [ ] **Step 2: Render two buttons instead of one**

Replace:

```tsx
        {BULK_PRINTABLE_STATUSES.includes(status) && selected.size > 0 && (
          <div className="rounded-2xl p-3 flex items-center justify-between gap-3 mb-4" style={{ background: 'var(--nav-accent)' }}>
            <span className="text-sm" style={{ color: 'var(--nav-accent-ink)' }}>Выбрано заказов: {selected.size}</span>
            <button onClick={printWaybills} disabled={printing}
              className="text-xs font-medium rounded-lg px-3 py-2 disabled:opacity-50" style={{ background: 'var(--nav-accent-ink)', color: 'var(--nav-accent)' }}>
              {printing ? 'Готовим PDF...' : 'Распечатать все накладные'}
            </button>
          </div>
        )}
```

with:

```tsx
        {BULK_PRINTABLE_STATUSES.includes(status) && selected.size > 0 && (
          <div className="rounded-2xl p-3 flex items-center justify-between gap-3 mb-4" style={{ background: 'var(--nav-accent)' }}>
            <span className="text-sm" style={{ color: 'var(--nav-accent-ink)' }}>Выбрано заказов: {selected.size}</span>
            <div className="flex gap-2">
              <button onClick={() => printWaybills('a4')} disabled={printing}
                className="text-xs font-medium rounded-lg px-3 py-2 disabled:opacity-50" style={{ background: 'var(--nav-accent-ink)', color: 'var(--nav-accent)' }}>
                {printing ? 'Готовим PDF...' : 'Скачать А4'}
              </button>
              <button onClick={() => printWaybills('a6')} disabled={printing}
                className="text-xs font-medium rounded-lg px-3 py-2 disabled:opacity-50" style={{ background: 'var(--nav-accent-ink)', color: 'var(--nav-accent)' }}>
                {printing ? 'Готовим PDF...' : 'Скачать А6'}
              </button>
            </div>
          </div>
        )}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`, open `/kaspi-shop/orders?status=KASPI_DELIVERY_WAIT_FOR_COURIER`. Select an order, verify both "Скачать А4" and "Скачать А6" buttons render, and clicking each fires a request to `/api/kaspi-shop/orders/waybills` with the right `format` in the body (check via the Network tab; a real download requires a live connected Kaspi session, which may not be available in this environment — note in the report whether a live order was actually available to test against, and if not, confirm the request shape and any error response is sane instead).

- [ ] **Step 5: Commit**

```bash
git add src/app/kaspi-shop/orders/page.tsx
git commit -m "feat(kaspi-shop): separate А4/А6 print buttons on Orders page"
```
