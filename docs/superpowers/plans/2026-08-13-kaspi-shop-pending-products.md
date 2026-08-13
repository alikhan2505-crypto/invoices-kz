# Kaspi Shop: Нераспознанные товары Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a read-only "Нераспознанные товары" page in Kaspi Shop showing the seller's products Kaspi's catalog couldn't auto-match, mirroring the real cabinet's own "Без привязки" tab.

**Architecture:** A new pure-logic module (`pendingProducts.ts`) wraps the two confirmed-live Kaspi endpoints (paginated product list + tab counts) behind an injectable-fetch interface for testability, following the same shape as every other `kaspiShop` lib module. A thin API route exposes it to the client with the existing admin-auth pattern. The page reuses the dark-hero-card + white-card-list visual language already shipped for Заказы/Финансы, with 3 of the page's 4 tabs shown disabled since their real request shape is unconfirmed (see findings doc).

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Tailwind, framer-motion, Supabase auth.

## Global Constraints

- Real endpoint 1: `POST https://mc.shop.kaspi.kz/bff/pending-products/{merchantId}`, body `{"page":N,"searchTerm":"","pageSize":5,"approvalStatus":"CHECK","isMobileApp":false}` — **page numbering starts at 1**, not 0 (unlike `getOrders`).
- Real endpoint 2: `GET https://mc.shop.kaspi.kz/content/pending/mc/product/{merchantId}/count`, response `{"IMPORTED":0,"CHECK":3,"PENDING":0,"TRASH":0}` — v1 only reads `.CHECK`.
- `imageUrl` comes from `images[0].medium` (a pre-built real CDN URL) — do **not** reuse the `baseUrl + paths[]` scheme from `cabinetApi.ts`'s order photos; it's a different endpoint with a different shape.
- v1 is read-only. Only the "Без привязки" (`CHECK`) tab is functional; the other 3 tabs render disabled, no click handler, no fetch attempted.
- Route auth: admin-only, matching every other `kaspi-shop` API route — reject with 401 if no valid Supabase user, 400 with `{"error":"Кабинет не подключён"}` if `loadConnection` has no session.
- Every task ends with `npx tsc --noEmit`. The final task also runs `npm run build`.
- Direct-to-main commits, no feature branches, no commit-confirmation prompts.
- Only pure-logic modules get Vitest tests (`pendingProducts.ts`); routes and pages have no test coverage, matching this project's established convention.

---

### Task 1: `pendingProducts.ts` lib module + tests

**Files:**
- Modify: `src/lib/kaspiShop/cabinetApi.ts:7` (export the existing `authHeaders` helper so other modules can reuse it instead of duplicating the header-building logic)
- Create: `src/lib/kaspiShop/pendingProducts.ts`
- Test: `src/lib/kaspiShop/pendingProducts.test.ts`

**Interfaces:**
- Consumes: `authHeaders(sessionCookies: string): Record<string, string>` from `./cabinetApi` (exported by this task).
- Produces: `PendingProduct` type `{ code: string; name: string; brand: string | null; categoryName: string | null; imageUrl: string | null }`; `listPendingProducts(sessionCookies: string, merchantId: string, page: number, fetchFn?: typeof fetch): Promise<{ products: PendingProduct[]; hasMore: boolean }>`; `getPendingCount(sessionCookies: string, merchantId: string, fetchFn?: typeof fetch): Promise<number>`. Task 2 imports both functions and the `PendingProduct` type.

- [ ] **Step 1: Export `authHeaders` from `cabinetApi.ts`**

In `src/lib/kaspiShop/cabinetApi.ts`, change line 7 from:

```ts
function authHeaders(sessionCookies: string): Record<string, string> {
```

to:

