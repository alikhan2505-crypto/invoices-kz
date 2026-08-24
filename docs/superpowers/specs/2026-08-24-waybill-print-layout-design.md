# Накладная Print Layout: А4/А6 — Design

## Context

Founder request (2026-08-24), grounded in a real накладная PDF the founder uploaded: each order's накладная from Kaspi's merchant-wide ZIP endpoint (`docs/superpowers/plans/2026-08-23-накладная-fix`, `src/lib/kaspiShop/waybills.ts`) is already its own single-label PDF page — barcode, QR, box label, "1/1" page marker. `mergeWaybillPdfs` today just concatenates these pages one after another (effectively an А6-per-page layout already, since Kaspi's own generated labels are narrow shipping-label pages, not А4-sized). The founder wants an explicit choice between printing on a regular А4 printer (multiple labels per sheet, matching how Kaspi's own cabinet packs 4-per-А4) and a dedicated А6 label printer (one label per page, sized to true А6) — a stated differentiator versus competitor tools during this session's earlier competitor research.

## Architecture

### One shared grid-imposition primitive

`src/lib/kaspiShop/waybills.ts` gets a single function, `packWaybillsToPages(pdfBuffers: Buffer[], pageSize: [number, number], cols: number, rows: number): Promise<Buffer>`, built on `pdf-lib`'s `embedPage`/`drawPage` (the standard N-up imposition pattern — load each source PDF, embed its first page into a new document, draw it scaled into a grid cell of the new page). Both output formats are just different parameters to this one function:

- **А6** — `pageSize = [297.6, 419.5]` (true 105×148mm in points), `cols=1, rows=1`. One label per page, scaled to fill true А6 dimensions rather than whatever raw size Kaspi's own generated PDF happens to use — this guarantees a predictable, real А6 page regardless of Kaspi's actual label dimensions (never directly inspected/confirmed).
- **А4** — `pageSize = PageSizes.A4` (pdf-lib built-in, 595.28×841.89pt), `cols=2, rows=2`. Up to 4 labels per sheet, filled in reading order (left→right, top→bottom); fewer than 4 selected orders simply leaves the remaining cells blank — e.g. 2 selected orders places 2 labels in the top row, bottom row empty, matching the founder's own description.

Each cell reserves a small fixed margin (10pt) so labels never touch the page edge or each other. Within a cell, the source label is scaled uniformly (never stretched/distorted independently per axis — barcodes and QR codes must keep their aspect ratio to stay scannable) to the largest size that fits the cell's content box, then centered.

`mergeWaybillPdfs` (the current one-page-per-label concatenation) is removed — its old A6-like behavior is now `packWaybillsToPages(buffers, A6_SIZE, 1, 1)`, which additionally normalizes every label to true А6 dimensions instead of passing Kaspi's raw page size through unchanged.

### API

`POST /api/kaspi-shop/orders/waybills` gains a required `format: 'a4' | 'a6'` field in its JSON body (alongside the existing `orderCodes`). Invalid/missing format is a 400. Response `Content-Disposition` filename becomes `nakladnye_a4.pdf` / `nakladnye_a6.pdf`.

### UI

The single "Распечатать все накладные" button in the bulk-select bar (`src/app/kaspi-shop/orders/page.tsx`) is replaced with two buttons — "Скачать А4" and "Скачать А6" — both calling the same `printWaybills` flow with a `format` argument, no remembered preference (founder chose explicit buttons over a toggle+memory).

## Testing

`packWaybillsToPages` is pure PDF manipulation (no network) and unit-testable: build small single-page dummy PDFs via `pdf-lib` in test setup (arbitrary label-like dimensions, e.g. 288×432pt matching a typical 4×6" shipping label), and assert:
- Output page count is `ceil(n / (cols*rows))` for n inputs across representative counts (1, 2, 4, 5, 8).
- Every output page matches the exact requested `pageSize`.
- Zero-input case returns an empty/valid PDF without throwing.

Visual placement (exact x/y per cell) is verified by code review of the cell-math formula rather than pixel-diffing rendered output — out of scope for automated tests, consistent with this codebase's existing PDF-generation testing depth.

## Explicitly out of scope

Remembering the founder's last-used format (explicit buttons chosen instead); any change to which orders are eligible for накладная printing (still `BULK_PRINTABLE_STATUSES`); the separate "Упаковка confirmation button" feature raised in the same conversation — that is its own, not-yet-scoped follow-up.
