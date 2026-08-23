# Kaspi Shop Orders: City Filter, Date Tab, Excel Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a city filter (all statuses), a "Все/Завтра до 20:00" delivery-date tab (Передача/Упаковка only), and a "Выгрузить в Excel" export button to the Kaspi Shop Orders page, matching the real Kaspi cabinet.

**Architecture:** Extend the existing `getOrders` GraphQL fragment (`cabinetApi.ts`) to carry `destination.city` and `delivery.plannedDeliveryDate` — both confirmed-live fields, just not previously requested. Add `cityId` as an optional param threaded into the already-wired (currently always-empty) `input.cityId` GraphQL variable — no new Kaspi endpoint. The date tab has no server-side equivalent, so it post-filters the already-fetched page client-side. City dropdown options come from sampling existing pages server-side (no new Kaspi endpoint either). Excel export loops the existing `listOrders` pages server-side and streams back an `.xlsx` built with the already-installed `xlsx` package.

**Tech Stack:** Next.js API routes, React (client component), `xlsx` (already a dependency), Vitest.

## Global Constraints

- No new Kaspi endpoint may be introduced without a live-captured, confirmed request/response shape — every change here reuses `mc.shop.kaspi.kz`'s existing `getOrders` GraphQL operation.
- Excel export caps at exactly 500 orders (spec: `docs/superpowers/specs/2026-08-23-kaspi-orders-filters-excel-design.md`).
- City dropdown samples exactly 5 pages (50 orders) per status.
- Date tab renders only when `BULK_PRINTABLE_STATUSES.includes(status)` (i.e. `KASPI_DELIVERY_WAIT_FOR_COURIER` / `KASPI_DELIVERY_CARGO_ASSEMBLY`).
- No new npm dependency — `xlsx` is already installed (`package.json`).

---

### Task 1: Extend `cabinetApi.ts` with city + delivery-date fields and a `cityId` filter param

**Files:**
- Modify: `src/lib/kaspiShop/cabinetApi.ts`
- Test: `src/lib/kaspiShop/cabinetApi.test.ts` (new)

**Interfaces:**
- Produces: `extractDestinationCity(destination: any): { cityId: string | null; cityName: string | null }` (exported)
- Produces: `Order` type gains `cityId: string | null`, `cityName: string | null`, `plannedDeliveryDate: string | null`
- Produces: `listOrders(sessionCookies: string, merchantId: string, status: string, page?: number, cityId?: string): Promise<OrdersPage>` (new optional 5th param, defaults to `''`)

- [ ] **Step 1: Write the failing test**

Create `src/lib/kaspiShop/cabinetApi.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { extractDestinationCity } from './cabinetApi'

describe('extractDestinationCity', () => {
  it('extracts city id/name from a destination with a city', () => {
    expect(extractDestinationCity({ city: { id: 366, name: 'Алматы' } })).toEqual({ cityId: '366', cityName: 'Алматы' })
  })

  it('returns nulls when destination has no city', () => {
    expect(extractDestinationCity({})).toEqual({ cityId: null, cityName: null })
  })

  it('returns nulls for a null or undefined destination', () => {
    expect(extractDestinationCity(null)).toEqual({ cityId: null, cityName: null })
    expect(extractDestinationCity(undefined)).toEqual({ cityId: null, cityName: null })
  })

  it('coerces a numeric city id to a string', () => {
    const result = extractDestinationCity({ city: { id: 30067228, name: 'Шымкент' } })
    expect(result.cityId).toBe('30067228')
    expect(typeof result.cityId).toBe('string')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/kaspiShop/cabinetApi.test.ts`
Expected: FAIL — `extractDestinationCity` is not exported from `./cabinetApi`

- [ ] **Step 3: Add `extractDestinationCity` and extend the `Order` type**

In `src/lib/kaspiShop/cabinetApi.ts`, replace:

```ts
export type Order = {
  code: string
  status: string
  customerFirstName: string
  customerLastName: string
  totalPrice: number
  creationTime: string
  items: OrderItem[]
}
```

with:

```ts
export type Order = {
  code: string
  status: string
  customerFirstName: string
  customerLastName: string
  totalPrice: number
  creationTime: string
  cityId: string | null
  cityName: string | null
  plannedDeliveryDate: string | null
  items: OrderItem[]
}
```

Then, immediately after `mapOrderItems`'s closing brace (right before `const GET_ORDERS_QUERY = ...`), add:

