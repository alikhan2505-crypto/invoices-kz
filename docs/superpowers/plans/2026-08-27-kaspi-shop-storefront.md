# Онлайн-каталог продавца (витрина) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public storefront page (`invoices.kz/shop/{slug}`) listing a seller's Kaspi Shop products, with checkout (name/phone/address + Kaspi Pay QR) that seller can share outside Kaspi Marketplace.

**Architecture:** Two existing, independent Kaspi integrations get bridged for the first time: `kaspi_shop_connections` (product source) and `kaspi_connections`/Kaspi Pay Кассир (payment). The settlement engine (`checkAndSettleKaspiPayment`) is extended with one new branch rather than forked, exactly mirroring its existing `invoice_id` branch. Everything else (rate-limiting, wallet-commission gating, race-safe minting) is copied from the already-shipped, already-hardened invoice-payment path.

**Tech Stack:** Next.js App Router (public + admin-gated routes), Supabase (service-role), existing `kaspiPay`/`kaspiShop` lib modules, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-27-kaspi-shop-storefront-design.md`

## Global Constraints

- Storefront products = `kaspi_shop_tracked_products` rows with `enabled = true` AND (`stock_count IS NULL` OR `stock_count > 0`) AND a positive price. No photos/descriptions in v1 — name, brand, price only.
- Checkout is always: buyer form (name, phone, address) → order created → Kaspi Pay QR/link shown. Never a bare-QR-no-form flow, never a WhatsApp handoff.
- Publishing requires BOTH an active `kaspi_shop_connections` row (implicit — settings page only exists for one) AND an active `kaspi_connections` (Kaspi Pay Кассир) row. Enforced server-side in `saveStorefrontSettings`, not just hidden in the UI.
- Storefront identity (slug/published) lives on the specific `connection_id`, never on "whichever store is currently active" — switching active store in the existing multi-store switcher must never change what a published storefront link resolves to.
- No fulfillment status beyond `pending_payment` → `paid` → `expired`. No seller-facing manual status change in v1.
- New pages sit in the existing Kaspi Shop nav section (`SiteNav.tsx`'s `kaspiShopLinks`), same `adminOnly` gate as the rest of that section. Public `/shop/[slug]` page has no nav/shell at all — same bare pattern as `/view/[token]`.
- Russian-only UI copy — matches this session's other new pages (AI-агент's Заявки/Переписка), no i18n needed for a brand-new feature.

---

### Task 1: Migration

**Files:** none in repo (DB-only).

- [ ] **Step 1:** Supabase MCP `apply_migration` (project `terjitbqgrjlqezyydql`, name `kaspi_shop_storefront`):

```sql
alter table kaspi_shop_connections
  add column storefront_slug text unique,
  add column storefront_published boolean not null default false;

create table kaspi_shop_orders (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references kaspi_shop_connections(id) on delete cascade,
  tracked_product_id uuid references kaspi_shop_tracked_products(id) on delete set null,
  product_name text not null,
  price numeric not null,
  buyer_name text not null,
  buyer_phone text not null,
  buyer_address text not null,
  status text not null default 'pending_payment' check (status in ('pending_payment', 'paid', 'expired')),
  created_at timestamptz not null default now()
);
create index kaspi_shop_orders_connection_id_idx on kaspi_shop_orders(connection_id);

alter table kaspi_payment_requests add column shop_order_id uuid references kaspi_shop_orders(id);

-- Mirrors the existing kaspi_payment_requests_invoice_pending_idx (one
-- pending row per invoice_id) -- same race this codebase already hardened
-- for invoices: this checkout is reachable from the public internet, so two
-- near-simultaneous requests for the same order must not both mint a real
-- Kaspi payment.
create unique index kaspi_payment_requests_shop_order_pending_idx
  on kaspi_payment_requests(shop_order_id)
  where status = 'pending' and shop_order_id is not null;
```

- [ ] **Step 2:** Verify via `execute_sql`:

```sql
select column_name, data_type, column_default from information_schema.columns
where table_name = 'kaspi_shop_connections' and column_name in ('storefront_slug', 'storefront_published');
select column_name, is_nullable from information_schema.columns
where table_name = 'kaspi_payment_requests' and column_name = 'shop_order_id';
select indexname from pg_indexes where tablename = 'kaspi_payment_requests' and indexname = 'kaspi_payment_requests_shop_order_pending_idx';
```

Expected: both new `kaspi_shop_connections` columns exist (`storefront_published` default `false`); `shop_order_id` is nullable on `kaspi_payment_requests`; the partial unique index exists.

No commit (no repo files changed).

---

### Task 2: Storefront product filter + data helpers

**Files:**
- Create: `src/lib/kaspiShop/storefront.ts`
- Test: `src/lib/kaspiShop/storefront.test.ts`

**Interfaces:**
- Produces (consumed by Task 4/5/6/7): `filterStorefrontProducts(rows: TrackedProductRow[]): StorefrontProduct[]`, `resolveStorefrontBySlug(slug: string): Promise<{connectionId: string, userId: string, companyName: string} | null>`, `loadStorefrontProducts(connectionId: string): Promise<StorefrontProduct[]>`, `loadStorefrontSettings(userId: string): Promise<StorefrontSettings | null>`, `saveStorefrontSettings(userId: string, connectionId: string, params: {slug: string, published: boolean}): Promise<{ok: true} | {ok: false, error: string}>`, `hasCashierConnection(userId: string): Promise<boolean>`, `isValidSlug(slug: string): boolean`.
- `StorefrontProduct = { id: string, name: string, brand: string, price: number }`.
- `StorefrontSettings = { connectionId: string, companyName: string, slug: string | null, published: boolean }`.

- [ ] **Step 1: Write the failing test** for the pure filter — `src/lib/kaspiShop/storefront.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { filterStorefrontProducts } from './storefront'

