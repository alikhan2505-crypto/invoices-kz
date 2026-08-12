# Kaspi Shop v2: Cabinet-Bot Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Exception — Task 1 is controller-only, not subagent-dispatchable.** It requires live interaction with the user's real Kaspi account and the controller's own browser-automation tool access (chrome-devtools-mcp) in real time. Do not dispatch it to an implementer subagent. Every later task that touches login, session, or price-push mechanics has a **Consumes: Task 1 findings** line — read `docs/superpowers/specs/2026-08-12-kaspi-cabinet-api-findings.md` (produced by Task 1) before starting that task, and treat its exact request/response shapes as authoritative over anything guessed in this plan.

**Goal:** Replace Kaspi Shop's official-API-only connection with a cabinet-bot connection (real Kaspi Магазин login), unlocking per-city catalog import, instant price pushes, and richer repricing algorithms.

**Architecture:** A new `src/lib/kaspiShop/cabinetAuth.ts` module logs into `idmc.shop.kaspi.kz` and stores the resulting session cookies (encrypted, same AES-256-GCM helper as the rest of Kaspi Shop). A new `src/lib/kaspiShop/cabinetApi.ts` module wraps authenticated calls to `mc.shop.kaspi.kz` (GraphQL `getMerchant`, REST `bff/offer-view/list`, and the price-push call captured in Task 1). Pricing logic gains per-city support and three new algorithms; the check cycle gains a rolling rate-limit budget.

**Tech Stack:** Next.js (this codebase's dynamic route params are `Promise<{...}>`, not the plain synchronous shape — see `src/app/api/bcc/pending/[id]/route.ts`), Supabase (Postgres + service-role client), Vitest for pure-logic modules only (route handlers/pages have no test coverage in this codebase), chrome-devtools-mcp for Task 1's live capture.

## Global Constraints

- Session cookies and any credential material are encrypted at rest with `encryptAtRest`/`decryptAtRest` from `src/lib/kaspiPay/crypto.ts`, under the existing `KASPI_SHOP_ENCRYPTION_KEY` — no new secret.
- The seller's password is used exactly once, in-memory, for the login call. It is never written to any table, log line, or error message.
- Migrations are applied via the Supabase MCP `apply_migration` tool, not raw `.sql` files committed to the repo.
- New route handlers follow the existing Kaspi Shop pattern: service-role Supabase client, `requireUser`-style Bearer-token auth for user-facing routes (see `src/app/api/kaspi-shop/connect/route.ts`), a dedicated cron secret header for scheduler-facing routes (see `src/app/api/kaspi-shop/cron/due/route.ts`).
- Kaspi's real rate limit is 250 price/stock/preorder changes per 30 minutes per connection (confirmed via competitor documentation, 2026-08-12 research) — every task that pushes prices must respect this.
- Pure-logic modules (pricing, rate-limit budget) get colocated Vitest `.test.ts` files. Route handlers and pages do not.

---

### Task 1: Live capture of the real login/OTP/price-push request shapes

**Files:**
- Create: `docs/superpowers/specs/2026-08-12-kaspi-cabinet-api-findings.md`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: a findings document with the exact captured request/response shapes for (a) `idmc.shop.kaspi.kz` login, (b) OTP verification if phone login is used, (c) one real price-change call. Tasks 5 and 7 read this file before writing any code.

This is a research task, not a coding task — it requires the controller (not a subagent) to drive chrome-devtools-mcp live while the user logs into their real Kaspi Магазин account, the same way Tasks were done during this session's brainstorming (see the 2026-08-12 live trace already captured in project memory for the read-only calls — `getMerchant`, `bff/offer-view/list` — this task fills the three gaps that trace didn't cover).

- [ ] **Step 1: Navigate to the correct login page and start capturing network requests**

Use `mcp__plugin_chrome-devtools-mcp_chrome-devtools__navigate_page` to `https://idmc.shop.kaspi.kz/login` (reached via `kaspi.kz/mc` if it redirects). Confirm via `take_snapshot` that this is the correct page (two tabs, "Телефон" / "Email" — NOT `merchant.kaspi.kz`, which is a different, unrelated Kaspi system reached by mistake earlier this session).

- [ ] **Step 2: Ask the user to log in, and capture the login POST**