```ts
export function extractDestinationCity(destination: any): { cityId: string | null; cityName: string | null } {
  const city = destination?.city
  if (!city || city.id == null) return { cityId: null, cityName: null }
  return { cityId: String(city.id), cityName: city.name ?? null }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/kaspiShop/cabinetApi.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Extend the GraphQL fragment and wire `cityId` through `listOrders`**

Replace the `OrdersPageFragment` definition:

```ts
fragment OrdersPageFragment on Order {
  code
  customer { firstName lastName }
  totalPrice
  creationTime
  modificationTime
  status
  entries {
    quantity
    totalPrice
    product { code name images { baseUrl paths } }
  }
}`
```

with:

```ts
fragment OrdersPageFragment on Order {
  code
  customer { firstName lastName }
  totalPrice
  creationTime
  modificationTime
  status
  destination {
    ... on Point { city { id name } }
    ... on OrderAddress { city { id name } }
    ... on Postomat { city { id name } }
  }
  delivery { plannedDeliveryDate }
  entries {
    quantity
    totalPrice
    product { code name images { baseUrl paths } }
  }
}`
```

Replace the `listOrders` function:

```ts
export async function listOrders(sessionCookies: string, merchantId: string, status: string, page = 0): Promise<OrdersPage> {
  const res = await fetch('https://mc.shop.kaspi.kz/mc/facade/graphql?opName=getOrders', {
    method: 'POST',
    headers: authHeaders(sessionCookies),
    body: JSON.stringify({
      operationName: 'getOrders',
      variables: {
        merchantUid: merchantId,
        size: PAGE_SIZE,
        page,
        input: { presetFilter: status, orderCode: '', cityId: '' },
        advancedInput: { orderCode: '', phoneNumber: '', productCode: '' },
        withAdvancedOrders: false,
      },
      query: GET_ORDERS_QUERY,
    }),
  })
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '')
    console.error('kaspi-shop listOrders: upstream not ok', res.status, bodyText.slice(0, 1000))
    return { orders: [], total: 0, sessionExpired: res.status === 401 }
  }
  const json = await res.json().catch(() => null)
  const page_ = json?.data?.merchant?.orders?.orders
  const orders = page_?.orders
  if (!Array.isArray(orders)) {
    console.error('kaspi-shop listOrders: unexpected response shape for status', status, JSON.stringify(json)?.slice(0, 2000))
    return { orders: [], total: 0, sessionExpired: false }
  }
  return {
    total: Number(page_.total) || 0,
    sessionExpired: false,
    orders: orders.map((o: any) => ({
      code: o.code,
      status: o.status,
      customerFirstName: o.customer?.firstName ?? '',
      customerLastName: o.customer?.lastName ?? '',
      totalPrice: Number(o.totalPrice) || 0,
      creationTime: o.creationTime,
      items: mapOrderItems(o.entries),
    })),
  }
}
```

with:

```ts
export async function listOrders(sessionCookies: string, merchantId: string, status: string, page = 0, cityId = ''): Promise<OrdersPage> {
  const res = await fetch('https://mc.shop.kaspi.kz/mc/facade/graphql?opName=getOrders', {
    method: 'POST',
    headers: authHeaders(sessionCookies),
    body: JSON.stringify({
      operationName: 'getOrders',
      variables: {
        merchantUid: merchantId,
        size: PAGE_SIZE,
        page,
        input: { presetFilter: status, orderCode: '', cityId },
        advancedInput: { orderCode: '', phoneNumber: '', productCode: '' },
        withAdvancedOrders: false,
      },
      query: GET_ORDERS_QUERY,
    }),
  })
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '')
    console.error('kaspi-shop listOrders: upstream not ok', res.status, bodyText.slice(0, 1000))
    return { orders: [], total: 0, sessionExpired: res.status === 401 }
  }
  const json = await res.json().catch(() => null)
  const page_ = json?.data?.merchant?.orders?.orders
  const orders = page_?.orders
  if (!Array.isArray(orders)) {
    console.error('kaspi-shop listOrders: unexpected response shape for status', status, JSON.stringify(json)?.slice(0, 2000))
    return { orders: [], total: 0, sessionExpired: false }
  }
  return {
    total: Number(page_.total) || 0,
    sessionExpired: false,
    orders: orders.map((o: any) => ({
      code: o.code,
      status: o.status,
      customerFirstName: o.customer?.firstName ?? '',
      customerLastName: o.customer?.lastName ?? '',
      totalPrice: Number(o.totalPrice) || 0,
      creationTime: o.creationTime,
      ...extractDestinationCity(o.destination),
      plannedDeliveryDate: o.delivery?.plannedDeliveryDate ?? null,
      items: mapOrderItems(o.entries),
    })),
  }
}
```

- [ ] **Step 6: Type-check and run the full test file**

Run: `npx tsc --noEmit -p .` — expect no new errors.
Run: `npx vitest run src/lib/kaspiShop/cabinetApi.test.ts` — expect PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/kaspiShop/cabinetApi.ts src/lib/kaspiShop/cabinetApi.test.ts
git commit -m "feat(kaspi-shop): listOrders carries city + planned delivery date, accepts cityId filter"
```