describe('filterStorefrontProducts', () => {
  it('excludes disabled products', () => {
    const result = filterStorefrontProducts([
      { id: '1', product_name: 'Товар А', brand: 'Brand', own_current_price: 1000, stock_count: 5, enabled: false },
    ])
    expect(result).toEqual([])
  })

  it('excludes products with zero stock', () => {
    const result = filterStorefrontProducts([
      { id: '1', product_name: 'Товар А', brand: 'Brand', own_current_price: 1000, stock_count: 0, enabled: true },
    ])
    expect(result).toEqual([])
  })

  it('includes products with null stock (untracked stock)', () => {
    const result = filterStorefrontProducts([
      { id: '1', product_name: 'Товар А', brand: 'Brand', own_current_price: 1000, stock_count: null, enabled: true },
    ])
    expect(result).toEqual([{ id: '1', name: 'Товар А', brand: 'Brand', price: 1000 }])
  })

  it('excludes products with zero or negative price', () => {
    const result = filterStorefrontProducts([
      { id: '1', product_name: 'Товар А', brand: 'Brand', own_current_price: 0, stock_count: 5, enabled: true },
      { id: '2', product_name: 'Товар Б', brand: 'Brand', own_current_price: -100, stock_count: 5, enabled: true },
    ])
    expect(result).toEqual([])
  })

  it('trims name/brand and coerces price to a number', () => {
    const result = filterStorefrontProducts([
      { id: '1', product_name: '  Товар А  ', brand: ' Brand ', own_current_price: '2500', stock_count: 3, enabled: true },
    ])
    expect(result).toEqual([{ id: '1', name: 'Товар А', brand: 'Brand', price: 2500 }])
  })

  it('includes positive-stock enabled products', () => {
    const result = filterStorefrontProducts([
      { id: '1', product_name: 'Товар А', brand: 'Brand', own_current_price: 1000, stock_count: 10, enabled: true },
    ])
    expect(result).toEqual([{ id: '1', name: 'Товар А', brand: 'Brand', price: 1000 }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/kaspiShop/storefront.test.ts`
Expected: FAIL — `storefront.ts` does not exist yet.

- [ ] **Step 3: Write the implementation** — full file `src/lib/kaspiShop/storefront.ts`:

```ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface TrackedProductRow {
  id: string
  product_name: string | null
  brand: string | null
  own_current_price: number | string | null
  stock_count: number | null
  enabled: boolean | null
}

export interface StorefrontProduct {
  id: string
  name: string
  brand: string
  price: number
}

// Pure -- no I/O. What counts as "available to buy right now": repricer-
// enabled (the only signal we have for "seller wants this active" -- see the
// design doc's deliberate v1 trade-off of reusing this flag) and either
// untracked stock (stock_count is null -- not every product has stock
// synced) or a genuinely positive count. Same zero-price guard
// catalogContext.ts already applies for the AI-агент's own catalog block.
export function filterStorefrontProducts(rows: TrackedProductRow[]): StorefrontProduct[] {
  return rows
    .filter(r => r.enabled && (r.stock_count === null || r.stock_count === undefined || r.stock_count > 0))
    .map(r => ({
      id: r.id,
      name: String(r.product_name || '').trim(),
      brand: String(r.brand || '').trim(),
      price: Number(r.own_current_price) || 0,
    }))
    .filter(p => p.name && p.price > 0)
}

export interface StorefrontSettings {
  connectionId: string
  companyName: string
  slug: string | null
  published: boolean
}

// Scoped to the user's currently ACTIVE store, same as every other Kaspi
// Shop settings surface (loadConnection in kaspiShop/connection.ts) -- the
// seller manages the storefront of whichever store they're switched into.
// The PUBLIC resolution path (resolveStorefrontBySlug) is deliberately NOT
// scoped this way -- see that function's own comment.
export async function loadStorefrontSettings(userId: string): Promise<StorefrontSettings | null> {
  const { data, error } = await supabase
    .from('kaspi_shop_connections')
    .select('id, company_name, storefront_slug, storefront_published')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw new Error(`kaspi_shop_connections storefront lookup failed: ${error.message}`)
  if (!data) return null
  return {
    connectionId: data.id,
    companyName: data.company_name,
    slug: data.storefront_slug,
    published: data.storefront_published,
  }
}

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug)
}

// Plain existence check, deliberately NOT loadConnectionByUserId (kaspiPay/
// connection.ts) -- that function decrypts the connection's private signing
// key and TOTP seed just to answer a yes/no question, which this has no
// business triggering.
export async function hasCashierConnection(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('kaspi_connections')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw new Error(`kaspi_connections existence check failed: ${error.message}`)
  return !!data
}

export async function saveStorefrontSettings(
  userId: string,
  connectionId: string,
  params: { slug: string; published: boolean }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isValidSlug(params.slug)) return { ok: false, error: 'invalid_slug' }
  if (params.published && !(await hasCashierConnection(userId))) return { ok: false, error: 'cashier_not_connected' }

  // Ownership check mirrors switchActiveConnection's pattern (kaspiShop/
  // connection.ts) -- never trust a connectionId from the client without
  // confirming it belongs to this user.
  const { data: owned, error: ownedError } = await supabase
    .from('kaspi_shop_connections')
    .select('id')
    .eq('id', connectionId)
    .eq('user_id', userId)
    .maybeSingle()
  if (ownedError) throw new Error(`kaspi_shop_connections ownership check failed: ${ownedError.message}`)
  if (!owned) return { ok: false, error: 'not_found' }

  const { error } = await supabase
    .from('kaspi_shop_connections')
    .update({ storefront_slug: params.slug, storefront_published: params.published })
    .eq('id', connectionId)
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'slug_taken' }
    throw new Error(`kaspi_shop_connections storefront save failed: ${error.message}`)
  }
  return { ok: true }
}

// The PUBLIC resolution path -- deliberately independent of is_active, per
// the design doc: a seller switching which store is "active" in the
// multi-store switcher (for repricer/orders/etc.) must never change what an
// already-shared storefront link shows. Unpublished and never-claimed slugs
// resolve identically (both null) -- a stale/guessed slug reveals nothing.
export async function resolveStorefrontBySlug(slug: string): Promise<{ connectionId: string; userId: string; companyName: string } | null> {
  const { data, error } = await supabase
    .from('kaspi_shop_connections')
    .select('id, user_id, company_name')
    .eq('storefront_slug', slug)
    .eq('storefront_published', true)
    .maybeSingle()
  if (error) throw new Error(`storefront resolve by slug failed: ${error.message}`)
  return data ? { connectionId: data.id, userId: data.user_id, companyName: data.company_name } : null
}

export async function loadStorefrontProducts(connectionId: string): Promise<StorefrontProduct[]> {
  const { data, error } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('id, product_name, brand, own_current_price, stock_count, enabled')
    .eq('connection_id', connectionId)
  if (error) throw new Error(`kaspi_shop_tracked_products lookup failed for connection ${connectionId}: ${error.message}`)
  return filterStorefrontProducts(data || [])
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/kaspiShop/storefront.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kaspiShop/storefront.ts src/lib/kaspiShop/storefront.test.ts
git status --short
git commit -m "feat(kaspi-shop): storefront product filter + settings/resolve data helpers"
```

---

### Task 3: Payment settlement — extend for shop orders

**Files:**
- Modify: `src/lib/kaspiPay/settlePayment.ts`
- Create: `src/lib/kaspiPay/shopOrderPayment.ts`

**Interfaces:**
- Consumes: `loadConnectionByUserId` (`connection.ts`), `createPayment` (`client.ts`, signature `(connection: KaspiConnection, params: {amount: number, orderId: string}) => Promise<{operationId, qrToken, paymentLink, expiresAt}>`), `getWalletBalance`/`computeCommission` (`wallet.ts`).
- Produces (consumed by Task 4): `getOrCreateKaspiPaymentForShopOrder(order: {id: string, connectionOwnerId: string, amount: number | string, status?: string | null}): Promise<KaspiShopOrderPayment | null>`, where `KaspiShopOrderPayment = SettleableRequest & {qr_token: string | null, payment_link: string | null, status: string}`.

- [ ] **Step 1: Extend `SettleableRequest` and add the settlement branch** in `src/lib/kaspiPay/settlePayment.ts`. Change the interface:

```ts
export interface SettleableRequest {
  id: string
  user_id: string
  invoice_id: string | null
  order_id: string | null
  shop_order_id: string | null
  amount: number | string
  kaspi_operation_id: string
  callback_url: string | null
  expires_at: string | null
}
```

Then insert a new branch right after the existing invoice branch (currently the block starting `if (reqRow.invoice_id) {`):

```ts
  if (reqRow.invoice_id) {
    await supabase.from('invoices').update({ status: 'paid' }).eq('id', reqRow.invoice_id)
    await supabase.from('invoice_logs').insert({ invoice_id: reqRow.invoice_id, status: 'paid' })
  }

  // Parallel to the invoice branch above -- a payment request can settle
  // either an invoice OR a storefront order, never both. The two id columns
  // are mutually exclusive by construction (each mint path only ever sets
  // one of them).
  if (reqRow.shop_order_id) {
    await supabase.from('kaspi_shop_orders').update({ status: 'paid' }).eq('id', reqRow.shop_order_id)
  }
```

- [ ] **Step 2: Run the existing test suite for this module** (no new tests here — this function has no dedicated test file today; verified by the full-suite gate in Task 8, and this task's own manual check in Step 4 below)

Run: `npx tsc --noEmit`
Expected: clean — `invoicePayment.ts`'s `KaspiInvoicePayment extends SettleableRequest` still compiles (it constructs values via `as KaspiInvoicePayment` casts, not object literals, so the new required field doesn't force it to select an extra column).

- [ ] **Step 3: Create `src/lib/kaspiPay/shopOrderPayment.ts`** — full file, mirrors `invoicePayment.ts`'s `getOrCreateKaspiPaymentForInvoice` exactly, for a `kaspi_shop_orders` row instead of an invoice:

```ts
import { createClient } from '@supabase/supabase-js'
import { loadConnectionByUserId } from './connection'
import { createPayment } from './client'
import { getWalletBalance, computeCommission } from './wallet'
import type { SettleableRequest } from './settlePayment'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface KaspiShopOrderPayment extends SettleableRequest {
  qr_token: string | null
  payment_link: string | null
  status: string
}

const SETTLEABLE_COLUMNS = 'id, user_id, invoice_id, order_id, shop_order_id, amount, kaspi_operation_id, callback_url, expires_at, qr_token, payment_link, status'

const MINT_WINDOW_MS = 60_000
const MINT_LIMIT = 3

const CLOSED_ORDER_STATUSES = new Set(['paid', 'expired'])

/**
 * Returns a storefront order's currently-valid Kaspi payment, minting one on
 * demand if none exists or the previous link expired -- same shape as
 * getOrCreateKaspiPaymentForInvoice (invoicePayment.ts), for a
 * kaspi_shop_orders row instead of an invoice. Reachable from the PUBLIC
 * /shop/[slug] checkout, so the same per-order mint rate limit and
 * wallet-balance-covers-commission gate apply before minting anything NEW
 * (an already-live link keeps working regardless of balance).
 */
export async function getOrCreateKaspiPaymentForShopOrder(order: {
  id: string
  connectionOwnerId: string
  amount: number | string
  status?: string | null
}): Promise<KaspiShopOrderPayment | null> {
  const { data: existing, error } = await supabase
    .from('kaspi_payment_requests')
    .select(SETTLEABLE_COLUMNS)
    .eq('shop_order_id', order.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`kaspi_payment_requests lookup for shop order ${order.id} failed: ${error.message}`)

  if (existing && (!existing.expires_at || new Date(existing.expires_at) > new Date())) {
    return existing as KaspiShopOrderPayment
  }

  if (order.status && CLOSED_ORDER_STATUSES.has(order.status)) return null

  const balance = await getWalletBalance(order.connectionOwnerId)
  if (balance < computeCommission(Number(order.amount))) return null

  const { count: recentMints, error: rateError } = await supabase
    .from('kaspi_payment_requests')
    .select('id', { count: 'exact', head: true })
    .eq('shop_order_id', order.id)
    .gte('created_at', new Date(Date.now() - MINT_WINDOW_MS).toISOString())
  if (rateError) console.error('Kaspi shop order payment: mint rate count failed for order', order.id, rateError.message)
  else if ((recentMints ?? 0) >= MINT_LIMIT) {
    console.error('Kaspi shop order payment: mint rate limit hit for order', order.id)
    return null
  }

  const connection = await loadConnectionByUserId(order.connectionOwnerId)
  if (!connection) return null

  const payment = await createPayment(connection, { amount: Number(order.amount), orderId: order.id })

  const { data: inserted, error: insertError } = await supabase
    .from('kaspi_payment_requests')
    .insert({
      user_id: order.connectionOwnerId,
      shop_order_id: order.id,
      order_id: order.id,
      amount: order.amount,
      kaspi_operation_id: payment.operationId,
      qr_token: payment.qrToken,
      payment_link: payment.paymentLink,
      status: 'pending',
      expires_at: payment.expiresAt,
    })
    .select(SETTLEABLE_COLUMNS)
    .single()
  if (insertError) {
    // Unique violation on kaspi_payment_requests_shop_order_pending_idx --
    // same concurrent-caller race as getOrCreateKaspiPaymentForInvoice's
    // identical handling: the other call's insert won, hand back its row.
    if (insertError.code === '23505') {
      const { data: winner } = await supabase
        .from('kaspi_payment_requests')
        .select(SETTLEABLE_COLUMNS)
        .eq('shop_order_id', order.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (winner) return winner as KaspiShopOrderPayment
    }
    console.error('Kaspi payment created but failed to persist for tracking — shop order', order.id, 'operation', payment.operationId, ':', insertError.message)
    return null
  }

  return inserted as KaspiShopOrderPayment
}
```

- [ ] **Step 4: Run the gate**

Run: `npx tsc --noEmit` → expect clean.
Run: `npx vitest run` → expect all existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kaspiPay/settlePayment.ts src/lib/kaspiPay/shopOrderPayment.ts
git status --short
git commit -m "feat(kaspi-shop): extend Kaspi Pay settlement for storefront orders"
```

---

### Task 4: Public API — catalog, order creation, payment polling

**Files:**
- Create: `src/app/api/shop/[slug]/route.ts`
- Create: `src/app/api/shop/[slug]/order/route.ts`
- Create: `src/app/api/shop/[slug]/order-status/route.ts`

**Interfaces:**
- Consumes: `resolveStorefrontBySlug`, `loadStorefrontProducts` (Task 2); `getOrCreateKaspiPaymentForShopOrder` (Task 3); `checkAndSettleKaspiPayment` (existing, `settlePayment.ts`); `normalizeKzPhone` (existing, `src/lib/kaspiPay/phone.ts`).
- Produces (consumed by Task 5): `GET /api/shop/[slug]` → `{companyName, products: StorefrontProduct[]}` or 404 `{error:'not_found'}`. `POST /api/shop/[slug]/order` body `{productId, buyerName, buyerPhone, buyerAddress}` → `{orderId, payment: {qr_token, payment_link, status} | null}` or 400/404/500 `{error}`. `GET /api/shop/[slug]/order-status?orderId=...` → `{payment: {qr_token, payment_link, status} | null}`.

- [ ] **Step 1: Create `src/app/api/shop/[slug]/route.ts`** — full file:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStorefrontBySlug, loadStorefrontProducts } from '@/lib/kaspiShop/storefront'

// Public, unauthenticated -- the customer opening a seller's shared link is
// never logged in. An unpublished or never-claimed slug resolves identically
// to 404 (see resolveStorefrontBySlug's own comment).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const storefront = await resolveStorefrontBySlug(slug)
  if (!storefront) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const products = await loadStorefrontProducts(storefront.connectionId)
  return NextResponse.json({ companyName: storefront.companyName, products })
}
```

- [ ] **Step 2: Create `src/app/api/shop/[slug]/order/route.ts`** — full file:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveStorefrontBySlug } from '@/lib/kaspiShop/storefront'
import { getOrCreateKaspiPaymentForShopOrder } from '@/lib/kaspiPay/shopOrderPayment'
import { normalizeKzPhone } from '@/lib/kaspiPay/phone'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Public, unauthenticated -- creates one order and mints its first Kaspi
// payment in a single call, mirroring how send-invoice mints an invoice's
// first payment link. The buyer never has an account; buyerName/Phone/
// Address is the only record of who placed the order (see Заказы витрины).
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const storefront = await resolveStorefrontBySlug(slug)
  if (!storefront) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const productId = typeof body?.productId === 'string' ? body.productId : null
  const buyerName = typeof body?.buyerName === 'string' ? body.buyerName.trim() : ''
  const buyerAddress = typeof body?.buyerAddress === 'string' ? body.buyerAddress.trim() : ''
  const buyerPhone = normalizeKzPhone(typeof body?.buyerPhone === 'string' ? body.buyerPhone : '')
  if (!productId || !buyerName || !buyerAddress || !buyerPhone) {
    return NextResponse.json({ error: 'Заполните имя, телефон и адрес' }, { status: 400 })
  }

  const { data: product, error: productError } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('id, product_name, own_current_price, enabled, stock_count')
    .eq('id', productId)
    .eq('connection_id', storefront.connectionId)
    .maybeSingle()
  if (productError) return NextResponse.json({ error: productError.message }, { status: 500 })
  if (!product || !product.enabled || (product.stock_count !== null && product.stock_count <= 0)) {
    return NextResponse.json({ error: 'Товар недоступен' }, { status: 400 })
  }
  const price = Number(product.own_current_price) || 0
  if (price <= 0) return NextResponse.json({ error: 'Товар недоступен' }, { status: 400 })

  const { data: order, error: orderError } = await supabase
    .from('kaspi_shop_orders')
    .insert({
      connection_id: storefront.connectionId,
      tracked_product_id: product.id,
      product_name: product.product_name,
      price,
      buyer_name: buyerName,
      buyer_phone: buyerPhone,
      buyer_address: buyerAddress,
      status: 'pending_payment',
    })
    .select('id, price, status')
    .single()
  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 })

  try {
    const payment = await getOrCreateKaspiPaymentForShopOrder({
      id: order.id, connectionOwnerId: storefront.userId, amount: order.price, status: order.status,
    })
    if (!payment) return NextResponse.json({ orderId: order.id, payment: null })
    return NextResponse.json({ orderId: order.id, payment: { qr_token: payment.qr_token, payment_link: payment.payment_link, status: payment.status } })
  } catch (e: any) {
    console.error('Storefront order payment mint failed for order', order.id, e.message)
    return NextResponse.json({ orderId: order.id, payment: null })
  }
}
```

- [ ] **Step 3: Create `src/app/api/shop/[slug]/order-status/route.ts`** — full file:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveStorefrontBySlug } from '@/lib/kaspiShop/storefront'
import { getOrCreateKaspiPaymentForShopOrder } from '@/lib/kaspiPay/shopOrderPayment'
import { checkAndSettleKaspiPayment } from '@/lib/kaspiPay/settlePayment'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Mirrors /api/kaspi/invoice-payment exactly -- the storefront checkout page
// polls this every few seconds while payment is pending, and a live Kaspi
// check right here is what makes confirmation instant and click-free on
// this project's once-daily cron plan (see settlePayment.ts).
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const orderId = req.nextUrl.searchParams.get('orderId')
  if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 })

  const storefront = await resolveStorefrontBySlug(slug)
  if (!storefront) return NextResponse.json({ payment: null })

  const { data: order } = await supabase
    .from('kaspi_shop_orders')
    .select('id, price, status')
    .eq('id', orderId)
    .eq('connection_id', storefront.connectionId)
    .maybeSingle()
  if (!order) return NextResponse.json({ payment: null })

  try {
    const payment = await getOrCreateKaspiPaymentForShopOrder({
      id: order.id, connectionOwnerId: storefront.userId, amount: order.price, status: order.status,
    })
    if (!payment) return NextResponse.json({ payment: null })

    if (payment.status === 'pending') {
      try {
        const outcome = await checkAndSettleKaspiPayment(payment)
        if (outcome === 'paid') payment.status = 'paid'
        else if (outcome === 'expired') return NextResponse.json({ payment: null })
      } catch (e: any) {
        console.error('Storefront order live status check failed for order', order.id, e.message)
      }
    }

    return NextResponse.json({ payment: { qr_token: payment.qr_token, payment_link: payment.payment_link, status: payment.status } })
  } catch (e: any) {
    console.error('Storefront order-status lookup failed for order', order.id, e.message)
    return NextResponse.json({ payment: null })
  }
}
```

- [ ] **Step 4: Run the gate**

Run: `npx tsc --noEmit` → expect clean.
Run: `npx vitest run` → expect all pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/shop
git status --short
git commit -m "feat(kaspi-shop): public storefront API -- catalog, order creation, payment polling"
```

