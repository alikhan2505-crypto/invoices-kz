# Kaspi Shop: Ниши Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a free, on-demand "check this product idea" tool at `/kaspi-shop/niches` — the seller types a product idea, gets a live snapshot of that market on Kaspi (competitor count, price distribution, top brands, top real products) pulled from Kaspi's own public search, no login or seller session required.

**Architecture:** A pure-logic module (`niches.ts`) wraps a single confirmed-live, unauthenticated Kaspi endpoint behind an injectable-fetch interface. A thin API route exposes it (admin-auth only, no `loadConnection` — this is the only Kaspi Shop feature that needs no seller session at all). A search page renders the results in the established dark-hero-card + white-card-list visual language.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Tailwind, framer-motion, Supabase auth.

## Global Constraints

- Real endpoint: `GET https://kaspi.kz/yml/product-view/pl/filters?text={query}&page=0&all=false&fl=true&ui=d&c=750000000` — **fully public, no auth headers, no session cookies**. This is unlike every other `kaspiShop` lib module.
- City is hardcoded to `750000000` (Almaty) — no city picker in v1.
- Response shape (confirmed live 2026-08-14 for query "термокружка"): `data.total` (number), `data.filters` (array of `{id, rows: [{title, count}]}` — use the entry with `id === 'price'` for price ranges, `id === 'manufacturerName'` for brands), `data.cards` (array of `{title, unitSalePrice, rating, reviewsQuantity, brand, previewImages: [{medium}]}`).
- `unitSalePrice` is the real current price (post-discount if any) — do **not** use `unitPrice`, which is the pre-discount price.
- Free feature in v1 — no Kaspi Shop Wallet credit charged, no wallet code touched at all.
- No AI verdict, no search history, no caching, no rate limiting, no city picker — all explicitly out of scope.
- Route auth: any authenticated Supabase user may call the route (matching every sibling `kaspi-shop` route's actual behavior — `is_admin` is enforced client-side in each page's `checkAccess`, not server-side in the route). Reject with 401 if no valid Supabase user.
- Every task ends with `npx tsc --noEmit`. The final task also runs `npm run build`.
- Direct-to-main commits, no feature branches, no commit-confirmation prompts.
- Only pure-logic modules get Vitest tests (`niches.ts`); routes and pages have no test coverage.

**Critical: unresolved production risk carried into Task 1.** Kaspi is confirmed (from an earlier Kaspi Shop sub-project this session) to block Vercel's IP range specifically on public *product-page* HTML (`kaspi.kz/shop/p/-{sku}/`, HTTP 429, no rate-limit headers). This plan's endpoint (`kaspi.kz/yml/product-view/pl/filters`) is also public and unauthenticated, and has never been tested from Vercel's IP range — only from a local browser during design research. **This can only be observed by actually deploying to production and calling the live route from Vercel** — no local tool can simulate Vercel's IP. Task 1 therefore ends with a mandatory controller-only verification gate (not a subagent step — subagents have no deploy access) before Task 2 may start. See Task 1's final section for exact instructions.

---

### Task 1: `niches.ts` lib module + tests + API route, with a controller verification gate

