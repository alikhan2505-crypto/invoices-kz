# Оптовая витрина (лендинг + каталог моделей) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a gifts.ru-style public wholesale site to Kaspi Bot's existing Витрина — a landing page (company history/capacity/annual volume), a catalog of sewn-goods models with a size×color variant grid and per-variant stock (or "order custom tailoring" when out of stock), a cart, and checkout that creates a real invoices.kz счёт (reusing the existing `/view/[token]` payment page — bank details + Kaspi Cashier — with zero new payment code).

**Architecture:** Extends the existing Витрина (`src/lib/kaspiShop/storefront.ts`, `kaspi_shop_connections`, `kaspi_shop_storefront_categories`) rather than building a separate site. Models/variants are a brand-new, independent catalog (`kaspi_shop_storefront_models` / `kaspi_shop_storefront_model_variants`) unrelated to `kaspi_shop_tracked_products`. Checkout mirrors the canonical server-side invoice-creation path already used by `cron/recurring/route.ts` and `invoiceSend.ts`: RPC `claim_invoice_number` + `insert` into `invoices`, then redirect to `/view/[token]`.

**Tech Stack:** Next.js App Router, Supabase (Postgres + service-role client), Vitest, Resend (email), TypeScript.

## Global Constraints

- Design doc: `docs/superpowers/specs/2026-09-14-wholesale-storefront-design.md` — every task below traces back to a section of it.
- New DB objects get Row Level Security enabled with **no public policies** — every read/write goes through service-role API routes, matching `kaspi_shop_custom_products`/`kaspi_shop_storefront_categories`.
- **Migrations are not stored as files in this repo** (see `supabase/migrations/README.md`) — Task 1 applies SQL directly via the Supabase MCP tool, not a checked-in migration file.
- **Testing convention already established in this codebase:** pure, side-effect-free functions (e.g. `filterStorefrontProducts` in `storefront.ts`) get Vitest unit tests; thin Supabase CRUD wrappers and Next.js route handlers do not (none of the existing `kaspi-shop/storefront/*` routes have test files). This plan follows that convention — do not add route-level tests that don't match the existing pattern.
- БИН lookup autofill (`/api/bin-lookup`) requires an authenticated invoices.kz session and is out of scope for the public checkout form (an anonymous buyer has none) — the checkout form's БИН field is a plain text input, no autofill. This is a deliberate, disclosed scope trim from the design doc's "автоподтягивается по БИН" line.
- Every new/modified TypeScript file must pass `npx tsc --noEmit -p tsconfig.json` with no new errors, and `npm run build` must stay green, before that task's commit.

---

### Task 1: Database schema — model catalog + landing columns

**Files:**
- None in the repo — applied directly via Supabase.

**Interfaces:**
- Produces: tables `kaspi_shop_storefront_models`, `kaspi_shop_storefront_model_variants`; columns `kaspi_shop_connections.storefront_landing_enabled/storefront_landing_history/storefront_landing_capacity/storefront_landing_annual_volume`. Every later task in this plan reads/writes these.

- [ ] **Step 1: Apply the migration**

Call the Supabase MCP tool `mcp__claude_ai_Supabase__apply_migration` with project id `terjitbqgrjlqezyydql`, migration name `wholesale_storefront_models`, and this SQL:

```sql
create table public.kaspi_shop_storefront_models (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.kaspi_shop_connections(id) on delete cascade,
  name text not null,
  price numeric not null,
  image_url text,
  storefront_category_id uuid references public.kaspi_shop_storefront_categories(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.kaspi_shop_storefront_model_variants (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.kaspi_shop_storefront_models(id) on delete cascade,
  size text not null,
  color text not null,
  stock_count integer,
  created_at timestamptz not null default now(),
  unique (model_id, size, color)
);

alter table public.kaspi_shop_storefront_models enable row level security;
alter table public.kaspi_shop_storefront_model_variants enable row level security;

alter table public.kaspi_shop_connections
  add column storefront_landing_enabled boolean not null default false,
  add column storefront_landing_history text,
  add column storefront_landing_capacity text,
  add column storefront_landing_annual_volume text;
```

- [ ] **Step 2: Verify the schema**

Run via `mcp__claude_ai_Supabase__execute_sql` (project id `terjitbqgrjlqezyydql`):

```sql
select table_name from information_schema.tables
where table_name in ('kaspi_shop_storefront_models', 'kaspi_shop_storefront_model_variants');
```

Expected: both rows returned.

```sql
select column_name from information_schema.columns
where table_name = 'kaspi_shop_connections' and column_name like 'storefront_landing%';
```

Expected: 4 rows (`storefront_landing_enabled`, `storefront_landing_history`, `storefront_landing_capacity`, `storefront_landing_annual_volume`).

- [ ] **Step 3: No commit needed**

This task has no repo file changes — nothing to commit. Proceed to Task 2.

---

### Task 2: `wholesaleStorefront.ts` — model/variant domain module

**Files:**
- Create: `src/lib/kaspiShop/wholesaleStorefront.ts`
- Test: `src/lib/kaspiShop/wholesaleStorefront.test.ts`

**Interfaces:**
- Consumes: Supabase service-role client (same pattern as `src/lib/kaspiShop/storefront.ts`).
- Produces (used by Tasks 3, 4, 6, 7):
  - `interface WholesaleVariant { id: string; size: string; color: string; stockCount: number | null }`
  - `interface WholesaleModel { id: string; name: string; price: number; imageUrl: string | null; categoryId: string | null; variants: WholesaleVariant[] }`
  - `function buildWholesaleModels(modelRows, variantRows): WholesaleModel[]` — pure
  - `interface ResolvedWholesaleLine { name: string; price: number; qty: number }`
  - `function resolveWholesaleLine(model: { id: string; name: string; price: number } | null, variant: { size: string; color: string } | null, qty: number): ResolvedWholesaleLine | null` — pure
  - `loadWholesaleModels(connectionId: string): Promise<WholesaleModel[]>`
  - `loadWholesaleModel(connectionId: string, modelId: string): Promise<WholesaleModel | null>`
  - `createWholesaleModel(connectionId: string, params: { name: string; price: number; imageUrl: string | null; categoryId: string | null }): Promise<WholesaleModel>`
  - `updateWholesaleModel(connectionId: string, modelId: string, params: Partial<{ name: string; price: number; imageUrl: string | null; categoryId: string | null }>): Promise<boolean>`
  - `deleteWholesaleModel(connectionId: string, modelId: string): Promise<boolean>`
  - `createWholesaleVariant(connectionId: string, modelId: string, params: { size: string; color: string; stockCount: number | null }): Promise<WholesaleVariant | null>`
  - `updateWholesaleVariant(connectionId: string, modelId: string, variantId: string, params: Partial<{ size: string; color: string; stockCount: number | null }>): Promise<boolean>`
  - `deleteWholesaleVariant(connectionId: string, modelId: string, variantId: string): Promise<boolean>`
  - `loadWholesaleModelByVariant(connectionId: string, modelId: string, size: string, color: string): Promise<{ model: { id: string; name: string; price: number }; variant: { size: string; color: string } } | null>`

- [ ] **Step 1: Write the failing tests for the two pure functions**

Create `src/lib/kaspiShop/wholesaleStorefront.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildWholesaleModels, resolveWholesaleLine } from './wholesaleStorefront'

describe('buildWholesaleModels', () => {
  it('nests each model\'s variants under it, ignoring variants for other models', () => {
    const models = [
      { id: 'm1', name: 'Лонгслив Long01', price: '4200', image_url: '/img1.jpg', storefront_category_id: 'cat1' },
      { id: 'm2', name: 'Шапка Yong', price: '2500', image_url: null, storefront_category_id: null },
    ]
    const variants = [
      { id: 'v1', model_id: 'm1', size: 'M', color: 'тёмно-синий', stock_count: 5 },
      { id: 'v2', model_id: 'm1', size: 'L', color: 'тёмно-синий', stock_count: 0 },
      { id: 'v3', model_id: 'm2', size: '56-60', color: 'серый', stock_count: null },
    ]
    const result = buildWholesaleModels(models, variants)
    expect(result).toEqual([
      {
        id: 'm1', name: 'Лонгслив Long01', price: 4200, imageUrl: '/img1.jpg', categoryId: 'cat1',
        variants: [
          { id: 'v1', size: 'M', color: 'тёмно-синий', stockCount: 5 },
          { id: 'v2', size: 'L', color: 'тёмно-синий', stockCount: 0 },
        ],
      },
      {
        id: 'm2', name: 'Шапка Yong', price: 2500, imageUrl: null, categoryId: null,
        variants: [{ id: 'v3', size: '56-60', color: 'серый', stockCount: null }],
      },
    ])
  })

  it('returns a model with an empty variants array when it has none', () => {
    const result = buildWholesaleModels(
      [{ id: 'm1', name: 'Без вариантов', price: '1000', image_url: null, storefront_category_id: null }],
      []
    )
    expect(result).toEqual([{ id: 'm1', name: 'Без вариантов', price: 1000, imageUrl: null, categoryId: null, variants: [] }])
  })
})

describe('resolveWholesaleLine', () => {
  const model = { id: 'm1', name: 'Лонгслив Long01', price: 4200 }
  const variant = { size: 'M', color: 'тёмно-синий' }

  it('resolves a valid model+variant+qty into a priced line with size/color baked into the name', () => {
    const result = resolveWholesaleLine(model, variant, 2)
    expect(result).toEqual({ name: 'Лонгслив Long01, тёмно-синий, M', price: 4200, qty: 2 })
  })

  it('resolves the same way regardless of variant stock -- zero/null stock is "order tailoring", not a block', () => {
    // resolveWholesaleLine takes only size/color, never stockCount, so a
    // zero-stock variant resolves identically -- the caller decided it was
    // orderable (a real variant row exists) before calling this.
    const result = resolveWholesaleLine(model, variant, 1)
    expect(result?.price).toBe(4200)
  })

  it('returns null when the model is missing', () => {
    expect(resolveWholesaleLine(null, variant, 1)).toBeNull()
  })

  it('returns null when the variant is missing (buyer sent a size/color combo the seller never defined)', () => {
    expect(resolveWholesaleLine(model, null, 1)).toBeNull()
  })

  it('returns null for a non-positive quantity', () => {
    expect(resolveWholesaleLine(model, variant, 0)).toBeNull()
    expect(resolveWholesaleLine(model, variant, -1)).toBeNull()
  })

  it('returns null when the model price is not positive (defensive -- a real row is always priced)', () => {
    expect(resolveWholesaleLine({ ...model, price: 0 }, variant, 1)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/kaspiShop/wholesaleStorefront.test.ts`