---

### Task 5: Public storefront page

**Files:**
- Create: `src/app/shop/[slug]/page.tsx`

**Interfaces:**
- Consumes: Task 4's three routes. `qrcode` package (already a dependency, used identically in `src/app/view/[token]/page.tsx`).

- [ ] **Step 1: Create `src/app/shop/[slug]/page.tsx`** — full file, bare public layout (no `SiteNav`/`DesktopShell`, same as `/view/[token]`):

```tsx
'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import QRCode from 'qrcode'

type Product = { id: string; name: string; brand: string; price: number }
type Payment = { qr_token: string | null; payment_link: string | null; status: string }

const EASE = [0.16, 1, 0.3, 1] as const

function LogoMark() {
  return (
    <img src="/icon.svg" alt="" className="w-7 h-7 rounded-lg" style={{ boxShadow: '0 6px 14px -6px var(--nav-accent)' }} />
  )
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('ru-KZ').format(price) + ' ₸'
}

export default function StorefrontPage() {
  const params = useParams<{ slug: string }>()
  const reduceMotion = !!useReducedMotion()
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [selected, setSelected] = useState<Product | null>(null)
  const [buyerName, setBuyerName] = useState('')
  const [buyerPhone, setBuyerPhone] = useState('')
  const [buyerAddress, setBuyerAddress] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [payment, setPayment] = useState<Payment | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/shop/${params.slug}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setNotFound(true); return }
        setCompanyName(data.companyName || '')
        setProducts(Array.isArray(data.products) ? data.products : [])
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [params.slug])

  useEffect(() => {
    if (!payment?.payment_link) { setQrDataUrl(null); return }
    let cancelled = false
    QRCode.toDataURL(payment.payment_link, { width: 160, margin: 1 })
      .then(url => { if (!cancelled) setQrDataUrl(url) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [payment?.payment_link])

  // Same 5s / ~12.5min-cap live-poll shape as /view/[token] -- see
  // settlePayment.ts for why polling (not a cron) is the primary
  // confirmation path on this project's once-daily cron plan.
  const pollCount = useRef(0)
  useEffect(() => {
    if (!payment || payment.status !== 'pending' || !orderId) return
    pollCount.current = 0
    const interval = setInterval(async () => {
      pollCount.current++
      if (pollCount.current > 150) { clearInterval(interval); return }
      try {
        const res = await fetch(`/api/shop/${params.slug}/order-status?orderId=${orderId}`)
        const data = await res.json()
        setPayment(data.payment || null)
      } catch {
        // Transient network hiccup — the next tick tries again.
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [payment?.status, orderId, params.slug])

  async function submitOrder() {
    if (!selected) return
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/shop/${params.slug}/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: selected.id, buyerName, buyerPhone, buyerAddress }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Не удалось оформить заказ'); return }
      setOrderId(data.orderId)
      setPayment(data.payment || null)
    } catch {
      setError('Ошибка сети. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setSubmitting(false)
    }
  }

  function closeModal() {
    setSelected(null)
    setBuyerName(''); setBuyerPhone(''); setBuyerAddress('')
    setOrderId(null); setPayment(null); setQrDataUrl(null); setError(null)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загрузка…</div>
  if (notFound) return <div className="min-h-screen flex items-center justify-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Витрина не найдена</div>

  return (
    <div className="min-h-screen" style={{ background: 'var(--nav-bg)' }}>
      <div className="max-w-3xl mx-auto p-4 lg:p-6">
        <div className="flex items-center gap-2.5 mb-6">
          <LogoMark />
          <h1 className="text-lg font-bold" style={{ color: 'var(--nav-text-primary)' }}>{companyName}</h1>
        </div>

        {products.length === 0 ? (
          <div className="text-sm text-center py-16" style={{ color: 'var(--nav-text-muted)' }}>Пока нет товаров в наличии</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {products.map((p, i) => (
              <motion.div
                key={p.id}
                initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : Math.min(i * 0.04, 0.3) }}
                className="nav-glass rounded-2xl p-4 flex flex-col"
              >
                {p.brand && <div className="text-[11px] font-medium mb-1" style={{ color: 'var(--nav-text-muted)' }}>{p.brand}</div>}
                <div className="text-sm font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{p.name}</div>
                <div className="text-base font-bold mb-3" style={{ color: 'var(--nav-text-primary)' }}>{formatPrice(p.price)}</div>
                <button
                  onClick={() => setSelected(p)}
                  className="mt-auto rounded-lg px-4 py-2 text-sm font-semibold"
                  style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
                >
                  Купить
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={closeModal}>
          <div className="nav-glass rounded-2xl p-5 w-full max-w-sm" style={{ background: 'var(--nav-bg)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{selected.name}</div>
              <button onClick={closeModal} className="text-sm" style={{ color: 'var(--nav-text-muted)' }}>✕</button>
            </div>

            {payment ? (
              <div className="text-center">
                {payment.status === 'paid' ? (
                  <div className="py-6 text-sm font-semibold" style={{ color: 'var(--nav-success)' }}>Заказ оплачен! Продавец свяжется с вами.</div>
                ) : (
                  <>
                    {qrDataUrl && <img src={qrDataUrl} alt="Kaspi QR" className="mx-auto mb-3 rounded-lg" width={160} height={160} />}
                    <a href={payment.payment_link || '#'} target="_blank" rel="noopener noreferrer"
                      className="inline-block rounded-lg px-4 py-2 text-sm font-semibold" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                      Оплатить {formatPrice(selected.price)} через Kaspi
                    </a>
                    <div className="text-xs mt-3" style={{ color: 'var(--nav-text-muted)' }}>Ждём подтверждение оплаты…</div>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="text-sm font-bold mb-3" style={{ color: 'var(--nav-text-primary)' }}>{formatPrice(selected.price)}</div>
                <div className="space-y-2 mb-4">
                  <input value={buyerName} onChange={e => setBuyerName(e.target.value)} placeholder="Имя"
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)]"
                    style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
                  <input value={buyerPhone} onChange={e => setBuyerPhone(e.target.value)} placeholder="Телефон"
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)]"
                    style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
                  <input value={buyerAddress} onChange={e => setBuyerAddress(e.target.value)} placeholder="Адрес доставки"
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)]"
                    style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
                </div>
                {error && <div className="text-xs mb-3" style={{ color: 'var(--nav-critical)' }}>{error}</div>}
                <button onClick={submitOrder} disabled={submitting || !buyerName.trim() || !buyerPhone.trim() || !buyerAddress.trim()}
                  className="w-full rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  {submitting ? 'Оформляем…' : 'Оформить и оплатить'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run the gate**

Run: `npx tsc --noEmit` → expect clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/shop
git status --short
git commit -m "feat(kaspi-shop): public storefront page -- catalog + checkout"
```

