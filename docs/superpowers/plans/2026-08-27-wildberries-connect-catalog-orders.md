# Wildberries: Подключение + каталог + заказы/этикетки Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new admin-only «Wildberries» section where a seller connects their WB Seller API token and sees their real products/prices and orders, with waybill/label printing — read-only, no repricing.

**Architecture:** A single new table (`wb_connections`) stores an encrypted JWT + its decoded expiry; everything else (catalog, orders) is fetched live from Wildberries' official REST API on each page view, never persisted — mirroring how Kaspi Shop's own «Заказы» page already works, and deliberately avoiding any background sync given WB now bills cloud services per API call.

**Tech Stack:** Next.js API routes, Supabase (service-role), Vitest, plain `fetch` against `*.wildberries.ru` REST hosts (no SDK dependency).

**Spec:** `docs/superpowers/specs/2026-08-27-wildberries-connect-catalog-orders-design.md`

## Global Constraints

- **No live WB seller account exists for this build** (founder confirmed). Every WB response shape below is sourced from official documentation and mature community client libraries (Dakword/WBSeller, eslazarev/wildberries-sdk), NOT verified against a real live call — every fetch function must be written defensively (never throw on an unexpected field, treat parsing failures as "no data" rather than a crash) and every response-shape assumption gets an inline comment saying so, matching this codebase's own established precedent (`/kaspi-shop/nkt`'s honest "не уверен" pattern) rather than projecting false confidence.
- Read-only in v1 — no price-write endpoint, no repricer. Do not build `discounts-prices-api`'s `POST /api/v2/upload/task` or anything price-mutating.
- No background sync, no cron, no stored product/order rows — every catalog/order view is a live fetch, on the page-load request only.
- New admin-only nav section «Wildberries», gated the same way as Kaspi Bot/AI-агент (`adminOnly: true` in `SiteNav.tsx`'s `SECTIONS`).
- New dedicated encryption key `WB_ENCRYPTION_KEY` (32-byte hex) — one key per integration, matching `KASPI_SHOP_ENCRYPTION_KEY`/`AI_AGENT_ENCRYPTION_KEY`'s existing precedent. Not set in this environment; document it as an external step, same as every other new integration key this codebase has ever added.
- **Scope adjustment made during planning, not guessed at build time**: the design's `granted_categories` column was meant to show "which categories does this token cover" — but this session's research did not verify WB's exact JWT claim names for scopes/categories (only the registered, universally-standard `exp` claim is something we can trust). This plan stores the **entire decoded JWT payload as-is** in that column (diagnostic value, not a curated feature) and only builds real UI around `exp` (expiry), which IS a safe, standard claim. Do not build a "these exact categories are active" checklist UI — that would be fabricated confidence about an unverified claim shape.

---

### Task 1: Migration

**Files:** none in repo (DB-only).

- [ ] **Step 1:** Supabase MCP `apply_migration` (project `terjitbqgrjlqezyydql`, name `wb_connections`):

```sql
create table wb_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  token_enc text not null,
  token_expires_at timestamptz not null,
  decoded_claims jsonb not null default '{}',
  status text not null default 'active' check (status in ('active', 'expired', 'error')),
  connected_at timestamptz not null default now()
);
create unique index wb_connections_user_id_idx on wb_connections(user_id);
```

(`decoded_claims` — named for what it honestly is, the raw decoded JWT payload, not a curated "granted_categories" list; see Global Constraints.)

- [ ] **Step 2:** Verify via `execute_sql`:

```sql
select column_name, data_type, is_nullable from information_schema.columns where table_name = 'wb_connections' order by ordinal_position;
select indexname from pg_indexes where tablename = 'wb_connections';
```

Expected: all 7 columns present with the right types; `wb_connections_user_id_idx` exists.

No commit (no repo files changed).

---

### Task 2: Pure JWT decode helper

**Files:**
- Create: `src/lib/wildberries/token.ts`
- Test: `src/lib/wildberries/token.test.ts`

**Interfaces:**
- Produces (consumed by Task 3): `decodeWbToken(token: string): { expiresAt: string; claims: Record<string, unknown> } | null`.

- [ ] **Step 1: Write the failing tests** — full file `src/lib/wildberries/token.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { decodeWbToken } from './token'

// A JWT's middle segment is base64url(JSON payload) -- no signing key needed
// to build one for this pure-decode test, only a well-formed 3-part shape.
function fakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.fakesignature`
}