```ts
export function authHeaders(sessionCookies: string): Record<string, string> {
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/kaspiShop/pendingProducts.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { listPendingProducts, getPendingCount } from './pendingProducts'

function fakeFetch(status: number, body: any): typeof fetch {
  return (async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch
}

describe('listPendingProducts', () => {
  it('maps the real response shape into PendingProduct, with hasMore true on a full page', async () => {
    const fetchFn = fakeFetch(201, {
      data: [
        { code: 'A1', name: 'Товар 1', brand: 'Abil.Sisters', category: { name: 'Одежда', leaf: false }, images: [{ medium: 'https://cdn/1.jpg' }] },
        { code: 'A2', name: 'Товар 2', brand: null, category: null, images: [] },
        { code: 'A3', name: 'Товар 3', brand: 'X', category: { name: 'Y' }, images: [{ medium: 'https://cdn/3.jpg' }] },
        { code: 'A4', name: 'Товар 4', brand: 'X', category: { name: 'Y' }, images: [{ medium: 'https://cdn/4.jpg' }] },
        { code: 'A5', name: 'Товар 5', brand: 'X', category: { name: 'Y' }, images: [{ medium: 'https://cdn/5.jpg' }] },
      ],
    })
    const result = await listPendingProducts('cookies', 'merchant1', 1, fetchFn)
    expect(result.products).toHaveLength(5)
    expect(result.products[0]).toEqual({ code: 'A1', name: 'Товар 1', brand: 'Abil.Sisters', categoryName: 'Одежда', imageUrl: 'https://cdn/1.jpg' })
    expect(result.products[1]).toEqual({ code: 'A2', name: 'Товар 2', brand: null, categoryName: null, imageUrl: null })
    expect(result.hasMore).toBe(true)
  })

  it('sets hasMore false on a short page', async () => {
    const fetchFn = fakeFetch(201, { data: [{ code: 'A1', name: 'Товар 1', brand: 'X', category: { name: 'Y' }, images: [] }] })
    const result = await listPendingProducts('cookies', 'merchant1', 1, fetchFn)
    expect(result.hasMore).toBe(false)
  })

  it('returns an empty result on a failed request', async () => {
    const fetchFn = fakeFetch(401, {})
    const result = await listPendingProducts('cookies', 'merchant1', 1, fetchFn)
    expect(result).toEqual({ products: [], hasMore: false })
  })
})

describe('getPendingCount', () => {
  it('returns just the CHECK count', async () => {
    const fetchFn = fakeFetch(200, { IMPORTED: 0, CHECK: 3, PENDING: 0, TRASH: 0 })
    const count = await getPendingCount('cookies', 'merchant1', fetchFn)
    expect(count).toBe(3)
  })

  it('returns 0 on a failed request', async () => {
    const fetchFn = fakeFetch(401, {})
    const count = await getPendingCount('cookies', 'merchant1', fetchFn)
    expect(count).toBe(0)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/kaspiShop/pendingProducts.test.ts`
Expected: FAIL — `Cannot find module './pendingProducts'` (the module doesn't exist yet).

- [ ] **Step 4: Write the implementation**

Create `src/lib/kaspiShop/pendingProducts.ts`:

```ts
// Real endpoints confirmed live 2026-08-13 against merchant 425002
// ("ABIL-SISTERS") -- see docs/superpowers/specs/2026-08-13-kaspi-nkt-api-findings.md.
// Only the "Без привязки" (approvalStatus: CHECK) tab's shape was observed
// with real data; the other 3 tabs' approvalStatus keys are inferred, not
// confirmed, so v1 only ever requests CHECK.
import { authHeaders } from './cabinetApi'

export type PendingProduct = {
  code: string
  name: string
  brand: string | null
  categoryName: string | null
  imageUrl: string | null
}

const PAGE_SIZE = 5

// Real page numbering starts at 1, not 0 -- different from getOrders.
export async function listPendingProducts(
  sessionCookies: string,
  merchantId: string,
  page: number,
  fetchFn: typeof fetch = fetch
): Promise<{ products: PendingProduct[]; hasMore: boolean }> {
  const res = await fetchFn(`https://mc.shop.kaspi.kz/bff/pending-products/${merchantId}`, {
    method: 'POST',
    headers: authHeaders(sessionCookies),
    body: JSON.stringify({ page, searchTerm: '', pageSize: PAGE_SIZE, approvalStatus: 'CHECK', isMobileApp: false }),
  })
  if (!res.ok) return { products: [], hasMore: false }
  const json = await res.json().catch(() => null)
  const data = json?.data
  if (!Array.isArray(data)) return { products: [], hasMore: false }
  return {
    products: data.map((p: any) => ({
      code: p.code,
      name: p.name,
      brand: p.brand ?? null,
      categoryName: p.category?.name ?? null,
      imageUrl: p.images?.[0]?.medium ?? null,
    })),
    hasMore: data.length === PAGE_SIZE,
  }
}