---

### Task 6: Seller settings — «Витрина»

**Files:**
- Create: `src/app/api/kaspi-shop/storefront/route.ts`
- Create: `src/app/kaspi-shop/storefront/page.tsx`

**Interfaces:**
- Consumes: `loadStorefrontSettings`, `saveStorefrontSettings`, `hasCashierConnection` (Task 2).
- Produces (consumed by Task 7's nav step): page reachable at `/kaspi-shop/storefront`.

- [ ] **Step 1: Create `src/app/api/kaspi-shop/storefront/route.ts`** — full file:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadStorefrontSettings, saveStorefrontSettings, hasCashierConnection } from '@/lib/kaspiShop/storefront'

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

  const settings = await loadStorefrontSettings(user.id)
  if (!settings) return NextResponse.json({ error: 'no_connection' }, { status: 404 })

  const cashierConnected = await hasCashierConnection(user.id)
  return NextResponse.json({ ...settings, cashierConnected })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await loadStorefrontSettings(user.id)
  if (!settings) return NextResponse.json({ error: 'no_connection' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const slug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : ''
  const published = !!body?.published
  if (!slug) return NextResponse.json({ error: 'invalid_slug' }, { status: 400 })

  const result = await saveStorefrontSettings(user.id, settings.connectionId, { slug, published })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Create `src/app/kaspi-shop/storefront/page.tsx`** — full file:

```tsx
'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'

const EASE = [0.16, 1, 0.3, 1] as const

type Settings = { connectionId: string; companyName: string; slug: string | null; published: boolean; cashierConnected: boolean }

export default function KaspiShopStorefrontSettings() {
  const router = useRouter()
  const reduceMotion = !!useReducedMotion()
  const [loading, setLoading] = useState(true)
  const [noConnection, setNoConnection] = useState(false)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [slugInput, setSlugInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  const load = useCallback(async () => {
    const headers = await authHeader()
    const res = await fetch('/api/kaspi-shop/storefront', { headers })
    if (res.status === 404) { setNoConnection(true); setLoading(false); return }
    if (res.ok) {
      const data = await res.json()
      setSettings(data)
      setSlugInput(data.slug || '')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      await load()
    }
    init()
  }, [router, load])

  async function save(published: boolean) {
    setError(null)
    setSaving(true)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/storefront', {
        method: 'POST', headers, body: JSON.stringify({ slug: slugInput, published }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(
          data.error === 'slug_taken' ? 'Такая ссылка уже занята, выберите другую'
          : data.error === 'invalid_slug' ? 'Ссылка может содержать только латинские буквы, цифры и дефис'
          : data.error === 'cashier_not_connected' ? 'Сначала подключите Kaspi Pay Кассир'
          : 'Не удалось сохранить'
        )
        return
      }
      await load()
    } catch {
      setError('Ошибка сети. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setSaving(false)
    }
  }

  function copyLink() {
    if (!settings?.slug) return
    navigator.clipboard.writeText(`${window.location.origin}/shop/${settings.slug}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загрузка…</div>
    </main>
    </DesktopShell>
  )

  if (noConnection) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Сначала подключите магазин Kaspi Shop</div>
    </main>
    </DesktopShell>
  )

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-2xl mx-auto p-4 lg:p-6 pb-24 lg:pb-6">
        <motion.div
          className="mb-6"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <h1 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>Витрина</h1>
          <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Публичная страница с вашими товарами — делитесь ссылкой в Instagram/WhatsApp</p>
        </motion.div>

        {!settings?.cashierConnected ? (
          <div className="nav-glass rounded-2xl p-5 text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
            Для приёма оплаты на витрине нужен подключённый Kaspi Pay Кассир.{' '}
            <a href="/profile/kaspi-pay" className="font-semibold" style={{ color: 'var(--nav-accent)' }}>Подключить →</a>
          </div>
        ) : (
          <div className="nav-glass rounded-2xl p-5 space-y-4">
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Ссылка витрины</label>
              <div className="flex items-center gap-2">
                <span className="text-sm" style={{ color: 'var(--nav-text-muted)' }}>invoices.kz/shop/</span>
                <input value={slugInput} onChange={e => setSlugInput(e.target.value.toLowerCase())}
                  placeholder="my-store"
                  className="flex-1 rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)]"
                  style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
              </div>
            </div>

            {error && <div className="text-xs" style={{ color: 'var(--nav-critical)' }}>{error}</div>}

            <div className="flex items-center gap-3">
              <button onClick={() => save(!settings.published)} disabled={saving || !slugInput.trim()}
                className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
                style={{ background: settings.published ? 'var(--nav-critical)' : 'var(--nav-accent)', color: '#fff' }}>
                {settings.published ? 'Снять с публикации' : 'Опубликовать'}
              </button>
              {settings.published && settings.slug && (
                <button onClick={copyLink} className="text-xs font-semibold nav-glass rounded-lg px-3 py-2" style={{ color: 'var(--nav-accent)' }}>
                  {copied ? 'Скопировано ✓' : 'Скопировать ссылку'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
    </DesktopShell>
  )
}
```

- [ ] **Step 3: Run the gate**

Run: `npx tsc --noEmit` → expect clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/kaspi-shop/storefront/route.ts src/app/kaspi-shop/storefront/page.tsx
git status --short
git commit -m "feat(kaspi-shop): storefront settings page -- publish toggle + slug"
```

---

### Task 7: Seller orders — «Заказы витрины» + nav entries

**Files:**
- Create: `src/app/api/kaspi-shop/storefront-orders/route.ts`
- Create: `src/app/kaspi-shop/storefront-orders/page.tsx`
- Modify: `src/components/SiteNav.tsx`

**Interfaces:**
- Consumes: none new — direct Supabase reads scoped to the caller's own `kaspi_shop_connections`.
- Produces: `GET /api/kaspi-shop/storefront-orders` → `{orders: {id, productName, price, buyerName, buyerPhone, buyerAddress, status, createdAt}[]}`.

- [ ] **Step 1: Create `src/app/api/kaspi-shop/storefront-orders/route.ts`** — full file:

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

// Across ALL of the caller's stores (not just the currently active one) --
// a seller who switches active stores must still see every past storefront
// order, same reasoning as why publish state itself isn't tied to is_active.
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: connections, error: connError } = await supabase
    .from('kaspi_shop_connections')
    .select('id')
    .eq('user_id', user.id)
  if (connError) return NextResponse.json({ error: connError.message }, { status: 500 })
  const connectionIds = (connections || []).map(c => c.id)
  if (connectionIds.length === 0) return NextResponse.json({ orders: [] })

  const { data: rows, error: ordersError } = await supabase
    .from('kaspi_shop_orders')
    .select('id, product_name, price, buyer_name, buyer_phone, buyer_address, status, created_at')
    .in('connection_id', connectionIds)
    .order('created_at', { ascending: false })
  if (ordersError) return NextResponse.json({ error: ordersError.message }, { status: 500 })

  const orders = (rows || []).map(r => ({
    id: r.id,
    productName: r.product_name,
    price: Number(r.price),
    buyerName: r.buyer_name,
    buyerPhone: r.buyer_phone,
    buyerAddress: r.buyer_address,
    status: r.status,
    createdAt: r.created_at,
  }))
  return NextResponse.json({ orders })
}
```

- [ ] **Step 2: Create `src/app/kaspi-shop/storefront-orders/page.tsx`** — full file:

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'

const EASE = [0.16, 1, 0.3, 1] as const

type Order = {
  id: string; productName: string; price: number
  buyerName: string; buyerPhone: string; buyerAddress: string
  status: string; createdAt: string
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending_payment: { label: 'Ждёт оплаты', color: 'var(--nav-text-muted)' },
  paid: { label: 'Оплачен', color: 'var(--nav-success)' },
  expired: { label: 'Истёк', color: 'var(--nav-critical)' },
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-KZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('ru-KZ').format(price) + ' ₸'
}

export default function KaspiShopStorefrontOrders() {
  const router = useRouter()
  const reduceMotion = !!useReducedMotion()
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: { session } } = await supabase.auth.getSession()
      const headers = { 'Authorization': `Bearer ${session?.access_token}` }
      const res = await fetch('/api/kaspi-shop/storefront-orders', { headers })
      if (res.ok) {
        const data = await res.json()
        setOrders(Array.isArray(data.orders) ? data.orders : [])
      }
      setLoading(false)
    }
    load()
  }, [router])

  if (loading) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загрузка…</div>
    </main>
    </DesktopShell>
  )

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-4xl mx-auto p-4 lg:p-6 pb-24 lg:pb-6">
        <motion.div
          className="mb-6"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <h1 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>Заказы витрины</h1>
          <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Заказы, оформленные напрямую через вашу витрину</p>
        </motion.div>

        {orders.length === 0 ? (
          <div className="text-sm text-center py-16" style={{ color: 'var(--nav-text-muted)' }}>Пока нет заказов с витрины</div>
        ) : (
          <div className="space-y-2">
            {orders.map((o, i) => {
              const status = STATUS_LABEL[o.status] || STATUS_LABEL.pending_payment
              return (
                <motion.div
                  key={o.id}
                  initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : Math.min(i * 0.03, 0.3) }}
                  className="nav-glass rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap"
                >
                  <div>
                    <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{o.productName} — {formatPrice(o.price)}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--nav-text-secondary)' }}>{o.buyerName} · {o.buyerPhone} · {o.buyerAddress}</div>
                    <div className="text-[11px] mt-1" style={{ color: 'var(--nav-text-muted)' }}>{formatDate(o.createdAt)}</div>
                  </div>
                  <span className="text-xs font-bold" style={{ color: status.color }}>{status.label}</span>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </main>
    </DesktopShell>
  )
}
```

- [ ] **Step 3: Add nav entries** — modify `src/components/SiteNav.tsx`'s `kaspiShopLinks` array (`src/components/SiteNav.tsx:31-44`):

```ts
const kaspiShopLinks: { href: string; label: LocalizedLabel }[] = [
  { href: '/kaspi-shop', label: { ru: 'Демпинг', kk: 'Демпинг', en: 'Repricer' } },
  { href: '/kaspi-shop/orders', label: { ru: 'Заказы', kk: 'Тапсырыстар', en: 'Orders' } },
  { href: '/kaspi-shop/storefront', label: { ru: 'Витрина', kk: 'Витрина', en: 'Storefront' } },
  { href: '/kaspi-shop/storefront-orders', label: { ru: 'Заказы витрины', kk: 'Витрина тапсырыстары', en: 'Storefront orders' } },
  { href: '/kaspi-shop/refunds', label: { ru: 'Возвраты', kk: 'Қайтарулар', en: 'Refunds' } },
  { href: '/kaspi-shop/finance', label: { ru: 'Финансы', kk: 'Қаржы', en: 'Finance' } },
  { href: '/kaspi-shop/pending-products', label: { ru: 'Нераспознанные товары', kk: 'Танылмаған тауарлар', en: 'Unmatched products' } },
  { href: '/kaspi-shop/removed', label: { ru: 'Управление товарами', kk: 'Тауарларды басқару', en: 'Product management' } },
  { href: '/kaspi-shop/niches', label: { ru: 'Ниши', kk: 'Нишалар', en: 'Niches' } },
  { href: '/kaspi-shop/profit', label: { ru: 'Прибыль', kk: 'Пайда', en: 'Profit' } },
  { href: '/kaspi-shop/margin', label: { ru: 'Калькулятор маржи', kk: 'Маржа калькуляторы', en: 'Margin calculator' } },
  { href: '/kaspi-shop/reviews', label: { ru: 'Отзывы', kk: 'Пікірлер', en: 'Reviews' } },
  { href: '/kaspi-shop/quality', label: { ru: 'Качество', kk: 'Сапа', en: 'Quality' } },
  { href: '/kaspi-shop/nkt', label: { ru: 'Каталог НКТ', kk: 'ҰТК каталогы', en: 'NKT catalog' } },
]
```

(Only the two new lines after `/kaspi-shop/orders` are additions — every other line is unchanged, reproduced here so the diff target is unambiguous.)

- [ ] **Step 4: Run the gate**

Run: `npx tsc --noEmit` → expect clean.
Run: `npx vitest run` → expect all pass.

- [ ] **Step 5: Commit**

Stage exactly these files (check `git status --short` first — this file is also touched by a concurrently-running parallel session in this repo; never `git add -A`):

```bash
git add src/app/api/kaspi-shop/storefront-orders/route.ts src/app/kaspi-shop/storefront-orders/page.tsx src/components/SiteNav.tsx
git status --short
git commit -m "feat(kaspi-shop): Заказы витрины page + nav entries for storefront"
```

---

### Task 8: Ship

**Files:** none (verification only).

- [ ] **Step 1:** Full gate: `npx vitest run`, `npx tsc --noEmit`, `npm run build` — all clean.
- [ ] **Step 2:** `git pull --rebase --autostash` (a parallel session may have pushed, especially given `SiteNav.tsx` is shared), then `git push origin main`.
- [ ] **Step 3:** Confirm the Vercel deployment for the pushed commit(s) reaches READY (targeted `get_deployment` check, not a broad list).
- [ ] **Step 4: Founder live-test script** (hand to user):
  1. Open `/kaspi-shop/storefront` — if Kaspi Pay Кассир isn't connected, confirm the prompt to connect it appears instead of the publish toggle.
  2. Set a slug, click «Опубликовать» — confirm success and the copy-link button appears.
  3. Open the copied `/shop/{slug}` link in a private/incognito window — confirm products with `enabled=true` and stock appear, disabled/zero-stock ones don't.
  4. Click «Купить» on a product, fill in name/phone/address, submit — confirm a Kaspi Pay QR appears.
  5. Pay it with a real Kaspi Pay app — confirm the storefront page shows "Заказ оплачен" within ~5–10 seconds (live poll), with no manual refresh.
  6. Open `/kaspi-shop/storefront-orders` — confirm the just-placed order appears with status «Оплачен» and the correct buyer name/phone/address.
  7. Switch active store via the store switcher, then reopen the original `/shop/{slug}` link — confirm it still resolves to the same storefront (not affected by which store is "active").

## Self-Review (done at write time)

- **Spec coverage:** migration incl. the shop-order pending-payment race index the spec didn't spell out but the architecture requires (T1); pure product filter + settings/resolve/products helpers (T2); settlement extended via one new branch, new mint/rate-limit/race-safe payment helper mirroring the invoice path (T3); public catalog/order/poll API (T4); public checkout page with buyer form → QR → live-poll (T5); seller publish/slug settings gated on Kaspi Pay Кассир being connected (T6); seller orders list scoped across all their connections, nav entries (T7); live-test script covering the full loop including the "switching active store doesn't break the link" invariant (T8). Out-of-scope items from the spec (photos, fulfillment status, multiple storefronts, custom design) have no tasks — correct.
- **Placeholder scan:** none found — every step has complete, runnable code.
- **Type consistency:** `StorefrontProduct`/`StorefrontSettings` (T2) used identically in T4/T6's routes and T5/T6/T7's pages. `SettleableRequest`'s new `shop_order_id` field (T3) is read consistently by `checkAndSettleKaspiPayment` and produced consistently by `shopOrderPayment.ts`'s `SETTLEABLE_COLUMNS`. `getOrCreateKaspiPaymentForShopOrder`'s `order.connectionOwnerId` parameter name matches exactly between its definition (T3) and both call sites (T4's order/order-status routes).
