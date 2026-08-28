# Kaspi Shop — merchantId in Competitor Tooltip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each competitor's `merchantId` next to their name/price in the Kaspi Shop demping card's competitor tooltip, so a seller can copy the ID straight into the existing "excluded merchants" field instead of hunting for it elsewhere.

**Architecture:** `competitor_snapshot` is a JSONB column already storing `{ merchantName, price }[]`. Add `merchantId` as one more key in the same object, written at the two places `checkCycle.ts` already builds this array from `CompetitorOffer` (which already carries `merchantId`). Render it in the existing native `title`-attribute tooltip in `page.tsx`.

**Tech Stack:** Next.js (App Router), TypeScript, Supabase (JSONB column, no schema change needed).

## Global Constraints

- No database migration — `competitor_snapshot` is JSONB, adding a key is a pure code change.
- No new automated tests — matches this codebase's existing convention: `applyPriceCheckResult` talks to Supabase directly and isn't unit-tested (only pure predicates like `isCheckDue` get coverage in `checkCycle.test.ts`); `competitorTooltip` is an inline, non-exported helper in `page.tsx`, consistent with the rest of that file having no colocated test file.
- Snapshots written before this change won't carry `merchantId` until their product's next check cycle — render code must treat it as optional and omit the `(ID ...)` suffix rather than showing `(ID undefined)`.
- Verification is `tsc --noEmit` + a manual check on `/kaspi-shop` after deploy — per the spec's own Testing section.

---

### Task 1: Add merchantId to the competitor snapshot and its tooltip

**Files:**
- Modify: `src/lib/kaspiShop/checkCycle.ts:306-310` (per-city branch's `competitorSnapshot`)
- Modify: `src/lib/kaspiShop/checkCycle.ts:435-439` (legacy flat branch's `competitorSnapshot`)
- Modify: `src/app/kaspi-shop/page.tsx:33` (`Product['competitor_snapshot']` type)
- Modify: `src/app/kaspi-shop/page.tsx:39-42` (`competitorTooltip` function)

**Interfaces:**
- Consumes: `CompetitorOffer` type from `src/lib/kaspiShop/pricing.ts` — already `{ merchantId: string; price: number; merchantName?: string | null }`, unchanged by this task.
- Produces: `competitor_snapshot` JSONB rows now shaped `{ merchantName: string | null; price: number; merchantId: string }[]`. No other task/file depends on this shape changing (grepped: only `checkCycle.ts` writes it, only `page.tsx` reads it).

- [ ] **Step 1: Add `merchantId` to the per-city branch's snapshot**

In `src/lib/kaspiShop/checkCycle.ts`, find (around line 306):

```ts
      const competitorSnapshot = leaderOffers
        .filter(o => !excludedMerchants.includes(o.merchantId))
        .sort((a, b) => a.price - b.price)
        .slice(0, 10)
        .map(o => ({ merchantName: o.merchantName || null, price: o.price }))
```

Change the last line to:

```ts
        .map(o => ({ merchantName: o.merchantName || null, price: o.price, merchantId: o.merchantId }))
```

- [ ] **Step 2: Add `merchantId` to the legacy branch's snapshot**

In the same file, find (around line 435):

```ts
    const competitorSnapshot = (competitorOffers || [])
      .filter(o => !excludedMerchants.includes(o.merchantId))
      .sort((a, b) => a.price - b.price)
      .slice(0, 10)
      .map(o => ({ merchantName: o.merchantName || null, price: o.price }))
```

Change the last line to:

```ts
      .map(o => ({ merchantName: o.merchantName || null, price: o.price, merchantId: o.merchantId }))
```

- [ ] **Step 3: Update the frontend type**

In `src/app/kaspi-shop/page.tsx`, find (around line 33):

```ts
  competitor_snapshot: { merchantName: string | null; price: number }[] | null
```

Replace with (optional, since older rows won't have it yet):

```ts
  competitor_snapshot: { merchantName: string | null; price: number; merchantId?: string }[] | null
```

- [ ] **Step 4: Render the ID in the tooltip**

In the same file, find (around line 39):

```ts
function competitorTooltip(snapshot: Product['competitor_snapshot']): string | undefined {
  if (!snapshot || snapshot.length === 0) return undefined
  return snapshot.map(o => `${o.merchantName || 'Продавец'} — ${o.price.toLocaleString('ru-KZ')} ₸`).join('\n')
}
```

Replace with:

```ts
function competitorTooltip(snapshot: Product['competitor_snapshot']): string | undefined {
  if (!snapshot || snapshot.length === 0) return undefined
  return snapshot
    .map(o => `${o.merchantName || 'Продавец'} — ${o.price.toLocaleString('ru-KZ')} ₸${o.merchantId ? ` (ID ${o.merchantId})` : ''}`)
    .join('\n')
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no output (clean pass).

- [ ] **Step 6: Commit**

```bash
git add src/lib/kaspiShop/checkCycle.ts src/app/kaspi-shop/page.tsx
git commit -m "feat(kaspi-shop): show merchantId in competitor tooltip"
```

- [ ] **Step 7: Push and deploy**

```bash
git pull --rebase --autostash origin main
git push origin main
```

- [ ] **Step 8: Manual verification on production**

Once the Vercel deploy for this commit is READY, open `/kaspi-shop` as an admin, find a tracked product that has a non-empty `competitor_snapshot` (hover over its "Конкурент" price to see the tooltip), and confirm each line now ends with `(ID <number>)`. A product whose snapshot predates this deploy will show no ID until its next check cycle runs — that's expected, not a bug (see Global Constraints).

---

## Self-Review

**Spec coverage:** Goal (show merchantId in tooltip) → Steps 1-4. Architecture (JSONB, no migration, both checkCycle.ts sites, page.tsx type+render) → Steps 1-4. Scope note (native tooltip stays plain text, no popover) → nothing to implement, correctly not a step. Data/error handling (optional field, omit suffix if missing) → Step 3 (`merchantId?: string`) + Step 4 (`o.merchantId ? ... : ''`). Testing (tsc + manual check, no new automated tests) → Steps 5 and 8. All spec sections covered by one task, no gaps.

**Placeholder scan:** No TBD/TODO; every step shows exact before/after code or an exact command with expected output.

**Type consistency:** `merchantId` is `string` on `CompetitorOffer` (unchanged, from `pricing.ts`) and `string?` on the frontend snapshot type — deliberately optional there only, matching the "old rows won't have it yet" constraint; the backend always writes it going forward since `CompetitorOffer.merchantId` is required, never `undefined`, at write time.