**Files:**
- Create: `src/lib/kaspiShop/niches.ts`
- Test: `src/lib/kaspiShop/niches.test.ts`
- Create: `src/app/api/kaspi-shop/niches/route.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (first task).
- Produces: `NicheSummary` type `{ total: number; priceRanges: { label: string; count: number }[]; topBrands: { name: string; count: number }[]; products: { name: string; price: number; rating: number; reviewsCount: number; brand: string; imageUrl: string | null }[] }`; `checkNiche(query: string, fetchFn?: typeof fetch): Promise<NicheSummary>`. `GET /api/kaspi-shop/niches?query={text}` → `200 NicheSummary`, `401 { error: 'Unauthorized' }`, or `400 { error: 'query обязателен' }`. Task 3's page fetches this route directly.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/kaspiShop/niches.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { checkNiche } from './niches'

function fakeFetch(status: number, body: any): typeof fetch {
  return (async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch
}

describe('checkNiche', () => {
  it('maps the real response shape into a NicheSummary', async () => {
    const fetchFn = fakeFetch(200, {
      data: {
        total: 6192,
        filters: [
          { id: 'price', rows: [
            { title: 'до 10 000 т', count: 3554 },
            { title: '10 000 - 49 999 т', count: 2555 },
          ] },
          { id: 'manufacturerName', rows: [
            { title: 'YETI', count: 12 },
            { title: 'RedFox', count: 40 },
            { title: 'A', count: 1 },
            { title: 'B', count: 2 },
            { title: 'C', count: 3 },
            { title: 'D', count: 4 },
          ] },
        ],
        cards: [
          { title: 'Термокружка 1', unitSalePrice: 1102, rating: 4.8, reviewsQuantity: 619, brand: 'Без бренда', previewImages: [{ medium: 'https://cdn/1.jpg' }] },
          { title: 'Термокружка 2', unitSalePrice: 1535, rating: 4.8, reviewsQuantity: 296, brand: 'RedFox', previewImages: [] },
        ],
      },
    })

    const result = await checkNiche('термокружка', fetchFn)

    expect(result.total).toBe(6192)
    expect(result.priceRanges).toEqual([
      { label: 'до 10 000 т', count: 3554 },
      { label: '10 000 - 49 999 т', count: 2555 },
    ])
    expect(result.topBrands).toEqual([
      { name: 'RedFox', count: 40 },
      { name: 'YETI', count: 12 },
      { name: 'D', count: 4 },
      { name: 'C', count: 3 },
      { name: 'B', count: 2 },
    ])
    expect(result.products).toEqual([
      { name: 'Термокружка 1', price: 1102, rating: 4.8, reviewsCount: 619, brand: 'Без бренда', imageUrl: 'https://cdn/1.jpg' },
      { name: 'Термокружка 2', price: 1535, rating: 4.8, reviewsCount: 296, brand: 'RedFox', imageUrl: null },
    ])
  })

  it('caps products at 12 even if more cards are returned', async () => {
    const cards = Array.from({ length: 15 }, (_, i) => ({
      title: `Товар ${i}`, unitSalePrice: 1000, rating: 5, reviewsQuantity: 1, brand: 'X', previewImages: [],
    }))
    const fetchFn = fakeFetch(200, { data: { total: 100, filters: [], cards } })
    const result = await checkNiche('x', fetchFn)
    expect(result.products).toHaveLength(12)
  })

  it('returns an empty summary on a failed request', async () => {
    const fetchFn = fakeFetch(500, {})
    const result = await checkNiche('x', fetchFn)
    expect(result).toEqual({ total: 0, priceRanges: [], topBrands: [], products: [] })
  })

  it('returns an empty summary when data is missing from the response', async () => {
    const fetchFn = fakeFetch(200, {})
    const result = await checkNiche('x', fetchFn)
    expect(result).toEqual({ total: 0, priceRanges: [], topBrands: [], products: [] })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/kaspiShop/niches.test.ts`
Expected: FAIL — `Cannot find module './niches'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/kaspiShop/niches.ts`:

```ts
// Real endpoint confirmed live 2026-08-14 -- kaspi.kz's own public product
// search, fully unauthenticated (unlike every other kaspiShop lib module,
// this one needs no session cookies or merchantId at all). See
// docs/superpowers/specs/2026-08-14-kaspi-shop-niches-design.md.
export type NicheSummary = {
  total: number
  priceRanges: { label: string; count: number }[]
  topBrands: { name: string; count: number }[]
  products: { name: string; price: number; rating: number; reviewsCount: number; brand: string; imageUrl: string | null }[]
}

const CITY_ID = '750000000' // Almaty -- hardcoded in v1, no city picker

export async function checkNiche(query: string, fetchFn: typeof fetch = fetch): Promise<NicheSummary> {
  const url = `https://kaspi.kz/yml/product-view/pl/filters?text=${encodeURIComponent(query)}&page=0&all=false&fl=true&ui=d&c=${CITY_ID}`
  const res = await fetchFn(url, { headers: { accept: 'application/json, text/*' } })
  if (!res.ok) return { total: 0, priceRanges: [], topBrands: [], products: [] }
  const json = await res.json().catch(() => null)
  const data = json?.data
  if (!data) return { total: 0, priceRanges: [], topBrands: [], products: [] }

  const filters = Array.isArray(data.filters) ? data.filters : []
  const priceFilter = filters.find((f: any) => f.id === 'price')
  const brandFilter = filters.find((f: any) => f.id === 'manufacturerName')

  const priceRanges = (priceFilter?.rows || []).map((r: any) => ({ label: r.title, count: Number(r.count) || 0 }))
  const topBrands = (brandFilter?.rows || [])
    .map((r: any) => ({ name: r.title, count: Number(r.count) || 0 }))
    .sort((a: any, b: any) => b.count - a.count)
    .slice(0, 5)

  const cards = Array.isArray(data.cards) ? data.cards.slice(0, 12) : []
  const products = cards.map((c: any) => ({
    name: c.title,
    price: Number(c.unitSalePrice) || 0,
    rating: Number(c.rating) || 0,
    reviewsCount: Number(c.reviewsQuantity) || 0,
    brand: c.brand ?? '',
    imageUrl: c.previewImages?.[0]?.medium ?? null,
  }))

  return { total: Number(data.total) || 0, priceRanges, topBrands, products }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/kaspiShop/niches.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the API route**