// Real response carries all 4 tabs' counts -- v1 only surfaces CHECK
// (the only tab with a confirmed, functional list view).
export async function getPendingCount(
  sessionCookies: string,
  merchantId: string,
  fetchFn: typeof fetch = fetch
): Promise<number> {
  const res = await fetchFn(`https://mc.shop.kaspi.kz/content/pending/mc/product/${merchantId}/count`, {
    headers: authHeaders(sessionCookies),
  })
  if (!res.ok) return 0
  const json = await res.json().catch(() => null)
  return Number(json?.CHECK) || 0
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/kaspiShop/pendingProducts.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/kaspiShop/cabinetApi.ts src/lib/kaspiShop/pendingProducts.ts src/lib/kaspiShop/pendingProducts.test.ts
git commit -m "feat(kaspi-shop): pending-products lib module for Нераспознанные товары"
```

---

### Task 2: API route

**Files:**
- Create: `src/app/api/kaspi-shop/pending-products/route.ts`

**Interfaces:**
- Consumes: `listPendingProducts`, `getPendingCount`, `PendingProduct` from `@/lib/kaspiShop/pendingProducts` (Task 1); `loadConnection` from `@/lib/kaspiShop/connection` (existing, returns `{ sessionCookies, merchantId, ... } | null`, same shape used by `src/app/api/kaspi-shop/finance/route.ts`).
- Produces: `GET /api/kaspi-shop/pending-products?page={n}` → `200 { products: PendingProduct[], hasMore: boolean, count: number }`, `401 { error: 'Unauthorized' }`, or `400 { error: 'Кабинет не подключён' }`. Task 4's page fetches this shape directly.

- [ ] **Step 1: Write the route**

Create `src/app/api/kaspi-shop/pending-products/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection } from '@/lib/kaspiShop/connection'
import { listPendingProducts, getPendingCount } from '@/lib/kaspiShop/pendingProducts'

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

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pageParam = Number(req.nextUrl.searchParams.get('page')) || 1
  const page = pageParam < 1 ? 1 : pageParam

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён' }, { status: 400 })
  }

  const [{ products, hasMore }, count] = await Promise.all([
    listPendingProducts(connection.sessionCookies, connection.merchantId, page),
    getPendingCount(connection.sessionCookies, connection.merchantId),
  ])

  return NextResponse.json({ products, hasMore, count })
}
```

This route has no test coverage, matching every other `kaspi-shop` API route in this codebase.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/kaspi-shop/pending-products/route.ts
git commit -m "feat(kaspi-shop): pending-products API route"
```

---

### Task 3: Sidebar — real link, rename from placeholder

**Files:**
- Modify: `src/components/kaspiShop/Sidebar.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `KaspiShopSidebar`'s `active` prop now accepts `'pending-products'` in addition to `'demping' | 'orders' | 'finance'`. Task 4's page passes `active="pending-products"`.

- [ ] **Step 1: Remove "Каталог НКТ" from `SOON_ITEMS`**

In `src/components/kaspiShop/Sidebar.tsx:6`, change:

```ts
const SOON_ITEMS = ['Каталог НКТ', 'Ниши']
```

to:

```ts
const SOON_ITEMS = ['Ниши']
```

- [ ] **Step 2: Extend the `active` union**

In `src/components/kaspiShop/Sidebar.tsx:15`, change:

```tsx
  active: 'demping' | 'orders' | 'finance'
