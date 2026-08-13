# Kaspi Shop: Финансы Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Exception — Task 1 is controller-only, not subagent-dispatchable.** Same reason as the previous two plans' Task 1: it needs live interaction with a real, already-connected Kaspi account and the controller's own browser-automation tool access, in real time.

**Goal:** A Финансы page in Kaspi Shop showing revenue, order count, and average order value over a 7/30/90-day window, computed from real fulfilled orders — matching the "Финансы" section every competitor (Northline, PriceFeed) already has.

**Architecture:** A new pure-logic module (`finance.ts`) paginates through `listOrders` for fulfilled-order statuses (`KASPI_DELIVERY_TRANSMITTED`, `ARCHIVED`), filters by date, and aggregates into a `FinanceSummary`. A new route exposes it; a new page renders it in the same dark hero-card visual language as Демпинг, reusing `KaspiShopSidebar`.

**Tech Stack:** Next.js (dynamic route params are `Promise<{...}>` in this codebase's version), Vitest for `finance.ts`'s aggregation logic, chrome-devtools-mcp for Task 1's live check.

## Global Constraints

- Revenue = sum of `totalPrice` over orders in `KASPI_DELIVERY_TRANSMITTED` and `ARCHIVED` statuses only — no other status counts.
- `listOrders`' real, confirmed page size is 10 (requesting more throws a Kaspi-side "Bad Request" GraphQL error) — never override it.
- Safety cap: 20 pages (200 orders) per status per request. A summary that hits the cap sets `truncated: true` rather than silently under-counting without saying so.
- No early-stop-on-sort-order in the pagination loop — real `creationTime` values are NOT monotonically ordered within a page (confirmed live 2026-08-13). Always page through the full cap (or until a short page signals the true last page), then filter by date after fetching.
- v1 has no custom date ranges (7/30/90-day presets only) and no charts (list-based daily breakdown only).
- Every task ends with a clean `npx tsc --noEmit`; the final task also runs `npm run build`.
- Route handlers and pages have no test coverage in this codebase; only pure-logic modules get colocated Vitest `.test.ts` files.

---

### Task 1: Live check for a real payout/commission endpoint

**Files:**
- Create: `docs/superpowers/specs/2026-08-13-kaspi-finance-api-findings.md`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: a findings document. This task's outcome does NOT gate Tasks 2-6 — v1 ships on `listOrders` data regardless of what's found here.

- [ ] **Step 1: Check the already-connected real account's session is still live**

Navigate to `https://kaspi.kz/mc/#/settings` (merchant 425002, "ABIL-SISTERS" — the account already connected this session via the phone login). If the session is still valid, the real Настройки page loads. If it redirects to a login page, the session has expired — ask the user for their phone number and a fresh SMS code, repeat the phone+OTP login flow documented in `docs/superpowers/specs/2026-08-12-kaspi-cabinet-api-findings.md` directly on `idmc.shop.kaspi.kz/login`, then retry this step.

- [ ] **Step 2: Look for a finance/payout surface inside the Магазин cabinet itself**

With `list_network_requests` open, click through Настройки and every item under ОСТАЛЬНОЕ (Показатели качества, Рейтинг, Задержки при передачах, Возвраты по качеству, Отмены по вашей вине, Пользователи, Kaspi Marketing). Record in the findings file: for each, whether it shows any revenue/payout/commission figure, and if so, the exact request (URL, method, response shape) that produced it.

- [ ] **Step 3: Check whether merchant.kaspi.kz (the separate Kaspi Pay/acquiring system) exposes payout data**

Navigate to `https://merchant.kaspi.kz` in the same browser (same phone number, but project memory notes this is a genuinely different system from `idmc.shop.kaspi.kz` — it may require its own separate login). Attempt to log in with the same phone; if it needs its own OTP, ask the user for it once. If it reaches a real dashboard, look specifically for payout/commission/settlement data and record the exact request shape if found. **Time-box this**: if `merchant.kaspi.kz` turns out to need substantial separate reverse-engineering (a different auth flow, different session model), stop and record it as an open question for a dedicated future session rather than expanding this task's scope.

- [ ] **Step 4: Write the findings document and commit**

Write `docs/superpowers/specs/2026-08-13-kaspi-finance-api-findings.md` covering: whether a real payout/commission endpoint was found (with its full request/response shape if so), or a plain "not found in the Магазин cabinet; merchant.kaspi.kz [reached and confirmed absent / not explored, needs a dedicated session]" if not. Either outcome is a valid, complete result — write it plainly.

```bash
git add docs/superpowers/specs/2026-08-13-kaspi-finance-api-findings.md
git commit -m "docs(kaspi-shop): check for a real payout/commission endpoint (finance sub-project)"
```

---

### Task 2: `computeFinanceSummary` aggregation logic

**Files:**
- Modify: `src/lib/kaspiShop/cabinetApi.ts` (export the existing `PAGE_SIZE` constant)
- Create: `src/lib/kaspiShop/finance.ts`
- Test: `src/lib/kaspiShop/finance.test.ts`

**Interfaces:**
- Consumes: `listOrders(sessionCookies: string, merchantId: string, status: string, page?: number): Promise<{orders: Order[], total: number}>` (existing, `src/lib/kaspiShop/cabinetApi.ts`), `Order` type (existing, same file: `{code, status, customerFirstName, customerLastName, totalPrice, creationTime}`).
- Produces: `FinanceSummary` type and `computeFinanceSummary(sessionCookies: string, merchantId: string, sinceDays: number, listOrdersFn?: typeof listOrders): Promise<FinanceSummary>`. Task 3's route calls this directly.

- [ ] **Step 1: Export `PAGE_SIZE` from `cabinetApi.ts`**

In `src/lib/kaspiShop/cabinetApi.ts`, find the line `const PAGE_SIZE = 10` (just above `listOrders`) and change it to:

```ts
export const PAGE_SIZE = 10
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/kaspiShop/finance.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { computeFinanceSummary } from './finance'
import type { Order } from './cabinetApi'

function makeOrder(code: string, totalPrice: number, creationTime: string): Order {
  return { code, status: 'TRANSMITTED', customerFirstName: 'Test', customerLastName: 'T', totalPrice, creationTime }
}

describe('computeFinanceSummary', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-13T12:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('sums revenue from both fulfilled statuses, excluding orders outside the window', async () => {
    const fakeListOrders = vi.fn(async (_sessionCookies: string, _merchantId: string, status: string, _page = 0) => {
      if (status === 'KASPI_DELIVERY_TRANSMITTED') {
        return {
          total: 2,
          orders: [
            makeOrder('1', 1000, '2026-08-12T10:00:00.000Z'), // inside 7-day window
            makeOrder('2', 2000, '2026-08-01T10:00:00.000Z'), // outside 7-day window
          ],
        }
      }
      if (status === 'ARCHIVED') {
        return { total: 1, orders: [makeOrder('3', 500, '2026-08-10T10:00:00.000Z')] }
      }
      return { total: 0, orders: [] }
    })

    const summary = await computeFinanceSummary('cookies', 'merchant1', 7, fakeListOrders as any)

    expect(summary.totalRevenue).toBe(1500)
    expect(summary.orderCount).toBe(2)
    expect(summary.averageOrderValue).toBe(750)
    expect(summary.byDay).toEqual([
      { date: '2026-08-10', revenue: 500, orderCount: 1 },
      { date: '2026-08-12', revenue: 1000, orderCount: 1 },
    ])
    expect(summary.truncated).toBe(false)
  })

  it('paginates a status until a short page, without assuming sort order', async () => {
    const fakeListOrders = vi.fn(async (_sessionCookies: string, _merchantId: string, status: string, page = 0) => {
      if (status !== 'KASPI_DELIVERY_TRANSMITTED') return { total: 0, orders: [] }
      if (page === 0) {
        return { total: 12, orders: Array.from({ length: 10 }, (_, i) => makeOrder(`p0-${i}`, 100, '2026-08-11T10:00:00.000Z')) }
      }
      if (page === 1) {
        return { total: 12, orders: [makeOrder('p1-0', 100, '2026-08-12T10:00:00.000Z'), makeOrder('p1-1', 100, '2026-08-12T10:00:00.000Z')] }
      }
      throw new Error('should not fetch a third page when the second page is short')
    })

    const summary = await computeFinanceSummary('cookies', 'merchant1', 7, fakeListOrders as any)

    expect(summary.orderCount).toBe(12)
    expect(summary.totalRevenue).toBe(1200)
    expect(summary.truncated).toBe(false)
  })

  it('sets truncated when a status hits the page cap', async () => {
    const fakeListOrders = vi.fn(async (_sessionCookies: string, _merchantId: string, status: string, _page = 0) => {
      if (status !== 'KASPI_DELIVERY_TRANSMITTED') return { total: 0, orders: [] }
      // Every page is a full page of 10 -- the loop never sees a short page
      // and must stop at the 20-page cap instead of looping forever.
      return { total: 500, orders: Array.from({ length: 10 }, (_, i) => makeOrder(`x-${i}`, 100, '2026-08-11T10:00:00.000Z')) }
    })

    const summary = await computeFinanceSummary('cookies', 'merchant1', 7, fakeListOrders as any)

    expect(summary.truncated).toBe(true)
    expect(fakeListOrders).toHaveBeenCalledTimes(20) // capped, not 50 (500/10)
  })

  it('returns a zero summary with no division by zero when there are no orders', async () => {
    const fakeListOrders = vi.fn(async () => ({ total: 0, orders: [] }))

    const summary = await computeFinanceSummary('cookies', 'merchant1', 30, fakeListOrders as any)

    expect(summary.totalRevenue).toBe(0)
    expect(summary.orderCount).toBe(0)
    expect(summary.averageOrderValue).toBe(0)
    expect(summary.byDay).toEqual([])
    expect(summary.truncated).toBe(false)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/kaspiShop/finance.test.ts`
Expected: FAIL with "Cannot find module './finance'"

- [ ] **Step 4: Implement**

Create `src/lib/kaspiShop/finance.ts`:

```ts
import { listOrders, Order, PAGE_SIZE } from './cabinetApi'

// Real Kaspi cabinet's own nav has no finance section (confirmed live
// 2026-08-13 against two real accounts) -- this is a report WE compute
// from order data, not a passthrough of a Kaspi endpoint. See
// docs/superpowers/specs/2026-08-13-kaspi-shop-finance-design.md and
// docs/superpowers/specs/2026-08-13-kaspi-finance-api-findings.md.
export type FinanceSummary = {
  totalRevenue: number
  orderCount: number
  averageOrderValue: number
  byDay: { date: string; revenue: number; orderCount: number }[]
  truncated: boolean
}

// Only these two statuses represent fulfilled/completed orders -- an order
// still in NEW or UPAKOVKA hasn't happened yet and shouldn't count as
// revenue.
const REVENUE_STATUSES = ['KASPI_DELIVERY_TRANSMITTED', 'ARCHIVED']

// Per status, per request -- a real, deliberate v1 limit, not an oversight.
// A seller past this volume in the selected window sees a totalRevenue
// computed from a subset, with truncated:true telling the UI to say so.
const MAX_PAGES_PER_STATUS = 20

export async function computeFinanceSummary(
  sessionCookies: string,
  merchantId: string,
  sinceDays: number,
  listOrdersFn: typeof listOrders = listOrders
): Promise<FinanceSummary> {
  const cutoffMs = Date.now() - sinceDays * 24 * 60 * 60 * 1000
  const allOrders: Order[] = []
  let truncated = false

  for (const status of REVENUE_STATUSES) {
    let page = 0
    let fetchedForStatus = 0
    let totalForStatus = 0
    while (page < MAX_PAGES_PER_STATUS) {
      const result = await listOrdersFn(sessionCookies, merchantId, status, page)
      allOrders.push(...result.orders)
      fetchedForStatus += result.orders.length
      totalForStatus = result.total
      page += 1
      if (result.orders.length < PAGE_SIZE) break // real last page (short of a full page)
    }
    if (fetchedForStatus < totalForStatus) truncated = true
  }

  const inWindow = allOrders.filter(o => new Date(o.creationTime).getTime() >= cutoffMs)

  const byDayMap = new Map<string, { revenue: number; orderCount: number }>()
  for (const o of inWindow) {
    const date = o.creationTime.slice(0, 10) // YYYY-MM-DD, real creationTime is ISO 8601
    const bucket = byDayMap.get(date) || { revenue: 0, orderCount: 0 }
    bucket.revenue += o.totalPrice
    bucket.orderCount += 1
    byDayMap.set(date, bucket)
  }
  const byDay = Array.from(byDayMap.entries())
    .map(([date, v]) => ({ date, revenue: v.revenue, orderCount: v.orderCount }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const totalRevenue = inWindow.reduce((sum, o) => sum + o.totalPrice, 0)
  const orderCount = inWindow.length
  const averageOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0

  return { totalRevenue, orderCount, averageOrderValue, byDay, truncated }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/kaspiShop/finance.test.ts`
Expected: PASS (all 4 cases)

- [ ] **Step 6: Verify with `tsc`**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/kaspiShop/cabinetApi.ts src/lib/kaspiShop/finance.ts src/lib/kaspiShop/finance.test.ts
git commit -m "feat(kaspi-shop): compute revenue summary from fulfilled orders"
```

---

### Task 3: `GET /api/kaspi-shop/finance`

**Files:**
- Create: `src/app/api/kaspi-shop/finance/route.ts`

**Interfaces:**
- Consumes: `computeFinanceSummary` (Task 2), `loadConnection` (existing, `src/lib/kaspiShop/connection.ts`).
- Produces: `GET /api/kaspi-shop/finance?days={7|30|90}` returning a `FinanceSummary` JSON body, or `{ error }`.

- [ ] **Step 1: Implement**

Create `src/app/api/kaspi-shop/finance/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection } from '@/lib/kaspiShop/connection'
import { computeFinanceSummary } from '@/lib/kaspiShop/finance'

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

  const summary = await computeFinanceSummary(connection.sessionCookies, connection.merchantId, days)
  return NextResponse.json(summary)
}
```

- [ ] **Step 2: Verify with `tsc`**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/kaspi-shop/finance/route.ts
git commit -m "feat(kaspi-shop): add GET /api/kaspi-shop/finance"
```