Expected: FAIL — `Cannot find module './wholesaleStorefront'` (the file doesn't exist yet).

- [ ] **Step 3: Write the module — pure functions first, then the Supabase CRUD wrappers**

Create `src/lib/kaspiShop/wholesaleStorefront.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Independent catalog: gifts.ru-style wholesale sewn-goods models with a
// size×color variant grid, unrelated to kaspi_shop_tracked_products (Kaspi
// marketplace resale) or kaspi_shop_custom_products (the flat Витрина
// catalog). See docs/superpowers/specs/2026-09-14-wholesale-storefront-design.md.

export interface WholesaleVariant {
  id: string
  size: string
  color: string
  stockCount: number | null
}

export interface WholesaleModel {
  id: string
  name: string
  price: number
  imageUrl: string | null
  categoryId: string | null
  variants: WholesaleVariant[]
}

interface ModelRow { id: string; name: string; price: number | string; image_url: string | null; storefront_category_id: string | null }
interface VariantRow { id: string; model_id: string; size: string; color: string; stock_count: number | null }

// Pure -- no I/O. Nests each model's own variants under it. A model with no
// variant rows yet still comes back with an empty variants array (not
// dropped) so the admin UI can show "нет вариантов" instead of a missing card.
export function buildWholesaleModels(modelRows: ModelRow[], variantRows: VariantRow[]): WholesaleModel[] {
  return modelRows.map(m => ({
    id: m.id,
    name: String(m.name || '').trim(),
    price: Number(m.price) || 0,
    imageUrl: m.image_url,
    categoryId: m.storefront_category_id,
    variants: variantRows
      .filter(v => v.model_id === m.id)
      .map(v => ({ id: v.id, size: v.size, color: v.color, stockCount: v.stock_count })),
  }))
}

export interface ResolvedWholesaleLine { name: string; price: number; qty: number }

// Pure -- no I/O. Turns one cart line (a model + a specific size/color the
// buyer picked) into a priced счёт line, or null if it can't be fulfilled.
// stockCount is deliberately NOT a parameter: whether a size/color combo has
// stock only decides the public UI's "В корзину" vs "Оформить пошив на
// заказ" label -- both add the SAME line to the cart, and both are valid at
// checkout as long as a real variant row exists (see the design doc's
// "заказ на пошив" note). The caller is responsible for having already
// looked up a real variant row before calling this -- a null variant here
// means the buyer's request doesn't match any size/color the seller ever
// defined for this model, which is the only case that gets rejected.
export function resolveWholesaleLine(
  model: { id: string; name: string; price: number } | null,
  variant: { size: string; color: string } | null,
  qty: number
): ResolvedWholesaleLine | null {
  if (!model || !variant || !Number.isFinite(qty) || qty <= 0) return null
  if (model.price <= 0) return null
  return { name: `${model.name}, ${variant.color}, ${variant.size}`, price: model.price, qty }
}

export async function loadWholesaleModels(connectionId: string): Promise<WholesaleModel[]> {
  const { data: modelRows, error: modelsError } = await supabase
    .from('kaspi_shop_storefront_models')
    .select('id, name, price, image_url, storefront_category_id')
    .eq('connection_id', connectionId)
    .order('created_at', { ascending: false })
  if (modelsError) throw new Error(`kaspi_shop_storefront_models lookup failed for connection ${connectionId}: ${modelsError.message}`)
  const modelIds = (modelRows || []).map(m => m.id)
  if (modelIds.length === 0) return []

  const { data: variantRows, error: variantsError } = await supabase
    .from('kaspi_shop_storefront_model_variants')
    .select('id, model_id, size, color, stock_count')
    .in('model_id', modelIds)
  if (variantsError) throw new Error(`kaspi_shop_storefront_model_variants lookup failed for connection ${connectionId}: ${variantsError.message}`)

  return buildWholesaleModels(modelRows || [], variantRows || [])
}

export async function loadWholesaleModel(connectionId: string, modelId: string): Promise<WholesaleModel | null> {
  const { data: modelRow, error: modelError } = await supabase
    .from('kaspi_shop_storefront_models')
    .select('id, name, price, image_url, storefront_category_id')
    .eq('id', modelId)
    .eq('connection_id', connectionId)
    .maybeSingle()
  if (modelError) throw new Error(`kaspi_shop_storefront_models lookup failed for model ${modelId}: ${modelError.message}`)
  if (!modelRow) return null

  const { data: variantRows, error: variantsError } = await supabase
    .from('kaspi_shop_storefront_model_variants')
    .select('id, model_id, size, color, stock_count')
    .eq('model_id', modelId)
  if (variantsError) throw new Error(`kaspi_shop_storefront_model_variants lookup failed for model ${modelId}: ${variantsError.message}`)

  return buildWholesaleModels([modelRow], variantRows || [])[0]
}

export async function createWholesaleModel(
  connectionId: string,
  params: { name: string; price: number; imageUrl: string | null; categoryId: string | null }
): Promise<WholesaleModel> {
  const { data, error } = await supabase
    .from('kaspi_shop_storefront_models')
    .insert({
      connection_id: connectionId,
      name: params.name,
      price: params.price,
      image_url: params.imageUrl,
      storefront_category_id: params.categoryId,
    })
    .select('id, name, price, image_url, storefront_category_id')
    .single()
  if (error) throw new Error(`kaspi_shop_storefront_models insert failed: ${error.message}`)
  return buildWholesaleModels([data], [])[0]
}

export async function updateWholesaleModel(
  connectionId: string,
  modelId: string,
  params: Partial<{ name: string; price: number; imageUrl: string | null; categoryId: string | null }>
): Promise<boolean> {
  const patch: Record<string, unknown> = {}
  if (params.name !== undefined) patch.name = params.name
  if (params.price !== undefined) patch.price = params.price
  if (params.imageUrl !== undefined) patch.image_url = params.imageUrl
  if (params.categoryId !== undefined) patch.storefront_category_id = params.categoryId

  const { data, error } = await supabase
    .from('kaspi_shop_storefront_models')
    .update(patch)
    .eq('id', modelId)
    .eq('connection_id', connectionId)
    .select('id')
  if (error) throw new Error(`kaspi_shop_storefront_models update failed: ${error.message}`)
  return !!data && data.length > 0
}

// Cascades to the model's variants via the FK's `on delete cascade`.
export async function deleteWholesaleModel(connectionId: string, modelId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('kaspi_shop_storefront_models')
    .delete()
    .eq('id', modelId)
    .eq('connection_id', connectionId)
    .select('id')
  if (error) throw new Error(`kaspi_shop_storefront_models delete failed: ${error.message}`)
  return !!data && data.length > 0
}

// The variants table has no connection_id of its own -- ownership always
// routes through the model, so every variant mutation below first confirms
// modelId belongs to connectionId (same pattern setProductCategory in
// storefront.ts uses for its own ownership check) before touching a variant row.
async function modelBelongsToConnection(connectionId: string, modelId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('kaspi_shop_storefront_models')
    .select('id')
    .eq('id', modelId)
    .eq('connection_id', connectionId)
    .maybeSingle()
  if (error) throw new Error(`kaspi_shop_storefront_models ownership check failed: ${error.message}`)
  return !!data
}

export async function createWholesaleVariant(
  connectionId: string,
  modelId: string,
  params: { size: string; color: string; stockCount: number | null }
): Promise<WholesaleVariant | null> {
  if (!(await modelBelongsToConnection(connectionId, modelId))) return null
  const { data, error } = await supabase
    .from('kaspi_shop_storefront_model_variants')
    .insert({ model_id: modelId, size: params.size, color: params.color, stock_count: params.stockCount })
    .select('id, size, color, stock_count')
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('duplicate_variant')
    throw new Error(`kaspi_shop_storefront_model_variants insert failed: ${error.message}`)
  }
  return { id: data.id, size: data.size, color: data.color, stockCount: data.stock_count }
}

export async function updateWholesaleVariant(
  connectionId: string,
  modelId: string,
  variantId: string,
  params: Partial<{ size: string; color: string; stockCount: number | null }>
): Promise<boolean> {
  if (!(await modelBelongsToConnection(connectionId, modelId))) return false
  const patch: Record<string, unknown> = {}
  if (params.size !== undefined) patch.size = params.size
  if (params.color !== undefined) patch.color = params.color
  if (params.stockCount !== undefined) patch.stock_count = params.stockCount

  const { data, error } = await supabase
    .from('kaspi_shop_storefront_model_variants')
    .update(patch)
    .eq('id', variantId)
    .eq('model_id', modelId)
    .select('id')
  if (error) {
    if (error.code === '23505') throw new Error('duplicate_variant')
    throw new Error(`kaspi_shop_storefront_model_variants update failed: ${error.message}`)
  }
  return !!data && data.length > 0
}

export async function deleteWholesaleVariant(connectionId: string, modelId: string, variantId: string): Promise<boolean> {
  if (!(await modelBelongsToConnection(connectionId, modelId))) return false
  const { data, error } = await supabase
    .from('kaspi_shop_storefront_model_variants')
    .delete()
    .eq('id', variantId)
    .eq('model_id', modelId)
    .select('id')
  if (error) throw new Error(`kaspi_shop_storefront_model_variants delete failed: ${error.message}`)
  return !!data && data.length > 0
}

// The public checkout's own lookup: one model + the exact size/color the
// buyer picked, scoped to the SELLER's connection (never trust a modelId
// from an anonymous POST body without this). Returns null if the model
// doesn't exist for this connection, or if this size/color combination was
// never defined -- resolveWholesaleLine turns either into a rejected line.
export async function loadWholesaleModelByVariant(
  connectionId: string,
  modelId: string,
  size: string,
  color: string
): Promise<{ model: { id: string; name: string; price: number }; variant: { size: string; color: string } } | null> {
  const { data: modelRow, error: modelError } = await supabase
    .from('kaspi_shop_storefront_models')
    .select('id, name, price')
    .eq('id', modelId)
    .eq('connection_id', connectionId)
    .maybeSingle()
  if (modelError) throw new Error(`kaspi_shop_storefront_models lookup failed for model ${modelId}: ${modelError.message}`)
  if (!modelRow) return null

  const { data: variantRow, error: variantError } = await supabase
    .from('kaspi_shop_storefront_model_variants')
    .select('size, color')
    .eq('model_id', modelId)
    .eq('size', size)
    .eq('color', color)
    .maybeSingle()
  if (variantError) throw new Error(`kaspi_shop_storefront_model_variants lookup failed for model ${modelId}: ${variantError.message}`)
  if (!variantRow) return null

  return {
    model: { id: modelRow.id, name: String(modelRow.name || '').trim(), price: Number(modelRow.price) || 0 },
    variant: { size: variantRow.size, color: variantRow.color },
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/kaspiShop/wholesaleStorefront.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors mentioning `wholesaleStorefront`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/kaspiShop/wholesaleStorefront.ts src/lib/kaspiShop/wholesaleStorefront.test.ts
git commit -m "feat(kaspi-shop): wholesale model/variant catalog domain module"
```

---

### Task 3: Admin API — models CRUD routes

**Files:**
- Create: `src/app/api/kaspi-shop/storefront/models/route.ts`
- Create: `src/app/api/kaspi-shop/storefront/models/[id]/route.ts`

**Interfaces:**
- Consumes: `loadStorefrontSettings` (`@/lib/kaspiShop/storefront`), `loadWholesaleModels`/`createWholesaleModel`/`updateWholesaleModel`/`deleteWholesaleModel` (`@/lib/kaspiShop/wholesaleStorefront`, Task 2).
- Produces: `GET/POST /api/kaspi-shop/storefront/models`, `PATCH/DELETE /api/kaspi-shop/storefront/models/[id]` — consumed by Task 8 (admin UI).

- [ ] **Step 1: Write the list+create route**

Create `src/app/api/kaspi-shop/storefront/models/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadStorefrontSettings } from '@/lib/kaspiShop/storefront'
import { loadWholesaleModels, createWholesaleModel } from '@/lib/kaspiShop/wholesaleStorefront'

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

// Витрина → Модели: lists every wholesale model (with its variants) for the
// admin table. Separate from GET /api/kaspi-shop/storefront/catalog (Kaspi +
// custom products) -- this is an entirely independent catalog.
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await loadStorefrontSettings(user.id)
  if (!settings) return NextResponse.json({ error: 'no_connection' }, { status: 404 })

  const models = await loadWholesaleModels(settings.connectionId)
  return NextResponse.json({ models })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await loadStorefrontSettings(user.id)
  if (!settings) return NextResponse.json({ error: 'no_connection' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const price = Number(body?.price)
  const imageUrl = typeof body?.imageUrl === 'string' && body.imageUrl.trim() ? body.imageUrl.trim() : null
  const categoryId = typeof body?.categoryId === 'string' && body.categoryId ? body.categoryId : null
  if (!name) return NextResponse.json({ error: 'Укажите название' }, { status: 400 })
  if (!Number.isFinite(price) || price <= 0) return NextResponse.json({ error: 'Укажите цену' }, { status: 400 })

  const model = await createWholesaleModel(settings.connectionId, { name, price, imageUrl, categoryId })
  return NextResponse.json({ model })
}
```

- [ ] **Step 2: Write the update+delete route**

Create `src/app/api/kaspi-shop/storefront/models/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadStorefrontSettings } from '@/lib/kaspiShop/storefront'
import { updateWholesaleModel, deleteWholesaleModel } from '@/lib/kaspiShop/wholesaleStorefront'

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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await loadStorefrontSettings(user.id)
  if (!settings) return NextResponse.json({ error: 'no_connection' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const patch: Parameters<typeof updateWholesaleModel>[2] = {}
  if (typeof body?.name === 'string') {
    const name = body.name.trim()
    if (!name) return NextResponse.json({ error: 'Укажите название' }, { status: 400 })
    patch.name = name
  }
  if (body?.price !== undefined) {
    const price = Number(body.price)
    if (!Number.isFinite(price) || price <= 0) return NextResponse.json({ error: 'Укажите цену' }, { status: 400 })
    patch.price = price
  }
  if (body?.imageUrl !== undefined) patch.imageUrl = typeof body.imageUrl === 'string' && body.imageUrl.trim() ? body.imageUrl.trim() : null
  if (body?.categoryId !== undefined) patch.categoryId = typeof body.categoryId === 'string' && body.categoryId ? body.categoryId : null

  const updated = await updateWholesaleModel(settings.connectionId, id, patch)
  if (!updated) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await loadStorefrontSettings(user.id)
  if (!settings) return NextResponse.json({ error: 'no_connection' }, { status: 404 })

  const deleted = await deleteWholesaleModel(settings.connectionId, id)
  if (!deleted) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.json` — expected no new errors.
Run: `npm run build` — expected success, both new routes listed in the route table.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/kaspi-shop/storefront/models/route.ts src/app/api/kaspi-shop/storefront/models/[id]/route.ts
git commit -m "feat(kaspi-shop): admin CRUD routes for wholesale models"
```

---

### Task 4: Admin API — variants CRUD routes

**Files:**
- Create: `src/app/api/kaspi-shop/storefront/models/[id]/variants/route.ts`
- Create: `src/app/api/kaspi-shop/storefront/models/[id]/variants/[variantId]/route.ts`

**Interfaces:**
- Consumes: `loadStorefrontSettings`, `createWholesaleVariant`/`updateWholesaleVariant`/`deleteWholesaleVariant` (Task 2).
- Produces: `POST /api/kaspi-shop/storefront/models/[id]/variants`, `PATCH/DELETE /api/kaspi-shop/storefront/models/[id]/variants/[variantId]` — consumed by Task 8.

- [ ] **Step 1: Write the create-variant route**

Create `src/app/api/kaspi-shop/storefront/models/[id]/variants/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadStorefrontSettings } from '@/lib/kaspiShop/storefront'
import { createWholesaleVariant } from '@/lib/kaspiShop/wholesaleStorefront'

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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: modelId } = await params
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await loadStorefrontSettings(user.id)
  if (!settings) return NextResponse.json({ error: 'no_connection' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const size = typeof body?.size === 'string' ? body.size.trim() : ''
  const color = typeof body?.color === 'string' ? body.color.trim() : ''
  const stockCount = body?.stockCount === null || body?.stockCount === undefined || body?.stockCount === ''
    ? null
    : Number(body.stockCount)
  if (!size) return NextResponse.json({ error: 'Укажите размер' }, { status: 400 })
  if (!color) return NextResponse.json({ error: 'Укажите цвет' }, { status: 400 })
  if (stockCount !== null && (!Number.isFinite(stockCount) || stockCount < 0)) {
    return NextResponse.json({ error: 'Некорректный остаток' }, { status: 400 })
  }

  try {
    const variant = await createWholesaleVariant(settings.connectionId, modelId, { size, color, stockCount })
    if (!variant) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return NextResponse.json({ variant })
  } catch (e: any) {
    if (e.message === 'duplicate_variant') return NextResponse.json({ error: 'Такое сочетание размер+цвет уже есть' }, { status: 400 })
    throw e
  }
}
```

- [ ] **Step 2: Write the update+delete-variant route**

Create `src/app/api/kaspi-shop/storefront/models/[id]/variants/[variantId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadStorefrontSettings } from '@/lib/kaspiShop/storefront'
import { updateWholesaleVariant, deleteWholesaleVariant } from '@/lib/kaspiShop/wholesaleStorefront'

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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; variantId: string }> }) {
  const { id: modelId, variantId } = await params
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await loadStorefrontSettings(user.id)
  if (!settings) return NextResponse.json({ error: 'no_connection' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const patch: Parameters<typeof updateWholesaleVariant>[3] = {}
  if (typeof body?.size === 'string') {
    const size = body.size.trim()
    if (!size) return NextResponse.json({ error: 'Укажите размер' }, { status: 400 })
    patch.size = size
  }
  if (typeof body?.color === 'string') {
    const color = body.color.trim()
    if (!color) return NextResponse.json({ error: 'Укажите цвет' }, { status: 400 })
    patch.color = color
  }
  if (body?.stockCount !== undefined) {
    const stockCount = body.stockCount === null || body.stockCount === '' ? null : Number(body.stockCount)
    if (stockCount !== null && (!Number.isFinite(stockCount) || stockCount < 0)) {
      return NextResponse.json({ error: 'Некорректный остаток' }, { status: 400 })
    }
    patch.stockCount = stockCount
  }

  try {
    const updated = await updateWholesaleVariant(settings.connectionId, modelId, variantId, patch)
    if (!updated) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e.message === 'duplicate_variant') return NextResponse.json({ error: 'Такое сочетание размер+цвет уже есть' }, { status: 400 })
    throw e
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; variantId: string }> }) {
  const { id: modelId, variantId } = await params
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await loadStorefrontSettings(user.id)
  if (!settings) return NextResponse.json({ error: 'no_connection' }, { status: 404 })

  const deleted = await deleteWholesaleVariant(settings.connectionId, modelId, variantId)
  if (!deleted) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.json` — expected no new errors.
Run: `npm run build` — expected success.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/kaspi-shop/storefront/models/[id]/variants"
git commit -m "feat(kaspi-shop): admin CRUD routes for wholesale model variants"
```

---

### Task 5: Landing content — settings, appearance route, save function

**Files:**
- Modify: `src/lib/kaspiShop/storefront.ts`
- Modify: `src/app/api/kaspi-shop/storefront/appearance/route.ts`

**Interfaces:**
- Modifies `StorefrontSettings` (adds `landingEnabled: boolean; landingHistory: string | null; landingCapacity: string | null; landingAnnualVolume: string | null`) and `saveStorefrontAppearance`'s params — consumed by Task 6 (public GET), Task 9 (admin UI), and the already-existing `GET /api/kaspi-shop/storefront` route (which spreads `...settings`, needs no code change).

- [ ] **Step 1: Extend `loadStorefrontSettings` and its interface**

In `src/lib/kaspiShop/storefront.ts`, replace the `StorefrontSettings` interface and `loadStorefrontSettings`:

```typescript
export interface StorefrontSettings {
  connectionId: string
  companyName: string
  slug: string | null
  published: boolean
  backgroundColor: string | null
  deliveryInfo: string | null
  chatWidgetEnabled: boolean
  landingEnabled: boolean
  landingHistory: string | null
  landingCapacity: string | null
  landingAnnualVolume: string | null
}
```

```typescript
export async function loadStorefrontSettings(userId: string): Promise<StorefrontSettings | null> {
  const { data, error } = await supabase
    .from('kaspi_shop_connections')
    .select('id, company_name, storefront_slug, storefront_published, storefront_background_color, storefront_delivery_info, storefront_chat_widget_enabled, storefront_landing_enabled, storefront_landing_history, storefront_landing_capacity, storefront_landing_annual_volume')
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
    backgroundColor: data.storefront_background_color,
    deliveryInfo: data.storefront_delivery_info,
    chatWidgetEnabled: data.storefront_chat_widget_enabled,
    landingEnabled: data.storefront_landing_enabled,
    landingHistory: data.storefront_landing_history,
    landingCapacity: data.storefront_landing_capacity,
    landingAnnualVolume: data.storefront_landing_annual_volume,
  }
}
```

- [ ] **Step 2: Extend `saveStorefrontAppearance`**

In `src/lib/kaspiShop/storefront.ts`, replace `saveStorefrontAppearance`:

```typescript
export async function saveStorefrontAppearance(
  userId: string,
  connectionId: string,
  params: {
    backgroundColor: string | null
    deliveryInfo: string
    chatWidgetEnabled: boolean
    landingEnabled: boolean
    landingHistory: string
    landingCapacity: string
    landingAnnualVolume: string
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (params.backgroundColor !== null && !(STOREFRONT_BACKGROUND_PRESETS as readonly string[]).includes(params.backgroundColor)) {
    return { ok: false, error: 'invalid_background' }
  }
  if (params.chatWidgetEnabled && !(await loadWebsiteWidgetKey(userId))) {
    return { ok: false, error: 'widget_not_connected' }
  }

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
    .update({
      storefront_background_color: params.backgroundColor,
      storefront_delivery_info: params.deliveryInfo.trim() || null,
      storefront_chat_widget_enabled: params.chatWidgetEnabled,
      storefront_landing_enabled: params.landingEnabled,
      storefront_landing_history: params.landingHistory.trim() || null,
      storefront_landing_capacity: params.landingCapacity.trim() || null,
      storefront_landing_annual_volume: params.landingAnnualVolume.trim() || null,
    })
    .eq('id', connectionId)
  if (error) throw new Error(`kaspi_shop_connections appearance save failed: ${error.message}`)
  return { ok: true }
}
```

- [ ] **Step 3: Extend `resolveStorefrontBySlug`'s return shape**

The public catalog (Task 6) needs `landingEnabled`/`landingHistory`/`landingCapacity`/`landingAnnualVolume` too. In `src/lib/kaspiShop/storefront.ts`, replace `resolveStorefrontBySlug`:

```typescript
export async function resolveStorefrontBySlug(slug: string): Promise<{
  connectionId: string
  userId: string
  companyName: string
  backgroundColor: string | null
  deliveryInfo: string | null
  chatWidgetEnabled: boolean
  landingEnabled: boolean
  landingHistory: string | null
  landingCapacity: string | null
  landingAnnualVolume: string | null
} | null> {
  const { data, error } = await supabase
    .from('kaspi_shop_connections')
    .select('id, user_id, company_name, storefront_background_color, storefront_delivery_info, storefront_chat_widget_enabled, storefront_landing_enabled, storefront_landing_history, storefront_landing_capacity, storefront_landing_annual_volume')
    .eq('storefront_slug', slug)
    .eq('storefront_published', true)
    .maybeSingle()
  if (error) throw new Error(`storefront resolve by slug failed: ${error.message}`)
  return data ? {
    connectionId: data.id,
    userId: data.user_id,
    companyName: data.company_name,
    backgroundColor: data.storefront_background_color,
    deliveryInfo: data.storefront_delivery_info,
    chatWidgetEnabled: data.storefront_chat_widget_enabled,
    landingEnabled: data.storefront_landing_enabled,
    landingHistory: data.storefront_landing_history,
    landingCapacity: data.storefront_landing_capacity,
    landingAnnualVolume: data.storefront_landing_annual_volume,
  } : null
}
```

- [ ] **Step 4: Update the appearance route to pass the new fields through**

Replace the `POST` handler body in `src/app/api/kaspi-shop/storefront/appearance/route.ts`:

```typescript
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await loadStorefrontSettings(user.id)
  if (!settings) return NextResponse.json({ error: 'no_connection' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const backgroundColor = typeof body?.backgroundColor === 'string' && body.backgroundColor ? body.backgroundColor : null
  const deliveryInfo = typeof body?.deliveryInfo === 'string' ? body.deliveryInfo : ''
  const chatWidgetEnabled = !!body?.chatWidgetEnabled
  const landingEnabled = !!body?.landingEnabled
  const landingHistory = typeof body?.landingHistory === 'string' ? body.landingHistory : ''
  const landingCapacity = typeof body?.landingCapacity === 'string' ? body.landingCapacity : ''
  const landingAnnualVolume = typeof body?.landingAnnualVolume === 'string' ? body.landingAnnualVolume : ''

  const result = await saveStorefrontAppearance(user.id, settings.connectionId, {
    backgroundColor, deliveryInfo, chatWidgetEnabled, landingEnabled, landingHistory, landingCapacity, landingAnnualVolume,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
```

(The `import` line and `requireUser` helper in this file stay unchanged.)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`

Expected: this will surface every caller of `saveStorefrontAppearance` and every reader of `resolveStorefrontBySlug`'s return type that needs updating. At this point in the plan, the only caller of `saveStorefrontAppearance` is the route just edited (Step 4) and the only reader of `resolveStorefrontBySlug` is `src/app/api/shop/[slug]/route.ts` (existing, untouched — it destructures `storefront.companyName`/`backgroundColor`/etc. by name, which still all exist, so it stays green) and `src/app/api/shop/[slug]/order/route.ts` (same). Expected: no errors.

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: all existing tests still pass (no test directly exercises `saveStorefrontAppearance`/`resolveStorefrontBySlug`, per this codebase's convention of not testing thin Supabase wrappers).

- [ ] **Step 7: Commit**

```bash
git add src/lib/kaspiShop/storefront.ts src/app/api/kaspi-shop/storefront/appearance/route.ts
git commit -m "feat(kaspi-shop): landing content fields on storefront settings"
```

---

### Task 6: Public API — wholesale catalog data

**Files:**
- Create: `src/app/api/shop/[slug]/wholesale/route.ts`

**Interfaces:**
- Consumes: `resolveStorefrontBySlug` (Task 5), `loadWholesaleModels` (Task 2), `loadStorefrontCategories` (existing, `storefront.ts`).
- Produces: `GET /api/shop/[slug]/wholesale` → `{ companyName, landingEnabled, landingHistory, landingCapacity, landingAnnualVolume, models: WholesaleModel[], categories: StorefrontCategory[] }` — consumed by Tasks 11, 12, 13.

- [ ] **Step 1: Write the route**

Create `src/app/api/shop/[slug]/wholesale/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { resolveStorefrontBySlug, loadStorefrontCategories } from '@/lib/kaspiShop/storefront'
import { loadWholesaleModels } from '@/lib/kaspiShop/wholesaleStorefront'

// Public, unauthenticated -- same resolution rules as GET /api/shop/[slug]
// (resolveStorefrontBySlug's own comment: an unpublished or never-claimed
// slug resolves identically to 404). Separate endpoint from the existing
// Kaspi/custom-product one: this is the independent wholesale model catalog.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const storefront = await resolveStorefrontBySlug(slug)
  if (!storefront) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const [models, categories] = await Promise.all([
    loadWholesaleModels(storefront.connectionId),
    loadStorefrontCategories(storefront.connectionId),
  ])

  return NextResponse.json({
    companyName: storefront.companyName,
    landingEnabled: storefront.landingEnabled,
    landingHistory: storefront.landingHistory,
    landingCapacity: storefront.landingCapacity,
    landingAnnualVolume: storefront.landingAnnualVolume,
    models,
    categories,
  })
}
```

- [ ] **Step 2: Typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.json` — expected no new errors.
Run: `npm run build` — expected success, `/api/shop/[slug]/wholesale` listed.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/shop/[slug]/wholesale/route.ts"
git commit -m "feat(kaspi-shop): public wholesale catalog + landing data endpoint"
```

---

### Task 7: Public API — checkout creates a real invoice

**Files:**
- Create: `src/app/api/shop/[slug]/wholesale-order/route.ts`

**Interfaces:**
- Consumes: `resolveStorefrontBySlug` (Task 5), `loadWholesaleModelByVariant` + `resolveWholesaleLine` (Task 2), `normalizeKzPhone` (`@/lib/kaspiPay/phone`, existing).
- Produces: `POST /api/shop/[slug]/wholesale-order` → `{ publicToken }` on success — consumed by Task 10 (cart/checkout UI), which redirects the browser to `/view/{publicToken}`.

- [ ] **Step 1: Write the route**

Create `src/app/api/shop/[slug]/wholesale-order/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { resolveStorefrontBySlug } from '@/lib/kaspiShop/storefront'
import { loadWholesaleModelByVariant, resolveWholesaleLine, type ResolvedWholesaleLine } from '@/lib/kaspiShop/wholesaleStorefront'
import { normalizeKzPhone } from '@/lib/kaspiPay/phone'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const resend = new Resend(process.env.RESEND_API_KEY!)