Create `src/app/api/kaspi-shop/niches/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkNiche } from '@/lib/kaspiShop/niches'

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

  const query = req.nextUrl.searchParams.get('query')?.trim()
  if (!query) return NextResponse.json({ error: 'query обязателен' }, { status: 400 })

  const summary = await checkNiche(query)
  return NextResponse.json(summary)
}
```

This route has no test coverage, matching every other `kaspi-shop` API route in this codebase.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/kaspiShop/niches.ts src/lib/kaspiShop/niches.test.ts src/app/api/kaspi-shop/niches/route.ts
git commit -m "feat(kaspi-shop): niches lib module + API route"
```

**⛔ CONTROLLER VERIFICATION GATE — not an implementer subagent step.**

An implementer subagent has no production deploy access and cannot perform this check. After Task 1's commit is pushed and Vercel has deployed it to production, **the controller (the session executing this plan, not a dispatched subagent) must personally verify the route works from Vercel's real IP** before Task 2 begins:

1. Confirm the deploy finished (check the Vercel deployment status for the latest commit).
2. Using an authenticated session against the live production site (e.g. a real logged-in admin browser session, or any tool with a valid Supabase access token), call `GET https://<production-domain>/api/kaspi-shop/niches?query=термокружка` with the `Authorization: Bearer <token>` header.
3. **If it returns `200` with a `NicheSummary` containing a non-zero `total`:** the direct-from-Vercel path works. Proceed to Task 2 as planned.
4. **If it times out, returns a 5xx, or the underlying Kaspi call inside `checkNiche` silently returns an empty summary (`total: 0` when the query is known to have real results, like "термокружка"):** this is the Vercel-IP-block risk materializing. **Stop this plan here.** Do not guess at a fix. This project already solved an identical problem for the repricer's competitor-price check (see `src/lib/kaspiShop/checkCycle.ts`'s `getDueTrackedProducts`/`applyPriceCheckResult` split and `.github/workflows/kaspi-shop-price-check.yml` + `.github/scripts/kaspi-shop-price-check.mjs` for the working relay pattern: a Vercel endpoint reports what's needed, a GitHub Actions script performs the actual outbound fetch from its own IP, a second Vercel endpoint receives the result). Escalate back to a design/plan revision that mirrors that same split for `checkNiche` specifically, rather than improvising a fix inline — this needs its own scoped decision, not a hidden addition to this plan.

Only proceed to Task 2 once step 3's outcome is confirmed.

---

### Task 2: Sidebar — real link, remove the last placeholder

**Files:**
- Modify: `src/components/kaspiShop/Sidebar.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `KaspiShopSidebar`'s `active` prop now accepts `'niches'` in addition to `'demping' | 'orders' | 'finance' | 'pending-products'`. Task 3's page passes `active="niches"`.

- [ ] **Step 1: Empty out `SOON_ITEMS`**

In `src/components/kaspiShop/Sidebar.tsx:6`, change:

```ts
const SOON_ITEMS = ['Ниши']
```

to:

```ts
const SOON_ITEMS: string[] = []
```

(Kept as a typed empty array, not deleted outright — the `{SOON_ITEMS.map(item => ...)}` block right below it still references it, and removing the variable would require also removing that block; leaving it empty keeps the render path harmless and the file diff minimal.)

- [ ] **Step 2: Extend the `active` union**

In `src/components/kaspiShop/Sidebar.tsx:15`, change:

```tsx
  active: 'demping' | 'orders' | 'finance' | 'pending-products'
