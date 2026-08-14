# Kaspi Shop: Прибыль Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/kaspi-shop/profit` — real unit economics (revenue minus COGS minus ad spend minus commission = net profit) per product and per store, for 7/30/90-day windows.

**Architecture:** A new pure-logic module (`profit.ts`) mirrors `finance.ts`'s order-fetching/pagination approach exactly, additionally attributing revenue per product SKU (via order line items, already real data) and subtracting seller-entered COGS/ad-spend/commission. Three small PATCH routes let the seller fill in what Kaspi's API can never provide. The page shows a real number immediately and flags — never blocks behind — anything not yet configured.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Tailwind, framer-motion, Supabase.

## Global Constraints

- **Migrations already applied by the controller before this plan was written** — `kaspi_shop_tracked_products.cogs_amount numeric` (migration `kaspi_shop_profit_cogs_column`), `kaspi_shop_connections.commission_rate_percent numeric` + new table `kaspi_shop_ad_spend` (migration `kaspi_shop_profit_commission_and_ad_spend`, columns `id uuid pk`, `connection_id uuid references kaspi_shop_connections(id) on delete cascade`, `days integer check (days in (7,30,90))`, `amount numeric not null default 0`, `updated_at timestamptz not null default now()`, unique on `(connection_id, days)`, RLS enabled with no policies — service-role-key-only, matching `kaspi_niche_checks`'s pattern). **Do not re-run these migrations.**
- **Join key, live-confirmed 2026-08-14 (do not use `kaspi_sku`):** an order item's `code` matches `kaspi_shop_tracked_products.kaspi_master_sku`. `kaspi_sku` is a different value (the seller's own per-offer identifier) and must not be used for this join.
- **Product name/photo come from order data, not the catalog table.** `kaspi_shop_tracked_products` has no image column at all. `OrderItem.name`/`OrderItem.imageUrl` (both already real and already used by the Заказы feature) are the only source for display.
- **`totalRevenue` must be computed as the sum of per-product revenue buckets**, never independently from `order.totalPrice` — guarantees the store-level total always reconciles with the per-product breakdown shown below it, without depending on an unverified Kaspi invariant.
- Missing COGS, missing commission rate, or missing ad-spend-for-this-window must never block the top-line `netProfit` number — each missing input contributes `0` to the aggregate and is surfaced as an explicit, visible flag (`productsWithoutCogsCount`, `adSpendConfigured: false`, `commissionRatePercent: null`) for the UI to prompt about, never silently hidden.
- Route auth: every route requires an authenticated Supabase user (401 otherwise), matching every sibling `kaspi-shop` route.
- Every task ends with `npx tsc --noEmit`. The final task also runs `npm run build`.
- Direct-to-main commits, no feature branches, no commit-confirmation prompts.
- Free feature — no Kaspi Shop Wallet code touched anywhere in this plan.
- Only pure-logic modules get Vitest tests (`profit.ts`); routes and pages have no test coverage.

---

### Task 1: `profit.ts` — pure computation module + tests

**Files:**
- Create: `src/lib/kaspiShop/profit.ts`
- Test: `src/lib/kaspiShop/profit.test.ts`

**Interfaces:**
- Consumes: `listOrders`, `Order`, `PAGE_SIZE` from `./cabinetApi` (existing; `Order.items[]` now carries `{code, name, imageUrl, quantity, totalPrice}`, `totalPrice` already shipped and confirmed real).
- Produces: `ProductProfit` type, `ProfitSummary` type, `computeProfitSummary(sessionCookies, merchantId, sinceDays, catalog, adSpend, commissionRatePercent, listOrdersFn?)`. Task 2's `GET /api/kaspi-shop/profit` route consumes all of these directly.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/kaspiShop/profit.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { computeProfitSummary } from './profit'
import type { Order } from './cabinetApi'

function makeOrder(code: string, creationTime: string, items: { code: string; name: string; imageUrl: string | null; quantity: number; totalPrice: number }[]): Order {
  const totalPrice = items.reduce((sum, i) => sum + i.totalPrice, 0)
  return { code, status: 'TRANSMITTED', customerFirstName: 'Test', customerLastName: 'T', totalPrice, creationTime, items }
}