const MAX_CART_LINES = 20
const MAX_LINE_QTY = 999
const BIN_PATTERN = /^\d{12}$/

interface CartLineInput { modelId: string; size: string; color: string; qty: number }

// Public, unauthenticated -- creates a REAL invoices.kz счёт from the cart,
// then the buyer pays it on /view/[token] exactly like any other счёт (bank
// details + Kaspi Cashier if the seller has Pro + a connected Kaspi Cashier
// -- zero payment code here). Mirrors the canonical server-side invoice path
// already used by src/app/api/cron/recurring/route.ts and
// src/lib/aiAgent/invoiceSend.ts: RPC claim_invoice_number + insert into
// invoices, public_token comes from that row's own column default.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const storefront = await resolveStorefrontBySlug(slug)
  if (!storefront) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const rawItems = Array.isArray(body?.items) ? body.items : []
  const clientName = typeof body?.clientName === 'string' ? body.clientName.trim() : ''
  const clientBin = typeof body?.clientBin === 'string' ? body.clientBin.trim() : ''
  const clientEmail = typeof body?.clientEmail === 'string' ? body.clientEmail.trim() : ''
  const clientPhone = normalizeKzPhone(typeof body?.clientPhone === 'string' ? body.clientPhone : '')

  if (!clientName) return NextResponse.json({ error: 'Укажите название компании' }, { status: 400 })
  if (!BIN_PATTERN.test(clientBin)) return NextResponse.json({ error: 'БИН должен состоять из 12 цифр' }, { status: 400 })
  if (!clientEmail || !clientEmail.includes('@')) return NextResponse.json({ error: 'Укажите email' }, { status: 400 })

  const items: CartLineInput[] = rawItems
    .filter((it: any) =>
      typeof it?.modelId === 'string' && typeof it?.size === 'string' && typeof it?.color === 'string' &&
      Number.isInteger(it?.qty) && it.qty > 0 && it.qty <= MAX_LINE_QTY
    )
    .slice(0, MAX_CART_LINES)
    .map((it: any) => ({ modelId: it.modelId, size: it.size, color: it.color, qty: it.qty }))
  if (items.length === 0) return NextResponse.json({ error: 'Корзина пуста' }, { status: 400 })

  let resolved: (ResolvedWholesaleLine | null)[]
  try {
    resolved = await Promise.all(items.map(async it => {
      const found = await loadWholesaleModelByVariant(storefront.connectionId, it.modelId, it.size, it.color)
      return resolveWholesaleLine(found?.model ?? null, found?.variant ?? null, it.qty)
    }))
  } catch (e: any) {
    console.error('wholesale-order: line resolution failed', e.message)
    return NextResponse.json({ error: 'Не удалось оформить заявку' }, { status: 500 })
  }
  // All-or-nothing, same as the existing shop/[slug]/order flow: a partially
  // resolvable cart is rejected outright rather than silently dropping lines.
  if (resolved.some(l => l === null)) {
    return NextResponse.json({ error: 'Часть товаров в корзине больше недоступна, обновите страницу' }, { status: 400 })
  }
  const lines = resolved as ResolvedWholesaleLine[]
  const total = lines.reduce((sum, l) => sum + l.price * l.qty, 0)

  const { data: invoiceNumber, error: numberError } = await supabase
    .rpc('claim_invoice_number', { p_user_id: storefront.userId })
  if (numberError) {
    console.error('wholesale-order: claim_invoice_number failed', numberError.message)
    return NextResponse.json({ error: 'Не удалось оформить заявку' }, { status: 500 })
  }

  const { data: invoice, error: insertError } = await supabase
    .from('invoices')
    .insert({
      user_id: storefront.userId,
      number: invoiceNumber,
      amount: total,
      status: 'sent',
      client_name: clientName,
      client_bin: clientBin,
      client_email: clientEmail,
      client_phone: clientPhone || null,
      services: lines,
    })
    .select('public_token')
    .single()
  if (insertError || !invoice) {
    // Same trigger + error text as /create's own client-side check
    // (enforce_invoice_limit_trigger, see supabase/migrations/README.md) --
    // the seller's own monthly счёт limit applies here too, and a buyer
    // hitting it needs a human-readable reason, not a raw Postgres error.
    if (insertError?.message.includes('invoice_limit_reached')) {
      return NextResponse.json({ error: 'Продавец временно не может выставлять новые счета в этом месяце — свяжитесь с ним напрямую' }, { status: 400 })
    }
    console.error('wholesale-order: invoice insert failed', insertError?.message)
    return NextResponse.json({ error: 'Не удалось оформить заявку' }, { status: 500 })
  }

  const publicLink = `https://invoices.kz/view/${invoice.public_token}`
  try {
    await resend.emails.send({
      from: 'invoices.kz <mail@invoices.kz>',
      to: clientEmail,
      subject: `Счёт №${invoiceNumber} на ${total.toLocaleString('ru-KZ')} ₸ от ${storefront.companyName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1C2056; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">INVOICES.KZ</h1>
          </div>
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px;">
            <p style="font-size: 16px; color: #374151;">Здравствуйте, <strong>${clientName}</strong>!</p>
            <p style="color: #6b7280;">Ваша заявка у ${storefront.companyName} оформлена. Счёт на оплату — по ссылке ниже.</p>
            <a href="${publicLink}" style="display: inline-block; margin-top: 12px; background: #1C2056; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none;">Открыть счёт №${invoiceNumber}</a>
          </div>
        </div>
      `,
    })
  } catch (e: any) {
    // Best-effort -- the счёт already exists and is reachable via the
    // returned link either way, so a mail hiccup must not fail the order.
    console.error('wholesale-order: confirmation email failed (non-fatal)', e.message)
  }

  return NextResponse.json({ publicToken: invoice.public_token })
}
```

- [ ] **Step 2: Typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.json` — expected no new errors.
Run: `npm run build` — expected success.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/shop/[slug]/wholesale-order/route.ts"
git commit -m "feat(kaspi-shop): wholesale checkout creates a real invoice"
```

---

### Task 8: Admin UI — «Модели» page

**Files:**
- Create: `src/app/kaspi-shop/storefront/models/page.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/kaspi-shop/storefront/models`, `PATCH/DELETE /api/kaspi-shop/storefront/models/[id]`, `POST /api/kaspi-shop/storefront/models/[id]/variants`, `PATCH/DELETE /api/kaspi-shop/storefront/models/[id]/variants/[variantId]` (Tasks 3, 4); `GET /api/kaspi-shop/storefront/categories` (existing).

- [ ] **Step 1: Write the page**

Create `src/app/kaspi-shop/storefront/models/page.tsx`:

```typescript
'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { getActivePlan } from '@/lib/plan'