describe('decodeWbToken', () => {
  it('extracts the exp claim as an ISO string and keeps the full payload', () => {
    const expUnixSeconds = 1893456000 // 2030-01-01T00:00:00Z
    const token = fakeJwt({ exp: expUnixSeconds, sid: 'abc123', s: 106 })
    const result = decodeWbToken(token)
    expect(result).not.toBeNull()
    expect(result!.expiresAt).toBe(new Date(expUnixSeconds * 1000).toISOString())
    expect(result!.claims).toEqual({ exp: expUnixSeconds, sid: 'abc123', s: 106 })
  })

  it('returns null for a token that is not 3 dot-separated segments', () => {
    expect(decodeWbToken('not-a-jwt')).toBeNull()
    expect(decodeWbToken('only.two')).toBeNull()
  })

  it('returns null when the middle segment is not valid base64url JSON', () => {
    expect(decodeWbToken('aaa.not-json-at-all.bbb')).toBeNull()
  })

  it('returns null when the payload has no exp claim', () => {
    const token = fakeJwt({ sid: 'abc123' })
    expect(decodeWbToken(token)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/wildberries/token.test.ts`
Expected: FAIL — `./token` does not exist yet.

- [ ] **Step 3: Implement** — full file `src/lib/wildberries/token.ts`:

```ts
// WB issues JWTs (180-day validity per their own docs) via the seller
// cabinet -- we only ever READ them, never verify the signature (WB's own
// API does that on every real call; a bad token simply fails there). `exp`
// is a registered, universally-standard JWT claim (RFC 7519) -- safe to
// rely on. Everything else in the payload is stored as-is for diagnostics
// rather than parsed into named fields: this session's research could not
// verify WB's exact claim names for granted categories/scopes, and
// guessing them would be exactly the kind of fabricated confidence this
// codebase's own "не уверен" precedent (see /kaspi-shop/nkt) exists to avoid.
export function decodeWbToken(token: string): { expiresAt: string; claims: Record<string, unknown> } | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null

  let claims: Record<string, unknown>
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8')
    claims = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof claims !== 'object' || claims === null || Array.isArray(claims)) return null

  const exp = (claims as Record<string, unknown>).exp
  if (typeof exp !== 'number') return null

  return { expiresAt: new Date(exp * 1000).toISOString(), claims }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/wildberries/token.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the gate**

Run: `npx tsc --noEmit` → expect clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/wildberries/token.ts src/lib/wildberries/token.test.ts
git status --short
git commit -m "feat(wildberries): pure JWT decode helper for token expiry"
```

---

### Task 3: Connection storage module

**Files:**
- Create: `src/lib/wildberries/connection.ts`

**Interfaces:**
- Consumes: `decodeWbToken` (`./token`); `encryptAtRest`, `decryptAtRest` (`@/lib/kaspiPay/crypto`).
- Produces (consumed by Tasks 4/5/6): `getKey(): string`, `interface WbConnection { id: string; userId: string; token: string; tokenExpiresAt: string; status: string }`, `saveConnection(userId: string, token: string): Promise<{ ok: true } | { ok: false; error: string }>`, `loadConnection(userId: string): Promise<WbConnection | null>`, `deleteConnection(userId: string): Promise<void>`, `pingWbToken(token: string): Promise<boolean>`.

- [ ] **Step 1: Create `src/lib/wildberries/connection.ts`** — full file:

```ts
import { createClient } from '@supabase/supabase-js'
import { encryptAtRest, decryptAtRest } from '@/lib/kaspiPay/crypto'
import { decodeWbToken } from './token'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// A dedicated key, separate from every other integration's own encryption
// key (KASPI_SHOP_ENCRYPTION_KEY, AI_AGENT_ENCRYPTION_KEY, ...) -- one key
// per integration, so rotating or losing one never affects another.
export function getKey(): string {
  const key = process.env.WB_ENCRYPTION_KEY
  if (!key) throw new Error('WB_ENCRYPTION_KEY is not configured')
  return key
}

export interface WbConnection {
  id: string
  userId: string
  token: string
  tokenExpiresAt: string
  status: string
}

// Best-effort liveness check against WB's own ping endpoint -- NOT verified
// against a real token in this build (no live seller account exists yet,
// see the plan's Global Constraints). Only the documented failure mode
// (401 for a missing/invalid token) is something this session's research
// actually confirmed live; anything else (200, or any other status) is
// treated as "looks connected" rather than asserting a specific success
// shape we haven't seen.
export async function pingWbToken(token: string): Promise<boolean> {
  try {
    const res = await fetch('https://common-api.wildberries.ru/ping', {
      headers: { Authorization: `Bearer ${token}` },
    })
    return res.status !== 401
  } catch {
    return false
  }
}

export async function saveConnection(userId: string, token: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const decoded = decodeWbToken(token)
  if (!decoded) return { ok: false, error: 'invalid_token_format' }

  const isLive = await pingWbToken(token)
  if (!isLive) return { ok: false, error: 'token_rejected' }

  const { error } = await supabase.from('wb_connections').upsert({
    user_id: userId,
    token_enc: encryptAtRest(token, getKey()),
    token_expires_at: decoded.expiresAt,
    decoded_claims: decoded.claims,
    status: 'active',
  }, { onConflict: 'user_id' })
  if (error) return { ok: false, error: 'save_failed' }

  return { ok: true }
}

export async function loadConnection(userId: string): Promise<WbConnection | null> {
  const { data } = await supabase
    .from('wb_connections')
    .select('id, user_id, token_enc, token_expires_at, status')
    .eq('user_id', userId)
    .maybeSingle()
  if (!data) return null
  return {
    id: data.id,
    userId: data.user_id,
    token: decryptAtRest(data.token_enc, getKey()).toString('utf8'),
    tokenExpiresAt: data.token_expires_at,
    status: data.status,
  }
}

export async function deleteConnection(userId: string): Promise<void> {
  await supabase.from('wb_connections').delete().eq('user_id', userId)
}
```

- [ ] **Step 2: Run the gate**

Run: `npx tsc --noEmit` → expect clean.
Run: `npx vitest run` → expect all pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/wildberries/connection.ts
git status --short
git commit -m "feat(wildberries): connection storage -- token encrypt/save/load, ping validation"
```

---

### Task 4: Connect/disconnect API route + settings page

**Files:**
- Create: `src/app/api/wildberries/connect/route.ts`
- Create: `src/app/wildberries/page.tsx`

**Interfaces:**
- Consumes: `saveConnection`, `loadConnection`, `deleteConnection` (`@/lib/wildberries/connection`).
- Produces (consumed by Task 7's nav): page reachable at `/wildberries`.

- [ ] **Step 1: Create `src/app/api/wildberries/connect/route.ts`** — full file:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { saveConnection, loadConnection, deleteConnection } from '@/lib/wildberries/connection'

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

async function isAdmin(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', userId).single()
  return !!profile?.is_admin
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const connection = await loadConnection(user.id)
  if (!connection) return NextResponse.json({ connected: false })
  return NextResponse.json({ connected: true, tokenExpiresAt: connection.tokenExpiresAt, status: connection.status })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const result = await saveConnection(user.id, token)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ connected: true })
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  await deleteConnection(user.id)
  return NextResponse.json({ disconnected: true })
}
```

- [ ] **Step 2: Create `src/app/wildberries/page.tsx`** — full file:

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'

const EASE = [0.16, 1, 0.3, 1] as const

type Status = { connected: boolean; tokenExpiresAt?: string; status?: string }

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

export default function WildberriesPage() {
  const router = useRouter()
  const reduceMotion = !!useReducedMotion()
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [statusData, setStatusData] = useState<Status | null>(null)
  const [tokenInput, setTokenInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  async function load() {
    const headers = await authHeader()
    const res = await fetch('/api/wildberries/connect', { headers })
    if (res.status === 403) { setForbidden(true); setLoading(false); return }
    if (res.ok) setStatusData(await res.json())
    setLoading(false)
  }

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      await load()
    }
    init()
  }, [router])

  async function connect() {
    if (!tokenInput.trim()) return
    setBusy(true)
    setError(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/wildberries/connect', {
        method: 'POST', headers, body: JSON.stringify({ token: tokenInput.trim() }),
      })
      if (res.ok) {
        setTokenInput('')
        await load()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(
          data.error === 'invalid_token_format' ? 'Не удалось распознать токен — проверьте, что скопировали его полностью.'
          : data.error === 'token_rejected' ? 'Wildberries не принял этот токен — проверьте, что он не истёк и скопирован верно.'
          : 'Не удалось подключить. Попробуйте ещё раз.'
        )
      }
    } catch {
      setError('Ошибка сети. Проверьте соединение и попробуйте ещё раз.')
    }
    setBusy(false)
  }

  async function disconnect() {
    setBusy(true)
    setError(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/wildberries/connect', { method: 'DELETE', headers })
      if (res.ok) await load()
      else setError('Не удалось отключить. Попробуйте ещё раз.')
    } catch {
      setError('Ошибка сети. Проверьте соединение и попробуйте ещё раз.')
    }
    setBusy(false)
  }

  if (loading) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загрузка…</div>
    </main>
    </DesktopShell>
  )

  if (forbidden) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Эта функция пока доступна только администраторам.</div>
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
          <h1 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>Wildberries</h1>
          <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Подключите токен продавца, чтобы видеть свои товары, цены и заказы</p>
        </motion.div>

        <div className="nav-glass rounded-2xl p-5">
          {statusData?.connected ? (
            <div className="space-y-3">
              <div className="text-sm font-semibold" style={{ color: 'var(--nav-success)' }}>Подключено</div>
              {statusData.tokenExpiresAt && (
                <div className="text-xs" style={{ color: daysUntil(statusData.tokenExpiresAt) <= 14 ? 'var(--nav-critical)' : 'var(--nav-text-muted)' }}>
                  {daysUntil(statusData.tokenExpiresAt) <= 14
                    ? `Токен истекает через ${daysUntil(statusData.tokenExpiresAt)} дн. — подключите новый заранее`
                    : `Токен действителен до ${new Date(statusData.tokenExpiresAt).toLocaleDateString('ru-KZ')}`}
                </div>
              )}
              <button onClick={disconnect} disabled={busy}
                className="nav-glass rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50" style={{ color: 'var(--nav-text-primary)' }}>
                {busy ? 'Отключаем…' : 'Отключить'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>
                Кабинет Wildberries → Настройки → «Доступ к API» → создайте токен и вставьте его сюда.
              </p>
              <textarea
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                placeholder="eyJhbGciOi..."
                rows={3}
                className="w-full rounded-lg px-3 py-2 text-xs outline-none border border-[color:var(--nav-border)] font-mono"
                style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }}
              />
              {error && <div className="text-xs" style={{ color: 'var(--nav-critical)' }}>{error}</div>}
              <button onClick={connect} disabled={busy || !tokenInput.trim()}
                className="rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                {busy ? 'Подключаем…' : 'Подключить'}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
    </DesktopShell>
  )
}
```

- [ ] **Step 3: Run the gate**

Run: `npx tsc --noEmit` → expect clean.
Run: `npx vitest run` → expect all pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/wildberries/connect/route.ts src/app/wildberries/page.tsx
git status --short
git commit -m "feat(wildberries): connect/disconnect flow + settings page"
```

---

### Task 5: Catalog — live product/price view

**Files:**
- Create: `src/lib/wildberries/catalog.ts`
- Create: `src/app/api/wildberries/products/route.ts`
- Create: `src/app/wildberries/products/page.tsx`

**Interfaces:**
- Consumes: `loadConnection` (`@/lib/wildberries/connection`).
- Produces (consumed by Task 7's nav): `fetchWbProducts(token: string): Promise<WbProduct[]>` where `WbProduct = { nmId: number; name: string; price: number; discount: number; discountedPrice: number }`; page reachable at `/wildberries/products`.

- [ ] **Step 1: Create `src/lib/wildberries/catalog.ts`** — full file:

```ts
export interface WbProduct {
  nmId: number
  name: string
  price: number
  discount: number
  discountedPrice: number
}

// Field names here follow discounts-prices-api's documented
// GET /api/v2/list/goods/filter response as described in community client
// libraries (Dakword/WBSeller, eslazarev/wildberries-sdk) -- NOT verified
// against a real live response in this build (no seller account exists
// yet). Every field read is defensive (falls back to 0/empty rather than
// throwing) so an unexpected real shape degrades to "couldn't read this
// product" instead of crashing the whole page.
export async function fetchWbProducts(token: string): Promise<WbProduct[]> {
  const res = await fetch('https://discounts-prices-api.wildberries.ru/api/v2/list/goods/filter?limit=1000', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Wildberries price list request failed (HTTP ${res.status})`)

  const data = await res.json().catch(() => null)
  const rows = Array.isArray(data?.data?.listGoods) ? data.data.listGoods : []

  return rows.map((row: any): WbProduct => ({
    nmId: Number(row?.nmID) || 0,
    name: typeof row?.vendorCode === 'string' ? row.vendorCode : `Товар ${row?.nmID ?? ''}`,
    price: Number(row?.sizes?.[0]?.price) || Number(row?.price) || 0,
    discount: Number(row?.discount) || 0,
    discountedPrice: Number(row?.sizes?.[0]?.discountedPrice) || Number(row?.discountedPrice) || 0,
  })).filter((p: WbProduct) => p.nmId > 0)
}
```

- [ ] **Step 2: Create `src/app/api/wildberries/products/route.ts`** — full file:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection } from '@/lib/wildberries/connection'
import { fetchWbProducts } from '@/lib/wildberries/catalog'

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

async function isAdmin(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', userId).single()
  return !!profile?.is_admin
}

// Live fetch on every call, nothing persisted -- see the plan's Global
// Constraints on why (WB bills cloud services per API call as of Jan 2026;
// a live-on-view fetch costs nothing when nobody is looking at the page).
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const connection = await loadConnection(user.id)
  if (!connection) return NextResponse.json({ error: 'not_connected' }, { status: 404 })

  try {
    const products = await fetchWbProducts(connection.token)
    return NextResponse.json({ products })
  } catch (e: any) {
    console.error('wildberries products: fetch failed for user', user.id, ':', e.message)
    return NextResponse.json({ error: 'fetch_failed' }, { status: 502 })
  }
}
```

- [ ] **Step 3: Create `src/app/wildberries/products/page.tsx`** — full file:

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'

const EASE = [0.16, 1, 0.3, 1] as const

type Product = { nmId: number; name: string; price: number; discount: number; discountedPrice: number }

function formatPrice(price: number): string {
  return new Intl.NumberFormat('ru-KZ').format(price) + ' ₽'
}

export default function WildberriesProductsPage() {
  const router = useRouter()
  const reduceMotion = !!useReducedMotion()
  const [loading, setLoading] = useState(true)
  const [notConnected, setNotConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: { session } } = await supabase.auth.getSession()
      const headers = { 'Authorization': `Bearer ${session?.access_token}` }
      const res = await fetch('/api/wildberries/products', { headers })
      if (res.status === 404) { setNotConnected(true); setLoading(false); return }
      if (res.ok) {
        const data = await res.json()
        setProducts(Array.isArray(data.products) ? data.products : [])
      } else {
        setError('Не удалось загрузить товары. Попробуйте обновить страницу.')
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

  if (notConnected) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>
        Сначала подключите Wildberries на <a href="/wildberries" className="font-semibold" style={{ color: 'var(--nav-accent)' }}>странице подключения</a>
      </div>
    </main>
    </DesktopShell>
  )

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-4xl mx-auto p-4 lg:p-6 pb-24 lg:pb-6">
        <motion.div
          className="mb-4"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <h1 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>Товары</h1>
          <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
            Реальная цена на витрине может быть ниже — Wildberries добавляет свою скидку (СПП), которая не видна через API продавца
          </p>
        </motion.div>

        {error && <div className="text-sm py-4" style={{ color: 'var(--nav-critical)' }}>{error}</div>}

        {!error && products.length === 0 ? (
          <div className="text-sm text-center py-16" style={{ color: 'var(--nav-text-muted)' }}>Товары не найдены</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {products.map((p, i) => (
              <motion.div
                key={p.nmId}
                initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : Math.min(i * 0.03, 0.3) }}
                className="nav-glass rounded-2xl p-4"
              >
                <div className="text-sm font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{p.name}</div>
                <div className="text-[11px] mb-2" style={{ color: 'var(--nav-text-muted)' }}>nmID: {p.nmId}</div>
                <div className="text-base font-bold" style={{ color: 'var(--nav-text-primary)' }}>{formatPrice(p.discountedPrice || p.price)}</div>
                {p.discount > 0 && (
                  <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>Цена без скидки: {formatPrice(p.price)} (−{p.discount}%)</div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </main>
    </DesktopShell>
  )
}
```

- [ ] **Step 4: Run the gate**

Run: `npx tsc --noEmit` → expect clean.
Run: `npx vitest run` → expect all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/wildberries/catalog.ts src/app/api/wildberries/products/route.ts src/app/wildberries/products/page.tsx
git status --short
git commit -m "feat(wildberries): live product/price catalog view"
```

---

### Task 6: Orders + label printing

**Files:**
- Create: `src/lib/wildberries/orders.ts`
- Create: `src/app/api/wildberries/orders/route.ts`
- Create: `src/app/api/wildberries/orders/stickers/route.ts`
- Create: `src/app/wildberries/orders/page.tsx`

**Interfaces:**
- Consumes: `loadConnection` (`@/lib/wildberries/connection`).
- Produces (consumed by Task 7's nav): `fetchWbOrders(token: string): Promise<WbOrder[]>` where `WbOrder = { orderId: number; article: string; createdAt: string; status: string }`; `fetchWbStickers(token: string, orderIds: number[]): Promise<string[]>` (base64 PNG images); page reachable at `/wildberries/orders`.

- [ ] **Step 1: Create `src/lib/wildberries/orders.ts`** — full file:

```ts
export interface WbOrder {
  orderId: number
  article: string
  createdAt: string
  status: string
}

// Shape follows marketplace-api's documented GET /api/v3/orders/new and
// GET /api/v3/orders as described in official docs/community SDKs -- NOT
// verified live (no seller account exists yet, see Global Constraints).
// Defensive field access throughout: an unrecognized real shape degrades
// to an empty/placeholder value per row, never a thrown error.
export async function fetchWbOrders(token: string): Promise<WbOrder[]> {
  const res = await fetch('https://marketplace-api.wildberries.ru/api/v3/orders?limit=100', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Wildberries orders request failed (HTTP ${res.status})`)

  const data = await res.json().catch(() => null)
  const rows = Array.isArray(data?.orders) ? data.orders : []

  return rows.map((row: any): WbOrder => ({
    orderId: Number(row?.id) || 0,
    article: typeof row?.article === 'string' ? row.article : '—',
    createdAt: typeof row?.createdAt === 'string' ? row.createdAt : new Date().toISOString(),
    status: typeof row?.status === 'string' ? row.status : 'unknown',
  })).filter((o: WbOrder) => o.orderId > 0)
}

// POST /api/v3/orders/stickers, documented max 100 orders per request,
// only for orders in assembly ('confirm') or delivery ('complete') status.
// Requests PNG specifically (type=png) -- WB also offers svg/zplv/zplh, but
// PNG needs no further conversion to show/download, unlike Kaspi's own
// waybill flow which needed a PDF merge step this format sidesteps.
export async function fetchWbStickers(token: string, orderIds: number[]): Promise<string[]> {
  if (orderIds.length === 0 || orderIds.length > 100) {
    throw new Error('sticker request must contain 1-100 order ids')
  }
  const res = await fetch('https://marketplace-api.wildberries.ru/api/v3/orders/stickers?type=png&width=58&height=40', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ orders: orderIds }),
  })
  if (!res.ok) throw new Error(`Wildberries stickers request failed (HTTP ${res.status})`)

  const data = await res.json().catch(() => null)
  const stickers = Array.isArray(data?.stickers) ? data.stickers : []
  return stickers.map((s: any) => typeof s?.file === 'string' ? s.file : '').filter((f: string) => f.length > 0)
}
```

- [ ] **Step 2: Create `src/app/api/wildberries/orders/route.ts`** — full file:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection } from '@/lib/wildberries/connection'
import { fetchWbOrders } from '@/lib/wildberries/orders'

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

async function isAdmin(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', userId).single()
  return !!profile?.is_admin
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const connection = await loadConnection(user.id)
  if (!connection) return NextResponse.json({ error: 'not_connected' }, { status: 404 })

  try {
    const orders = await fetchWbOrders(connection.token)
    return NextResponse.json({ orders })
  } catch (e: any) {
    console.error('wildberries orders: fetch failed for user', user.id, ':', e.message)
    return NextResponse.json({ error: 'fetch_failed' }, { status: 502 })
  }
}
```

- [ ] **Step 3: Create `src/app/api/wildberries/orders/stickers/route.ts`** — full file:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection } from '@/lib/wildberries/connection'
import { fetchWbStickers } from '@/lib/wildberries/orders'

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

async function isAdmin(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', userId).single()
  return !!profile?.is_admin
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const orderIds = Array.isArray(body?.orderIds) ? body.orderIds.map(Number).filter((n: number) => Number.isFinite(n) && n > 0) : []
  if (orderIds.length === 0 || orderIds.length > 100) {
    return NextResponse.json({ error: 'orderIds must contain 1-100 valid ids' }, { status: 400 })
  }

  const connection = await loadConnection(user.id)
  if (!connection) return NextResponse.json({ error: 'not_connected' }, { status: 404 })

  try {
    const stickers = await fetchWbStickers(connection.token, orderIds)
    return NextResponse.json({ stickers })
  } catch (e: any) {
    console.error('wildberries stickers: fetch failed for user', user.id, ':', e.message)
    return NextResponse.json({ error: 'fetch_failed' }, { status: 502 })
  }
}
```

- [ ] **Step 4: Create `src/app/wildberries/orders/page.tsx`** — full file:

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'

const EASE = [0.16, 1, 0.3, 1] as const

type Order = { orderId: number; article: string; createdAt: string; status: string }

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-KZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function WildberriesOrdersPage() {
  const router = useRouter()
  const reduceMotion = !!useReducedMotion()
  const [loading, setLoading] = useState(true)
  const [notConnected, setNotConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [printing, setPrinting] = useState(false)

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const headers = await authHeader()
      const res = await fetch('/api/wildberries/orders', { headers })
      if (res.status === 404) { setNotConnected(true); setLoading(false); return }
      if (res.ok) {
        const data = await res.json()
        setOrders(Array.isArray(data.orders) ? data.orders : [])
      } else {
        setError('Не удалось загрузить заказы. Попробуйте обновить страницу.')
      }
      setLoading(false)
    }
    load()
  }, [router])

  function toggleSelected(orderId: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId); else next.add(orderId)
      return next
    })
  }

  async function printStickers() {
    if (selected.size === 0) return
    setPrinting(true)
    setError(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/wildberries/orders/stickers', {
        method: 'POST', headers, body: JSON.stringify({ orderIds: Array.from(selected) }),
      })
      if (!res.ok) { setError('Не удалось получить этикетки.'); return }
      const data = await res.json()
      const stickers: string[] = Array.isArray(data.stickers) ? data.stickers : []
      stickers.forEach((base64, i) => {
        const link = document.createElement('a')
        link.href = `data:image/png;base64,${base64}`
        link.download = `wb-sticker-${i + 1}.png`
        link.click()
      })
    } catch {
      setError('Ошибка сети. Проверьте соединение и попробуйте ещё раз.')
    }
    setPrinting(false)
  }

  if (loading) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загрузка…</div>
    </main>
    </DesktopShell>
  )

  if (notConnected) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>
        Сначала подключите Wildberries на <a href="/wildberries" className="font-semibold" style={{ color: 'var(--nav-accent)' }}>странице подключения</a>
      </div>
    </main>
    </DesktopShell>
  )

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-4xl mx-auto p-4 lg:p-6 pb-24 lg:pb-6">
        <motion.div
          className="flex items-center justify-between gap-3 mb-4 flex-wrap"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <h1 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>Заказы</h1>
          {selected.size > 0 && (
            <button onClick={printStickers} disabled={printing}
              className="text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-50"
              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
              {printing ? 'Готовим…' : `Печать этикеток (${selected.size})`}
            </button>
          )}
        </motion.div>

        {error && <div className="text-sm py-4" style={{ color: 'var(--nav-critical)' }}>{error}</div>}

        {!error && orders.length === 0 ? (
          <div className="text-sm text-center py-16" style={{ color: 'var(--nav-text-muted)' }}>Заказов пока нет</div>
        ) : (
          <div className="space-y-2">
            {orders.map(o => (
              <div key={o.orderId} onClick={() => toggleSelected(o.orderId)}
                className="nav-glass rounded-2xl p-3 flex items-center gap-3 cursor-pointer"
                style={{ outline: selected.has(o.orderId) ? '2px solid var(--nav-accent)' : 'none', outlineOffset: -2 }}>
                <input type="checkbox" checked={selected.has(o.orderId)} onChange={() => toggleSelected(o.orderId)} onClick={e => e.stopPropagation()} />
                <div className="flex-1">
                  <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{o.article}</div>
                  <div className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>№{o.orderId} · {formatDate(o.createdAt)}</div>
                </div>
                <div className="text-xs font-semibold" style={{ color: 'var(--nav-text-secondary)' }}>{o.status}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
    </DesktopShell>
  )
}
```

- [ ] **Step 5: Run the gate**

Run: `npx tsc --noEmit` → expect clean.
Run: `npx vitest run` → expect all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/wildberries/orders.ts src/app/api/wildberries/orders src/app/wildberries/orders/page.tsx
git status --short
git commit -m "feat(wildberries): orders view + label printing"
```

---

### Task 7: Navigation — new admin-gated «Wildberries» section

**Files:**
- Modify: `src/components/SiteNav.tsx`

**Interfaces:** none new — wires up pages from Tasks 4/5/6.

- [ ] **Step 1: Add the labels entry** — change the `labels` type/values at the top of the file. Change:

```ts
const labels: Record<Lang, { home: string; invoices: string; kaspiShop: string; aiAgent: string; kaspiApi: string; profile: string; history: string; menu: string; close: string }> = {
  ru: { home: 'Дашборд', invoices: 'Счета', kaspiShop: 'Kaspi Bot', aiAgent: 'AI-агент', kaspiApi: 'Kaspi API', profile: 'Профиль', history: 'История', menu: 'Меню', close: 'Закрыть' },
  kk: { home: 'Дашборд', invoices: 'Шоттар', kaspiShop: 'Kaspi Bot', aiAgent: 'AI-агент', kaspiApi: 'Kaspi API', profile: 'Профиль', history: 'Тарих', menu: 'Мәзір', close: 'Жабу' },
  en: { home: 'Dashboard', invoices: 'Invoices', kaspiShop: 'Kaspi Bot', aiAgent: 'AI Agent', kaspiApi: 'Kaspi API', profile: 'Profile', history: 'History', menu: 'Menu', close: 'Close' },
}
```

to:

```ts
const labels: Record<Lang, { home: string; invoices: string; kaspiShop: string; aiAgent: string; kaspiApi: string; wildberries: string; profile: string; history: string; menu: string; close: string }> = {
  ru: { home: 'Дашборд', invoices: 'Счета', kaspiShop: 'Kaspi Bot', aiAgent: 'AI-агент', kaspiApi: 'Kaspi API', wildberries: 'Wildberries', profile: 'Профиль', history: 'История', menu: 'Меню', close: 'Закрыть' },
  kk: { home: 'Дашборд', invoices: 'Шоттар', kaspiShop: 'Kaspi Bot', aiAgent: 'AI-агент', kaspiApi: 'Kaspi API', wildberries: 'Wildberries', profile: 'Профиль', history: 'Тарих', menu: 'Мәзір', close: 'Жабу' },
  en: { home: 'Dashboard', invoices: 'Invoices', kaspiShop: 'Kaspi Bot', aiAgent: 'AI Agent', kaspiApi: 'Kaspi API', wildberries: 'Wildberries', profile: 'Profile', history: 'History', menu: 'Menu', close: 'Close' },
}
```

- [ ] **Step 2: Add the links array and register the section** — add this new array right after `kaspiApiLinks`:

```ts
const wbLinks: { href: string; label: LocalizedLabel }[] = [
  { href: '/wildberries', label: { ru: 'Подключение', kk: 'Қосылу', en: 'Connect' } },
  { href: '/wildberries/products', label: { ru: 'Товары', kk: 'Тауарлар', en: 'Products' } },
  { href: '/wildberries/orders', label: { ru: 'Заказы', kk: 'Тапсырыстар', en: 'Orders' } },
]
```

Then change the `Section` type and `SECTIONS` array:

```ts
type Section = {
  key: 'invoices' | 'kaspiApi' | 'kaspiShop' | 'aiAgent'
  links: { href: string; label: LocalizedLabel }[]
  adminOnly: boolean
}

const SECTIONS: Section[] = [
  { key: 'invoices', links: invoicesLinks, adminOnly: false },
  { key: 'kaspiApi', links: kaspiApiLinks, adminOnly: false },
  { key: 'kaspiShop', links: kaspiShopLinks, adminOnly: true },
  { key: 'aiAgent', links: aiAgentLinks, adminOnly: true },
]
```

to:

```ts
type Section = {
  key: 'invoices' | 'kaspiApi' | 'kaspiShop' | 'aiAgent' | 'wildberries'
  links: { href: string; label: LocalizedLabel }[]
  adminOnly: boolean
}

const SECTIONS: Section[] = [
  { key: 'invoices', links: invoicesLinks, adminOnly: false },
  { key: 'kaspiApi', links: kaspiApiLinks, adminOnly: false },
  { key: 'kaspiShop', links: kaspiShopLinks, adminOnly: true },
  { key: 'aiAgent', links: aiAgentLinks, adminOnly: true },
  { key: 'wildberries', links: wbLinks, adminOnly: true },
]
```

- [ ] **Step 3: Add the mobile drawer entry** — find the mobile nav list (the array containing the `/kaspi-shop`/`/ai-agent/settings` entries with `locked: !isAdmin`) and add a matching line:

```ts
            { href: '/kaspi-shop', label: labels[lang].kaspiShop, locked: !isAdmin, hintId: 'mobile-kaspiShop' },
            { href: '/ai-agent/settings', label: labels[lang].aiAgent, locked: !isAdmin, hintId: 'mobile-aiAgent' },
```

to:

```ts
            { href: '/kaspi-shop', label: labels[lang].kaspiShop, locked: !isAdmin, hintId: 'mobile-kaspiShop' },
            { href: '/ai-agent/settings', label: labels[lang].aiAgent, locked: !isAdmin, hintId: 'mobile-aiAgent' },
            { href: '/wildberries', label: labels[lang].wildberries, locked: !isAdmin, hintId: 'mobile-wildberries' },
```

- [ ] **Step 4: Run the gate**

Run: `npx tsc --noEmit` → expect clean.
Run: `npx vitest run` → expect all pass.

- [ ] **Step 5: Commit**

Check `git status --short` first — `SiteNav.tsx` is shared with a concurrently-active parallel Claude session in this repo; confirm the diff is exactly these changes before staging.

```bash
git add src/components/SiteNav.tsx
git status --short
git commit -m "feat(wildberries): admin-gated Wildberries nav section"
```

---

### Task 8: Ship

**Files:** none (verification only).

- [ ] **Step 1:** Full gate: `npx vitest run`, `npx tsc --noEmit`, `npm run build` — all clean.
- [ ] **Step 2:** `git pull --rebase --autostash` (a parallel session may have pushed), then `git push origin main`.
- [ ] **Step 3:** Confirm the Vercel deployment for the pushed commit(s) reaches READY (targeted `get_deployment` check, not a broad list).
- [ ] **Step 4:** Tell the founder to generate `WB_ENCRYPTION_KEY` (`openssl rand -hex 32`) and add it to Vercel Production, then redeploy — the connect flow will fail with a clear server error until this is set, matching every other integration's own external-setup step.
- [ ] **Step 5: Honest live-test caveat for the founder**: without a real WB seller account, none of the actual API calls (ping, price list, orders, stickers) have been exercised against Wildberries' real servers in this build — only the JWT-decode logic and the UI flow around it are genuinely tested. When a real WB token becomes available, the very first live click-through should specifically check: (a) does `/ping` actually behave as expected for a valid token (not just the confirmed-live 401 for an invalid one), (b) do the assumed JSON field names in `catalog.ts`/`orders.ts` match what WB actually returns. Any mismatch there is expected to need a small, targeted fix once real data is in hand — not a sign the whole approach was wrong.

## Self-Review (done at write time)

- **Spec coverage:** connection with JWT decode/expiry tracking (T2/T3/T4); live (non-persisted) catalog with the honest СПП caveat (T5); live orders + PNG label printing (T6); new admin-gated top-level nav section (T7); external `WB_ENCRYPTION_KEY` step + honest no-live-account caveat (T8). Out-of-scope items (price writing, repricer, niches, finance, returns, business-catalog registration, any billing) have no tasks — correct.
- **Placeholder scan:** none found — every step has complete, runnable code.
- **Type consistency:** `WbConnection`/`WbProduct`/`WbOrder` field names match exactly between their producing module (T3/T5/T6) and every route/page that consumes them. `decodeWbToken`'s `{expiresAt, claims}` return shape (T2) matches exactly how `saveConnection` (T3) destructures it.
- **Honesty discipline, checked against the spec's own testing section**: every WB response-shape assumption in `catalog.ts`/`orders.ts`/`connection.ts` carries an explicit "not verified live" comment, and Task 8 hands the founder a concrete first-live-test checklist rather than implying the feature is proven. The `granted_categories`→`decoded_claims` rename (Global Constraints) is the one deliberate scope correction made during planning, not discovered later — it replaces a curated-but-unverifiable "which categories" UI with an honest raw-payload field, matching this codebase's `/kaspi-shop/nkt` precedent for admitting what isn't confirmed.