---

### Task 2: Thread `cityId` through the orders list API route

**Files:**
- Modify: `src/app/api/kaspi-shop/orders/route.ts`

**Interfaces:**
- Consumes: `listOrders(sessionCookies, merchantId, status, page, cityId)` from Task 1

- [ ] **Step 1: Add the `cityId` query param and forward it**

Replace:

```ts
  const status = req.nextUrl.searchParams.get('status') || 'NEW'
  const page = Number(req.nextUrl.searchParams.get('page')) || 0

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён — подключите его через Kaspi Магазин' }, { status: 400 })
  }

  const { orders, total, sessionExpired } = await listOrders(connection.sessionCookies, connection.merchantId, status, page)
```

with:

```ts
  const status = req.nextUrl.searchParams.get('status') || 'NEW'
  const page = Number(req.nextUrl.searchParams.get('page')) || 0
  const cityId = req.nextUrl.searchParams.get('cityId') || ''

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён — подключите его через Kaspi Магазин' }, { status: 400 })
  }

  const { orders, total, sessionExpired } = await listOrders(connection.sessionCookies, connection.merchantId, status, page, cityId)
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/kaspi-shop/orders/route.ts
git commit -m "feat(kaspi-shop): orders list route accepts cityId filter"
```

---

### Task 3: `ordersFilters.ts` — delivery-date cutoff filter and distinct-city collection

**Files:**
- Create: `src/lib/kaspiShop/ordersFilters.ts`
- Test: `src/lib/kaspiShop/ordersFilters.test.ts`

**Interfaces:**
- Produces: `type DeliveryDateMode = 'all' | 'tomorrow'`
- Produces: `filterByDeliveryCutoff<T extends { plannedDeliveryDate: string | null }>(orders: T[], mode: DeliveryDateMode, now?: Date): T[]`
- Produces: `collectDistinctCities<T extends { cityId: string | null; cityName: string | null }>(orders: T[]): { cityId: string; cityName: string }[]`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/kaspiShop/ordersFilters.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { filterByDeliveryCutoff, collectDistinctCities } from './ordersFilters'

describe('filterByDeliveryCutoff', () => {
  const NOW = new Date('2026-08-23T10:00:00.000Z') // 15:00 Almaty time

  it("mode 'all' returns every order unchanged", () => {
    const orders = [{ plannedDeliveryDate: null }, { plannedDeliveryDate: '2026-08-30T00:00:00.000Z' }]
    expect(filterByDeliveryCutoff(orders, 'all', NOW)).toEqual(orders)
  })

  it("mode 'tomorrow' keeps orders due by tomorrow 20:00 Almaty time (15:00 UTC on 2026-08-24)", () => {
    const dueToday = { plannedDeliveryDate: '2026-08-23T09:00:00.000Z' }
    const dueTomorrowMorning = { plannedDeliveryDate: '2026-08-24T05:00:00.000Z' }
    const dueTomorrowAtCutoff = { plannedDeliveryDate: '2026-08-24T15:00:00.000Z' }
    const dueAfterCutoff = { plannedDeliveryDate: '2026-08-24T15:00:00.001Z' }
    const dueDayAfter = { plannedDeliveryDate: '2026-08-25T00:00:00.000Z' }
    const result = filterByDeliveryCutoff(
      [dueToday, dueTomorrowMorning, dueTomorrowAtCutoff, dueAfterCutoff, dueDayAfter],
      'tomorrow',
      NOW
    )
    expect(result).toEqual([dueToday, dueTomorrowMorning, dueTomorrowAtCutoff])
  })

  it("mode 'tomorrow' drops orders with no planned delivery date", () => {
    expect(filterByDeliveryCutoff([{ plannedDeliveryDate: null }], 'tomorrow', NOW)).toEqual([])
  })
})