type Variant = { id: string; size: string; color: string; stockCount: number | null }
type Model = { id: string; name: string; price: number; imageUrl: string | null; categoryId: string | null; variants: Variant[] }
type Category = { id: string; name: string; sortOrder: number }

function formatPrice(price: number): string {
  return new Intl.NumberFormat('ru-KZ').format(price) + ' ₸'
}

export default function WholesaleModelsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [models, setModels] = useState<Model[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [error, setError] = useState('')

  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [newImageUrl, setNewImageUrl] = useState('')
  const [newCategoryId, setNewCategoryId] = useState('')
  const [creating, setCreating] = useState(false)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [variantSize, setVariantSize] = useState('')
  const [variantColor, setVariantColor] = useState('')
  const [variantStock, setVariantStock] = useState('')
  const [addingVariant, setAddingVariant] = useState(false)

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  const load = useCallback(async () => {
    setError('')
    try {
      const headers = await authHeader()
      const [modelsRes, categoriesRes] = await Promise.all([
        fetch('/api/kaspi-shop/storefront/models', { headers }),
        fetch('/api/kaspi-shop/storefront/categories', { headers }),
      ])
      const modelsData = await modelsRes.json().catch(() => null)
      if (!modelsRes.ok) { setError(modelsData?.error || 'Не удалось загрузить модели'); return }
      setModels(modelsData.models || [])
      const categoriesData = await categoriesRes.json().catch(() => null)
      if (categoriesRes.ok) setCategories(categoriesData.categories || [])
    } catch {
      setError('Не удалось загрузить модели. Проверьте соединение и попробуйте ещё раз.')
    }
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', user.id).single()
      if (!profile?.is_admin && !getActivePlan(profile).canKaspiShop) { router.push('/dashboard'); return }
      const { data: { session } } = await supabase.auth.getSession()
      const connRes = await fetch('/api/kaspi-shop/wallet', { headers: { Authorization: `Bearer ${session?.access_token}` } })
      const connData = await connRes.json().catch(() => null)
      if (!connData?.connected || connData?.sessionStatus === 'session_expired') { router.push('/kaspi-shop'); return }
      await load()
      setLoading(false)
    }
    init()
  }, [router, load])

  async function createModel() {
    const price = Number(newPrice)
    if (!newName.trim()) { setError('Укажите название'); return }
    if (!Number.isFinite(price) || price <= 0) { setError('Укажите цену'); return }
    setCreating(true)
    setError('')
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/storefront/models', {
        method: 'POST', headers,
        body: JSON.stringify({ name: newName.trim(), price, imageUrl: newImageUrl.trim() || null, categoryId: newCategoryId || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Не удалось создать модель'); return }
      setNewName(''); setNewPrice(''); setNewImageUrl(''); setNewCategoryId('')
      await load()
    } catch {
      setError('Не удалось создать модель. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setCreating(false)
    }
  }

  async function deleteModel(id: string) {
    if (!confirm('Удалить модель и все её варианты размер/цвет?')) return
    try {
      const headers = await authHeader()
      await fetch(`/api/kaspi-shop/storefront/models/${id}`, { method: 'DELETE', headers })
      await load()
    } catch {
      setError('Не удалось удалить модель.')
    }
  }

  async function addVariant(modelId: string) {
    if (!variantSize.trim() || !variantColor.trim()) { setError('Укажите размер и цвет'); return }
    setAddingVariant(true)
    setError('')
    try {
      const headers = await authHeader()
      const res = await fetch(`/api/kaspi-shop/storefront/models/${modelId}/variants`, {
        method: 'POST', headers,
        body: JSON.stringify({ size: variantSize.trim(), color: variantColor.trim(), stockCount: variantStock === '' ? null : Number(variantStock) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Не удалось добавить вариант'); return }
      setVariantSize(''); setVariantColor(''); setVariantStock('')
      await load()
    } catch {
      setError('Не удалось добавить вариант. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setAddingVariant(false)
    }
  }

  async function deleteVariant(modelId: string, variantId: string) {
    try {
      const headers = await authHeader()
      await fetch(`/api/kaspi-shop/storefront/models/${modelId}/variants/${variantId}`, { method: 'DELETE', headers })
      await load()
    } catch {
      setError('Не удалось удалить вариант.')
    }
  }

  async function updateVariantStock(modelId: string, variantId: string, stockCount: number | null) {
    try {
      const headers = await authHeader()
      await fetch(`/api/kaspi-shop/storefront/models/${modelId}/variants/${variantId}`, {
        method: 'PATCH', headers, body: JSON.stringify({ stockCount }),
      })
      await load()
    } catch {
      setError('Не удалось обновить остаток.')
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загрузка…</div>

  return (
    <DesktopShell>
      <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
        <SiteNav />
        <div className="flex-1 min-w-0 p-4 lg:p-6 pb-6 max-w-4xl mx-auto w-full">
          <h1 className="text-2xl font-extrabold mb-4" style={{ color: 'var(--nav-text-primary)' }}>Модели (оптовый каталог)</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--nav-text-muted)' }}>
            Отдельный каталог для публичной витрины сестры — не связан с товарами Kaspi. У каждой модели своя цена и сетка размер×цвет с остатком; остаток 0 или пустой показывает покупателю «Оформить пошив на заказ».
          </p>

          {error && <div className="nav-glass rounded-2xl p-3 mb-4 text-sm" style={{ color: 'var(--nav-critical)' }}>{error}</div>}

          <div className="nav-glass rounded-2xl p-4 mb-6 space-y-2">
            <div className="text-sm font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>Новая модель</div>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Название (напр. «Лонгслив однотонный Long01»)"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)]" style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
            <input value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="Цена, ₸" type="number"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)]" style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
            <input value={newImageUrl} onChange={e => setNewImageUrl(e.target.value)} placeholder="Ссылка на фото"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)]" style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
            <select value={newCategoryId} onChange={e => setNewCategoryId(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)]" style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }}>
              <option value="">Без раздела</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={createModel} disabled={creating}
              className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
              {creating ? 'Создаём…' : 'Добавить модель'}
            </button>
          </div>

          <div className="space-y-3">
            {models.map(m => (
              <div key={m.id} className="nav-glass rounded-2xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {m.imageUrl ? (
                      <img src={m.imageUrl} alt={m.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" style={{ background: 'var(--nav-bg)' }} />
                    ) : (
                      <div className="w-12 h-12 rounded-lg flex-shrink-0" style={{ background: 'var(--nav-bg)' }} />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: 'var(--nav-text-primary)' }}>{m.name}</div>
                      <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{formatPrice(m.price)} · {m.variants.length} вариантов</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => setExpandedId(expandedId === m.id ? null : m.id)} className="text-xs font-medium rounded-lg px-3 py-1.5 nav-glass" style={{ color: 'var(--nav-text-primary)' }}>
                      {expandedId === m.id ? 'Скрыть варианты' : 'Варианты'}
                    </button>
                    <button onClick={() => deleteModel(m.id)} className="text-xs font-medium rounded-lg px-3 py-1.5" style={{ color: 'var(--nav-critical)' }}>Удалить</button>
                  </div>
                </div>

                {expandedId === m.id && (
                  <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--nav-border)' }}>
                    <table className="w-full text-sm mb-3">
                      <thead>
                        <tr style={{ color: 'var(--nav-text-muted)' }}>
                          <th className="text-left font-medium pb-2">Размер</th>
                          <th className="text-left font-medium pb-2">Цвет</th>
                          <th className="text-left font-medium pb-2">Остаток</th>
                          <th className="pb-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {m.variants.map(v => (
                          <tr key={v.id} style={{ color: 'var(--nav-text-primary)' }}>
                            <td className="py-1">{v.size}</td>
                            <td className="py-1">{v.color}</td>
                            <td className="py-1">
                              <input
                                type="number"
                                defaultValue={v.stockCount ?? ''}
                                placeholder="пошив"
                                onBlur={e => updateVariantStock(m.id, v.id, e.target.value === '' ? null : Number(e.target.value))}
                                className="w-20 rounded px-2 py-1 text-xs outline-none border border-[color:var(--nav-border)]"
                                style={{ background: 'var(--nav-bg)' }}
                              />
                            </td>
                            <td className="py-1 text-right">
                              <button onClick={() => deleteVariant(m.id, v.id)} className="text-xs" style={{ color: 'var(--nav-critical)' }}>✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex flex-wrap gap-2">
                      <input value={variantSize} onChange={e => setVariantSize(e.target.value)} placeholder="Размер (M, 56-60...)"
                        className="rounded-lg px-2 py-1.5 text-xs outline-none border border-[color:var(--nav-border)] w-28" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-primary)' }} />
                      <input value={variantColor} onChange={e => setVariantColor(e.target.value)} placeholder="Цвет"
                        className="rounded-lg px-2 py-1.5 text-xs outline-none border border-[color:var(--nav-border)] w-28" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-primary)' }} />
                      <input value={variantStock} onChange={e => setVariantStock(e.target.value)} placeholder="Остаток (пусто = пошив)" type="number"
                        className="rounded-lg px-2 py-1.5 text-xs outline-none border border-[color:var(--nav-border)] w-40" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-primary)' }} />
                      <button onClick={() => addVariant(m.id)} disabled={addingVariant}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                        {addingVariant ? 'Добавляем…' : 'Добавить вариант'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {models.length === 0 && (
              <div className="text-sm text-center py-8" style={{ color: 'var(--nav-text-muted)' }}>Пока нет ни одной модели</div>
            )}
          </div>
        </div>
      </main>
    </DesktopShell>
  )
}
```

- [ ] **Step 2: Typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.json` — expected no new errors.
Run: `npm run build` — expected success, `/kaspi-shop/storefront/models` listed as a static/dynamic route.

- [ ] **Step 3: Commit**

```bash
git add "src/app/kaspi-shop/storefront/models/page.tsx"
git commit -m "feat(kaspi-shop): admin Models page for the wholesale catalog"
```

---

### Task 9: Admin UI — landing fields + link to Models

**Files:**
- Modify: `src/app/kaspi-shop/storefront/page.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/kaspi-shop/storefront/appearance` (now landing-aware, Task 5); links to `/kaspi-shop/storefront/models` (Task 8).

- [ ] **Step 1: Add landing state and wire it through load/save**

In `src/app/kaspi-shop/storefront/page.tsx`, add to the appearance state block (near `chatWidgetEnabled`):

```typescript
  const [landingEnabled, setLandingEnabled] = useState(false)
  const [landingHistory, setLandingHistory] = useState('')
  const [landingCapacity, setLandingCapacity] = useState('')
  const [landingAnnualVolume, setLandingAnnualVolume] = useState('')
```

In the `load` callback, after `setChatWidgetEnabled(!!data.chatWidgetEnabled)`, add:

```typescript
      setLandingEnabled(!!data.landingEnabled)
      setLandingHistory(data.landingHistory || '')
      setLandingCapacity(data.landingCapacity || '')
      setLandingAnnualVolume(data.landingAnnualVolume || '')
```

In `saveAppearance`, change the `body` of the fetch call to:

```typescript
        body: JSON.stringify({ backgroundColor, deliveryInfo, chatWidgetEnabled, landingEnabled, landingHistory, landingCapacity, landingAnnualVolume }),
```

- [ ] **Step 2: Add the landing form fields to the appearance tab's JSX**

Inside the `{tab === 'settings' && (...)}` block, find the existing appearance section (the one with `deliveryInfo`/`chatWidgetEnabled` inputs and the "Сохранить" button that calls `saveAppearance`). Add a new block directly above that section's save button:

```tsx
              <div className="mt-6 pt-6 border-t" style={{ borderColor: 'var(--nav-border)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <input type="checkbox" checked={landingEnabled} onChange={e => setLandingEnabled(e.target.checked)} id="landing-enabled" />
                  <label htmlFor="landing-enabled" className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>
                    Показывать лендинг о компании на главной странице витрины
                  </label>
                </div>
                <textarea value={landingHistory} onChange={e => setLandingHistory(e.target.value)} placeholder="История становления компании" rows={3}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)] mb-2" style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
                <textarea value={landingCapacity} onChange={e => setLandingCapacity(e.target.value)} placeholder="Имеющиеся мощности" rows={2}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)] mb-2" style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
                <textarea value={landingAnnualVolume} onChange={e => setLandingAnnualVolume(e.target.value)} placeholder="Годовые объёмы" rows={2}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)]" style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
              </div>
```

(This sits inside the same appearance form, so the existing "Сохранить" button below it already calls `saveAppearance`, which now sends these fields too — no new button needed.)

- [ ] **Step 3: Link to the Models page**

Find the tab-switcher buttons (`{(['settings','catalog'] as const).map(...)}` or the equivalent literal `tab === 'settings'` / `tab === 'catalog'` button pair near line 350-360). Directly after that switcher, add a plain link button (this is a separate page, not a third value of the `tab` state, since Task 8 built it as its own route):

```tsx
        <a href="/kaspi-shop/storefront/models" className="inline-block text-sm font-semibold rounded-full px-4 py-2 nav-glass mb-4" style={{ color: 'var(--nav-text-primary)' }}>
          Модели (оптовый каталог) →
        </a>
```

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.json` — expected no new errors.
Run: `npm run build` — expected success.

- [ ] **Step 5: Commit**

```bash
git add "src/app/kaspi-shop/storefront/page.tsx"
git commit -m "feat(kaspi-shop): landing fields in appearance settings + Models link"
```

---

### Task 10: Public UI — wholesale cart hook + shared cart bar/checkout component

**Files:**
- Create: `src/lib/kaspiShop/useWholesaleCart.ts`
- Create: `src/components/kaspiShop/WholesaleCartBar.tsx`

**Interfaces:**
- Produces:
  - `type WholesaleCartLine = { key: string; modelId: string; modelName: string; size: string; color: string; price: number; imageUrl: string | null; qty: number; customOrder: boolean }`
  - `useWholesaleCart(slug: string): { lines: WholesaleCartLine[]; count: number; total: number; addLine: (line: Omit<WholesaleCartLine, 'qty'> & { qty: number }) => void; setQty: (key: string, qty: number) => void; removeLine: (key: string) => void; clear: () => void }`
  - `<WholesaleCartBar slug={string} />` — self-contained floating cart bar + checkout modal, calls `POST /api/shop/[slug]/wholesale-order` (Task 7) and redirects to `/view/{publicToken}` on success.
- Consumed by Tasks 11, 12, 13 (`addLine` from the model-detail page; `<WholesaleCartBar>` mounted on both the catalog and model-detail pages).

- [ ] **Step 1: Write the cart hook**

Create `src/lib/kaspiShop/useWholesaleCart.ts`:

```typescript
'use client'
import { useState, useEffect, useCallback } from 'react'

export type WholesaleCartLine = {
  key: string
  modelId: string
  modelName: string
  size: string
  color: string
  price: number
  imageUrl: string | null
  qty: number
  customOrder: boolean
}

const MAX_LINE_QTY = 999

function cartStorageKey(slug: string): string {
  return `invoiceskz_shop_wholesale_cart_${slug}`
}

function lineKey(modelId: string, size: string, color: string): string {
  return `${modelId}:${size}:${color}`
}

// Cart lines are stored denormalized (full name/price/image, not just an id)
// -- unlike the existing flat storefront cart (shop/[slug]/page.tsx), which
// re-derives display data from one already-fetched product list, a
// wholesale cart line comes from a specific model's DETAIL page (its own
// fetch), so there's no single in-memory list to look the line back up in
// once the buyer has navigated elsewhere (e.g. back to /catalog). Re-priced
// server-side at checkout regardless (see resolveWholesaleLine) -- what's
// stored here is display-only.
export function useWholesaleCart(slug: string) {
  const [lines, setLines] = useState<WholesaleCartLine[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(cartStorageKey(slug))
      if (raw) setLines(JSON.parse(raw))
    } catch {
      // Corrupt/blocked storage -- start with an empty cart rather than crash.
    }
    setLoaded(true)
  }, [slug])

  useEffect(() => {
    if (!loaded) return
    try { localStorage.setItem(cartStorageKey(slug), JSON.stringify(lines)) } catch {}
  }, [lines, loaded, slug])

  const addLine = useCallback((line: WholesaleCartLine) => {
    setLines(prev => {
      const key = lineKey(line.modelId, line.size, line.color)
      const existing = prev.find(l => l.key === key)
      if (existing) {
        return prev.map(l => l.key === key ? { ...l, qty: Math.min(l.qty + line.qty, MAX_LINE_QTY) } : l)
      }
      return [...prev, { ...line, key, qty: Math.min(line.qty, MAX_LINE_QTY) }]
    })
  }, [])

  const setQty = useCallback((key: string, qty: number) => {
    setLines(prev => {
      if (qty <= 0) return prev.filter(l => l.key !== key)
      return prev.map(l => l.key === key ? { ...l, qty: Math.min(qty, MAX_LINE_QTY) } : l)
    })
  }, [])

  const removeLine = useCallback((key: string) => {
    setLines(prev => prev.filter(l => l.key !== key))
  }, [])

  const clear = useCallback(() => setLines([]), [])

  const count = lines.reduce((sum, l) => sum + l.qty, 0)
  const total = lines.reduce((sum, l) => sum + l.price * l.qty, 0)

  return { lines, count, total, addLine, setQty, removeLine, clear }
}
```

- [ ] **Step 2: Write the shared cart bar + checkout modal component**

Create `src/components/kaspiShop/WholesaleCartBar.tsx`:

```typescript
'use client'
import { useState } from 'react'
import { useWholesaleCart } from '@/lib/kaspiShop/useWholesaleCart'