---

### Task 4: Sidebar — real Финансы link

**Files:**
- Modify: `src/components/kaspiShop/Sidebar.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `<KaspiShopSidebar active="finance" />` — Task 5's page uses this.

- [ ] **Step 1: Add `'finance'` to the `active` union and remove it from the "скоро" list**

In `src/components/kaspiShop/Sidebar.tsx`, change:

```ts
const SOON_ITEMS = ['Финансы', 'Каталог НКТ', 'Ниши']
```

to:

```ts
const SOON_ITEMS = ['Каталог НКТ', 'Ниши']
```

And change the component signature:

```tsx
export default function KaspiShopSidebar({ active, orderStatus, orderCounts }: {
  active: 'demping' | 'orders'
  orderStatus?: string
  orderCounts?: Record<string, number>
}) {
```

to:

```tsx
export default function KaspiShopSidebar({ active, orderStatus, orderCounts }: {
  active: 'demping' | 'orders' | 'finance'
  orderStatus?: string
  orderCounts?: Record<string, number>
}) {
```

- [ ] **Step 2: Add the real link**

Directly after the `{active === 'orders' && (...)}` block (the order-status subnav) and before the `{SOON_ITEMS.map(...)}` block, add:

```tsx
          <Link href="/kaspi-shop/finance"
            className={`rounded-xl text-sm font-medium px-3 py-2.5 ${active === 'finance' ? 'bg-[#1C2056] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            Финансы
          </Link>
```

- [ ] **Step 3: Verify with `tsc`**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/kaspiShop/Sidebar.tsx
git commit -m "feat(kaspi-shop): link the real Финансы page from the sidebar"
```

---

### Task 5: Финансы page

**Files:**
- Create: `src/app/kaspi-shop/finance/page.tsx`

**Interfaces:**
- Consumes: `GET /api/kaspi-shop/finance` (Task 3), `<KaspiShopSidebar active="finance">` (Task 4).
- Produces: the `/kaspi-shop/finance` page.

- [ ] **Step 1: Implement**

Create `src/app/kaspi-shop/finance/page.tsx`:

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import KaspiShopSidebar from '@/components/kaspiShop/Sidebar'

const EASE = [0.16, 1, 0.3, 1] as const

type FinanceSummary = {
  totalRevenue: number
  orderCount: number
  averageOrderValue: number
  byDay: { date: string; revenue: number; orderCount: number }[]
  truncated: boolean
}

const PERIODS = [7, 30, 90]

export default function KaspiShopFinance() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)
  const [summary, setSummary] = useState<FinanceSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

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
      const res = await fetch(`/api/kaspi-shop/finance?days=${forDays}`, { headers })
      const data = await res.json()
      if (!res.ok) { setLoadError(data.error || 'Не удалось загрузить финансы'); setSummary(null); return }
      setSummary(data)
    } catch {
      setLoadError('Не удалось загрузить финансы. Проверьте соединение и попробуйте ещё раз.')
      setSummary(null)
    } finally {
      setSummaryLoading(false)
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <main className="min-h-screen bg-[#F6F6FB] lg:flex">
      <KaspiShopSidebar active="finance" />

      <div className="flex-1 min-w-0 p-4 lg:p-6 pb-24 lg:pb-6">
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
              <div className="text-[11px] font-semibold tracking-wider text-white/40 uppercase mb-1">Финансы</div>
              <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight">Выручка</h1>
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
          <div className="grid grid-cols-3 gap-3 lg:gap-6">
            <div>
              <div className="text-3xl lg:text-4xl font-black font-mono tabular-nums">{(summary?.totalRevenue ?? 0).toLocaleString('ru-KZ')}</div>
              <div className="text-xs text-white/40 mt-1">₸ выручка</div>
            </div>
            <div>
              <div className="text-3xl lg:text-4xl font-black font-mono tabular-nums">{summary?.orderCount ?? 0}</div>
              <div className="text-xs text-white/40 mt-1">заказов</div>
            </div>
            <div>
              <div className="text-3xl lg:text-4xl font-black font-mono tabular-nums">{Math.round(summary?.averageOrderValue ?? 0).toLocaleString('ru-KZ')}</div>
              <div className="text-xs text-white/40 mt-1">₸ средний чек</div>
            </div>
          </div>
          {summary?.truncated && (
            <div className="text-[11px] text-white/40 mt-4">Учтены последние 200 заказов на статус — на большом объёме сумма может быть неполной.</div>
          )}
        </motion.div>

        {summaryLoading ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center text-sm text-gray-400">Считаем...</div>
        ) : !summary || summary.byDay.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <div className="text-sm text-gray-500">За этот период выполненных заказов нет.</div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-50">
            {[...summary.byDay].reverse().map(d => (
              <div key={d.date} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-gray-600">{d.date}</span>
                <span className="text-xs text-gray-400">{d.orderCount} {d.orderCount === 1 ? 'заказ' : 'заказов'}</span>
                <span className="font-mono font-semibold text-sm text-[#1C2056] tabular-nums">{d.revenue.toLocaleString('ru-KZ')} ₸</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t px-4 py-2 flex items-center justify-between z-40">
        <div className="text-xs font-semibold text-[#1C2056]">Финансы</div>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Verify with `tsc`**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/kaspi-shop/finance/page.tsx
git commit -m "feat(kaspi-shop): Финансы page with period switcher and daily revenue breakdown"
```

---

### Task 6: Final build verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: all pure-logic tests pass, including Task 2's new `finance.test.ts` suite (4 cases) and every pre-existing suite in this codebase.

- [ ] **Step 2: Full build**

Run: `npx tsc --noEmit` then `npm run build`
Expected: both clean, `/api/kaspi-shop/finance` and `/kaspi-shop/finance` both listed in the build output.

- [ ] **Step 3: Push**

```bash
git push origin main
```

---

## Self-Review Notes

- **Spec coverage:** revenue definition (TRANSMITTED+ARCHIVED only, Task 2), pagination safety cap + truncated flag (Task 2), date filtering without assuming sort order (Task 2, explicitly tested in Step 2's second test case), 7/30/90 preset switcher with no custom range (Task 5), list-based breakdown with no charting library (Task 5), sidebar real link replacing the "скоро" placeholder (Task 4), Task 1's live check for a real payout endpoint as a non-blocking stretch goal (Task 1) — all covered.
- **Placeholder scan:** no TBD/TODO markers; Task 1's live-capture steps are necessarily conditional on what's found live (same pattern as the previous two plans' Task 1) rather than a fixed script, which is expected for a research task, not an unresolved placeholder.
- **Type consistency:** `FinanceSummary` (Task 2) is the exact type Task 3's route returns verbatim and Task 5's page declares independently but structurally identically (no shared import needed across the client/server boundary, matching this codebase's existing pattern in `orders/page.tsx` vs `cabinetApi.ts`'s `Order` type); `computeFinanceSummary`'s signature (Task 2) matches exactly how Task 3 calls it; `PAGE_SIZE` exported in Task 2 Step 1 is the same constant `listOrders` already uses internally, not a second hardcoded `10`.