```

to:

```tsx
  active: 'demping' | 'orders' | 'finance' | 'pending-products' | 'niches'
```

- [ ] **Step 3: Add the real nav link**

In `src/components/kaspiShop/Sidebar.tsx`, right after the "Нераспознанные товары" `<Link>` block (currently lines 59-62) and before the `{SOON_ITEMS.map(...)}` block, insert:

```tsx
          <Link href="/kaspi-shop/niches"
            className={`rounded-xl text-sm font-medium px-3 py-2.5 ${active === 'niches' ? 'bg-[#1C2056] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            Ниши
          </Link>
```

So the block reads:

```tsx
          <Link href="/kaspi-shop/pending-products"
            className={`rounded-xl text-sm font-medium px-3 py-2.5 ${active === 'pending-products' ? 'bg-[#1C2056] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            Нераспознанные товары
          </Link>
          <Link href="/kaspi-shop/niches"
            className={`rounded-xl text-sm font-medium px-3 py-2.5 ${active === 'niches' ? 'bg-[#1C2056] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            Ниши
          </Link>
          {SOON_ITEMS.map(item => (
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/kaspiShop/Sidebar.tsx
git commit -m "feat(kaspi-shop): promote Ниши from скоро to a real sidebar link"
```

---

### Task 3: Page — `/kaspi-shop/niches`

**Files:**
- Create: `src/app/kaspi-shop/niches/page.tsx`

**Interfaces:**
- Consumes: `GET /api/kaspi-shop/niches?query={text}` (Task 1, returns `NicheSummary`); `KaspiShopSidebar` with `active="niches"` (Task 2).
- Produces: the page itself — nothing downstream depends on it.

- [ ] **Step 1: Write the page**

Create `src/app/kaspi-shop/niches/page.tsx`:

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import KaspiShopSidebar from '@/components/kaspiShop/Sidebar'

const EASE = [0.16, 1, 0.3, 1] as const

type NicheSummary = {
  total: number
  priceRanges: { label: string; count: number }[]
  topBrands: { name: string; count: number }[]
  products: { name: string; price: number; rating: number; reviewsCount: number; brand: string; imageUrl: string | null }[]
}

export default function KaspiShopNiches() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [summary, setSummary] = useState<NicheSummary | null>(null)
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => { checkAccess() }, [])

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

  async function doSearch() {
    if (!query.trim()) return
    setSearching(true)
    setLoadError('')
    setSearched(true)
    try {
      const headers = await authHeader()
      const res = await fetch(`/api/kaspi-shop/niches?query=${encodeURIComponent(query.trim())}`, { headers })
      const data = await res.json()
      if (!res.ok) { setLoadError(data.error || 'Не удалось проверить нишу'); setSummary(null); return }
      setSummary(data)
    } catch {
      setLoadError('Не удалось проверить нишу. Проверьте соединение и попробуйте ещё раз.')
      setSummary(null)
    } finally {
      setSearching(false)
    }
  }

  if (loading) return <LoadingSpinner />

  const isEmpty = !!summary && summary.total === 0 && summary.products.length === 0

  return (
    <main className="min-h-screen bg-[#F6F6FB] lg:flex">
      <KaspiShopSidebar active="niches" />

      <div className="flex-1 min-w-0 p-4 lg:p-6 pb-24 lg:pb-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
          className="bg-[#12142E] rounded-[28px] p-6 lg:p-8 mb-4 text-white">
          <div className="text-[11px] font-semibold tracking-wider text-white/40 uppercase mb-1">Ниши</div>
          <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight mb-6">Проверить идею товара</h1>
          <form onSubmit={e => { e.preventDefault(); doSearch() }} className="flex gap-2">
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Например: термокружка"
              className="flex-1 rounded-xl bg-white/10 text-white placeholder-white/40 px-4 py-3 text-sm outline-none focus:bg-white/15" />
            <button type="submit" disabled={searching || !query.trim()}
              className="rounded-xl bg-white text-[#12142E] text-sm font-semibold px-5 py-3 disabled:opacity-40">
              {searching ? 'Ищем...' : 'Проверить'}
            </button>
          </form>
          {summary && !isEmpty && (
            <div className="mt-6 text-3xl lg:text-4xl font-black font-mono tabular-nums">
              {summary.total.toLocaleString('ru-KZ')}
              <span className="text-sm font-medium text-white/40 ml-2">товаров по запросу «{query}»</span>
            </div>
          )}
        </motion.div>

        {loadError && (
          <div className="bg-red-50 rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
            <span className="text-sm text-red-600">{loadError}</span>
            <button onClick={doSearch} className="text-xs bg-red-500 text-white rounded-lg px-3 py-1.5 flex-shrink-0">Повторить</button>
          </div>
        )}

        {!searched ? null : searching ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center text-sm text-gray-400">Ищем на Kaspi...</div>
        ) : !summary || isEmpty ? (
          loadError ? null : (
            <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
              <div className="text-sm text-gray-500">Ничего не нашлось по этому запросу.</div>
            </div>
          )
        ) : (
          <>
            {(summary.priceRanges.length > 0 || summary.topBrands.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                {summary.priceRanges.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-50">
                    <div className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Диапазоны цен</div>
                    {summary.priceRanges.map(r => (
                      <div key={r.label} className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-sm text-gray-600">{r.label}</span>
                        <span className="text-xs text-gray-400 tabular-nums">{r.count}</span>
                      </div>
                    ))}
                  </div>
                )}
                {summary.topBrands.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-50">
                    <div className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Топ брендов</div>
                    {summary.topBrands.map(b => (
                      <div key={b.name} className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-sm text-gray-600">{b.name}</span>
                        <span className="text-xs text-gray-400 tabular-nums">{b.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {summary.products.length > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {summary.products.map((p, i) => (
                  <div key={i} className="bg-white rounded-2xl shadow-sm p-3">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt={p.name} className="w-full aspect-square rounded-xl object-cover bg-gray-100 mb-2" />
                    ) : (
                      <div className="w-full aspect-square rounded-xl bg-gray-100 mb-2" />
                    )}
                    <div className="text-xs font-semibold text-gray-800 line-clamp-2 mb-1">{p.name}</div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-sm text-[#1C2056] tabular-nums">{p.price.toLocaleString('ru-KZ')} ₸</span>
                      <span className="text-[11px] text-gray-400">★{p.rating.toFixed(1)} ({p.reviewsCount})</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t px-4 py-2 flex items-center justify-between z-40">
        <div className="text-xs font-semibold text-[#1C2056]">Ниши</div>
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
Expected: build succeeds, `/kaspi-shop/niches` listed among the generated routes.

- [ ] **Step 4: Commit**

```bash
git add src/app/kaspi-shop/niches/page.tsx
git commit -m "feat(kaspi-shop): Ниши page — check a product idea against live Kaspi search"
```

---

## Self-Review Notes

- **Spec coverage:** design doc's on-demand (not browsable) scope → Task 1's `checkNiche`. No-session public endpoint → Task 1's route (no `loadConnection`). Hardcoded Almaty city, no picker → `CITY_ID` constant in `niches.ts`. No AI verdict / no history / no caching / no rate limiting / free (no wallet) → none of these appear anywhere in Tasks 1-3, correctly. Sidebar promotion → Task 2. Search UI + price/brand/product display → Task 3. Vercel-IP-block risk → Task 1's controller gate. All covered.
- **Placeholder scan:** none found — every step has literal code, and the controller-gate section gives concrete verification steps rather than a vague "check it works."
- **Type consistency:** `NicheSummary` defined once in `niches.ts` (Task 1) and re-declared identically (not imported — matching the established pattern in this codebase of `'use client'` pages keeping their own local copy of API types, e.g. `pending-products/page.tsx`'s local `PendingProduct`) in the page (Task 3); field names (`total`, `priceRanges`, `topBrands`, `products`, and each product's `name`/`price`/`rating`/`reviewsCount`/`brand`/`imageUrl`) match exactly across Tasks 1 and 3. Route response shape (Task 1) is exactly `NicheSummary`, consumed directly by Task 3's `doSearch`.