function formatPrice(price: number): string {
  return new Intl.NumberFormat('ru-KZ').format(price) + ' ₸'
}

// Mounted on both /shop/[slug]/catalog and /shop/[slug]/catalog/[modelId] --
// each mount reads the same localStorage-backed cart independently (see
// useWholesaleCart's own comment on why that's fine here, same as the
// existing flat storefront's per-page cart read). Handles its own checkout
// modal end to end: on submit, POSTs to /api/shop/[slug]/wholesale-order and
// redirects the browser straight to the returned счёт's /view/[token] page,
// where bank details + Kaspi Cashier already work with no code here.
export default function WholesaleCartBar({ slug }: { slug: string }) {
  const cart = useWholesaleCart(slug)
  const [open, setOpen] = useState(false)
  const [clientName, setClientName] = useState('')
  const [clientBin, setClientBin] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const binValid = /^\d{12}$/.test(clientBin)
  const emailValid = clientEmail.includes('@')
  const canSubmit = cart.lines.length > 0 && clientName.trim().length > 0 && binValid && emailValid && !submitting

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`/api/shop/${slug}/wholesale-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.lines.map(l => ({ modelId: l.modelId, size: l.size, color: l.color, qty: l.qty })),
          clientName: clientName.trim(),
          clientBin,
          clientEmail: clientEmail.trim(),
          clientPhone,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Не удалось оформить заявку'); return }
      cart.clear()
      window.location.href = `/view/${data.publicToken}`
    } catch {
      setError('Ошибка сети. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setSubmitting(false)
    }
  }

  if (cart.count === 0 && !open) return null

  return (
    <>
      {!open && (
        <div className="fixed bottom-4 inset-x-4 z-40 max-w-6xl mx-auto">
          <button onClick={() => setOpen(true)}
            className="w-full nav-glass rounded-2xl px-5 py-3.5 flex items-center justify-between shadow-lg"
            style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
            <span className="text-sm font-semibold">Корзина: {cart.count} {cart.count === 1 ? 'товар' : 'товара'}</span>
            <span className="text-sm font-bold">{formatPrice(cart.total)} · Оформить →</span>
          </button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setOpen(false)}>
          <div className="nav-glass rounded-2xl p-5 w-full max-w-sm max-h-[85vh] overflow-y-auto" style={{ background: 'var(--nav-bg)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>Ваша заявка</div>
              <button onClick={() => setOpen(false)} className="text-sm flex-shrink-0" style={{ color: 'var(--nav-text-muted)' }}>✕</button>
            </div>

            <ul className="space-y-1.5 mb-3 max-h-40 overflow-y-auto">
              {cart.lines.map(l => (
                <li key={l.key} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate" style={{ color: 'var(--nav-text-secondary)' }}>
                    {l.modelName}, {l.color}, {l.size}{l.customOrder ? ' (пошив)' : ''} × {l.qty}
                  </span>
                  <span className="font-semibold flex-shrink-0" style={{ color: 'var(--nav-text-primary)' }}>{formatPrice(l.price * l.qty)}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between text-sm font-bold mb-4 pt-2 border-t" style={{ color: 'var(--nav-text-primary)', borderColor: 'var(--nav-border)' }}>
              <span>Итого</span>
              <span>{formatPrice(cart.total)}</span>
            </div>

            <div className="space-y-2 mb-4">
              <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Название компании"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)]" style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
              <input value={clientBin} onChange={e => setClientBin(e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="БИН (12 цифр)"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)]" style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
              <input value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="Email — сюда придёт счёт" type="email"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)]" style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
              <input value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="Телефон (необязательно)"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)]" style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
            </div>

            {error && <div className="text-xs mb-3" style={{ color: 'var(--nav-critical)' }}>{error}</div>}
            <button onClick={submit} disabled={!canSubmit}
              className="w-full rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
              {submitting ? 'Оформляем…' : 'Оформить заявку'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.json` — expected no new errors (these files aren't imported anywhere yet, so this mainly checks the files parse and type-check standalone).
Run: `npm run build` — expected success.

- [ ] **Step 4: Commit**

```bash
git add src/lib/kaspiShop/useWholesaleCart.ts src/components/kaspiShop/WholesaleCartBar.tsx
git commit -m "feat(kaspi-shop): wholesale cart hook + shared cart bar/checkout modal"
```

---

### Task 11: Public UI — landing branch on `/shop/[slug]`

**Files:**
- Modify: `src/app/shop/[slug]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/shop/[slug]/wholesale` (Task 6, for `landingEnabled`/`landingHistory`/`landingCapacity`/`landingAnnualVolume`/`companyName` only — this page does NOT fetch or render the model catalog itself, that's Task 12).
- Does not change this page's existing behavior for any storefront with `landingEnabled: false` — same flat Kaspi/custom-product catalog as today, byte-for-byte.

- [ ] **Step 1: Add landing state and a second fetch**

In `src/app/shop/[slug]/page.tsx`, add near the other `useState` declarations (after `widgetKey`):

```typescript
  const [landingEnabled, setLandingEnabled] = useState(false)
  const [landingHistory, setLandingHistory] = useState<string | null>(null)
  const [landingCapacity, setLandingCapacity] = useState<string | null>(null)
  const [landingAnnualVolume, setLandingAnnualVolume] = useState<string | null>(null)
```

In the existing `useEffect` that fetches `/api/shop/${params.slug}`, add these lines right after `setWidgetKey(data.widgetKey || null)` (still inside the same `.then(data => { ... })` callback, before the closing brace):

```typescript
        setLandingEnabled(!!data.landingEnabled)
        setLandingHistory(data.landingHistory || null)
        setLandingCapacity(data.landingCapacity || null)
        setLandingAnnualVolume(data.landingAnnualVolume || null)
```

(`/api/shop/[slug]/route.ts` was not changed in this plan and doesn't return these fields yet — Step 2 below fixes that, since Task 6 only added the separate `/wholesale` endpoint, and this existing page fetches the *original* `/api/shop/[slug]` endpoint, not `/wholesale`.)

- [ ] **Step 2: Add the landing fields to the existing public GET route**

`src/app/api/shop/[slug]/route.ts` already spreads storefront fields individually rather than the whole object. Modify it:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { resolveStorefrontBySlug, loadStorefrontProducts, loadStorefrontCategories, loadWebsiteWidgetKey } from '@/lib/kaspiShop/storefront'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const storefront = await resolveStorefrontBySlug(slug)
  if (!storefront) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const [products, categories, widgetKey] = await Promise.all([
    loadStorefrontProducts(storefront.connectionId),
    loadStorefrontCategories(storefront.connectionId),
    storefront.chatWidgetEnabled ? loadWebsiteWidgetKey(storefront.userId) : Promise.resolve(null),
  ])
  return NextResponse.json({
    companyName: storefront.companyName,
    products,
    categories,
    backgroundColor: storefront.backgroundColor,
    deliveryInfo: storefront.deliveryInfo,
    widgetKey,
    landingEnabled: storefront.landingEnabled,
    landingHistory: storefront.landingHistory,
    landingCapacity: storefront.landingCapacity,
    landingAnnualVolume: storefront.landingAnnualVolume,
  })
}
```

- [ ] **Step 3: Render the landing screen when enabled**

In `src/app/shop/[slug]/page.tsx`, find the top-level `return (...)` (the one starting `<div className="min-h-screen" style={{ background: backgroundColor ...`). Wrap the existing body in a conditional: when `landingEnabled` is true, render the landing screen instead; the existing markup (header, delivery info, product grid, cart, checkout modal) becomes the `else` branch, completely unchanged. Replace the `return (` line and the lines immediately after the opening `<div>` (up to `{deliveryInfo && (`) with:

```tsx
  if (landingEnabled) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: backgroundColor || 'var(--nav-bg)' }}>
        <div className="max-w-2xl mx-auto p-6 text-center">
          <div className="flex items-center justify-center gap-2.5 mb-6">
            <LogoMark />
            <h1 className="text-2xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>{companyName}</h1>
          </div>
          {landingHistory && (
            <div className="nav-glass rounded-2xl p-5 mb-4 text-left">
              <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--nav-text-muted)' }}>История</div>
              <div className="text-sm whitespace-pre-wrap" style={{ color: 'var(--nav-text-secondary)' }}>{landingHistory}</div>
            </div>
          )}
          {landingCapacity && (
            <div className="nav-glass rounded-2xl p-5 mb-4 text-left">
              <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--nav-text-muted)' }}>Мощности</div>
              <div className="text-sm whitespace-pre-wrap" style={{ color: 'var(--nav-text-secondary)' }}>{landingCapacity}</div>
            </div>
          )}
          {landingAnnualVolume && (
            <div className="nav-glass rounded-2xl p-5 mb-6 text-left">
              <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--nav-text-muted)' }}>Годовые объёмы</div>
              <div className="text-sm whitespace-pre-wrap" style={{ color: 'var(--nav-text-secondary)' }}>{landingAnnualVolume}</div>
            </div>
          )}
          <a href={`/shop/${params.slug}/catalog`}
            className="inline-block rounded-xl px-6 py-3 text-sm font-semibold" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
            Перейти в каталог →
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: backgroundColor || 'var(--nav-bg)' }}>
```

Everything from `{widgetKey && (...)}` through the end of the file (the existing flat catalog + cart + checkout modal) stays exactly where it is, now as the function's second `return`.

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.json` — expected no new errors.
Run: `npm run build` — expected success.

- [ ] **Step 5: Manual check (no automated test exists for this page, matching the codebase's convention)**

Run `npm run dev`, then in a browser:
1. Open any existing published storefront slug that has `storefront_landing_enabled = false` (the default for every row until Task 9's form is used) — confirm the page renders exactly as before (flat product grid, no landing screen). This is the regression check for every OTHER seller's already-published Витрина.
2. Temporarily flip one test connection's `storefront_landing_enabled` to `true` via `execute_sql` (Supabase MCP) and confirm the landing screen renders instead, with a working "Перейти в каталог →" link (it will 404 until Task 12 exists — that's expected at this point in the plan).
3. Flip it back to `false` when done, unless it's meant to stay on for testing later tasks.

- [ ] **Step 6: Commit**

```bash
git add "src/app/shop/[slug]/page.tsx" "src/app/api/shop/[slug]/route.ts"
git commit -m "feat(kaspi-shop): landing screen on /shop/[slug] when enabled"
```

---

### Task 12: Public UI — catalog page

**Files:**
- Create: `src/app/shop/[slug]/catalog/page.tsx`

**Interfaces:**
- Consumes: `GET /api/shop/[slug]/wholesale` (Task 6); renders `<WholesaleCartBar slug={slug} />` (Task 10).

- [ ] **Step 1: Write the page**

Create `src/app/shop/[slug]/catalog/page.tsx`:

```typescript
'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import WholesaleCartBar from '@/components/kaspiShop/WholesaleCartBar'

type Variant = { id: string; size: string; color: string; stockCount: number | null }
type Model = { id: string; name: string; price: number; imageUrl: string | null; categoryId: string | null; variants: Variant[] }
type Category = { id: string; name: string; sortOrder: number }

const EASE = [0.16, 1, 0.3, 1] as const

function LogoMark() {
  return <img src="/icon.svg" alt="" className="w-7 h-7 rounded-lg" style={{ boxShadow: '0 6px 14px -6px var(--nav-accent)' }} />
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('ru-KZ').format(price) + ' ₸'
}

// Same grouping shape as the existing flat storefront's groupProducts
// (shop/[slug]/page.tsx) -- pure, no I/O. A model with no category goes into
// a trailing "Другое" group; a seller who never made a category gets one
// flat "Все" group.
function groupModels(models: Model[], categories: Category[]): { id: string | null; name: string; models: Model[] }[] {
  if (categories.length === 0) return [{ id: null, name: '', models }]
  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder)
  const groups = sorted.map(c => ({ id: c.id as string | null, name: c.name, models: models.filter(m => m.categoryId === c.id) }))
  const uncategorized = models.filter(m => !sorted.some(c => c.id === m.categoryId))
  if (uncategorized.length > 0) groups.push({ id: null, name: 'Другое', models: uncategorized })
  return groups.filter(g => g.models.length > 0)
}

export default function WholesaleCatalogPage() {
  const params = useParams<{ slug: string }>()
  const reduceMotion = !!useReducedMotion()
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [models, setModels] = useState<Model[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/shop/${params.slug}/wholesale`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setNotFound(true); return }
        setCompanyName(data.companyName || '')
        setModels(Array.isArray(data.models) ? data.models : [])
        setCategories(Array.isArray(data.categories) ? data.categories : [])
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [params.slug])

  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загрузка…</div>
  if (notFound) return <div className="min-h-screen flex items-center justify-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Витрина не найдена</div>

  const groups = groupModels(models, categories)
  const visibleGroups = activeCategory ? groups.filter(g => g.id === activeCategory) : groups

  return (
    <div className="min-h-screen" style={{ background: 'var(--nav-bg)' }}>
      <div className="max-w-6xl mx-auto p-4 lg:p-6 pb-32">
        <div className="flex items-center gap-2.5 mb-6">
          <LogoMark />
          <h1 className="text-lg font-bold" style={{ color: 'var(--nav-text-primary)' }}>{companyName}</h1>
        </div>

        {categories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
            <button onClick={() => setActiveCategory(null)}
              className="flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{ background: activeCategory === null ? 'var(--nav-accent)' : 'var(--nav-surface-glass)', color: activeCategory === null ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)' }}>
              Все
            </button>
            {[...categories].sort((a, b) => a.sortOrder - b.sortOrder).map(c => (
              <button key={c.id} onClick={() => setActiveCategory(c.id)}
                className="flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
                style={{ background: activeCategory === c.id ? 'var(--nav-accent)' : 'var(--nav-surface-glass)', color: activeCategory === c.id ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)' }}>
                {c.name}
              </button>
            ))}
          </div>
        )}

        {models.length === 0 ? (
          <div className="text-sm text-center py-16" style={{ color: 'var(--nav-text-muted)' }}>Пока нет моделей в каталоге</div>
        ) : (
          <div className="space-y-8">
            {visibleGroups.map(group => (
              <div key={group.id || group.name || 'all'}>
                {group.name && (
                  <h2 className="text-lg font-bold mb-4 pb-2 border-b" style={{ color: 'var(--nav-text-primary)', borderColor: 'var(--nav-border)' }}>{group.name}</h2>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                  {group.models.map((m, i) => (
                    <motion.a
                      key={m.id}
                      href={`/shop/${params.slug}/catalog/${m.id}`}
                      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : Math.min(i * 0.04, 0.3) }}
                      className="nav-glass rounded-2xl overflow-hidden flex flex-col transition-shadow hover:shadow-md"
                    >
                      {m.imageUrl ? (
                        <img src={m.imageUrl} alt={m.name} className="w-full aspect-square object-cover" style={{ background: 'var(--nav-bg)' }} />
                      ) : (
                        <div className="w-full aspect-square" style={{ background: 'var(--nav-bg)' }} />
                      )}
                      <div className="p-3 sm:p-4">
                        <div className="text-sm font-semibold mb-2 line-clamp-2" style={{ color: 'var(--nav-text-primary)' }}>{m.name}</div>
                        <div className="text-base sm:text-lg font-bold" style={{ color: 'var(--nav-text-primary)' }}>{formatPrice(m.price)}</div>
                      </div>
                    </motion.a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <WholesaleCartBar slug={params.slug} />
    </div>
  )
}
```

- [ ] **Step 2: Typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.json` — expected no new errors.
Run: `npm run build` — expected success, `/shop/[slug]/catalog` listed.

- [ ] **Step 3: Manual check**

`npm run dev`, open `/shop/<a slug with landingEnabled=true from Task 11>/catalog` (with at least one wholesale model created via Task 8's admin page). Confirm: category chips filter the grid, cards link to `/shop/<slug>/catalog/<modelId>` (404 expected until Task 13 exists), and the "Перейти в каталог →" link from the landing page (Task 11) now resolves here correctly.

- [ ] **Step 4: Commit**

```bash
git add "src/app/shop/[slug]/catalog/page.tsx"
git commit -m "feat(kaspi-shop): public wholesale catalog page"
```

---

### Task 13: Public UI — model detail page

**Files:**
- Create: `src/app/shop/[slug]/catalog/[modelId]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/shop/[slug]/wholesale` (Task 6 — fetches the whole catalog and finds this one model client-side, same shape the catalog page already uses, avoiding a third API route); `useWholesaleCart` + `<WholesaleCartBar>` (Task 10).

- [ ] **Step 1: Write the page**

Create `src/app/shop/[slug]/catalog/[modelId]/page.tsx`:

```typescript
'use client'
import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import WholesaleCartBar from '@/components/kaspiShop/WholesaleCartBar'
import { useWholesaleCart } from '@/lib/kaspiShop/useWholesaleCart'

type Variant = { id: string; size: string; color: string; stockCount: number | null }
type Model = { id: string; name: string; price: number; imageUrl: string | null; categoryId: string | null; variants: Variant[] }

function formatPrice(price: number): string {
  return new Intl.NumberFormat('ru-KZ').format(price) + ' ₸'
}

export default function WholesaleModelPage() {
  const params = useParams<{ slug: string; modelId: string }>()
  const cart = useWholesaleCart(params.slug)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [model, setModel] = useState<Model | null>(null)
  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  const [selectedSize, setSelectedSize] = useState<string | null>(null)
  const [added, setAdded] = useState(false)

  useEffect(() => {
    fetch(`/api/shop/${params.slug}/wholesale`)
      .then(r => r.json())
      .then(data => {
        const found: Model | undefined = (data.models || []).find((m: Model) => m.id === params.modelId)
        if (!found) { setNotFound(true); return }
        setModel(found)
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [params.slug, params.modelId])

  const colors = useMemo(() => Array.from(new Set((model?.variants || []).map(v => v.color))), [model])
  const sizesForColor = useMemo(
    () => (model?.variants || []).filter(v => v.color === selectedColor),
    [model, selectedColor]
  )
  const selectedVariant = useMemo(
    () => sizesForColor.find(v => v.size === selectedSize) || null,
    [sizesForColor, selectedSize]
  )

  useEffect(() => {
    if (colors.length > 0 && selectedColor === null) setSelectedColor(colors[0])
  }, [colors, selectedColor])

  useEffect(() => {
    setSelectedSize(null)
  }, [selectedColor])

  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загрузка…</div>
  if (notFound || !model) return <div className="min-h-screen flex items-center justify-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Модель не найдена</div>

  const inStock = selectedVariant && selectedVariant.stockCount !== null && selectedVariant.stockCount > 0
  const isCustomOrder = !!selectedVariant && !inStock

  function addToCart() {
    if (!model || !selectedVariant) return
    cart.addLine({
      key: `${model.id}:${selectedVariant.size}:${selectedVariant.color}`,
      modelId: model.id,
      modelName: model.name,
      size: selectedVariant.size,
      color: selectedVariant.color,
      price: model.price,
      imageUrl: model.imageUrl,
      qty: 1,
      customOrder: isCustomOrder,
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--nav-bg)' }}>
      <div className="max-w-2xl mx-auto p-4 lg:p-6 pb-32">
        <a href={`/shop/${params.slug}/catalog`} className="text-sm mb-4 inline-block" style={{ color: 'var(--nav-text-muted)' }}>← В каталог</a>

        {model.imageUrl ? (
          <img src={model.imageUrl} alt={model.name} className="w-full aspect-square object-cover rounded-2xl mb-4" style={{ background: 'var(--nav-surface-glass)' }} />
        ) : (
          <div className="w-full aspect-square rounded-2xl mb-4" style={{ background: 'var(--nav-surface-glass)' }} />
        )}

        <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{model.name}</h1>
        <div className="text-lg font-bold mb-4" style={{ color: 'var(--nav-text-primary)' }}>{formatPrice(model.price)}</div>

        {colors.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--nav-text-muted)' }}>Цвет</div>
            <div className="flex flex-wrap gap-2">
              {colors.map(c => (
                <button key={c} onClick={() => setSelectedColor(c)}
                  className="rounded-full px-3 py-1.5 text-xs font-medium"
                  style={{ background: selectedColor === c ? 'var(--nav-accent)' : 'var(--nav-surface-glass)', color: selectedColor === c ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)' }}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {sizesForColor.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--nav-text-muted)' }}>Размер</div>
            <div className="flex flex-wrap gap-2">
              {sizesForColor.map(v => (
                <button key={v.size} onClick={() => setSelectedSize(v.size)}
                  className="rounded-full px-3 py-1.5 text-xs font-medium"
                  style={{ background: selectedSize === v.size ? 'var(--nav-accent)' : 'var(--nav-surface-glass)', color: selectedSize === v.size ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)' }}>
                  {v.size}
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedVariant && (
          <div className="mb-4 text-sm" style={{ color: inStock ? 'var(--nav-success)' : 'var(--nav-text-muted)' }}>
            {inStock ? `На складе: ${selectedVariant.stockCount} шт.` : 'Нет в наличии — доступен пошив на заказ'}
          </div>
        )}

        <button onClick={addToCart} disabled={!selectedVariant}
          className="w-full rounded-xl py-3.5 font-medium text-sm disabled:opacity-50"
          style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
          {added ? 'Добавлено ✓' : isCustomOrder ? 'Оформить пошив на заказ' : 'В корзину'}
        </button>
      </div>

      <WholesaleCartBar slug={params.slug} />
    </div>
  )
}
```

- [ ] **Step 2: Typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.json` — expected no new errors.
Run: `npm run build` — expected success, `/shop/[slug]/catalog/[modelId]` listed.

- [ ] **Step 3: Manual end-to-end check**

`npm run dev`, with a test connection that has `storefront_landing_enabled = true`, at least one category, one model, and 2+ variants (one with real stock, one with `stock_count = 0` or empty) created via Task 8's admin page:

1. Open `/shop/<slug>` — landing renders, "Перейти в каталог →" works.
2. `/shop/<slug>/catalog` — category chips filter correctly, model cards link into detail pages.
3. On a model detail page: switching color resets the size selector; picking a size with real stock shows "На складе: N шт." and a green "В корзину" button; picking a size with 0/empty stock shows "Нет в наличии — доступен пошив на заказ" and the button reads "Оформить пошив на заказ" — both add a line to the cart.
4. The floating cart bar appears with the right count/total; opening it shows both lines (one marked "(пошив)"); filling in company name + a valid 12-digit БИН + email enables "Оформить заявку".
5. Submitting redirects to `/view/<token>` of a brand-new real invoice — confirm its amount matches the cart total, its line items read `"<модель>, <цвет>, <размер>"`, and (if the test connection has Kaspi Cashier connected + Pro plan) a QR/push payment option is present alongside bank details.
6. Confirm the email arrived at the submitted address with a working link to the same invoice.

- [ ] **Step 4: Commit**

```bash
git add "src/app/shop/[slug]/catalog/[modelId]/page.tsx"
git commit -m "feat(kaspi-shop): public wholesale model detail page with variant picker"
```

---

## Self-Review

**Spec coverage:**
- Модель данных (models/variants tables, landing columns) → Task 1, 2.
- Лендинг с историей/мощностями/объёмами, редактируется формой → Tasks 5, 9, 11.
- Каталог с группировками, карточки (фото/название/цена) → Task 12.
- Карточка модели: размер+цвет, остаток или «пошив на заказ» → Task 13.
- Корзина → Task 10.
- Чекаут: БИН/название/email обязательны, телефон опционален, создаёт настоящий счёт, редирект на `/view/[token]` → Tasks 7, 10.
- Админка «Модели» (список, создание/редактирование, таблица вариантов) → Task 8.
- Заказы = обычные счета в `/history`, отдельная таблица не нужна → confirmed by Task 7 (plain `invoices` insert, no new orders table).

**Placeholder scan:** none — every step has complete code, no TBD/TODO.

**Type consistency:** `WholesaleModel`/`WholesaleVariant` (Task 2) match field-for-field what Tasks 3, 4, 6, 8, 12, 13 read (`id/name/price/imageUrl/categoryId/variants[].id/size/color/stockCount`). `ResolvedWholesaleLine`/`resolveWholesaleLine` (Task 2) match Task 7's usage exactly. `WholesaleCartLine` (Task 10) matches what Task 13's `addLine` call constructs and what `WholesaleCartBar` (Task 10) and the checkout POST body (Task 7's expected `{ modelId, size, color, qty }` per item) both read.