describe('computeProfitSummary', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-14T12:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('attributes revenue per product and keeps totalRevenue consistent with the per-product sum', async () => {
    const fakeListOrders = vi.fn(async (_c: string, _m: string, status: string, _page = 0) => {
      if (status === 'KASPI_DELIVERY_TRANSMITTED') {
        return {
          total: 1,
          sessionExpired: false,
          orders: [
            makeOrder('1', '2026-08-13T10:00:00.000Z', [
              { code: 'SKU1', name: 'Товар 1', imageUrl: 'https://cdn/1.jpg', quantity: 2, totalPrice: 2000 },
              { code: 'SKU2', name: 'Товар 2', imageUrl: 'https://cdn/2.jpg', quantity: 1, totalPrice: 500 },
            ]),
          ],
        }
      }
      return { total: 0, sessionExpired: false, orders: [] }
    })

    const catalog = [
      { kaspiMasterSku: 'SKU1', trackedProductId: 'tp-1', cogsAmount: 300 },
      { kaspiMasterSku: 'SKU2', trackedProductId: 'tp-2', cogsAmount: null },
    ]

    const summary = await computeProfitSummary('cookies', 'merchant1', 7, catalog, { amount: 0, configured: false }, null, fakeListOrders as any)

    expect(summary.totalRevenue).toBe(2500)
    const sumOfProducts = summary.products.reduce((sum, p) => sum + p.revenue, 0)
    expect(sumOfProducts).toBe(summary.totalRevenue)

    const sku1 = summary.products.find(p => p.kaspiMasterSku === 'SKU1')!
    expect(sku1).toMatchObject({ trackedProductId: 'tp-1', unitsSold: 2, revenue: 2000, cogsAmount: 300, cogsTotal: 600, profit: 1400 })

    const sku2 = summary.products.find(p => p.kaspiMasterSku === 'SKU2')!
    expect(sku2).toMatchObject({ trackedProductId: 'tp-2', unitsSold: 1, revenue: 500, cogsAmount: null, cogsTotal: null, profit: null })
  })

  it('sorts products by revenue descending', async () => {
    const fakeListOrders = vi.fn(async (_c: string, _m: string, status: string, _page = 0) => {
      if (status === 'KASPI_DELIVERY_TRANSMITTED') {
        return {
          total: 1,
          sessionExpired: false,
          orders: [
            makeOrder('1', '2026-08-13T10:00:00.000Z', [
              { code: 'CHEAP', name: 'Дешёвый', imageUrl: null, quantity: 1, totalPrice: 100 },
              { code: 'PRICEY', name: 'Дорогой', imageUrl: null, quantity: 1, totalPrice: 900 },
            ]),
          ],
        }
      }
      return { total: 0, sessionExpired: false, orders: [] }
    })

    const summary = await computeProfitSummary('cookies', 'merchant1', 7, [], { amount: 0, configured: false }, null, fakeListOrders as any)

    expect(summary.products.map(p => p.kaspiMasterSku)).toEqual(['PRICEY', 'CHEAP'])
  })

  it('counts a product with no catalog match as revenue with no COGS, not an error', async () => {
    const fakeListOrders = vi.fn(async (_c: string, _m: string, status: string, _page = 0) => {
      if (status === 'KASPI_DELIVERY_TRANSMITTED') {
        return {
          total: 1,
          sessionExpired: false,
          orders: [makeOrder('1', '2026-08-13T10:00:00.000Z', [
            { code: 'UNKNOWN', name: 'Товар вне каталога', imageUrl: null, quantity: 1, totalPrice: 1000 },
          ])],
        }
      }
      return { total: 0, sessionExpired: false, orders: [] }
    })

    const summary = await computeProfitSummary('cookies', 'merchant1', 7, [], { amount: 0, configured: false }, null, fakeListOrders as any)

    expect(summary.totalRevenue).toBe(1000)
    expect(summary.products[0]).toMatchObject({ trackedProductId: null, cogsAmount: null, cogsTotal: null, profit: null })
    expect(summary.productsWithoutCogsCount).toBe(1)
  })

  it('missing COGS does not block netProfit, only flags productsWithoutCogsCount', async () => {
    const fakeListOrders = vi.fn(async (_c: string, _m: string, status: string, _page = 0) => {
      if (status === 'KASPI_DELIVERY_TRANSMITTED') {
        return {
          total: 1,
          sessionExpired: false,
          orders: [makeOrder('1', '2026-08-13T10:00:00.000Z', [
            { code: 'SKU1', name: 'Товар 1', imageUrl: null, quantity: 1, totalPrice: 1000 },
          ])],
        }
      }
      return { total: 0, sessionExpired: false, orders: [] }
    })
    const catalog = [{ kaspiMasterSku: 'SKU1', trackedProductId: 'tp-1', cogsAmount: null }]

    const summary = await computeProfitSummary('cookies', 'merchant1', 7, catalog, { amount: 0, configured: false }, null, fakeListOrders as any)

    expect(summary.totalCogsKnown).toBe(0)
    expect(summary.productsWithoutCogsCount).toBe(1)
    expect(summary.netProfit).toBe(1000) // revenue - 0 cogs - 0 ads - 0 commission
  })

  it('missing commission rate results in commissionAmount 0, not a blocked netProfit', async () => {
    const fakeListOrders = vi.fn(async () => ({ total: 0, sessionExpired: false, orders: [] }))

    const summary = await computeProfitSummary('cookies', 'merchant1', 7, [], { amount: 0, configured: false }, null, fakeListOrders as any)

    expect(summary.commissionRatePercent).toBe(null)
    expect(summary.commissionAmount).toBe(0)
  })

  it('applies the commission rate to totalRevenue when configured', async () => {
    const fakeListOrders = vi.fn(async (_c: string, _m: string, status: string, _page = 0) => {
      if (status === 'KASPI_DELIVERY_TRANSMITTED') {
        return {
          total: 1,
          sessionExpired: false,
          orders: [makeOrder('1', '2026-08-13T10:00:00.000Z', [
            { code: 'SKU1', name: 'Товар 1', imageUrl: null, quantity: 1, totalPrice: 1000 },
          ])],
        }
      }
      return { total: 0, sessionExpired: false, orders: [] }
    })

    const summary = await computeProfitSummary('cookies', 'merchant1', 7, [], { amount: 0, configured: false }, 10, fakeListOrders as any)

    expect(summary.commissionAmount).toBe(100)
    expect(summary.netProfit).toBe(900)
  })

  it('subtracts configured ad spend from netProfit', async () => {
    const fakeListOrders = vi.fn(async (_c: string, _m: string, status: string, _page = 0) => {
      if (status === 'KASPI_DELIVERY_TRANSMITTED') {
        return {
          total: 1,
          sessionExpired: false,
          orders: [makeOrder('1', '2026-08-13T10:00:00.000Z', [
            { code: 'SKU1', name: 'Товар 1', imageUrl: null, quantity: 1, totalPrice: 1000 },
          ])],
        }
      }
      return { total: 0, sessionExpired: false, orders: [] }
    })

    const summary = await computeProfitSummary('cookies', 'merchant1', 7, [], { amount: 150, configured: true }, null, fakeListOrders as any)

    expect(summary.adSpend).toBe(150)
    expect(summary.adSpendConfigured).toBe(true)
    expect(summary.netProfit).toBe(850)
  })

  it('excludes orders outside the sinceDays window', async () => {
    const fakeListOrders = vi.fn(async (_c: string, _m: string, status: string, _page = 0) => {
      if (status === 'KASPI_DELIVERY_TRANSMITTED') {
        return {
          total: 2,
          sessionExpired: false,
          orders: [
            makeOrder('1', '2026-08-13T10:00:00.000Z', [{ code: 'SKU1', name: 'In', imageUrl: null, quantity: 1, totalPrice: 1000 }]), // inside 7-day window
            makeOrder('2', '2026-08-01T10:00:00.000Z', [{ code: 'SKU2', name: 'Out', imageUrl: null, quantity: 1, totalPrice: 2000 }]), // outside
          ],
        }
      }
      return { total: 0, sessionExpired: false, orders: [] }
    })

    const summary = await computeProfitSummary('cookies', 'merchant1', 7, [], { amount: 0, configured: false }, null, fakeListOrders as any)

    expect(summary.totalRevenue).toBe(1000)
  })

  it('stops immediately and reports sessionExpired when the session is dead', async () => {
    const fakeListOrders = vi.fn(async () => ({ total: 0, sessionExpired: true, orders: [] }))

    const summary = await computeProfitSummary('cookies', 'merchant1', 30, [], { amount: 0, configured: false }, null, fakeListOrders as any)

    expect(summary.sessionExpired).toBe(true)
    expect(summary.totalRevenue).toBe(0)
    expect(fakeListOrders).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/kaspiShop/profit.test.ts`
Expected: FAIL — `Cannot find module './profit'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/kaspiShop/profit.ts`:

```ts
import { listOrders, Order, PAGE_SIZE } from './cabinetApi'

// Real unit economics per product/store -- revenue minus COGS minus ad
// spend minus commission. Kaspi has no API for accurate commission or ad
// spend (confirmed live 2026-08-14, see
// docs/superpowers/specs/2026-08-14-kaspi-shop-profit-design.md), so both
// are seller-entered here. Join key for attributing order revenue to a
// catalog product is kaspi_master_sku, NOT kaspi_sku -- confirmed live
// against a real order (order item code matched kaspi_master_sku exactly;
// kaspi_sku for that same row was a different value, the seller's own
// per-offer identifier).
export type ProductProfit = {
  kaspiMasterSku: string
  trackedProductId: string | null
  productName: string
  imageUrl: string | null
  unitsSold: number
  revenue: number
  cogsAmount: number | null
  cogsTotal: number | null
  profit: number | null
}

export type ProfitSummary = {
  products: ProductProfit[]
  totalRevenue: number
  totalCogsKnown: number
  productsWithoutCogsCount: number
  adSpend: number
  adSpendConfigured: boolean
  commissionRatePercent: number | null
  commissionAmount: number
  netProfit: number
  truncated: boolean
  sessionExpired: boolean
}

const REVENUE_STATUSES = ['KASPI_DELIVERY_TRANSMITTED', 'ARCHIVED']
const MAX_PAGES_PER_STATUS = 20

export async function computeProfitSummary(
  sessionCookies: string,
  merchantId: string,
  sinceDays: number,
  catalog: { kaspiMasterSku: string; trackedProductId: string; cogsAmount: number | null }[],
  adSpend: { amount: number; configured: boolean },
  commissionRatePercent: number | null,
  listOrdersFn: typeof listOrders = listOrders
): Promise<ProfitSummary> {
  const cutoffMs = Date.now() - sinceDays * 24 * 60 * 60 * 1000
  const allOrders: Order[] = []
  let truncated = false
  let sessionExpired = false

  statusLoop: for (const status of REVENUE_STATUSES) {
    let page = 0
    let fetchedForStatus = 0
    let totalForStatus = 0
    while (page < MAX_PAGES_PER_STATUS) {
      const result = await listOrdersFn(sessionCookies, merchantId, status, page)
      if (result.sessionExpired) {
        sessionExpired = true
        break statusLoop
      }
      allOrders.push(...result.orders)
      fetchedForStatus += result.orders.length
      totalForStatus = result.total
      page += 1
      if (result.orders.length < PAGE_SIZE) break
    }
    if (fetchedForStatus < totalForStatus) truncated = true
  }

  const inWindow = allOrders.filter(o => new Date(o.creationTime).getTime() >= cutoffMs)

  const catalogBySku = new Map(catalog.map(c => [c.kaspiMasterSku, c]))
  const bySku = new Map<string, { unitsSold: number; revenue: number; name: string; imageUrl: string | null }>()
  for (const order of inWindow) {
    for (const item of order.items) {
      const bucket = bySku.get(item.code) || { unitsSold: 0, revenue: 0, name: item.name, imageUrl: item.imageUrl }
      bucket.unitsSold += item.quantity
      bucket.revenue += item.totalPrice
      bySku.set(item.code, bucket)
    }
  }

  const products: ProductProfit[] = []
  let totalCogsKnown = 0
  let productsWithoutCogsCount = 0
  for (const [sku, agg] of bySku.entries()) {
    const catalogEntry = catalogBySku.get(sku)
    const cogsAmount = catalogEntry?.cogsAmount ?? null
    const cogsTotal = cogsAmount !== null ? cogsAmount * agg.unitsSold : null
    if (cogsTotal !== null) totalCogsKnown += cogsTotal
    else productsWithoutCogsCount += 1
    products.push({
      kaspiMasterSku: sku,
      trackedProductId: catalogEntry?.trackedProductId ?? null,
      productName: agg.name,
      imageUrl: agg.imageUrl,
      unitsSold: agg.unitsSold,
      revenue: agg.revenue,
      cogsAmount,
      cogsTotal,
      profit: cogsTotal !== null ? agg.revenue - cogsTotal : null,
    })
  }
  products.sort((a, b) => b.revenue - a.revenue)

  // Derived as the sum of the per-product buckets above (not independently
  // from order.totalPrice) so this number always reconciles with the
  // per-product breakdown shown below it in the UI.
  const totalRevenue = products.reduce((sum, p) => sum + p.revenue, 0)
  const commissionAmount = commissionRatePercent !== null ? totalRevenue * (commissionRatePercent / 100) : 0
  const netProfit = totalRevenue - totalCogsKnown - adSpend.amount - commissionAmount

  return {
    products,
    totalRevenue,
    totalCogsKnown,
    productsWithoutCogsCount,
    adSpend: adSpend.amount,
    adSpendConfigured: adSpend.configured,
    commissionRatePercent,
    commissionAmount,
    netProfit,
    truncated,
    sessionExpired,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/kaspiShop/profit.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/kaspiShop/profit.ts src/lib/kaspiShop/profit.test.ts
git commit -m "feat(kaspi-shop): profit.ts -- per-product/store unit-economics computation"
```

---

### Task 2: API routes

**Files:**
- Create: `src/app/api/kaspi-shop/profit/route.ts`
- Create: `src/app/api/kaspi-shop/profit/cogs/route.ts`
- Create: `src/app/api/kaspi-shop/profit/commission/route.ts`
- Create: `src/app/api/kaspi-shop/profit/ad-spend/route.ts`

**Interfaces:**
- Consumes: `computeProfitSummary`, `ProfitSummary` from `@/lib/kaspiShop/profit` (Task 1); `loadConnection`, `markSessionExpired` from `@/lib/kaspiShop/connection` (existing).
- Produces: `GET /api/kaspi-shop/profit?days={7|30|90}` → `200 ProfitSummary`; `PATCH /api/kaspi-shop/profit/cogs` (body `{trackedProductId, cogsAmount}`) → `200 {ok:true}`; `PATCH /api/kaspi-shop/profit/commission` (body `{commissionRatePercent}`) → `200 {ok:true}`; `PATCH /api/kaspi-shop/profit/ad-spend` (body `{days, amount}`) → `200 {ok:true}`. Task 4's page calls all four.

- [ ] **Step 1: Write the summary route**

Create `src/app/api/kaspi-shop/profit/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection, markSessionExpired } from '@/lib/kaspiShop/connection'
import { computeProfitSummary } from '@/lib/kaspiShop/profit'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

const VALID_DAYS = [7, 30, 90]

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const daysParam = Number(req.nextUrl.searchParams.get('days')) || 30
  const days = VALID_DAYS.includes(daysParam) ? daysParam : 30

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён' }, { status: 400 })
  }

  const { data: connRow } = await supabase
    .from('kaspi_shop_connections')
    .select('commission_rate_percent')
    .eq('id', connection.id)
    .single()
  const commissionRatePercent = connRow?.commission_rate_percent ?? null

  const { data: productRows } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('id, kaspi_master_sku, cogs_amount')
    .eq('connection_id', connection.id)
  const catalog = (productRows || [])
    .filter(p => p.kaspi_master_sku)
    .map(p => ({ kaspiMasterSku: p.kaspi_master_sku as string, trackedProductId: p.id as string, cogsAmount: p.cogs_amount as number | null }))

  const { data: adSpendRow } = await supabase
    .from('kaspi_shop_ad_spend')
    .select('amount')
    .eq('connection_id', connection.id)
    .eq('days', days)
    .maybeSingle()
  const adSpend = { amount: Number(adSpendRow?.amount) || 0, configured: !!adSpendRow }

  const summary = await computeProfitSummary(connection.sessionCookies, connection.merchantId, days, catalog, adSpend, commissionRatePercent)
  if (summary.sessionExpired) await markSessionExpired(connection.id)
  return NextResponse.json(summary)
}
```

- [ ] **Step 2: Write the COGS update route**

Create `src/app/api/kaspi-shop/profit/cogs/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const trackedProductId = body?.trackedProductId
  const cogsAmount = body?.cogsAmount === null ? null : Number(body?.cogsAmount)
  if (!trackedProductId || (cogsAmount !== null && !(cogsAmount >= 0))) {
    return NextResponse.json({ error: 'trackedProductId и корректная cogsAmount обязательны' }, { status: 400 })
  }

  const { error } = await supabase
    .from('kaspi_shop_tracked_products')
    .update({ cogs_amount: cogsAmount })
    .eq('id', trackedProductId)
    .eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'Не удалось сохранить себестоимость' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Write the commission-rate update route**

Create `src/app/api/kaspi-shop/profit/commission/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection } from '@/lib/kaspiShop/connection'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const commissionRatePercent = body?.commissionRatePercent === null ? null : Number(body?.commissionRatePercent)
  if (commissionRatePercent !== null && !(commissionRatePercent >= 0 && commissionRatePercent <= 100)) {
    return NextResponse.json({ error: 'Ставка комиссии должна быть от 0 до 100' }, { status: 400 })
  }

  const connection = await loadConnection(user.id)
  if (!connection) return NextResponse.json({ error: 'Кабинет не подключён' }, { status: 400 })

  const { error } = await supabase
    .from('kaspi_shop_connections')
    .update({ commission_rate_percent: commissionRatePercent })
    .eq('id', connection.id)
  if (error) return NextResponse.json({ error: 'Не удалось сохранить комиссию' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Write the ad-spend update route**

Create `src/app/api/kaspi-shop/profit/ad-spend/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection } from '@/lib/kaspiShop/connection'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

const VALID_DAYS = [7, 30, 90]

export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const days = Number(body?.days)
  const amount = Number(body?.amount)
  if (!VALID_DAYS.includes(days) || !(amount >= 0)) {
    return NextResponse.json({ error: 'days (7/30/90) и корректная amount обязательны' }, { status: 400 })
  }

  const connection = await loadConnection(user.id)
  if (!connection) return NextResponse.json({ error: 'Кабинет не подключён' }, { status: 400 })

  const { error } = await supabase
    .from('kaspi_shop_ad_spend')
    .upsert({ connection_id: connection.id, days, amount, updated_at: new Date().toISOString() }, { onConflict: 'connection_id,days' })
  if (error) return NextResponse.json({ error: 'Не удалось сохранить расходы на рекламу' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

These routes have no test coverage, matching every other `kaspi-shop` API route in this codebase.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/kaspi-shop/profit/route.ts src/app/api/kaspi-shop/profit/cogs/route.ts src/app/api/kaspi-shop/profit/commission/route.ts src/app/api/kaspi-shop/profit/ad-spend/route.ts
git commit -m "feat(kaspi-shop): profit summary + cogs/commission/ad-spend update routes"
```

---

### Task 3: Sidebar — real "Прибыль" link

**Files:**
- Modify: `src/components/kaspiShop/Sidebar.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `KaspiShopSidebar`'s `active` prop now accepts `'profit'` in addition to `'demping' | 'orders' | 'finance' | 'pending-products' | 'niches'`. Task 4's page passes `active="profit"`.

- [ ] **Step 1: Extend the `active` union**

In `src/components/kaspiShop/Sidebar.tsx`, change:

```tsx
  active: 'demping' | 'orders' | 'finance' | 'pending-products' | 'niches'
```

to:

```tsx
  active: 'demping' | 'orders' | 'finance' | 'pending-products' | 'niches' | 'profit'
```

- [ ] **Step 2: Add the real nav link**

In `src/components/kaspiShop/Sidebar.tsx`, right after the "Ниши" `<Link>` block, insert:

```tsx
          <Link href="/kaspi-shop/profit"
            className={`rounded-xl text-sm font-medium px-3 py-2.5 ${active === 'profit' ? 'bg-[#1C2056] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            Прибыль
          </Link>
```

So the block reads:

```tsx
          <Link href="/kaspi-shop/niches"
            className={`rounded-xl text-sm font-medium px-3 py-2.5 ${active === 'niches' ? 'bg-[#1C2056] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            Ниши
          </Link>
          <Link href="/kaspi-shop/profit"
            className={`rounded-xl text-sm font-medium px-3 py-2.5 ${active === 'profit' ? 'bg-[#1C2056] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            Прибыль
          </Link>
          {SOON_ITEMS.map(item => (
```

(`SOON_ITEMS` stays `const SOON_ITEMS: string[] = []` — already empty, do not modify it.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/kaspiShop/Sidebar.tsx
git commit -m "feat(kaspi-shop): add Прибыль to the sidebar"
```

---

### Task 4: Page — `/kaspi-shop/profit`

**Files:**
- Create: `src/app/kaspi-shop/profit/page.tsx`

**Interfaces:**
- Consumes: `GET /api/kaspi-shop/profit?days={7|30|90}`, `PATCH /api/kaspi-shop/profit/cogs`, `PATCH /api/kaspi-shop/profit/commission`, `PATCH /api/kaspi-shop/profit/ad-spend` (Task 2); `KaspiShopSidebar` with `active="profit"` (Task 3).
- Produces: the page itself — nothing downstream depends on it.

- [ ] **Step 1: Write the page**

Create `src/app/kaspi-shop/profit/page.tsx`:

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import KaspiShopSidebar from '@/components/kaspiShop/Sidebar'
import SessionExpiredBanner from '@/components/kaspiShop/SessionExpiredBanner'

const EASE = [0.16, 1, 0.3, 1] as const
const PERIODS = [7, 30, 90]

type ProductProfit = {
  kaspiMasterSku: string
  trackedProductId: string | null
  productName: string
  imageUrl: string | null
  unitsSold: number
  revenue: number
  cogsAmount: number | null
  cogsTotal: number | null
  profit: number | null
}

type ProfitSummary = {
  products: ProductProfit[]
  totalRevenue: number
  totalCogsKnown: number
  productsWithoutCogsCount: number
  adSpend: number
  adSpendConfigured: boolean
  commissionRatePercent: number | null
  commissionAmount: number
  netProfit: number
  truncated: boolean
  sessionExpired: boolean
}

export default function KaspiShopProfit() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)
  const [summary, setSummary] = useState<ProfitSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [commissionInput, setCommissionInput] = useState('')
  const [adSpendInput, setAdSpendInput] = useState('')
  const [savingCogsFor, setSavingCogsFor] = useState<string | null>(null)
  const [cogsInputs, setCogsInputs] = useState<Record<string, string>>({})

  useEffect(() => { checkAccess() }, [])
  useEffect(() => { if (!loading) loadSummary(days) }, [days, loading])

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  async function checkAccess() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) { router.push('/dashboard'); return }
    setLoading(false)
  }

  async function loadSummary(forDays: number) {
    setSummaryLoading(true)
    setLoadError('')
    try {
      const headers = await authHeader()
      const res = await fetch(`/api/kaspi-shop/profit?days=${forDays}`, { headers })
      const data = await res.json()
      if (!res.ok) { setLoadError(data.error || 'Не удалось загрузить прибыль'); setSummary(null); return }
      setSummary(data)
      setCommissionInput(data.commissionRatePercent !== null ? String(data.commissionRatePercent) : '')
      setAdSpendInput(data.adSpendConfigured ? String(data.adSpend) : '')
    } catch {
      setLoadError('Не удалось загрузить прибыль. Проверьте соединение и попробуйте ещё раз.')
      setSummary(null)
    } finally {
      setSummaryLoading(false)
    }
  }

  async function saveCommission() {
    const value = commissionInput.trim() === '' ? null : Number(commissionInput)
    const headers = await authHeader()
    await fetch('/api/kaspi-shop/profit/commission', { method: 'PATCH', headers, body: JSON.stringify({ commissionRatePercent: value }) })
    loadSummary(days)
  }

  async function saveAdSpend() {
    const value = Number(adSpendInput) || 0
    const headers = await authHeader()
    await fetch('/api/kaspi-shop/profit/ad-spend', { method: 'PATCH', headers, body: JSON.stringify({ days, amount: value }) })
    loadSummary(days)
  }

  async function saveCogs(trackedProductId: string) {
    const raw = cogsInputs[trackedProductId]
    const value = raw === undefined || raw.trim() === '' ? null : Number(raw)
    setSavingCogsFor(trackedProductId)
    try {
      const headers = await authHeader()
      await fetch('/api/kaspi-shop/profit/cogs', { method: 'PATCH', headers, body: JSON.stringify({ trackedProductId, cogsAmount: value }) })
      await loadSummary(days)
    } finally {
      setSavingCogsFor(null)
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <main className="min-h-screen bg-[#F6F6FB] lg:flex">
      <KaspiShopSidebar active="profit" />

      <div className="flex-1 min-w-0 p-4 lg:p-6 pb-24 lg:pb-6">
        {summary?.sessionExpired && <SessionExpiredBanner />}

        {loadError && (
          <div className="bg-red-50 rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
            <span className="text-sm text-red-600">{loadError}</span>
            <button onClick={() => loadSummary(days)} className="text-xs bg-red-500 text-white rounded-lg px-3 py-1.5 flex-shrink-0">Повторить</button>
          </div>
        )}

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
          className="bg-[#12142E] rounded-[28px] p-6 lg:p-8 mb-4 text-white">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <div className="text-[11px] font-semibold tracking-wider text-white/40 uppercase mb-1">Прибыль</div>
              <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight">Юнит-экономика</h1>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 bg-white/10 rounded-full p-1">
              {PERIODS.map(p => (
                <button key={p} onClick={() => setDays(p)}
                  className={`text-xs font-medium rounded-full px-3 py-1.5 transition-colors ${days === p ? 'bg-white text-[#12142E]' : 'text-white/60'}`}>
                  {p} дн.
                </button>
              ))}
            </div>
          </div>

          <div className="text-4xl lg:text-5xl font-black font-mono tabular-nums mb-1">
            {(summary?.netProfit ?? 0).toLocaleString('ru-KZ')} <span className="text-lg text-white/40">₸ прибыль</span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
            <div>
              <div className="text-lg font-bold font-mono tabular-nums">{(summary?.totalRevenue ?? 0).toLocaleString('ru-KZ')}</div>
              <div className="text-xs text-white/40 mt-1">₸ выручка</div>
            </div>
            <div>
              <div className="text-lg font-bold font-mono tabular-nums">{(summary?.totalCogsKnown ?? 0).toLocaleString('ru-KZ')}</div>
              <div className="text-xs text-white/40 mt-1">₸ себестоимость</div>
            </div>
            <div>
              {summary?.adSpendConfigured ? (
                <>
                  <div className="text-lg font-bold font-mono tabular-nums">{summary.adSpend.toLocaleString('ru-KZ')}</div>
                  <div className="text-xs text-white/40 mt-1">₸ реклама</div>
                </>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input value={adSpendInput} onChange={e => setAdSpendInput(e.target.value)} placeholder="0"
                    className="w-20 rounded-lg bg-white/10 text-white placeholder-white/30 px-2 py-1 text-sm outline-none focus:bg-white/15" />
                  <button onClick={saveAdSpend} className="text-xs font-medium bg-white text-[#12142E] rounded-lg px-2 py-1">✓</button>
                </div>
              )}
              <div className="text-xs text-white/40 mt-1">{summary?.adSpendConfigured ? '' : 'укажите расходы на рекламу'}</div>
            </div>
            <div>
              {summary?.commissionRatePercent !== null && summary?.commissionRatePercent !== undefined ? (
                <>
                  <div className="text-lg font-bold font-mono tabular-nums">{summary.commissionAmount.toLocaleString('ru-KZ')}</div>
                  <div className="text-xs text-white/40 mt-1">₸ комиссия ({summary.commissionRatePercent}%)</div>
                </>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input value={commissionInput} onChange={e => setCommissionInput(e.target.value)} placeholder="%"
                    className="w-16 rounded-lg bg-white/10 text-white placeholder-white/30 px-2 py-1 text-sm outline-none focus:bg-white/15" />
                  <button onClick={saveCommission} className="text-xs font-medium bg-white text-[#12142E] rounded-lg px-2 py-1">✓</button>
                </div>
              )}
              <div className="text-xs text-white/40 mt-1">{summary?.commissionRatePercent !== null && summary?.commissionRatePercent !== undefined ? '' : 'укажите комиссию Kaspi'}</div>
            </div>
          </div>

          {!!summary && summary.productsWithoutCogsCount > 0 && (
            <div className="text-[11px] text-white/50 mt-4">⚠ {summary.productsWithoutCogsCount} {summary.productsWithoutCogsCount === 1 ? 'товар' : 'товаров'} без себестоимости — прибыль может быть занижена.</div>
          )}
        </motion.div>

        {summaryLoading ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center text-sm text-gray-400">Считаем...</div>
        ) : !summary || summary.products.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <div className="text-sm text-gray-500">За этот период продаж нет.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {summary.products.map(p => (
              <div key={p.kaspiMasterSku} className="bg-white rounded-2xl shadow-sm p-3 flex items-center gap-3">
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt={p.productName} className="w-14 h-14 rounded-xl object-cover flex-shrink-0 bg-gray-100" />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-gray-100 flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-gray-800 truncate">{p.productName || p.kaspiMasterSku}</div>
                  <div className="text-[11px] text-gray-400">{p.unitsSold} шт · {p.revenue.toLocaleString('ru-KZ')} ₸ выручка</div>
                </div>
                {p.trackedProductId && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <input
                      value={cogsInputs[p.trackedProductId] ?? (p.cogsAmount !== null ? String(p.cogsAmount) : '')}
                      onChange={e => setCogsInputs(prev => ({ ...prev, [p.trackedProductId!]: e.target.value }))}
                      placeholder="себест."
                      className="w-20 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 px-2 py-1.5 text-xs outline-none focus:bg-gray-100 text-right" />
                    <button onClick={() => saveCogs(p.trackedProductId!)} disabled={savingCogsFor === p.trackedProductId}
                      className="text-xs font-medium bg-[#1C2056] text-white rounded-lg px-2 py-1.5 disabled:opacity-50">✓</button>
                  </div>
                )}
                <span className="font-mono font-bold text-sm text-[#1C2056] tabular-nums flex-shrink-0 w-20 text-right">
                  {p.profit !== null ? `${p.profit.toLocaleString('ru-KZ')} ₸` : <span className="text-gray-400 text-[11px] font-normal">укажите себест.</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t px-4 py-2 flex items-center justify-between z-40">
        <div className="text-xs font-semibold text-[#1C2056]">Прибыль</div>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Full build**

Run: `npm run build`
Expected: build succeeds, `/kaspi-shop/profit` and the four new API routes listed among the generated routes.

- [ ] **Step 4: Commit**

```bash
git add src/app/kaspi-shop/profit/page.tsx
git commit -m "feat(kaspi-shop): Прибыль page with editable commission/ad-spend/COGS"
```

---

## Self-Review Notes

- **Spec coverage:** flat commission % → Task 2's commission route + Task 4's inline editor. Manual per-window ad spend → `kaspi_shop_ad_spend` table + Task 2's ad-spend route + Task 4's inline editor. Single-current-value COGS per product → `cogs_amount` column + Task 2's cogs route + Task 4's per-row editor. Honesty pattern (never silently zero) → `productsWithoutCogsCount`/`adSpendConfigured`/`commissionRatePercent: null` all explicitly surfaced in the UI, never hidden. No catalog table invented → reused `kaspi_shop_tracked_products`. Product name/photo from order data, not catalog → `bySku` map captures `item.name`/`item.imageUrl` directly. `totalRevenue` internally consistent with per-product sum → computed as `products.reduce(...)`, not from `order.totalPrice`. Confirmed join key (`kaspi_master_sku`) → used throughout, `kaspi_sku` never referenced. All covered.
- **Placeholder scan:** none found — every step has literal code.
- **Type consistency:** `ProductProfit`/`ProfitSummary` (Task 1) match exactly what Task 2's `GET /profit` route returns (a direct `NextResponse.json(summary)`, no reshaping) and what Task 4's page's local type copies read (`kaspiMasterSku`, `trackedProductId`, `productName`, `imageUrl`, `unitsSold`, `revenue`, `cogsAmount`, `cogsTotal`, `profit`, and the summary-level fields all match field-for-field). `computeProfitSummary`'s `catalog`/`adSpend`/`commissionRatePercent` parameters match exactly what Task 2's route builds from its three separate Supabase reads.
