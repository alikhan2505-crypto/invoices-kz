# Kaspi Shop — merchantId in competitor tooltip

## Goal

The demping product card's competitor tooltip already shows each competitor's name and price (`competitor_snapshot`), but not their `merchantId`. The seller-facing "excluded merchants" field (`excluded_merchant_ids`) already works end-to-end — the backend filters excluded merchants out of the repricing math in both `checkCycle.ts` branches, and the settings form already lets a seller type comma-separated merchant IDs to exclude. The only real gap: a seller has no way to *discover* a competitor's ID from the tooltip that names them, so populating that field means hunting for the ID elsewhere.

This adds `merchantId` to the tooltip so a seller can copy it straight from the hover text into the exclude field.

## Architecture

`competitor_snapshot` is a JSONB column already storing `{ merchantName, price }[]` — no migration needed, just one more key in the same array of objects.

**Backend** (`src/lib/kaspiShop/checkCycle.ts`): both places that build `competitorSnapshot` (the per-city branch and the legacy flat branch) map from `CompetitorOffer` (`{ merchantId, price, merchantName }`) already — add `merchantId: o.merchantId` to both object literals.

**Frontend** (`src/app/kaspi-shop/page.tsx`): extend the `Product['competitor_snapshot']` type with `merchantId: string`, and update `competitorTooltip()` to render each line as `"${merchantName} — ${price} ₸ (ID ${merchantId})"`.

## Scope note (agreed with founder)

The tooltip is a native HTML `title` attribute — plain hover text, no interactivity. Showing the ID as copyable text is this task's full scope; a clickable "exclude this competitor" control would require replacing the tooltip with a custom popover component, which is a separate, larger UI change and explicitly deferred unless copy-pasting the ID turns out to be annoying in practice.

## Data / error handling

Purely additive field on an existing payload — no new failure modes. Snapshots written before this change simply won't carry `merchantId` until their product's next check cycle; the tooltip already guards `merchantName || 'Продавец'` for a missing name, so the render code does the same for a missing ID (omit the `(ID ...)` suffix rather than showing `(ID undefined)`).

## Testing

`applyPriceCheckResult` (where the snapshot is built) talks to Supabase directly and isn't unit-tested in this codebase (see `checkCycle.test.ts`'s own comment — only pure predicates like `isCheckDue` get unit coverage here; the pure per-city/legacy pricing math is tested separately in `pricing.test.ts`, and this change doesn't touch that math, only the snapshot's field list). `competitorTooltip` is a small inline helper in `page.tsx`, not extracted to a tested `lib/` module, consistent with the rest of that page — no new test infrastructure needed for a one-line format-string change. Verification is `tsc --noEmit` (type change flows through cleanly) plus a manual check on `/kaspi-shop` after deploy that the tooltip shows an ID.
