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