describe('collectDistinctCities', () => {
  it('dedupes by cityId and sorts by name (ru locale)', () => {
    const orders = [
      { cityId: '2', cityName: 'Шымкент' },
      { cityId: '1', cityName: 'Алматы' },
      { cityId: '2', cityName: 'Шымкент' },
    ]
    expect(collectDistinctCities(orders)).toEqual([
      { cityId: '1', cityName: 'Алматы' },
      { cityId: '2', cityName: 'Шымкент' },
    ])
  })

  it('skips orders with a missing city', () => {
    const orders = [{ cityId: null, cityName: null }, { cityId: '1', cityName: 'Алматы' }]
    expect(collectDistinctCities(orders)).toEqual([{ cityId: '1', cityName: 'Алматы' }])
  })

  it('returns an empty array for no orders', () => {
    expect(collectDistinctCities([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/kaspiShop/ordersFilters.test.ts`
Expected: FAIL — cannot find module `./ordersFilters`

- [ ] **Step 3: Implement `ordersFilters.ts`**

Create `src/lib/kaspiShop/ordersFilters.ts`:

```ts
// Kaspi's getOrders `input` has no server-side date field (confirmed shape:
// presetFilter/orderCode/cityId only -- docs/superpowers/specs/2026-08-13-
// kaspi-orders-api-findings.md section 2), so the "Завтра до 20:00" tab
// filters the already-fetched page client-side instead. Kazakhstan (Asia/
// Almaty) is a fixed UTC+5 offset with no DST.
const ALMATY_OFFSET_MS = 5 * 60 * 60 * 1000

export type DeliveryDateMode = 'all' | 'tomorrow'

// "Завтра до 20:00" means "must reach the courier by tomorrow 20:00 Almaty
// time" -- includes anything overdue or due today too, not only orders
// dated exactly tomorrow.
export function filterByDeliveryCutoff<T extends { plannedDeliveryDate: string | null }>(
  orders: T[],
  mode: DeliveryDateMode,
  now: Date = new Date()
): T[] {
  if (mode === 'all') return orders
  const localNow = new Date(now.getTime() + ALMATY_OFFSET_MS)
  const cutoffLocal = new Date(Date.UTC(
    localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate() + 1, 20, 0, 0
  ))
  const cutoffUtc = cutoffLocal.getTime() - ALMATY_OFFSET_MS
  return orders.filter(o => {
    if (!o.plannedDeliveryDate) return false
    const t = new Date(o.plannedDeliveryDate).getTime()
    return !Number.isNaN(t) && t <= cutoffUtc
  })
}

export function collectDistinctCities<T extends { cityId: string | null; cityName: string | null }>(
  orders: T[]
): { cityId: string; cityName: string }[] {
  const map = new Map<string, string>()
  for (const o of orders) {
    if (o.cityId && o.cityName && !map.has(o.cityId)) map.set(o.cityId, o.cityName)
  }
  return Array.from(map.entries())
    .map(([cityId, cityName]) => ({ cityId, cityName }))
    .sort((a, b) => a.cityName.localeCompare(b.cityName, 'ru'))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/kaspiShop/ordersFilters.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/kaspiShop/ordersFilters.ts src/lib/kaspiShop/ordersFilters.test.ts
git commit -m "feat(kaspi-shop): delivery-date cutoff filter and distinct-city collector"
```

---

### Task 4: City-sampling API route

**Files:**
- Create: `src/app/api/kaspi-shop/orders/cities/route.ts`

**Interfaces:**
- Consumes: `listOrders` (Task 1), `collectDistinctCities` (Task 3), `loadConnection`/`markSessionExpired` from `@/lib/kaspiShop/connection`
- Produces: `GET /api/kaspi-shop/orders/cities?status=X` → `{ cities: { cityId: string; cityName: string }[] }`

- [ ] **Step 1: Create the route**

Create `src/app/api/kaspi-shop/orders/cities/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection, markSessionExpired } from '@/lib/kaspiShop/connection'
import { listOrders } from '@/lib/kaspiShop/cabinetApi'
import { collectDistinctCities } from '@/lib/kaspiShop/ordersFilters'

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

// Kaspi's getOrders has no "list distinct cities" endpoint of its own, and
// guessing a new one is exactly what caused накладная to 404 for real (see
// docs/superpowers/specs/2026-08-13-kaspi-orders-api-findings.md section 5
// and the 2026-08-23 waybill fix). Sampling existing pages needs no new
// confirmed-live shape.
const CITY_SAMPLE_PAGES = 5

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const status = req.nextUrl.searchParams.get('status') || 'NEW'

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён — подключите его через Kaspi Магазин' }, { status: 400 })
  }

  const sampled: { cityId: string | null; cityName: string | null }[] = []
  let fetched = 0
  for (let page = 0; page < CITY_SAMPLE_PAGES; page++) {
    const result = await listOrders(connection.sessionCookies, connection.merchantId, status, page)
    if (result.sessionExpired) {
      await markSessionExpired(connection.id)
      return NextResponse.json({ error: 'Сессия истекла — переподключите кабинет' }, { status: 400 })
    }
    if (result.orders.length === 0) break
    sampled.push(...result.orders)
    fetched += result.orders.length
    if (fetched >= result.total) break
  }

  return NextResponse.json({ cities: collectDistinctCities(sampled) })
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/kaspi-shop/orders/cities/route.ts
git commit -m "feat(kaspi-shop): city-sampling route for the orders city filter dropdown"
```

---

### Task 5: `ordersExport.ts` — build the `.xlsx` buffer

**Files:**
- Create: `src/lib/kaspiShop/ordersExport.ts`
- Test: `src/lib/kaspiShop/ordersExport.test.ts`

**Interfaces:**
- Produces: `type ExportOrderRow = { code: string; cityName: string | null; customerFirstName: string; customerLastName: string; totalPrice: number; creationTime: string; plannedDeliveryDate: string | null; items: { name: string; quantity: number }[] }`
- Produces: `buildOrdersWorkbookBuffer(orders: ExportOrderRow[]): Buffer`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/kaspiShop/ordersExport.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { buildOrdersWorkbookBuffer } from './ordersExport'

describe('buildOrdersWorkbookBuffer', () => {
  it('writes a header row plus one row per order', () => {
    const buffer = buildOrdersWorkbookBuffer([
      {
        code: '123',
        cityName: 'Алматы',
        customerFirstName: 'Айнур',
        customerLastName: 'К',
        totalPrice: 5000,
        creationTime: '2026-08-20T10:00:00.000Z',
        plannedDeliveryDate: '2026-08-24T15:00:00.000Z',
        items: [{ name: 'Полотенца Sunlight', quantity: 2 }],
      },
    ])
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheet = workbook.Sheets['Заказы']
    const grid = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]
    expect(grid[0]).toEqual(['№ заказа', 'Город', 'Покупатель', 'Сумма', 'Дата создания', 'Дата передачи', 'Товары'])
    expect(grid[1]).toEqual(['123', 'Алматы', 'Айнур К', 5000, '20.08.2026', '24.08.2026', 'Полотенца Sunlight ×2'])
  })

  it('renders an empty string for a missing city and planned delivery date', () => {
    const buffer = buildOrdersWorkbookBuffer([
      {
        code: '999', cityName: null, customerFirstName: 'А', customerLastName: 'Б',
        totalPrice: 1000, creationTime: '2026-08-20T10:00:00.000Z', plannedDeliveryDate: null, items: [],
      },
    ])
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const grid = XLSX.utils.sheet_to_json(workbook.Sheets['Заказы'], { header: 1 }) as any[][]
    expect(grid[1][1]).toBe('')
    expect(grid[1][5]).toBe('')
    expect(grid[1][6]).toBe('')
  })

  it('joins multiple items with a semicolon', () => {
    const buffer = buildOrdersWorkbookBuffer([
      {
        code: '1', cityName: null, customerFirstName: 'А', customerLastName: '',
        totalPrice: 0, creationTime: '2026-08-20T10:00:00.000Z', plannedDeliveryDate: null,
        items: [{ name: 'Товар A', quantity: 1 }, { name: 'Товар B', quantity: 3 }],
      },
    ])
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const grid = XLSX.utils.sheet_to_json(workbook.Sheets['Заказы'], { header: 1 }) as any[][]
    expect(grid[1][6]).toBe('Товар A ×1; Товар B ×3')
  })

  it('returns a Buffer instance, even for an empty order list', () => {
    expect(Buffer.isBuffer(buildOrdersWorkbookBuffer([]))).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/kaspiShop/ordersExport.test.ts`
Expected: FAIL — cannot find module `./ordersExport`

- [ ] **Step 3: Implement `ordersExport.ts`**

Create `src/lib/kaspiShop/ordersExport.ts`:

```ts
import * as XLSX from 'xlsx'

export type ExportOrderRow = {
  code: string
  cityName: string | null
  customerFirstName: string
  customerLastName: string
  totalPrice: number
  creationTime: string
  plannedDeliveryDate: string | null
  items: { name: string; quantity: number }[]
}

const COLUMNS = ['№ заказа', 'Город', 'Покупатель', 'Сумма', 'Дата создания', 'Дата передачи', 'Товары']

// Explicit Asia/Almaty timeZone so the formatted date doesn't depend on the
// host machine's local timezone (test runners and Vercel's serverless
// functions both typically run in UTC).
function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ru-KZ', { timeZone: 'Asia/Almaty' })
}

export function buildOrdersWorkbookBuffer(orders: ExportOrderRow[]): Buffer {
  const rows = orders.map(o => [
    o.code,
    o.cityName ?? '',
    `${o.customerFirstName} ${o.customerLastName}`.trim(),
    o.totalPrice,
    formatDate(o.creationTime),
    formatDate(o.plannedDeliveryDate),
    o.items.map(i => `${i.name} ×${i.quantity}`).join('; '),
  ])
  const sheet = XLSX.utils.aoa_to_sheet([COLUMNS, ...rows])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Заказы')
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/kaspiShop/ordersExport.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/kaspiShop/ordersExport.ts src/lib/kaspiShop/ordersExport.test.ts
git commit -m "feat(kaspi-shop): xlsx workbook builder for the orders Excel export"
```

---

### Task 6: Excel export API route

**Files:**
- Create: `src/app/api/kaspi-shop/orders/export/route.ts`

**Interfaces:**
- Consumes: `listOrders` (Task 1), `buildOrdersWorkbookBuffer`/`ExportOrderRow` (Task 5)
- Produces: `GET /api/kaspi-shop/orders/export?status=X&cityId=Y` → `.xlsx` file, response header `x-truncated: 'true' | 'false'`

- [ ] **Step 1: Create the route**

Create `src/app/api/kaspi-shop/orders/export/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection, markSessionExpired } from '@/lib/kaspiShop/connection'
import { listOrders } from '@/lib/kaspiShop/cabinetApi'
import { buildOrdersWorkbookBuffer } from '@/lib/kaspiShop/ordersExport'

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

// Hard stop against a multi-thousand-row Архив export hanging the request
// (docs/superpowers/specs/2026-08-23-kaspi-orders-filters-excel-design.md).
const MAX_EXPORT_ORDERS = 500

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const status = req.nextUrl.searchParams.get('status') || 'NEW'
  const cityId = req.nextUrl.searchParams.get('cityId') || ''

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён — подключите его через Kaspi Магазин' }, { status: 400 })
  }

  const orders: Awaited<ReturnType<typeof listOrders>>['orders'] = []
  let total = Infinity
  let page = 0
  while (orders.length < total && orders.length < MAX_EXPORT_ORDERS) {
    const result = await listOrders(connection.sessionCookies, connection.merchantId, status, page, cityId)
    if (result.sessionExpired) {
      await markSessionExpired(connection.id)
      return NextResponse.json({ error: 'Сессия истекла — переподключите кабинет' }, { status: 400 })
    }
    if (result.orders.length === 0) break
    orders.push(...result.orders)
    total = result.total
    page++
  }

  const truncated = total > MAX_EXPORT_ORDERS
  const buffer = buildOrdersWorkbookBuffer(orders.slice(0, MAX_EXPORT_ORDERS))
  const filename = `zakazy_${status}_${new Date().toISOString().slice(0, 10)}.xlsx`
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${filename}"`,
      'x-truncated': truncated ? 'true' : 'false',
    },
  })
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/kaspi-shop/orders/export/route.ts
git commit -m "feat(kaspi-shop): Excel export route for orders (capped at 500 rows)"
```

---

### Task 7: Wire city filter, date tab, and Excel export into the Orders page

**Files:**
- Modify: `src/app/kaspi-shop/orders/page.tsx`

**Interfaces:**
- Consumes: `filterByDeliveryCutoff`, `DeliveryDateMode` (Task 3); `GET /api/kaspi-shop/orders/cities` (Task 4); `GET /api/kaspi-shop/orders/export` (Task 6); `GET /api/kaspi-shop/orders?...&cityId=` (Task 2)

- [ ] **Step 1: Extend the `Order` type and imports**

Replace:

```ts
import { ORDER_STATUS_TABS, BULK_PRINTABLE_STATUSES } from '@/lib/kaspiShop/orderStatuses'
```

with:

```ts
import { ORDER_STATUS_TABS, BULK_PRINTABLE_STATUSES } from '@/lib/kaspiShop/orderStatuses'
import { filterByDeliveryCutoff, type DeliveryDateMode } from '@/lib/kaspiShop/ordersFilters'
```

Replace:

```ts
type Order = {
  code: string
  status: string
  customerFirstName: string
  customerLastName: string
  totalPrice: number
  creationTime: string
  items: { code: string; name: string; imageUrl: string | null; quantity: number }[]
}
```

with:

```ts
type Order = {
  code: string
  status: string
  customerFirstName: string
  customerLastName: string
  totalPrice: number
  creationTime: string
  cityId: string | null
  cityName: string | null
  plannedDeliveryDate: string | null
  items: { code: string; name: string; imageUrl: string | null; quantity: number }[]
}
```

- [ ] **Step 2: Add state for city filter, date mode, and export**

Replace:

```ts
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [printing, setPrinting] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [groupBy, setGroupBy] = useState<'type' | 'date' | null>(null)
```

with:

```ts
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [printing, setPrinting] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [groupBy, setGroupBy] = useState<'type' | 'date' | null>(null)
  const [cityId, setCityId] = useState('')
  const [cityOptions, setCityOptions] = useState<{ cityId: string; cityName: string }[]>([])
  const [dateMode, setDateMode] = useState<DeliveryDateMode>('all')
  const [exporting, setExporting] = useState(false)
```

- [ ] **Step 3: Load city options on mount and on status change; refetch orders on city change**

Replace:

```ts
  useEffect(() => { checkAccess() }, [])
  useEffect(() => {
    if (loading) return
    // A status switch resets to page 0 -- skip this render's fetch (it'd
    // use the stale page from the previous status) and let the resulting
    // setPage(0) re-trigger this effect with the right value instead.
    if (prevStatus.current !== status) {
      prevStatus.current = status
      setPage(0)
      if (page === 0) { loadOrders(status, 0); loadCounts() }
      return
    }
    loadOrders(status, page)
    loadCounts()
  }, [status, page, loading])
```

with:

```ts
  const prevCityId = useRef(cityId)

  useEffect(() => { checkAccess() }, [])
  useEffect(() => {
    if (loading) return
    loadCityOptions(status)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])
  useEffect(() => {
    if (loading) return
    // A status or city switch resets to page 0 -- skip this render's fetch
    // (it'd use the stale page from before the switch) and let the
    // resulting setPage(0) re-trigger this effect with the right value.
    const statusChanged = prevStatus.current !== status
    const cityChanged = prevCityId.current !== cityId
    prevStatus.current = status
    prevCityId.current = cityId
    if (statusChanged) {
      setPage(0)
      setDateMode('all')
      loadCityOptions(status)
      if (page === 0) { loadOrders(status, 0, cityId); loadCounts() }
      return
    }
    if (cityChanged) {
      setPage(0)
      if (page === 0) loadOrders(status, 0, cityId)
      return
    }
    loadOrders(status, page, cityId)
    loadCounts()
  }, [status, page, cityId, loading])
```

Note: `prevStatus` is declared a few lines below (`const prevStatus = useRef(status)`) — leave that declaration where it is; `prevCityId` is added right before the effects that use it.

- [ ] **Step 4: Add `loadCityOptions` and thread `cityId` through `loadOrders`**

Replace:

```ts
  async function loadOrders(forStatus: string, forPage: number) {
    setOrdersLoading(true)
    setLoadError('')
    setSelected(new Set())
    try {
      const headers = await authHeader()
      const res = await fetch(`/api/kaspi-shop/orders?status=${encodeURIComponent(forStatus)}&page=${forPage}`, { headers })
```

with:

```ts
  async function loadCityOptions(forStatus: string) {
    try {
      const headers = await authHeader()
      const res = await fetch(`/api/kaspi-shop/orders/cities?status=${encodeURIComponent(forStatus)}`, { headers })
      if (!res.ok) { setCityOptions([]); return }
      const data = await res.json()
      setCityOptions(data.cities || [])
    } catch {
      setCityOptions([])
    }
  }

  async function loadOrders(forStatus: string, forPage: number, forCityId: string = '') {
    setOrdersLoading(true)
    setLoadError('')
    setSelected(new Set())
    try {
      const headers = await authHeader()
      const cityParam = forCityId ? `&cityId=${encodeURIComponent(forCityId)}` : ''
      const res = await fetch(`/api/kaspi-shop/orders?status=${encodeURIComponent(forStatus)}&page=${forPage}${cityParam}`, { headers })
```

- [ ] **Step 5: Add the Excel export handler**

Directly after the closing brace of `printWaybills` (before `if (loading) return <LoadingSpinner />`), add:

```ts
  async function exportExcel() {
    setExporting(true)
    try {
      const headers = await authHeader()
      const cityParam = cityId ? `&cityId=${encodeURIComponent(cityId)}` : ''
      const res = await fetch(`/api/kaspi-shop/orders/export?status=${encodeURIComponent(status)}${cityParam}`, { headers })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setLoadError(data.error || 'Не удалось выгрузить заказы')
        return
      }
      if (res.headers.get('x-truncated') === 'true') {
        setLoadError('Выгружены первые 500 заказов — список обрезан')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `zakazy_${status}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  const visibleOrders = BULK_PRINTABLE_STATUSES.includes(status) ? filterByDeliveryCutoff(orders, dateMode) : orders
```

- [ ] **Step 6: Render the city select and Excel export button in the header row**

Replace:

```tsx
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h1 className="text-2xl font-extrabold" style={{ color: 'var(--nav-text-primary)' }}>Заказы</h1>
          <div className="relative flex items-center gap-0.5 nav-glass rounded-full p-[3px]">
            {([['type', 'По виду'], ['date', 'По дате']] as const).map(([value, label]) => {
              const active = groupBy === value
              return (
                <button key={value} onClick={() => setGroupBy(g => g === value ? null : value)}
                  className="relative px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                  style={{ color: active ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)' }}>
                  {active && (
                    <motion.span layoutId="groupByPill" className="absolute inset-0 rounded-full" style={{ background: 'var(--nav-accent)', zIndex: 0 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
                  )}
                  <span className="relative" style={{ zIndex: 1 }}>{label}</span>
                </button>
              )
            })}
          </div>
        </div>
```

with:

```tsx
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h1 className="text-2xl font-extrabold" style={{ color: 'var(--nav-text-primary)' }}>Заказы</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={cityId} onChange={e => setCityId(e.target.value)}
              className="nav-glass rounded-full px-3 py-1.5 text-xs font-medium" style={{ color: 'var(--nav-text-primary)' }}>
              <option value="">Все города</option>
              {cityOptions.map(c => <option key={c.cityId} value={c.cityId}>{c.cityName}</option>)}
            </select>
            <button onClick={exportExcel} disabled={exporting}
              className="nav-glass text-xs font-semibold rounded-full px-3 py-1.5 disabled:opacity-50" style={{ color: 'var(--nav-text-primary)' }}>
              {exporting ? 'Экспорт...' : 'Выгрузить в Excel'}
            </button>
            <div className="relative flex items-center gap-0.5 nav-glass rounded-full p-[3px]">
              {([['type', 'По виду'], ['date', 'По дате']] as const).map(([value, label]) => {
                const active = groupBy === value
                return (
                  <button key={value} onClick={() => setGroupBy(g => g === value ? null : value)}
                    className="relative px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                    style={{ color: active ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)' }}>
                    {active && (
                      <motion.span layoutId="groupByPill" className="absolute inset-0 rounded-full" style={{ background: 'var(--nav-accent)', zIndex: 0 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
                    )}
                    <span className="relative" style={{ zIndex: 1 }}>{label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
```

- [ ] **Step 7: Render the date tab between the status chips and the bulk-print bar**

Replace:

```tsx
        {BULK_PRINTABLE_STATUSES.includes(status) && selected.size > 0 && (
```

with:

```tsx
        {BULK_PRINTABLE_STATUSES.includes(status) && (
          <div className="flex gap-2 mb-4">
            {([['all', 'Все'], ['tomorrow', 'Завтра до 20:00']] as const).map(([value, label]) => {
              const active = dateMode === value
              return (
                <button key={value} onClick={() => setDateMode(value)}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
                  style={{ color: active ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)', background: active ? 'var(--nav-accent)' : 'var(--nav-surface-glass)' }}>
                  {label}
                </button>
              )
            })}
          </div>
        )}

        {BULK_PRINTABLE_STATUSES.includes(status) && selected.size > 0 && (
```

- [ ] **Step 8: Render `visibleOrders` instead of `orders` in the list**

Replace:

```tsx
        {ordersLoading ? (
          <div className="nav-glass rounded-2xl p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загружаем заказы...</div>
        ) : orders.length === 0 ? (
```

with:

```tsx
        {ordersLoading ? (
          <div className="nav-glass rounded-2xl p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загружаем заказы...</div>
        ) : visibleOrders.length === 0 ? (
```

Replace:

```tsx
          if (!groupBy) {
            return <div className={CARD_GRID}>{orders.map((o, i) => renderCard(o, i))}</div>
          }

          const groups = new Map<string, Order[]>()
          for (const o of orders) {
```

with:

```tsx
          if (!groupBy) {
            return <div className={CARD_GRID}>{visibleOrders.map((o, i) => renderCard(o, i))}</div>
          }

          const groups = new Map<string, Order[]>()
          for (const o of visibleOrders) {
```

- [ ] **Step 9: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 10: Manual smoke test**

Run: `npm run dev`, open `/kaspi-shop/orders`. Verify:
- City dropdown shows options (or "Все города" only, if the sample has no orders).
- Selecting a city refetches the list (Network tab shows `cityId=` in the request).
- Switching to "Передача" or "Упаковка" shows the "Все/Завтра до 20:00" tabs; other statuses don't.
- "Выгрузить в Excel" downloads a `.xlsx` file that opens with the expected columns.

- [ ] **Step 11: Commit**

```bash
git add src/app/kaspi-shop/orders/page.tsx
git commit -m "feat(kaspi-shop): city filter, delivery-date tab, and Excel export on Orders page"
```