```

to:

```tsx
  active: 'demping' | 'orders' | 'finance' | 'pending-products'
```

- [ ] **Step 3: Add the real nav link**

In `src/components/kaspiShop/Sidebar.tsx`, right after the "Финансы" `<Link>` block (currently lines 55-58) and before the `{SOON_ITEMS.map(...)}` block, insert:

```tsx
          <Link href="/kaspi-shop/pending-products"
            className={`rounded-xl text-sm font-medium px-3 py-2.5 ${active === 'pending-products' ? 'bg-[#1C2056] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            Нераспознанные товары
          </Link>
```

So the block reads:

```tsx
          <Link href="/kaspi-shop/finance"
            className={`rounded-xl text-sm font-medium px-3 py-2.5 ${active === 'finance' ? 'bg-[#1C2056] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            Финансы
          </Link>
          <Link href="/kaspi-shop/pending-products"
            className={`rounded-xl text-sm font-medium px-3 py-2.5 ${active === 'pending-products' ? 'bg-[#1C2056] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            Нераспознанные товары
          </Link>
          {SOON_ITEMS.map(item => (
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (this will error until Task 4 exists if any other file already references a `'pending-products'`-only route that doesn't exist yet — it doesn't, so this should be clean on its own).

- [ ] **Step 5: Commit**

```bash
git add src/components/kaspiShop/Sidebar.tsx
git commit -m "feat(kaspi-shop): promote Нераспознанные товары from скоро to a real sidebar link"
```

---

### Task 4: Page — `/kaspi-shop/pending-products`

**Files:**
- Create: `src/app/kaspi-shop/pending-products/page.tsx`

**Interfaces:**
- Consumes: `GET /api/kaspi-shop/pending-products?page={n}` (Task 2, returns `{ products, hasMore, count }`); `KaspiShopSidebar` with `active="pending-products"` (Task 3).
- Produces: the page itself — nothing downstream depends on it.

- [ ] **Step 1: Write the page**

Create `src/app/kaspi-shop/pending-products/page.tsx`:

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import KaspiShopSidebar from '@/components/kaspiShop/Sidebar'

const EASE = [0.16, 1, 0.3, 1] as const

type PendingProduct = {
  code: string
  name: string
  brand: string | null
  categoryName: string | null
  imageUrl: string | null
}

const TABS = [
  { key: 'CHECK', label: 'Без привязки', enabled: true },
  { key: 'PENDING', label: 'Требуют доработок', enabled: false },
  { key: 'IMPORTED', label: 'На проверке', enabled: false },
  { key: 'TRASH', label: 'Отклонены', enabled: false },
]

export default function KaspiShopPendingProducts() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [products, setProducts] = useState<PendingProduct[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [count, setCount] = useState(0)
  const [listLoading, setListLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => { checkAccess() }, [])
  useEffect(() => { if (!loading) loadProducts(page) }, [page, loading])

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

  async function loadProducts(forPage: number) {
    setListLoading(true)
    setLoadError('')
    try {
      const headers = await authHeader()
      const res = await fetch(`/api/kaspi-shop/pending-products?page=${forPage}`, { headers })
      const data = await res.json()
      if (!res.ok) { setLoadError(data.error || 'Не удалось загрузить товары'); setProducts([]); setHasMore(false); return }
      setProducts(data.products || [])
      setHasMore(!!data.hasMore)
      setCount(data.count || 0)
    } catch {
      setLoadError('Не удалось загрузить товары. Проверьте соединение и попробуйте ещё раз.')
      setProducts([])
      setHasMore(false)
    } finally {
      setListLoading(false)
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <main className="min-h-screen bg-[#F6F6FB] lg:flex">
      <KaspiShopSidebar active="pending-products" />

      <div className="flex-1 min-w-0 p-4 lg:p-6 pb-24 lg:pb-6">
        {loadError && (
          <div className="bg-red-50 rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
            <span className="text-sm text-red-600">{loadError}</span>
            <button onClick={() => loadProducts(page)} className="text-xs bg-red-500 text-white rounded-lg px-3 py-1.5 flex-shrink-0">Повторить</button>
          </div>
        )}

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
          className="bg-[#12142E] rounded-[28px] p-6 lg:p-8 mb-4 text-white">
          <div className="text-[11px] font-semibold tracking-wider text-white/40 uppercase mb-1">Товары</div>
          <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight mb-6">
            Нераспознанные товары {count > 0 && <span className="text-white/40">· {count}</span>}
          </h1>
          <div className="flex items-center gap-1 flex-wrap bg-white/10 rounded-full p-1 w-fit">
            {TABS.map(tab => (
              <button key={tab.key} disabled={!tab.enabled}
                className={`text-xs font-medium rounded-full px-3 py-1.5 transition-colors ${
                  tab.enabled ? 'bg-white text-[#12142E]' : 'text-white/30 cursor-not-allowed'
                }`}>
                {tab.label}
              </button>
            ))}
          </div>
        </motion.div>

        {listLoading ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center text-sm text-gray-400">Загружаем товары...</div>
        ) : products.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <div className="text-sm text-gray-500">Нераспознанных товаров нет.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {products.map(p => (
              <div key={p.code} className="bg-white rounded-2xl shadow-sm p-3 flex items-center gap-3">
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt={p.name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0 bg-gray-100" />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-gray-100 flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-gray-800 truncate">{p.name}</div>
                  <div className="text-[11px] text-gray-400 truncate">
                    {p.brand && <span>{p.brand}</span>}
                    {p.categoryName && <span>{p.brand ? ' · ' : ''}Kaspi предлагает: {p.categoryName}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {(page > 1 || hasMore) && (
          <div className="flex items-center justify-end mt-4">
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="text-xs font-medium bg-white text-[#1C2056] rounded-lg px-3 py-1.5 disabled:opacity-40 shadow-sm">Назад</button>
              <button onClick={() => setPage(p => p + 1)} disabled={!hasMore}
                className="text-xs font-medium bg-white text-[#1C2056] rounded-lg px-3 py-1.5 disabled:opacity-40 shadow-sm">Дальше</button>
            </div>
          </div>
        )}
      </div>

      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t px-4 py-2 flex items-center justify-between z-40">
        <div className="text-xs font-semibold text-[#1C2056]">Нераспознанные товары</div>
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
Expected: build succeeds, `/kaspi-shop/pending-products` listed among the generated routes.

- [ ] **Step 4: Commit**

```bash
git add src/app/kaspi-shop/pending-products/page.tsx
git commit -m "feat(kaspi-shop): Нераспознанные товары page"
```

---

## Self-Review Notes

- **Spec coverage:** design doc's read-only Без-привязки-only scope → Tasks 1-4. Disabled 3 tabs → Task 4's `TABS` array. Sidebar rename + real link → Task 3. Both confirmed endpoints → Task 1. All covered.
- **Placeholder scan:** none found — every step has literal code.
- **Type consistency:** `PendingProduct` defined once in `pendingProducts.ts` (Task 1) and re-declared identically (not imported, matching this codebase's existing pattern of pages keeping their own local copy of API types rather than importing lib types into `'use client'` pages — see `orders/page.tsx`'s local `Order` type) in the page (Task 4); field names (`code`, `name`, `brand`, `categoryName`, `imageUrl`) match exactly across Tasks 1, 2, and 4. Route response shape `{ products, hasMore, count }` (Task 2) matches what Task 4's `loadProducts` reads.
