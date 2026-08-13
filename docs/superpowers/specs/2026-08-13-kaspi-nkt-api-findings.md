# Kaspi Shop: Нераспознанные товары — live API findings (2026-08-13)

Live-captured against the real, already-connected account (merchant 425002, "ABIL-SISTERS") via chrome-devtools-mcp on `kaspi.kz/mc/#/products/pending`.

## Correction to the original design doc assumption

The original design doc (`2026-08-13-kaspi-shop-nkt-catalog-design.md`) assumed this feature was about НКТ (National Product Catalog) compliance, based on a `merchant-nct/mc/nct/kassa-status` request observed firing on every cabinet page load. That endpoint was live-tested this session and is **unrelated**:

```
GET https://mc.shop.kaspi.kz/merchant-nct/mc/nct/kassa-status?m=425002
→ 200 {"merchantUid":"425002","kaspiKassaActive":false}
```

This is a **Kaspi Kassa (cash register / POS) activation flag**, a single boolean per merchant — not a per-product classification status. It fires globally because the cabinet shell shows a POS-setup nudge banner, not because it relates to product recognition. Discard it entirely from this feature's design.

The real feature, reachable from the cabinet's own ТОВАРЫ nav as "Нераспознанные товары" (`kaspi.kz/mc/#/products/pending`), is about products Kaspi's catalog-matching system could not automatically link to an existing master product/category — sellers must manually assign a category (and Kaspi's own moderation may reject the assignment). It has nothing to do with tax/cash-register compliance.

## Real endpoints

### Counts per tab

```
GET https://mc.shop.kaspi.kz/content/pending/mc/product/{merchantId}/count
→ 200 {"IMPORTED":0,"CHECK":3,"PENDING":0,"TRASH":0}
```

Confirmed live for merchant 425002. Powers the 4 tab badges. Real UI tab labels, in the order they appear in the cabinet, with the `approvalStatus` value each maps to (only `CHECK` directly confirmed by opening that tab — the other three sat at 0 for this account, so their exact key was inferred from position/semantics, not observed with a populated response):

| Tab label (ru) | approvalStatus key | Confirmed |
|---|---|---|
| Без привязки | `CHECK` | Yes — opened this tab live, matches the list response below |
| Требуют доработок | `PENDING` | Inferred only (count was 0) |
| На проверке | `IMPORTED` | Inferred only (count was 0) |
| Отклонены | `TRASH` | Inferred only (count was 0) |

v1 should treat the `PENDING`/`IMPORTED`/`TRASH` mapping as unconfirmed and either verify live with a seller account that has items in those states before shipping tab-switching, or ship only the confirmed `CHECK` tab in v1 and mark the others "скоро" — see Open Question below.

### List (paginated)

```
POST https://mc.shop.kaspi.kz/bff/pending-products/{merchantId}
Body: {"page":1,"searchTerm":"","pageSize":5,"approvalStatus":"CHECK","isMobileApp":false}
→ 201
```

Note: real page numbering starts at 1, not 0 (unlike `getOrders`, which starts at 0 — don't assume the same convention). Real page size used by the SPA itself was 5; not confirmed whether larger sizes are rejected the way `getOrders`' `size:50` was — treat 5 as the safe default unless independently verified.

Response shape (`data: [...]`), one real captured item (fields trimmed to what's relevant, full response has more per-item detail available in the raw capture if needed later):

```json
{
  "code": "<product code>",
  "name": "<real product name, e.g. a long-sleeve garment title>",
  "brand": "Abil.Sisters",
  "brandChosenByAI": false,
  "category": {
    "code": "<category code>",
    "name": "<category name>",
    "closed": false,
    "leaf": false,
    "restrictionType": null,
    "hasChildRestrictions": false,
    "chosenByAI": false
  },
  "description": "<text>",
  "moderationDeadline": "<ISO date>",
  "firstImportedDate": "<ISO date>",
  "currentStatusDate": "<ISO date>",
  "colours": [],
  "images": [
    {
      "small": "https://resources.cdn-kaspi.kz/img/mc/p/<uuid>/<uuid>/<uuid>.jpeg?format=gallery-small",
      "medium": "...?format=gallery-medium",
      "large": "...?format=gallery-large",
      "width": 0,
      "height": 0,
      "location": "...",
      "bucketName": "...",
      "sourceBucket": "...",
      "sourceLocation": "...",
      "generatedByAI": false,
      "needManual": false,
      "visualType": "..."
    }
  ],
  "masterProductRemoveReason": null,
  "disputeDto": null
}
```

Key confirmations:
- Image CDN URL pattern is **different** from the order-product image pattern (`baseUrl + paths[]`) already used in `cabinetApi.ts`. Here each image object carries pre-built `small`/`medium`/`large` URLs directly — use `small` or `medium` for a list view, no URL-building needed.
- `category` is present but often not a leaf/closed category (`leaf: false`) — this is Kaspi's *best guess*, not a confirmed assignment. v1 (read-only) should surface this as "Kaspi suggests: {category.name}" rather than implying it's already assigned.
- No per-product "reason" field explaining *why* it's unrecognized was observed populated (`masterProductRemoveReason` and `disputeDto` were both `null` on the captured item) — a real rejected/dispute item (from the Отклонены tab) would be needed to confirm those fields' populated shape. Not required for v1's read-only "Без привязки" list.

## Open question for the design doc

Given only the `CHECK` (Без привязки) tab was observed with real data, and the exact `approvalStatus` values for the other 3 tabs are inferred rather than confirmed, v1 should either:
(a) ship only the "Без привязки" tab live, with the other three shown as disabled/"скоро" placeholders within the same page, or
(b) ship all 4 tabs using the inferred keys, accepting the small risk one of the three untested keys is wrong (in which case that tab would just render an empty list against a real non-empty backend state).

Recommendation: (a) — matches this project's established discipline of not shipping unconfirmed request shapes, and the seller's real account had 0 items in the other 3 states anyway, so there's nothing to lose by deferring them.