Ask the user to enter their real Kaspi Магазин credentials on this page in the shared browser. Once they submit, use `mcp__plugin_chrome-devtools-mcp_chrome-devtools__list_network_requests` (filter `resourceTypes: ["xhr", "fetch"]`) to find the login call, then `get_network_request` on it. Record in the findings file:
- Exact URL and HTTP method
- Full request body shape (field names, not the user's real values)
- Required headers (CSRF token pattern, content-type)
- Response body shape (success case, and the shape that signals "OTP required" if phone login)
- Any `Set-Cookie` headers and their names (expect something in the `mc-session`/`mc-sid` family, matching the read-only calls already captured this session, but confirm on this specific host)

- [ ] **Step 3: If phone login was used, capture the OTP-verification call**

Ask the user for the SMS code (they read it to you, you do not need to see their phone) and enter it in the browser yourself via `fill`. Capture the verification POST the same way as Step 2: URL, method, body shape, response shape, and confirm which cookie(s) become the durable session vs. which were only for the login handshake.

- [ ] **Step 4: Capture one real price-change request**

With the user's explicit go-ahead for this specific action (this changes a real price on their real account, however briefly — confirm before doing it, and confirm what to change it back to afterward), navigate to "Управление товарами", pick one real product, and change its price by a small, clearly-reversible amount through the cabinet's own UI. Capture the resulting network request the same way: URL, method, request body shape, response shape. Then set the price back to its original value the same way, and confirm via the products list that it's restored.

- [ ] **Step 5: Write the findings document**

Write `docs/superpowers/specs/2026-08-12-kaspi-cabinet-api-findings.md` with three sections (Login, OTP verification, Price push), each containing the exact method/URL/headers/body/response shapes captured above, with placeholder values (`{phone}`, `{password}`, `{otpCode}`, `{sku}`, `{newPrice}`) standing in for real data — never the real credentials or real SKUs from the trace.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-08-12-kaspi-cabinet-api-findings.md
git commit -m "docs(kaspi-shop): capture real cabinet login/OTP/price-push request shapes"
```

---

### Task 2: Data model — per-city pricing and connection changes

**Files:**
- Migration (via Supabase MCP `apply_migration`, no repo file)

**Interfaces:**
- Consumes: nothing
- Produces: `kaspi_shop_product_city_prices` table (columns: `id uuid primary key default gen_random_uuid()`, `tracked_product_id uuid references kaspi_shop_tracked_products(id) on delete cascade`, `city_code text not null`, `own_current_price numeric`, `last_competitor_price numeric`, `updated_at timestamptz default now()`, unique on `(tracked_product_id, city_code)`). New columns on `kaspi_shop_tracked_products`: `kaspi_master_sku text`, `kaspi_brand text`, `kaspi_category text`, `excluded_city_codes text[] default '{}'`, `excluded_merchant_ids text[] default '{}'`, `demping_strategy text default 'undercut_leader'`. New columns on `kaspi_shop_connections`: `session_cookies text` (encrypted, replaces reliance on `api_token` for cabinet-bot connections — `api_token` stays for backward compatibility with any v1 connections still on the official-API path), `session_status text default 'active'` (values: `active`, `session_expired`).

- [ ] **Step 1: Apply the migration**

Use the Supabase MCP `apply_migration` tool with name `add_kaspi_shop_cabinet_bot_fields` and this SQL:

```sql
create table kaspi_shop_product_city_prices (
  id uuid primary key default gen_random_uuid(),
  tracked_product_id uuid not null references kaspi_shop_tracked_products(id) on delete cascade,
  city_code text not null,
  own_current_price numeric,
  last_competitor_price numeric,
  updated_at timestamptz not null default now(),
  unique (tracked_product_id, city_code)
);

alter table kaspi_shop_product_city_prices enable row level security;

alter table kaspi_shop_tracked_products
  add column kaspi_master_sku text,
  add column kaspi_brand text,
  add column kaspi_category text,
  add column excluded_city_codes text[] not null default '{}',
  add column excluded_merchant_ids text[] not null default '{}',
  add column demping_strategy text not null default 'undercut_leader';

alter table kaspi_shop_connections
  add column session_cookies text,
  add column session_status text not null default 'active';
```

- [ ] **Step 2: Verify via Supabase MCP**

Use `mcp__claude_ai_Supabase__list_tables` (or `execute_sql` with `select column_name from information_schema.columns where table_name = 'kaspi_shop_tracked_products'`) to confirm all new columns exist with the expected types and defaults.

- [ ] **Step 3: Commit**

No repo file changed by this task (migration applied directly). Note the migration name in the plan's progress ledger instead of a git commit.

---

### Task 3: Pricing algorithms — extend `computeRepriceCandidate`

**Files:**
- Modify: `src/lib/kaspiShop/pricing.ts`
- Test: `src/lib/kaspiShop/pricing.test.ts`

**Interfaces:**
- Consumes: nothing (pure logic)
- Produces: `computeRepriceCandidate(input: RepriceInput): RepriceResult` — extended signature (see below) that Task 9 (check-cycle v2) calls per tracked product per city.

The existing `computeRepriceCandidate({ competitorPrice, undercutStep, floorPrice })` only implements "undercut the lowest competitor" (`undercut_leader`). This task adds three more strategies and switches the input from a single `competitorPrice` to a `competitorPrices: number[]` array, since `be_second` needs to see more than just the minimum.

- [ ] **Step 1: Write the failing tests for the new strategies**

Add to `src/lib/kaspiShop/pricing.test.ts` (keep the existing `undercut_leader` tests as-is, just confirm they still pass with the array-based input):

```ts
describe('computeRepriceCandidate strategies', () => {
  it('match_leader sets price equal to the lowest competitor', () => {
    const result = computeRepriceCandidate({
      competitorPrices: [10000, 10500],
      undercutStep: 100,
      floorPrice: 8000,
      strategy: 'match_leader',
    })
    expect(result).toEqual({ price: 10000, heldAtFloor: false })
  })

  it('match_leader holds at floor if the leader price is below floor', () => {
    const result = computeRepriceCandidate({
      competitorPrices: [7000],
      undercutStep: 100,
      floorPrice: 8000,
      strategy: 'match_leader',
    })
    expect(result).toEqual({ price: 8000, heldAtFloor: true })
  })

  it('stay_above_leader sits step above the lowest competitor when we are not already cheapest', () => {
    const result = computeRepriceCandidate({
      competitorPrices: [10000, 10500],
      undercutStep: 100,
      floorPrice: 8000,
      strategy: 'stay_above_leader',
      ownCurrentPrice: 10200,
    })
    expect(result).toEqual({ price: 10100, heldAtFloor: false })
  })

  it('stay_above_leader cedes the top spot and moves above the next seller if we are already cheapest', () => {
    const result = computeRepriceCandidate({
      competitorPrices: [10000, 10500],
      undercutStep: 100,
      floorPrice: 8000,
      strategy: 'stay_above_leader',
      ownCurrentPrice: 9500,
    })
    expect(result).toEqual({ price: 10100, heldAtFloor: false })
  })

  it('be_second sits step above the second-lowest competitor when there are 2+ competitors', () => {
    const result = computeRepriceCandidate({
      competitorPrices: [10000, 10500, 11000],
      undercutStep: 100,
      floorPrice: 8000,
      strategy: 'be_second',
    })
    expect(result).toEqual({ price: 10600, heldAtFloor: false })
  })

  it('be_second sits step above the only competitor when there is exactly one', () => {
    const result = computeRepriceCandidate({
      competitorPrices: [10000],
      undercutStep: 100,
      floorPrice: 8000,
      strategy: 'be_second',
    })
    expect(result).toEqual({ price: 10100, heldAtFloor: false })
  })

  it('be_second holds at floor if the second-lowest tier would be below floor', () => {
    const result = computeRepriceCandidate({
      competitorPrices: [6000, 6500],
      undercutStep: 100,
      floorPrice: 8000,
      strategy: 'be_second',
    })
    expect(result).toEqual({ price: 8000, heldAtFloor: true })
  })

  it('undercut_leader still works with the array input (default strategy)', () => {
    const result = computeRepriceCandidate({
      competitorPrices: [10000],
      undercutStep: 100,
      floorPrice: 8000,
    })
    expect(result).toEqual({ price: 9900, heldAtFloor: false })
  })

  it('returns held at floor with no candidate price change when there are no competitors', () => {
    const result = computeRepriceCandidate({
      competitorPrices: [],
      undercutStep: 100,
      floorPrice: 8000,
      ownCurrentPrice: 8500,
    })
    expect(result).toEqual({ price: 8500, heldAtFloor: false })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/kaspiShop/pricing.test.ts`
Expected: FAIL — `computeRepriceCandidate` doesn't accept `competitorPrices`/`strategy`/`ownCurrentPrice` yet, and doesn't implement the new strategies.

- [ ] **Step 3: Implement the extended function**

Replace `computeRepriceCandidate` in `src/lib/kaspiShop/pricing.ts` with:

```ts
export type DempingStrategy = 'undercut_leader' | 'match_leader' | 'stay_above_leader' | 'be_second'

export type RepriceInput = {
  competitorPrices: number[]
  undercutStep: number
  floorPrice: number
  strategy?: DempingStrategy
  ownCurrentPrice?: number
}

export type RepriceResult = {
  price: number
  heldAtFloor: boolean
}

// Given the set of competitor prices already visible for one city (after
// excluded cities/merchants have been filtered out by the caller -- this
// function has no opinion on which competitors count, only what price to
// pick given the ones it's handed), compute the candidate own price under
// one of four strategies.
export function computeRepriceCandidate({
  competitorPrices,
  undercutStep,
  floorPrice,
  strategy = 'undercut_leader',
  ownCurrentPrice,
}: RepriceInput): RepriceResult {
  if (competitorPrices.length === 0) {
    // No competitors to react to -- hold at whatever we're already at (or
    // the floor if we have no current price to hold at).
    return { price: ownCurrentPrice ?? floorPrice, heldAtFloor: false }
  }

  const sorted = [...competitorPrices].sort((a, b) => a - b)
  const lowest = sorted[0]
  let candidate: number

  if (strategy === 'undercut_leader') {
    candidate = lowest - undercutStep
  } else if (strategy === 'match_leader') {
    candidate = lowest
  } else if (strategy === 'stay_above_leader') {
    const weAreCheapest = ownCurrentPrice !== undefined && ownCurrentPrice <= lowest
    const tier = weAreCheapest && sorted.length > 1 ? sorted[1] : lowest
    candidate = tier + undercutStep
  } else {
    // be_second: sit just above whichever price separates us from being
    // cheapest -- the second-lowest competitor if there are 2+, or the
    // only competitor if there's just one (nothing to be "second" to
    // otherwise, so we sit above them the same as stay_above_leader would).
    const tier = sorted.length > 1 ? sorted[1] : sorted[0]
    candidate = tier + undercutStep
  }

  if (candidate < floorPrice) {
    return { price: floorPrice, heldAtFloor: true }
  }
  return { price: candidate, heldAtFloor: false }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/kaspiShop/pricing.test.ts`
Expected: PASS (all cases, including the pre-existing `undercut_leader`/XML-generation tests already in the file — check their input shape was updated to `competitorPrices: [n]` if they used the old single-`competitorPrice` field name).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kaspiShop/pricing.ts src/lib/kaspiShop/pricing.test.ts
git commit -m "feat(kaspi-shop): add match_leader, stay_above_leader, be_second demping strategies"
```

---

### Task 4: Rate-limit budget tracker

**Files:**
- Create: `src/lib/kaspiShop/rateLimitBudget.ts`
- Test: `src/lib/kaspiShop/rateLimitBudget.test.ts`

**Interfaces:**
- Consumes: nothing (pure logic over a list of timestamps)
- Produces: `remainingBudget(changeTimestamps: number[], now: number): number` and `isWithinBudget(changeTimestamps: number[], now: number): boolean` — Task 9's check cycle calls these before pushing a price change, using the connection's recent change history.

Kaspi allows 250 price/stock/preorder changes per rolling 30-minute window per connection. This module has no knowledge of Kaspi or Supabase — it's given a list of millisecond timestamps of past changes and says whether one more is safe right now.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/kaspiShop/rateLimitBudget.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { remainingBudget, isWithinBudget, KASPI_RATE_LIMIT_MAX, KASPI_RATE_LIMIT_WINDOW_MS } from './rateLimitBudget'

describe('remainingBudget', () => {
  it('returns the full limit when there is no history', () => {
    expect(remainingBudget([], 1_000_000)).toBe(KASPI_RATE_LIMIT_MAX)
  })

  it('subtracts changes that fall within the rolling window', () => {
    const now = 1_000_000
    const recent = [now - 1000, now - 2000, now - 3000]
    expect(remainingBudget(recent, now)).toBe(KASPI_RATE_LIMIT_MAX - 3)
  })

  it('ignores changes older than the rolling window', () => {
    const now = 1_000_000
    const old = [now - (KASPI_RATE_LIMIT_WINDOW_MS + 1000)]
    expect(remainingBudget(old, now)).toBe(KASPI_RATE_LIMIT_MAX)
  })

  it('never returns negative', () => {
    const now = 1_000_000
    const way_too_many = Array.from({ length: KASPI_RATE_LIMIT_MAX + 50 }, (_, i) => now - i)
    expect(remainingBudget(way_too_many, now)).toBe(0)
  })
})

describe('isWithinBudget', () => {
  it('is true when remaining budget is above zero', () => {
    expect(isWithinBudget([], 1_000_000)).toBe(true)
  })

  it('is false when the window is fully spent', () => {
    const now = 1_000_000
    const full = Array.from({ length: KASPI_RATE_LIMIT_MAX }, (_, i) => now - i)
    expect(isWithinBudget(full, now)).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/kaspiShop/rateLimitBudget.test.ts`
Expected: FAIL with "Cannot find module './rateLimitBudget'"

- [ ] **Step 3: Implement**

Create `src/lib/kaspiShop/rateLimitBudget.ts`:

```ts
// Kaspi allows at most 250 price/stock/preorder changes per rolling
// 30-minute window per connection -- exceeding it blocks all changes for
// 30 minutes (confirmed via competitor documentation, 2026-08-12). This
// module tracks nothing itself; the caller supplies the connection's
// recent change timestamps (ms since epoch) and gets back how much
// budget is left right now.
export const KASPI_RATE_LIMIT_MAX = 250
export const KASPI_RATE_LIMIT_WINDOW_MS = 30 * 60 * 1000

export function remainingBudget(changeTimestamps: number[], now: number): number {
  const withinWindow = changeTimestamps.filter(t => now - t < KASPI_RATE_LIMIT_WINDOW_MS).length
  return Math.max(0, KASPI_RATE_LIMIT_MAX - withinWindow)
}

export function isWithinBudget(changeTimestamps: number[], now: number): boolean {
  return remainingBudget(changeTimestamps, now) > 0
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/kaspiShop/rateLimitBudget.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/kaspiShop/rateLimitBudget.ts src/lib/kaspiShop/rateLimitBudget.test.ts
git commit -m "feat(kaspi-shop): track Kaspi's 250-changes/30min rate limit"
```

---

### Task 5: Cabinet login/session module

**Files:**
- Create: `src/lib/kaspiShop/cabinetAuth.ts`

**Interfaces:**
- Consumes: **Task 1 findings** (`docs/superpowers/specs/2026-08-12-kaspi-cabinet-api-findings.md`) for the exact login/OTP request shapes. Also consumes `encryptAtRest`/`decryptAtRest` from `src/lib/kaspiPay/crypto.ts`.
- Produces: `loginToKaspiCabinet(input: { loginMethod: 'phone' | 'email', identifier: string, password: string }): Promise<LoginResult>` where `LoginResult` is either `{ status: 'success', sessionCookies: string }` or `{ status: 'otp_required', otpToken: string }` or `{ status: 'error', message: string }`; `submitOtp(otpToken: string, code: string): Promise<LoginResult>`; `isSessionValid(sessionCookies: string): Promise<boolean>` (makes one lightweight authenticated call, e.g. `getMerchant`, and checks for an auth-failure response). Task 6 (connect route) and Task 9 (check cycle, for session-expiry detection) both depend on these three functions.

- [ ] **Step 1: Read the findings file**

Read `docs/superpowers/specs/2026-08-12-kaspi-cabinet-api-findings.md` in full before writing any code in this task. The exact request bodies, headers, and response shapes below are placeholders for what that file actually contains — replace every detail that conflicts with the findings file's real captured values.

- [ ] **Step 2: Implement the module**

Create `src/lib/kaspiShop/cabinetAuth.ts` with `loginToKaspiCabinet`, `submitOtp`, and `isSessionValid`, built from the exact request/response shapes in the Task 1 findings file (login POST to `idmc.shop.kaspi.kz`, the CSRF-token-then-submit pattern already observed on the sibling `merchant.kaspi.kz` system this session — confirm whether `idmc.shop.kaspi.kz` matches or differs per the findings file — OTP submission if applicable, and a lightweight `getMerchant` GraphQL POST to `mc.shop.kaspi.kz/mc/facade/graphql` for `isSessionValid`, matching the exact query already captured live this session:
```graphql
query getMerchant($id: String!) {
  merchant(id: $id) { id name logo { url } }
  session { user { id } merchants(id: $id) { userName name master profileId } }
}
```
). No test file for this task — it makes real network calls and has no meaningful pure-logic surface to unit test (matches this codebase's established pattern of not testing network-calling modules directly).

- [ ] **Step 3: Verify with `tsc`**

Run: `npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 4: Commit**

```bash
git add src/lib/kaspiShop/cabinetAuth.ts
git commit -m "feat(kaspi-shop): cabinet login/OTP/session-check module"
```

---

### Task 6: Connect route v2 — cabinet login, auto-fetch merchant info, catalog import

**Files:**
- Modify: `src/app/api/kaspi-shop/connect/route.ts`
- Create: `src/app/api/kaspi-shop/connect/otp/route.ts`
- Modify: `src/lib/kaspiShop/connection.ts`

**Interfaces:**
- Consumes: `loginToKaspiCabinet`, `submitOtp` (Task 5); `saveConnection` (existing, extend its params to accept `sessionCookies` and drop the requirement for `merchantId`/`companyName` to be supplied by the caller — they're fetched automatically now).
- Produces: `POST /api/kaspi-shop/connect` now accepts `{ loginMethod, identifier, password }` instead of `{ apiToken, merchantId, companyName }`; returns `{ status: 'connected' }` or `{ status: 'otp_required', otpToken }`. `POST /api/kaspi-shop/connect/otp` accepts `{ otpToken, code }`, completes the login, then calls `getMerchant` to populate `company_name`/logo and `bff/offer-view/list` to import the existing catalog into `kaspi_shop_tracked_products` (one row per SKU, `enabled: false` by default so the seller reviews and turns on tracking deliberately rather than every SKU repricing immediately) plus one `kaspi_shop_product_city_prices` row per city in that SKU's `allCityPrices`.

- [ ] **Step 1: Extend `saveConnection`**

In `src/lib/kaspiShop/connection.ts`, add a `sessionCookies?: string` param to `saveConnection`'s input type, encrypt it with `encryptAtRest` before insert/update (same call pattern already used there for `apiToken`), and store it in the new `session_cookies` column. Set `session_status: 'active'` on successful save.

- [ ] **Step 2: Rewrite the connect route**

Replace the body of `src/app/api/kaspi-shop/connect/route.ts`'s `POST` handler: validate `{ loginMethod, identifier, password }`, call `loginToKaspiCabinet`. On `otp_required`, return `{ status: 'otp_required', otpToken }` without saving anything yet. On `success`, save the connection with the returned `sessionCookies`, then call `getMerchant` to fetch `company_name`/logo and update the row, then call `bff/offer-view/list` and insert one `kaspi_shop_tracked_products` row per SKU (`enabled: false`, `own_current_price` from the SKU's data, `kaspi_master_sku`/`kaspi_brand`/`kaspi_category` populated) plus per-city rows in `kaspi_shop_product_city_prices` from `allCityPrices`.

- [ ] **Step 3: Add the OTP-completion route**

Create `src/app/api/kaspi-shop/connect/otp/route.ts`: `POST` handler accepting `{ otpToken, code }`, calls `submitOtp`, then does the same save-connection + auto-fetch-merchant + import-catalog sequence as Step 2's success path.

- [ ] **Step 4: Verify with `tsc` and a manual auth-header check**

Run: `npx tsc --noEmit`
Expected: no new errors. No automated test (route handlers have no test coverage in this codebase) — this task's manual verification happens in Task 10 once the UI can drive it end-to-end.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/kaspi-shop/connect/route.ts src/app/api/kaspi-shop/connect/otp/route.ts src/lib/kaspiShop/connection.ts
git commit -m "feat(kaspi-shop): connect via real Kaspi cabinet login, auto-import merchant info and catalog"
```

---

### Task 7: Session-based price push

**Files:**
- Create: `src/lib/kaspiShop/cabinetPricePush.ts`

**Interfaces:**
- Consumes: **Task 1 findings** for the exact price-push request shape; `decryptAtRest` (Task 5's pattern) to read stored session cookies.
- Produces: `pushPriceChange(sessionCookies: string, sku: string, cityCode: string, newPrice: number): Promise<{ success: true } | { success: false, reason: 'session_expired' | 'other', message: string }>` — Task 9's check cycle calls this once per (product, city) that needs a price change, after confirming rate-limit budget via Task 4.

- [ ] **Step 1: Read the findings file**

Read `docs/superpowers/specs/2026-08-12-kaspi-cabinet-api-findings.md`'s price-push section before writing any code. The request shape below is a placeholder — replace it with the file's actual captured values.

- [ ] **Step 2: Implement**

Create `src/lib/kaspiShop/cabinetPricePush.ts` implementing `pushPriceChange` using the exact endpoint/method/body shape from the findings file, attaching `sessionCookies` as the `Cookie` header (matching the pattern already confirmed live this session: `mc-session`/`mc-sid` cookies, `x-auth-version: 3` header, `origin: https://kaspi.kz` for cross-subdomain calls to `mc.shop.kaspi.kz`). Detect session expiry from the response (an auth-failure status code or body shape, per the findings file) and return `{ success: false, reason: 'session_expired', ... }` rather than throwing — the caller (Task 9) uses this to flip the connection's `session_status`.

- [ ] **Step 3: Verify with `tsc`**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/kaspiShop/cabinetPricePush.ts
git commit -m "feat(kaspi-shop): push price changes through the authenticated cabinet session"
```

---

### Task 8: AI-suggested floor price and undercut step

**Files:**
- Create: `src/lib/kaspiShop/suggestPricingRule.ts`
- Modify: `src/app/api/kaspi-shop/products/route.ts`

**Interfaces:**
- Consumes: `Anthropic` client, matching the existing pattern in `src/lib/instagramAiReply.ts` (same env var, same SDK usage).
- Produces: `suggestPricingRule(input: { productTitle: string, category: string, competitorPrices: number[], ownCost?: number }): Promise<{ floorPrice: number, undercutStep: number, reasoning: string }>` — a new `POST /api/kaspi-shop/products/suggest-pricing` action (or a query param on the existing products route — pick the existing route's dispatch pattern) that the connect-flow UI (Task 10) calls per newly-imported product to pre-fill the floor/step fields before the seller enables tracking.

- [ ] **Step 1: Implement the suggestion module**

Create `src/lib/kaspiShop/suggestPricingRule.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type PricingSuggestion = {
  floorPrice: number
  undercutStep: number
  reasoning: string
}

// One Anthropic call proposes a starting floor price and undercut step for
// a newly-imported product, given its category and the competitor prices
// already seen. The seller reviews/overrides before enabling tracking --
// this is a starting point, not an autonomous pricing decision.
export async function suggestPricingRule({
  productTitle,
  category,
  competitorPrices,
  ownCost,
}: {
  productTitle: string
  category: string
  competitorPrices: number[]
  ownCost?: number
}): Promise<PricingSuggestion> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Товар: "${productTitle}" (категория: ${category}). Цены конкурентов на Kaspi.kz: ${competitorPrices.join(', ')} тенге.${ownCost ? ` Себестоимость продавца: ${ownCost} тенге.` : ''}

Предложи минимальную цену (floorPrice, ниже которой продавец никогда не опустится) и шаг демпинга (undercutStep, на сколько тенге снижать цену ниже конкурента). Если известна себестоимость, floorPrice должен оставлять разумную маржу (не менее 10-15%). Ответь СТРОГО в формате:
FLOOR: <число>
STEP: <число>
REASONING: <одно предложение на русском>`,
    }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  const floorMatch = text.match(/FLOOR:\s*(\d+)/)
  const stepMatch = text.match(/STEP:\s*(\d+)/)
  const reasoningMatch = text.match(/REASONING:\s*(.+)/)

  if (!floorMatch || !stepMatch) {
    throw new Error(`suggestPricingRule: could not parse Anthropic response: ${text}`)
  }

  return {
    floorPrice: Number(floorMatch[1]),
    undercutStep: Number(stepMatch[1]),
    reasoning: reasoningMatch ? reasoningMatch[1].trim() : '',
  }
}
```

- [ ] **Step 2: Wire it into the products route**

In `src/app/api/kaspi-shop/products/route.ts`, add a new case: `POST` with `{ action: 'suggest-pricing', productId }` (or a separate `PATCH`-adjacent branch, matching however the existing route already dispatches multiple product actions) — loads the tracked product plus its `kaspi_shop_product_city_prices` rows for `competitorPrices`, calls `suggestPricingRule`, returns the suggestion without writing it to the database (the seller applies it explicitly via a second call to the existing product-update path).

- [ ] **Step 3: Verify with `tsc`**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/kaspiShop/suggestPricingRule.ts src/app/api/kaspi-shop/products/route.ts
git commit -m "feat(kaspi-shop): AI-suggested floor price and undercut step for imported products"
```

---

### Task 9: Check cycle v2 — per-city pricing, new algorithms, rate limit, session push

**Files:**
- Modify: `src/lib/kaspiShop/checkCycle.ts`

**Interfaces:**
- Consumes: `computeRepriceCandidate` (Task 3, new signature), `remainingBudget`/`isWithinBudget` (Task 4), `pushPriceChange` (Task 7), `isSessionValid` (Task 5).
- Produces: `applyPriceCheckResult` now operates per (tracked product, city) pair instead of once per product, and pushes through the cabinet session instead of only updating the stored price for the next XML-feed cycle.

- [ ] **Step 1: Update `applyPriceCheckResult`**

In `src/lib/kaspiShop/checkCycle.ts`, change `applyPriceCheckResult` to: load the tracked product's `kaspi_shop_product_city_prices` rows (skip any whose `city_code` is in `excluded_city_codes`), filter incoming competitor offers by excluding any from `excluded_merchant_ids` (the competitor-price fetch itself, still running via GitHub Actions per the existing 2026-08-12 fix, now needs to report per-city competitor prices with merchant IDs — note this as a required change to the GitHub Actions script and the `/cron/due` and `/cron/apply` route contracts, extending `competitorPrice: number | null` to `competitorOffers: { price: number, cityCode: string, merchantId: string }[] | null`), call `computeRepriceCandidate` per city with the connection's `demping_strategy`, check `isWithinBudget` using the connection's recent push timestamps — query `checked_at` from `kaspi_shop_price_checks` rows for this connection with `action = 'updated'` in the last 30 minutes (pushes happen synchronously within the same check cycle in this design, so `checked_at` already is the push timestamp; no new column needed) — before calling `pushPriceChange`, and on `session_expired` set the connection's `session_status` accordingly and stop processing further cities/products for that connection until reconnected.

- [ ] **Step 2: Update the cron routes' contracts**

Update `src/app/api/kaspi-shop/cron/due/route.ts` and `src/app/api/kaspi-shop/cron/apply/route.ts` and `.github/scripts/kaspi-shop-price-check.mjs` to carry per-city competitor offers (with `merchantId`) instead of a single `competitorPrice` number, matching the extended shape from Step 1. The GitHub Actions script's own parsing of Kaspi's public product page must now extract seller/merchant identity per offer, not just the minimum price — inspect the actual embedded JSON on a real Kaspi product page (the existing regex-based price extraction in the script's history only pulled `"price":\d+`; extend it to also capture nearby merchant identifiers, verifying against a real product page before trusting the shape).

- [ ] **Step 3: Verify with `tsc` and `npm run build`**

Run: `npx tsc --noEmit` then `npm run build`
Expected: both clean. `npm run build` specifically catches route-type mismatches `tsc --noEmit` alone has missed before in this codebase (see the 2026-08-11 Kaspi Shop v1 plan's Task 11 finding).

- [ ] **Step 4: Commit**

```bash
git add src/lib/kaspiShop/checkCycle.ts src/app/api/kaspi-shop/cron/due/route.ts src/app/api/kaspi-shop/cron/apply/route.ts .github/scripts/kaspi-shop-price-check.mjs
git commit -m "feat(kaspi-shop): per-city repricing with rate-limit budgeting and session-based price push"
```

---

### Task 10: UI — cabinet login flow, session-expired reconnect, algorithm/city controls, AI-suggest button

**Files:**
- Modify: `src/app/kaspi-shop/page.tsx`

**Interfaces:**
- Consumes: `/api/kaspi-shop/connect` and `/api/kaspi-shop/connect/otp` (Task 6), `/api/kaspi-shop/products` `suggest-pricing` action (Task 8).
- Produces: the connect form becomes login/password (+ conditional OTP step) instead of API-token/merchantId/companyName; a `session_status === 'session_expired'` banner prompts reconnect; each tracked product's edit UI gains a strategy selector (four options matching Task 3), a city-exclusion multi-select, a competitor-merchant blocklist input, and an "AI-подбор" button that calls the suggest-pricing action and pre-fills floor/step for review before saving.

- [ ] **Step 1: Replace the connect form**

In `src/app/kaspi-shop/page.tsx`, replace the `apiToken`/`merchantId`/`companyName` inputs and `connect()` function with a login-method toggle (Телефон/Email), identifier + password fields, and a `connect()` that posts to `/api/kaspi-shop/connect`. On `{ status: 'otp_required', otpToken }`, show a code-entry step that posts to `/api/kaspi-shop/connect/otp`.

- [ ] **Step 2: Add the session-expired banner**

Extend `load()`'s wallet-route response handling (it already reads `connected`/`paused`) to also read `session_status`, and render a banner with a "Переподключиться" button (reopens the connect form) when it's `session_expired`.

- [ ] **Step 3: Extend the per-product controls**

For each tracked product row, add: a `<select>` for `demping_strategy` (labelled "Быть 1-м" / "Цена лидера" / "Держаться над лидером" / "Быть 2-м", matching Task 3's four strategies), a multi-select or tag input for `excluded_city_codes`, a text input for `excluded_merchant_ids` (comma-separated is acceptable given this codebase's existing form patterns favor simplicity over rich multi-selects), and an "ИИ-подбор цены" button that calls the suggest-pricing action and fills the floor/step inputs with the response for the seller to review before saving (never auto-saves).

- [ ] **Step 4: Manual verification**

Run `npm run build` to confirm the page compiles, then start the dev server and manually walk through: connect (with a real or test account), confirm the OTP step appears/works if phone login is used, confirm imported products appear disabled by default, confirm the AI-suggest button fills floor/step, confirm changing strategy/city-exclusion/blocklist and saving persists (check via Supabase).

- [ ] **Step 5: Commit**

```bash
git add src/app/kaspi-shop/page.tsx
git commit -m "feat(kaspi-shop): cabinet login UI, session-expired reconnect, per-product strategy/city/blocklist controls, AI price suggestion"
```

---

### Task 11: Final build verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: all pure-logic tests pass, including Tasks 3 and 4's new suites and every pre-existing suite in this codebase.

- [ ] **Step 2: Full build**

Run: `npx tsc --noEmit` then `npm run build`
Expected: both clean, all Kaspi Shop routes listed in the build output (`/api/kaspi-shop/connect`, `/api/kaspi-shop/connect/otp`, `/api/kaspi-shop/products`, `/api/kaspi-shop/cron/due`, `/api/kaspi-shop/cron/apply`, `/kaspi-shop`).

- [ ] **Step 3: Push**

```bash
git push origin main
```

---

## Self-Review Notes

- **Spec coverage:** connection flow (Tasks 5-6), auto-fetch company name (Task 6), per-city data model (Task 2), rate-limit budgeting (Task 4), new algorithms (Task 3), AI floor/step suggestion (Task 8), error handling for session expiry (Tasks 5, 7, 9, 10) — all covered. Заказы/накладные/Финансы/НКТ/Предзаказ/Ниши and Instagram/platform promotion are explicitly out of scope per the spec and not included here.
- **Placeholder scan:** Tasks 5 and 7 contain example request shapes marked explicitly as placeholders to be overwritten from Task 1's findings file — this is a genuine cross-task dependency (the skill's own "Consumes" mechanism), not an unresolved TBD; every other task has complete, concrete code.
- **Type consistency:** `computeRepriceCandidate`'s new `competitorPrices`/`strategy`/`ownCurrentPrice` signature (Task 3) is the one Task 9 calls; `pushPriceChange`'s `{ success, reason }` shape (Task 7) is the one Task 9 branches on; `session_status` values (`active`/`session_expired`, Task 2) are the ones Tasks 6, 9, and 10 all check against consistently.
