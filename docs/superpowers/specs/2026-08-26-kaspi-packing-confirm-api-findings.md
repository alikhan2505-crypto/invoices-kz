# Kaspi Packing Confirmation ("Я упаковал, сформировать накладные") — Findings

Captured live 2026-08-26 on merchant 30067228, correcting a real bug the
founder caught: накладные do not exist for an order sitting in Упаковка.
This session's earlier "corrupted zip" fix (75e57e9, 2026-08-25) treated
that as an edge case to error-message around; it is actually the ONLY
correct state for Упаковка, always, because Kaspi generates the накладная
only when packing is explicitly confirmed.

## The real flow, confirmed end-to-end

1. Cabinet's Упаковка list (`/mc/#/orders?status=KASPI_DELIVERY_CARGO_ASSEMBLY`)
   has row checkboxes + two buttons: «Скачать лист подбора» (picking list,
   unrelated to накладные — not built, out of scope) and «Сформировать
   накладные» (disabled until ≥1 row selected). NOT a print/download action
   despite the name — see below.
2. Selecting a row and clicking «Сформировать накладные» fires:
   ```
   POST https://mc.shop.kaspi.kz/mc/api/order/cargo/assembled?_m={merchantId}
   Body: {"cargos":[{"orderCode":"1050124508","newCargoSpace":1,"quantity":9}]}
   → 200, empty body
   ```
   `newCargoSpace` = «Количество мест» (package count; the cabinet defaults
   it to 1 and lets the seller edit it before submitting — not exposed in
   our UI for v1, always sent as 1). `quantity` = total unit count across
   the order's line items (confirmed: order had one line item at quantity
   9, matching the list's "Количество товаров" column exactly).
3. An alert banner appears immediately: **"Накладные будут сформированы в
   течение 5 минут на странице заказа в разделе «Передача»"** — confirming
   the action is async and накладные live exclusively under Передача.
4. Confirmed by direct observation: the instant the call returned, the
   order vanished from Упаковка (count 1→0) and appeared under Передача
   (count 0→1) — the status transition is synchronous even though the PDF
   generation is not.
5. This is exactly the same flow shown in the mobile seller app screenshot
   the founder provided: a packing checklist ending in one button, "Я
   упаковал, сформировать накладные" — same action, same endpoint family,
   confirmed as the single source of truth across both surfaces.

## Every other order tab audited live, no накладная-related action found

Checked against real data on both 30067228 and 425002 (ABIL-SISTERS):
Новые, На подписании, Самовывоз, Моя доставка, Передача (has «Распечатать
все накладные» — a single global button, no per-row selection, prints
everything in the current view at once), Переданы на доставку (Excel export
only), Отменены при доставке (Excel export only, plus a real "Кол-во дней с
момента отказа" / "Состояние заказа" pair of columns not currently
surfaced anywhere in our app — noted as a possible future enhancement, not
a bug), Архив. None of these carry any hidden packing/накладная action; the
bug was isolated entirely to Упаковка.

## Correction applied

`BULK_PRINTABLE_STATUSES` (wrongly included both Упаковка and Передача for
waybill printing) split into:
- `BULK_SELECTABLE_STATUSES` — both statuses still support the shared
  checkbox-selection + date-filter UI, since that scaffolding is generic.
- `WAYBILL_PRINTABLE_STATUSES` — Передача only. Waybill printing UI never
  renders on Упаковка again.

Упаковка's selection bar now renders «Я упаковал, сформировать накладные»
(`POST /api/kaspi-shop/orders/confirm-packing` → `confirmPacking()` in
`cabinetApi.ts`) instead of the А4/А6 print buttons it never should have
had.

## Bonus finding: the А4/А6 grid-imposition bug it uncovered

While confirming накладные became available under Передача, a REAL
накладная was captured (order 1050124508, via the merchant-wide waybill ZIP
endpoint) and inspected directly -- this immediately explained a second,
independent bug the founder had already flagged from a screenshot ("А4 и
А6 совсем что-то не то"):

Kaspi's real накладная PDF page is **595.275 × 841.875 pt — a full А4
canvas** — but decoding its content stream (FlateDecode-compressed, 1479
raw / 7125 decoded bytes) showed every single drawn operator (barcodes,
text, the QR code's Form XObject placement) stays within **x:[11,286] of
595, y:[429,831] of 842** — i.e. the real label content occupies exactly
the **top-left quarter** of the page (≈ one А6-sized cell with ~11pt
margins), and the rest of the canvas is blank. `packWaybillsToPages()`
(`src/lib/kaspiShop/waybills.ts`) was embedding the page's FULL MediaBox,
so its scaling math shrank that blank canvas right along with the real
content — the actual label ended up a tiny box in one corner of each
target cell instead of filling it.

Fix: crop to `{ left: 0, bottom: mediaHeight/2, right: mediaWidth/2, top:
mediaHeight }` via pdf-lib's `embedPage(page, boundingBox)` (its
`PDFEmbeddedPage.width/height` are derived from the passed boundingBox, so
the rest of the scale/position math needed no changes). Verified two ways:
(1) a new unit test asserts the embedded XObject's own `/BBox` in the
output PDF equals the cropped quarter, not the full page; (2) the real
captured накладная was run through the fixed code and screenshotted in
Chrome — А6 now fills the whole page edge-to-edge, and А4 tiles 4 full,
legible labels (2 top + 2 bottom), matching the cabinet's own layout
exactly.
