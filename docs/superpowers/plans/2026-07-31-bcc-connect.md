# Подключение BCC (Connect BCC Account) — Acquiring v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 1 must be executed by the session controller directly — it requires an already-authenticated BCC developer portal browser session that a fresh subagent does not have. Do not dispatch Task 1 to a subagent.**

**Goal:** Let a Pro user connect their own BCC (Bank CenterCredit) business account via OAuth2, so incoming payments are matched against their open invoices automatically on a daily schedule, extending the already-shipped manual-Excel-import Acquiring feature at `/profile/acquiring`.

**Architecture:** A one-time OAuth2 authorization-code flow (three new API routes: connect/callback/disconnect) stores per-user BCC tokens server-side only (new `bcc_connections` table, no client RLS access). A daily cron route fetches each connected user's statement, reuses the existing pure `findMatches`/`normalizeBin` matching logic unchanged, and stores only the resulting match summaries (new `bcc_pending_matches` table, client-readable) until the user confirms them with the existing one-click "Подтвердить оплату" flow.

**Tech Stack:** Next.js App Router route handlers (Node runtime), `crypto` (Node builtin, already used in this codebase for HMAC — see `src/lib/webhookSignature.ts`), Supabase JS client (service-role for privileged tables), Resend (already used for cron emails), Vitest.

## Global Constraints

- Pro plan only — reuses the existing `canAcquiring` flag (`src/lib/plan.ts`), no new flag.
- Tokens (`bcc_connections.access_token`/`refresh_token`) are never sent to the browser and never queried by the client — every read/write of that table happens through a service-role Supabase client inside a server route.
- `bcc_pending_matches` holds only match summaries (invoice id + matched amount/date/description) — never raw, unrelated statement rows.
- No auto-confirmation — every match (file-based or BCC-based) still requires the user's explicit click, reusing the exact `invoices.update({status:'paid'})` + `invoice_logs.insert(...)` pattern already in `src/app/profile/acquiring/page.tsx`.
- Cron runs once daily, gated by the same `CRON_SECRET` bearer-token pattern already used in `src/app/api/cron/notifications/route.ts:44-48`.
- Confirmed live endpoints (read directly from `developer.bcc.kz`'s authenticated docs this session — do not re-derive from training-data assumptions about generic OAuth2/Apigee portals):
  - App-level client-credentials token: `POST https://api.bcc.kz:11443/bcc/production/v2/oauth/token`, scope `bcc.application.business.account.management`.
  - User auth-code exchange / refresh: `POST https://api.bcc.kz:11443/bcc/production/v1/auth-client/token`, body `{ redirect_uri, grant_type: 'authorization_code'|'refresh_token', client_secret, code|refresh_token }`, header `Authorization: Bearer <app-level token>`.
  - Authorization URL: `POST https://api.bcc.kz:11443/bcc/production/v1/auth-client/generate-auth-url`, body `{ redirect_uri, client_idn }`, header `Authorization: Bearer <app-level token>` → returns `{ authUrl }`.
  - Revoke: `POST https://api.bcc.kz:11443/bcc/production/v1/auth-client/revoke`, body `{ token }`, header `Authorization: Bearer <app-level token>`.
  - List accounts: `GET https://api.bcc.kz:11443/bcc/production/v1/business-account-management/accounts`, headers `Authorization: Bearer <app-level token>` **and** `x-client-token: <user access_token>` — returns `[{ iban, currency, status, is_main, ... }]`.
  - Statement: `GET https://api.bcc.kz:11443/bcc/production/v1/business-account-management/accounts/{iban}/statement?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&currency=...`, same two-header auth as above — returns `{ transactions: [{ valueDate, amount, partyIdn (number), purpose, ... }] }`.
  - **Every BCC call needing the app-level token must mint one fresh via the client-credentials endpoint** — this codebase has no cross-request in-memory cache (serverless functions don't share state reliably between invocations), so `getBccAppToken()` is called once per request/cron-iteration, not cached. This is simple and correct; revisit only if BCC's rate limits ever complain.
  - BCC's portal lists four host variants for every single endpoint (`api.bcc.kz:11443`, `api.bcc.kz`, `api-test.bcc.kz`, `api-sandbox.bcc.kz`), all labeled "Production, Development" and — tellingly — all sharing the exact same `/bcc/production/...` path regardless of host. This reads as host-level environment routing rather than a genuinely separate sandbox with different fake data, but it was not possible to confirm which without live credentials (which don't exist until Task 1). Task 2 makes only the **host** configurable via `BCC_API_HOST` (default `api.bcc.kz:11443`) so this can be swapped during Task 6's manual verification without a code change, if the primary host doesn't behave as expected.
- Full spec: `docs/superpowers/specs/2026-07-31-bcc-connect-design.md` — read it if anything below is ambiguous.

---

### Task 1: Register invoices.kz as a BCC application (controller-executed, not a subagent)

**Files:** none (external portal action) + append to `.env.local`

This task creates the actual OAuth client credentials every other task depends on. It must be done by whoever holds the already-authenticated `developer.bcc.kz` session (account `invoiceskz_dev`, per `bcc_developer_portal_reference.md` memory) — a fresh subagent has no access to that session and cannot do this step.

- [ ] **Step 1: Create the application**

Navigate to `https://developer.bcc.kz/ru/application/new`. Fill in:
- Title: `invoices.kz`
- Описание: `invoices.kz — сервис для выставления счетов, интеграция BCC для автоматического сопоставления оплат`
- URL-адрес(а) перенаправления OAuth приложения: `https://www.invoices.kz/api/bcc/callback`

Submit. The resulting application detail page shows a `client_id` and `client_secret` (or a way to reveal/generate the secret) — copy both.

- [ ] **Step 2: Subscribe the application to the Business Account Management product**

On the application's detail page (or via `/ru/product/6155`), subscribe/add the "Business Account Management API" product (id 6155) to this application — this product bundles both the statement API and the "Авторизация для клиентов" (Client Authorization) sub-API needed for the OAuth flow, confirmed to live under the same product id during this session's research.

- [ ] **Step 3: Generate the state-signing secret**

```bash
openssl rand -hex 32
```

- [ ] **Step 4: Store secrets locally for development**

Append to `.env.local` (create the three keys if the file doesn't already define them):

```
BCC_CLIENT_ID=<client_id from Step 1>
BCC_CLIENT_SECRET=<client_secret from Step 1>
BCC_STATE_SECRET=<output of Step 3>
```

These same three values will need to be added to Vercel's Production environment in Task 12 before this feature works in production — Task 12 has the exact reminder. Do **not** add `BCC_API_HOST` to `.env.local` unless Task 6's manual verification shows the default host doesn't work — it's optional and only exists as an escape hatch (see Task 2).

---

### Task 2: `src/lib/bccAuth.ts` — shared app-level token + base URLs

**Files:**
- Create: `src/lib/bccAuth.ts`

**Interfaces:**
- Consumes: `process.env.BCC_CLIENT_ID`, `process.env.BCC_CLIENT_SECRET` (Task 1).
- Produces: `BCC_AUTH_CLIENT_BASE`, `BCC_BUSINESS_ACCOUNT_BASE` constants and `getBccAppToken(): Promise<string>` — imported by Tasks 6, 7, 8, 9 (every route that talks to BCC).

No test for this file — it's a thin network call (I/O-heavy glue), matching this codebase's existing convention of not unit-testing route-level API glue (see `docs/superpowers/specs/2026-07-31-bcc-connect-design.md`'s Testing section). Task 6's manual verification step is what actually exercises this against BCC's real endpoint.

- [ ] **Step 1: Implement**

Create `src/lib/bccAuth.ts`:

```ts
// BCC's portal lists api.bcc.kz:11443, api.bcc.kz, api-test.bcc.kz, and
// api-sandbox.bcc.kz as the "Production, Development" hosts for every
// endpoint — all sharing the same /bcc/production/... path regardless of
// host. Default to the primary one; override via BCC_API_HOST in .env.local
// (e.g. BCC_API_HOST=api-sandbox.bcc.kz) if it doesn't behave as expected.
const BCC_HOST = process.env.BCC_API_HOST || 'api.bcc.kz:11443'
export const BCC_AUTH_CLIENT_BASE = `https://${BCC_HOST}/bcc/production/v1/auth-client`
export const BCC_BUSINESS_ACCOUNT_BASE = `https://${BCC_HOST}/bcc/production/v1/business-account-management`
const BCC_OAUTH_TOKEN_URL = `https://${BCC_HOST}/bcc/production/v2/oauth/token`

// App-level (client-credentials) token — authenticates invoices.kz itself to
// BCC's API gateway. Distinct from the per-user token obtained through the
// authorization-code flow (see src/lib/bccState.ts and the connect/callback
// routes) — BCC's statement API requires BOTH on every call.
export async function getBccAppToken(): Promise<string> {
  const res = await fetch(BCC_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${process.env.BCC_CLIENT_ID}:${process.env.BCC_CLIENT_SECRET}`).toString('base64'),
    },
    body: 'grant_type=client_credentials&scope=bcc.application.business.account.management',
  })
  if (!res.ok) {
    throw new Error(`BCC app token request failed: ${res.status} ${await res.text()}`)
  }
  const data = await res.json()
  return data.access_token as string
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/bccAuth.ts
git commit -m "add shared BCC app-level token helper and base URLs"
```

---

### Task 3: `src/lib/bccState.ts` — signed OAuth `state` parameter

**Files:**
- Create: `src/lib/bccState.ts`
- Test: `src/lib/bccState.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces: `signState(userId: string, secret: string): string`, `verifyState(state: string, secret: string): { userId: string } | null` — consumed by Task 6 (connect, signs) and Task 7 (callback, verifies).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/bccState.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { signState, verifyState } from './bccState'

describe('signState / verifyState', () => {
  const secret = 'test-secret'

  it('round-trips a valid state', () => {
    const state = signState('user-123', secret)
    expect(verifyState(state, secret)).toEqual({ userId: 'user-123' })
  })

  it('rejects a state signed with a different secret', () => {
    const state = signState('user-123', secret)
    expect(verifyState(state, 'wrong-secret')).toBeNull()
  })

  it('rejects a tampered payload', () => {
    const state = signState('user-123', secret)
    const decoded = Buffer.from(state, 'base64url').toString('utf8')
    const tampered = decoded.replace('user-123', 'attacker-999')
    const tamperedState = Buffer.from(tampered).toString('base64url')
    expect(verifyState(tamperedState, secret)).toBeNull()
  })

  it('rejects garbage input without throwing', () => {
    expect(verifyState('not-valid-state', secret)).toBeNull()
  })

  it('rejects an expired state', () => {
    vi.useFakeTimers()
    const state = signState('user-123', secret)
    vi.advanceTimersByTime(11 * 60 * 1000)
    expect(verifyState(state, secret)).toBeNull()
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/bccState.test.ts`
Expected: FAIL with "Cannot find module './bccState'".

- [ ] **Step 3: Implement**

Create `src/lib/bccState.ts`:

```ts
import crypto from 'crypto'

const MAX_AGE_MS = 10 * 60 * 1000 // 10 minutes

export function signState(userId: string, secret: string): string {
  const nonce = crypto.randomBytes(16).toString('hex')
  const timestamp = Date.now().toString()
  const payload = `${userId}:${nonce}:${timestamp}`
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  return Buffer.from(`${payload}:${signature}`).toString('base64url')
}

export function verifyState(state: string, secret: string): { userId: string } | null {
  let decoded: string
  try {
    decoded = Buffer.from(state, 'base64url').toString('utf8')
  } catch {
    return null
  }
  const parts = decoded.split(':')
  if (parts.length !== 4) return null
  const [userId, nonce, timestamp, signature] = parts

  const payload = `${userId}:${nonce}:${timestamp}`
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  const sigBuf = Buffer.from(signature, 'hex')
  const expBuf = Buffer.from(expected, 'hex')
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null

  const age = Date.now() - Number(timestamp)
  if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) return null

  return { userId }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/bccState.test.ts`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bccState.ts src/lib/bccState.test.ts
git commit -m "add signed OAuth state helper for the BCC connect flow"
```

---

### Task 4: `src/lib/bccStatement.ts` — map BCC transactions to `StatementRow[]`

**Files:**
- Create: `src/lib/bccStatement.ts`
- Test: `src/lib/bccStatement.test.ts`

**Interfaces:**
- Consumes: `StatementRow` type from `./acquiringMatch` (already shipped).
- Produces: `BccTransaction` type, `mapBccTransactions(transactions: BccTransaction[]): StatementRow[]` — consumed by Task 9's cron route.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/bccStatement.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mapBccTransactions, BccTransaction } from './bccStatement'

function tx(overrides: Partial<BccTransaction> = {}): BccTransaction {
  return { valueDate: '2026-07-01', amount: 100000, partyIdn: 123456789012, purpose: 'Оплата по счету', ...overrides }
}

describe('mapBccTransactions', () => {
  it('maps BCC transaction fields to StatementRow', () => {
    const rows = mapBccTransactions([tx()])
    expect(rows).toEqual([{ date: '2026-07-01', amount: 100000, bin: '123456789012', description: 'Оплата по счету' }])
  })

  it('skips transactions with no partyIdn', () => {
    const rows = mapBccTransactions([tx({ partyIdn: '' })])
    expect(rows).toHaveLength(0)
  })

  it('normalizes a partyIdn containing formatting characters', () => {
    const rows = mapBccTransactions([tx({ partyIdn: '123 456 789 012' })])
    expect(rows[0].bin).toBe('123456789012')
  })

  it('defaults description to empty string when purpose is missing', () => {
    const rows = mapBccTransactions([tx({ purpose: undefined as any })])
    expect(rows[0].description).toBe('')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/bccStatement.test.ts`
Expected: FAIL with "Cannot find module './bccStatement'".

- [ ] **Step 3: Implement**

Create `src/lib/bccStatement.ts`:

```ts
import { StatementRow } from './acquiringMatch'

// BCC's live example response returns partyIdn as a JSON number
// (e.g. 100100100100), not a string — String() it before stripping
// non-digit characters so normalization behaves the same either way.
export interface BccTransaction {
  valueDate: string
  amount: number
  partyIdn: string | number
  purpose?: string
}

export function mapBccTransactions(transactions: BccTransaction[]): StatementRow[] {
  return transactions
    .filter(t => String(t.partyIdn ?? '').trim() !== '')
    .map(t => ({
      date: t.valueDate,
      amount: Number(t.amount),
      bin: String(t.partyIdn).replace(/\D/g, ''),
      description: t.purpose || '',
    }))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/bccStatement.test.ts`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bccStatement.ts src/lib/bccStatement.test.ts
git commit -m "add BCC transaction to StatementRow mapper"
```

---

### Task 5: Database schema — `bcc_connections` and `bcc_pending_matches`

**Files:** none in the repo (this codebase has no `supabase/migrations` directory — schema changes are applied directly against the live Supabase project, same as this session's earlier `is_admin`/webhook fixes)

**Interfaces:**
- Produces: the two tables, consumed by Tasks 7, 8, 9 (service-role reads/writes) and Task 11 (client-side `bcc_pending_matches` select via RLS).

- [ ] **Step 1: Apply the schema**

Using the Supabase MCP tool (`apply_migration` or `execute_sql`), run:

```sql
create table bcc_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  iban text not null,
  currency text not null,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  status text not null default 'active',
  last_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id)
);
alter table bcc_connections enable row level security;

create table bcc_pending_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete cascade,
  matched_amount numeric not null,
  matched_date text,
  matched_description text,
  created_at timestamptz not null default now()
);
alter table bcc_pending_matches enable row level security;

create policy "users read own pending matches" on bcc_pending_matches
  for select using (auth.uid() = user_id);
```

Note: `bcc_connections` intentionally gets **no** RLS policy at all beyond `enable row level security` — with RLS enabled and zero policies, no role except `service_role` (which bypasses RLS) can read or write it. This is deliberate, not an oversight: verify this is what got applied in Step 2.

- [ ] **Step 2: Verify**

Using the Supabase MCP `list_tables` tool (or `execute_sql` with `select * from information_schema.tables where table_name in ('bcc_connections','bcc_pending_matches')`), confirm both tables exist. Using `execute_sql` with `select * from pg_policies where tablename in ('bcc_connections','bcc_pending_matches')`, confirm exactly one policy exists (`bcc_pending_matches`, `select`, `auth.uid() = user_id`) and `bcc_connections` has zero policies.

- [ ] **Step 3: Commit a note**

No file changes to commit for this task (schema lives in Supabase, not the repo) — proceed directly to Task 6. If you want a durable record of exactly what was run, that's what this plan file itself already is.

---

### Task 6: `src/app/api/bcc/connect/route.ts`

**Files:**
- Create: `src/app/api/bcc/connect/route.ts`

**Interfaces:**
- Consumes: `getBccAppToken`, `BCC_AUTH_CLIENT_BASE` (Task 2); `signState` (Task 3); `normalizeBin` from `@/lib/acquiringMatch` (already shipped); `BCC_CLIENT_ID`/`BCC_CLIENT_SECRET`/`BCC_STATE_SECRET` env vars (Task 1).
- Produces: `POST /api/bcc/connect` → `{ authUrl }` on success, `{ error: 'no_bin' | 'bcc_unavailable' }` on failure — consumed by Task 11's page.

- [ ] **Step 1: Implement**

Create `src/app/api/bcc/connect/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizeBin } from '@/lib/acquiringMatch'
import { signState } from '@/lib/bccState'
import { getBccAppToken, BCC_AUTH_CLIENT_BASE } from '@/lib/bccAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const REDIRECT_URI = 'https://www.invoices.kz/api/bcc/callback'

export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('bin_iin').eq('id', user.id).single()
  if (!profile?.bin_iin) {
    return NextResponse.json({ error: 'no_bin' }, { status: 400 })
  }

  let appToken: string
  try {
    appToken = await getBccAppToken()
  } catch (e: any) {
    console.error('BCC app token error:', e.message)
    return NextResponse.json({ error: 'bcc_unavailable' }, { status: 502 })
  }

  const authUrlRes = await fetch(`${BCC_AUTH_CLIENT_BASE}/generate-auth-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${appToken}`,
    },
    body: JSON.stringify({
      redirect_uri: REDIRECT_URI,
      client_idn: normalizeBin(profile.bin_iin),
    }),
  })
  if (!authUrlRes.ok) {
    console.error('BCC generate-auth-url error:', authUrlRes.status, await authUrlRes.text())
    return NextResponse.json({ error: 'bcc_unavailable' }, { status: 502 })
  }
  const { authUrl } = await authUrlRes.json()

  // BCC's authUrl is a standard Keycloak authorization endpoint
  // (/auth/realms/.../protocol/openid-connect/auth) — appending our own
  // signed `state` here is standard OAuth2 practice, and lets
  // /api/bcc/callback verify the redirect wasn't forged before trusting
  // the user_id it carries.
  const url = new URL(authUrl)
  url.searchParams.set('state', signState(user.id, process.env.BCC_STATE_SECRET!))

  return NextResponse.json({ authUrl: url.toString() })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification against BCC's sandbox**

Run `npm run dev`, sign in as a Pro-plan user whose profile has `bin_iin` set, and call:

```bash
curl -X POST http://localhost:3000/api/bcc/connect -H "Authorization: Bearer <a real session access_token from the browser's devtools>"
```

Expected: `{"authUrl": "https://...auth/realms/.../protocol/openid-connect/auth?...&state=..."}`. If this instead returns `{"error":"bcc_unavailable"}`, check the terminal log for the request/response BCC returned — the most likely cause is the client-credentials request's exact encoding, which this codebase had not previously confirmed. Try these variants in `src/lib/bccAuth.ts`'s `getBccAppToken` if the Basic-auth-header approach fails:
1. `client_id`/`client_secret` as body fields instead of the `Authorization: Basic` header: `body: 'grant_type=client_credentials&scope=bcc.application.business.account.management&client_id=' + process.env.BCC_CLIENT_ID + '&client_secret=' + encodeURIComponent(process.env.BCC_CLIENT_SECRET!)`.
2. `application/json` content type with a JSON body instead of form-encoded, same fields.

Whichever variant returns a 200 with an `access_token` field is correct — update `getBccAppToken` accordingly and note the working shape in a comment.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/bcc/connect/route.ts
git commit -m "add BCC connect route: mints authUrl for the user to authorize"
```

---

### Task 7: `src/app/api/bcc/callback/route.ts`

**Files:**
- Create: `src/app/api/bcc/callback/route.ts`

**Interfaces:**
- Consumes: `verifyState` (Task 3); `getBccAppToken`, `BCC_AUTH_CLIENT_BASE`, `BCC_BUSINESS_ACCOUNT_BASE` (Task 2); `bcc_connections` table (Task 5).
- Produces: `GET /api/bcc/callback` — a redirect to `/profile/acquiring?bcc=connected` or `?bcc=error`, consumed by Task 11's page (which reads that query param).

- [ ] **Step 1: Implement**

Create `src/app/api/bcc/callback/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyState } from '@/lib/bccState'
import { getBccAppToken, BCC_AUTH_CLIENT_BASE, BCC_BUSINESS_ACCOUNT_BASE } from '@/lib/bccAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const REDIRECT_URI = 'https://www.invoices.kz/api/bcc/callback'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  if (!code || !state) {
    return NextResponse.redirect('https://www.invoices.kz/profile/acquiring?bcc=error')
  }

  const verified = verifyState(state, process.env.BCC_STATE_SECRET!)
  if (!verified) {
    console.error('BCC callback: invalid or expired state')
    return NextResponse.redirect('https://www.invoices.kz/profile/acquiring?bcc=error')
  }

  try {
    const appToken = await getBccAppToken()

    const tokenRes = await fetch(`${BCC_AUTH_CLIENT_BASE}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${appToken}`,
      },
      body: JSON.stringify({
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
        client_secret: process.env.BCC_CLIENT_SECRET,
        code,
      }),
    })
    if (!tokenRes.ok) throw new Error(`token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`)
    const { access_token, refresh_token, expires_in } = await tokenRes.json()

    const accountsRes = await fetch(`${BCC_BUSINESS_ACCOUNT_BASE}/accounts`, {
      headers: {
        'Authorization': `Bearer ${appToken}`,
        'x-client-token': access_token,
        'accept': 'application/json',
      },
    })
    if (!accountsRes.ok) throw new Error(`accounts fetch failed: ${accountsRes.status} ${await accountsRes.text()}`)
    const accounts = await accountsRes.json()
    const account = accounts.find((a: any) => a.is_main) || accounts[0]
    if (!account) throw new Error('no accounts returned for this user')

    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString()

    await supabase.from('bcc_connections').upsert({
      user_id: verified.userId,
      iban: account.iban,
      currency: account.currency,
      access_token,
      refresh_token,
      expires_at: expiresAt,
      status: 'active',
      last_checked_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

    return NextResponse.redirect('https://www.invoices.kz/profile/acquiring?bcc=connected')
  } catch (e: any) {
    console.error('BCC callback error:', e.message)
    return NextResponse.redirect('https://www.invoices.kz/profile/acquiring?bcc=error')
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual end-to-end verification**

With Task 6 already verified working (real `authUrl` returned), open that URL in a browser, log into the BCC sandbox test account, approve consent, and confirm the browser lands on `/profile/acquiring?bcc=connected`. Then check via the Supabase MCP `execute_sql` tool: `select user_id, iban, currency, status from bcc_connections;` — confirm a row exists with the expected `user_id` and a real-looking `iban`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/bcc/callback/route.ts
git commit -m "add BCC callback route: exchanges code for tokens, stores connection"
```

---

### Task 8: `src/app/api/bcc/disconnect/route.ts`

**Files:**
- Create: `src/app/api/bcc/disconnect/route.ts`

**Interfaces:**
- Consumes: `getBccAppToken`, `BCC_AUTH_CLIENT_BASE` (Task 2); `bcc_connections`/`bcc_pending_matches` tables (Task 5).
- Produces: `POST /api/bcc/disconnect` → `{ ok: true }`, consumed by Task 11's page.

- [ ] **Step 1: Implement**

Create `src/app/api/bcc/disconnect/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getBccAppToken, BCC_AUTH_CLIENT_BASE } from '@/lib/bccAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: connection } = await supabase
    .from('bcc_connections')
    .select('access_token')
    .eq('user_id', user.id)
    .maybeSingle()

  if (connection) {
    try {
      const appToken = await getBccAppToken()
      await fetch(`${BCC_AUTH_CLIENT_BASE}/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${appToken}`,
        },
        body: JSON.stringify({ token: connection.access_token }),
      })
    } catch (e: any) {
      // Best-effort — even if BCC's revoke call fails, we still remove our
      // own copy of the token below so the user's disconnect always
      // succeeds from their point of view.
      console.error('BCC revoke error:', e.message)
    }
  }

  await supabase.from('bcc_pending_matches').delete().eq('user_id', user.id)
  await supabase.from('bcc_connections').delete().eq('user_id', user.id)

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

With a connection already established (from Task 7's verification), call `POST /api/bcc/disconnect` with the same user's session token. Confirm via `execute_sql`: `select count(*) from bcc_connections;` returns `0` for that user.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/bcc/disconnect/route.ts
git commit -m "add BCC disconnect route"
```

---

### Task 9: `src/app/api/cron/bcc-check/route.ts` + cron schedule

**Files:**
- Create: `src/app/api/cron/bcc-check/route.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `getBccAppToken`, `BCC_AUTH_CLIENT_BASE`, `BCC_BUSINESS_ACCOUNT_BASE` (Task 2); `mapBccTransactions` (Task 4); `findMatches`, `OpenInvoice` from `@/lib/acquiringMatch` (already shipped); `bcc_connections`/`bcc_pending_matches` tables (Task 5).
- Produces: `GET /api/cron/bcc-check` — nothing else depends on it besides Vercel's own cron scheduler.

- [ ] **Step 1: Implement the route**

Create `src/app/api/cron/bcc-check/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { findMatches, OpenInvoice } from '@/lib/acquiringMatch'
import { mapBccTransactions } from '@/lib/bccStatement'
import { getBccAppToken, BCC_AUTH_CLIENT_BASE, BCC_BUSINESS_ACCOUNT_BASE } from '@/lib/bccAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const resend = new Resend(process.env.RESEND_API_KEY!)

async function refreshAccessToken(appToken: string, refreshToken: string) {
  const res = await fetch(`${BCC_AUTH_CLIENT_BASE}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${appToken}`,
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_secret: process.env.BCC_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok) throw new Error(`refresh failed: ${res.status} ${await res.text()}`)
  return res.json() as Promise<{ access_token: string, refresh_token: string, expires_in: number }>
}

function formatDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: connections } = await supabase
    .from('bcc_connections')
    .select('*')
    .eq('status', 'active')

  // Minted once for the whole run, not per-connection: if BCC's app-level
  // token endpoint itself is down, that's a systemic failure that should
  // abort the run and retry tomorrow with every connection left 'active' —
  // not something that should flip every single user's connection to
  // 'error' just because the app-wide token call failed once.
  let appToken: string
  try {
    appToken = await getBccAppToken()
  } catch (e: any) {
    console.error('BCC cron: app token error, aborting run:', e.message)
    return NextResponse.json({ error: 'bcc_unavailable' }, { status: 502 })
  }

  let checked = 0
  let notified = 0

  for (const conn of (connections || []) as any[]) {
    try {
      let clientToken = conn.access_token
      if (new Date(conn.expires_at) <= new Date()) {
        const refreshed = await refreshAccessToken(appToken, conn.refresh_token)
        clientToken = refreshed.access_token
        await supabase.from('bcc_connections').update({
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        }).eq('id', conn.id)
      }

      const dateFrom = formatDate(new Date(conn.last_checked_at))
      const dateTo = formatDate(new Date())
      const statementUrl = `${BCC_BUSINESS_ACCOUNT_BASE}/accounts/${conn.iban}/statement?dateFrom=${dateFrom}&dateTo=${dateTo}&currency=${conn.currency}`
      const statementRes = await fetch(statementUrl, {
        headers: {
          'Authorization': `Bearer ${appToken}`,
          'x-client-token': clientToken,
          'accept': 'application/json',
        },
      })
      if (!statementRes.ok) throw new Error(`statement fetch failed: ${statementRes.status} ${await statementRes.text()}`)
      const statement = await statementRes.json()
      const rows = mapBccTransactions(statement.transactions || [])

      const { data: invoices } = await supabase
        .from('invoices')
        .select('id, number, client_name, client_bin, amount')
        .eq('user_id', conn.user_id)
        .not('status', 'in', '(paid,cancelled)')
        .not('client_bin', 'is', null)
      const openInvoices = (invoices || []) as OpenInvoice[]
      const openInvoiceIds = new Set(openInvoices.map(i => i.id))

      const { data: existingPending } = await supabase
        .from('bcc_pending_matches')
        .select('id, invoice_id, matched_amount, matched_date')
        .eq('user_id', conn.user_id)

      // Drop stale pending matches for invoices settled through some other
      // route (manual Excel import, direct edit) since the last check —
      // otherwise they'd sit here forever as dead, unconfirmable entries.
      for (const pending of (existingPending || []) as any[]) {
        if (!openInvoiceIds.has(pending.invoice_id)) {
          await supabase.from('bcc_pending_matches').delete().eq('id', pending.id)
        }
      }

      const matches = findMatches(rows, openInvoices)
      let newMatches = 0
      for (const match of matches) {
        const alreadyPending = (existingPending || []).some((p: any) =>
          p.invoice_id === match.invoice.id &&
          Number(p.matched_amount) === Number(match.row.amount) &&
          p.matched_date === match.row.date
        )
        if (alreadyPending) continue
        await supabase.from('bcc_pending_matches').insert({
          user_id: conn.user_id,
          invoice_id: match.invoice.id,
          matched_amount: match.row.amount,
          matched_date: match.row.date,
          matched_description: match.row.description,
        })
        newMatches++
      }

      await supabase.from('bcc_connections').update({ last_checked_at: new Date().toISOString() }).eq('id', conn.id)
      checked++

      if (newMatches > 0) {
        const { data: ownerProfile } = await supabase.from('profiles').select('email').eq('id', conn.user_id).single()
        if (ownerProfile?.email) {
          await resend.emails.send({
            from: 'invoices.kz <mail@invoices.kz>',
            to: ownerProfile.email,
            subject: `Найдено ${newMatches} возможных оплат`,
            html: `<p>По вашему подключённому счёту BCC найдено ${newMatches} операций, совпадающих по БИН и сумме с вашими открытыми счетами. Проверьте и подтвердите их в разделе <a href="https://www.invoices.kz/profile/acquiring">Эквайринг</a>.</p>`,
          })
          notified++
        }
      }
    } catch (e: any) {
      console.error('BCC cron error for connection', conn.id, e.message)
      await supabase.from('bcc_connections').update({ status: 'error' }).eq('id', conn.id)
    }
  }

  return NextResponse.json({ ok: true, checked, notified })
}
```

- [ ] **Step 2: Add the cron schedule**

Modify `vercel.json` — add a third entry to the `crons` array (after the existing two):

```json
{
  "crons": [
    {
      "path": "/api/cron/recurring",
      "schedule": "0 9 1 * *"
    },
    {
      "path": "/api/cron/notifications",
      "schedule": "0 5 * * *"
    },
    {
      "path": "/api/cron/bcc-check",
      "schedule": "0 7 * * *"
    }
  ]
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

With a connection already established, call the route locally with the dev `CRON_SECRET`:

```bash
curl http://localhost:3000/api/cron/bcc-check -H "Authorization: Bearer <your CRON_SECRET from .env.local>"
```

Expected: `{"ok":true,"checked":1,"notified":0 or 1}`. Check `bcc_connections.last_checked_at` advanced, and (if the connected sandbox account has a transaction matching one of your test invoices by BIN+amount) a row appears in `bcc_pending_matches`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/bcc-check/route.ts vercel.json
git commit -m "add daily BCC statement-check cron"
```

---

### Task 10: i18n additions for the connect/disconnect UI

**Files:**
- Modify: `src/lib/i18n/acquiring.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: 10 new keys on `AcquiringContent`, consumed by Task 11's page.

- [ ] **Step 1: Add the new interface fields**

In `src/lib/i18n/acquiring.ts`, add these fields to the `AcquiringContent` interface, right after `multipleMatchesHint: string`:

```ts
  bccSectionTitle: string
  bccConnectButton: string
  bccConnectingLabel: string
  bccDisconnectButton: string
  bccDisconnectingLabel: string
  bccConnectedIbanLabel: string
  bccLastCheckedLabel: string
  bccPendingMatchesLabel: (count: number) => string
  bccConnectedMessage: string
  bccErrorMessage: string
  bccErrorNoBin: string
  bccErrorGeneric: string
```

- [ ] **Step 2: Add the `ru` translations**

In the `ru` block, right after `multipleMatchesHint: '...'`, add:

```ts
    bccSectionTitle: 'Автоматическая проверка через BCC',
    bccConnectButton: 'Подключить счёт BCC',
    bccConnectingLabel: 'Подключаем...',
    bccDisconnectButton: 'Отключить',
    bccDisconnectingLabel: 'Отключаем...',
    bccConnectedIbanLabel: 'Счёт',
    bccLastCheckedLabel: 'Последняя проверка',
    bccPendingMatchesLabel: (count: number) => `Найдено оплат по BCC: ${count}`,
    bccConnectedMessage: 'Счёт BCC успешно подключён.',
    bccErrorMessage: 'Не удалось подключить BCC. Попробуйте ещё раз.',
    bccErrorNoBin: 'Укажите БИН/ИИН в реквизитах перед подключением BCC.',
    bccErrorGeneric: 'Сервис BCC временно недоступен. Попробуйте позже.',
```

- [ ] **Step 3: Add the `kk` translations**

In the `kk` block, right after `multipleMatchesHint: '...'`, add:

```ts
    bccSectionTitle: 'BCC арқылы автоматты тексеру',
    bccConnectButton: 'BCC шотын қосу',
    bccConnectingLabel: 'Қосылуда...',
    bccDisconnectButton: 'Ажырату',
    bccDisconnectingLabel: 'Ажыратылуда...',
    bccConnectedIbanLabel: 'Шот',
    bccLastCheckedLabel: 'Соңғы тексеру',
    bccPendingMatchesLabel: (count: number) => `BCC бойынша табылған төлемдер: ${count}`,
    bccConnectedMessage: 'BCC шоты сәтті қосылды.',
    bccErrorMessage: 'BCC қосу мүмкін болмады. Қайталап көріңіз.',
    bccErrorNoBin: 'BCC қосу алдында деректемелерде БИН/ИИН көрсетіңіз.',
    bccErrorGeneric: 'BCC қызметі уақытша қолжетімсіз. Кейінірек көріңіз.',
```

- [ ] **Step 4: Add the `en` translations**

In the `en` block, right after `multipleMatchesHint: '...'`, add:

```ts
    bccSectionTitle: 'Automatic checking via BCC',
    bccConnectButton: 'Connect BCC account',
    bccConnectingLabel: 'Connecting...',
    bccDisconnectButton: 'Disconnect',
    bccDisconnectingLabel: 'Disconnecting...',
    bccConnectedIbanLabel: 'Account',
    bccLastCheckedLabel: 'Last checked',
    bccPendingMatchesLabel: (count: number) => `Payments found via BCC: ${count}`,
    bccConnectedMessage: 'BCC account connected successfully.',
    bccErrorMessage: 'Could not connect BCC. Please try again.',
    bccErrorNoBin: 'Add your BIN/IIN in your requisites before connecting BCC.',
    bccErrorGeneric: 'The BCC service is temporarily unavailable. Try again later.',
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/i18n/acquiring.ts
git commit -m "add i18n keys for the BCC connect/disconnect UI"
```

---

### Task 11: Wire the "Connected account" section into `/profile/acquiring`

**Files:**
- Modify: `src/app/profile/acquiring/page.tsx`

**Interfaces:**
- Consumes: `/api/bcc/connect`, `/api/bcc/disconnect` (Tasks 6, 8); `bcc_connections`, `bcc_pending_matches` tables (Task 5); the 12 new i18n keys (Task 10).
- Produces: the finished page — nothing else depends on it.

- [ ] **Step 1: Replace the file**

Replace the full contents of `src/app/profile/acquiring/page.tsx` with:

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getActivePlan } from '@/lib/plan'
import { parseStatementFile, AcquiringParseError } from '@/lib/acquiringParse'
import { findMatches, AcquiringMatch, OpenInvoice } from '@/lib/acquiringMatch'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel } from '@/lib/a11yLabels'
import { acquiringDict } from '@/lib/i18n/acquiring'

interface BccConnection {
  iban: string
  last_checked_at: string
  status: string
}

interface BccPendingMatch {
  id: string
  invoice_id: string
  matched_amount: number
  matched_date: string | null
  matched_description: string | null
  invoices: { id: string, number: string, client_name: string | null, client_bin: string | null, amount: number } | null
}

export default function AcquiringPage() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = acquiringDict[lang]

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([])
  const [matches, setMatches] = useState<AcquiringMatch[]>([])
  const [unmatchedCount, setUnmatchedCount] = useState<number | null>(null)
  const [processing, setProcessing] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const [fileName, setFileName] = useState('')

  const [bccConnection, setBccConnection] = useState<BccConnection | null>(null)
  const [bccPending, setBccPending] = useState<BccPendingMatch[]>([])
  const [bccConnecting, setBccConnecting] = useState(false)
  const [bccDisconnecting, setBccDisconnecting] = useState(false)
  const [bccMessage, setBccMessage] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const bccStatus = params.get('bcc')
    if (bccStatus === 'connected') setBccMessage(t.bccConnectedMessage)
    if (bccStatus === 'error') setBccMessage(t.bccErrorMessage)
    if (bccStatus) window.history.replaceState(null, '', '/profile/acquiring')
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(p)

    if (getActivePlan(p).canAcquiring) {
      const { data: invoices } = await supabase
        .from('invoices')
        .select('id, number, client_name, client_bin, amount')
        .eq('user_id', user.id)
        .not('status', 'in', '(paid,cancelled)')
        .not('client_bin', 'is', null)
      setOpenInvoices((invoices as OpenInvoice[]) || [])

      const { data: connection } = await supabase
        .from('bcc_connections')
        .select('iban, last_checked_at, status')
        .eq('user_id', user.id)
        .maybeSingle()
      setBccConnection(connection as BccConnection | null)

      const { data: pending } = await supabase
        .from('bcc_pending_matches')
        .select('id, invoice_id, matched_amount, matched_date, matched_description, invoices(id, number, client_name, client_bin, amount)')
        .eq('user_id', user.id)
      setBccPending((pending as any[] as BccPendingMatch[]) || [])
    }

    setLoading(false)
  }

  async function connectBcc() {
    setBccMessage('')
    setBccConnecting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/bcc/connect', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      })
      const data = await res.json()
      if (!res.ok || !data.authUrl) {
        setBccMessage(data.error === 'no_bin' ? t.bccErrorNoBin : t.bccErrorGeneric)
        return
      }
      window.location.href = data.authUrl
    } finally {
      setBccConnecting(false)
    }
  }

  async function disconnectBcc() {
    setBccDisconnecting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('/api/bcc/disconnect', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      })
      setBccConnection(null)
      setBccPending([])
    } finally {
      setBccDisconnecting(false)
    }
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setMatches([])
    setUnmatchedCount(null)
    setFileName(file.name)
    setProcessing(true)
    try {
      const rows = await parseStatementFile(file)
      const found = findMatches(rows, openInvoices)
      setMatches(found)
      setUnmatchedCount(rows.length - new Set(found.map(m => m.row)).size)
    } catch (e: any) {
      setError(e instanceof AcquiringParseError ? t.parseErrorMessages[e.code] : (e?.message || String(e)))
    } finally {
      setProcessing(false)
    }
  }

  async function confirmPayment(match: AcquiringMatch) {
    setConfirmError('')
    setConfirmingId(match.invoice.id)
    try {
      const { error: updateError } = await supabase.from('invoices').update({ status: 'paid' }).eq('id', match.invoice.id)
      if (updateError) {
        setConfirmError(updateError.message || 'Ошибка при обновлении статуса счета')
        return
      }
      await supabase.from('invoice_logs').insert({ invoice_id: match.invoice.id, status: 'paid' })
      setMatches(prev => prev.filter(m => m.row !== match.row))
      setOpenInvoices(prev => prev.filter(i => i.id !== match.invoice.id))
    } finally {
      setConfirmingId(null)
    }
  }

  async function confirmBccMatch(pending: BccPendingMatch) {
    setConfirmError('')
    setConfirmingId(pending.invoice_id)
    try {
      const { error: updateError } = await supabase.from('invoices').update({ status: 'paid' }).eq('id', pending.invoice_id)
      if (updateError) {
        setConfirmError(updateError.message || 'Ошибка при обновлении статуса счета')
        return
      }
      await supabase.from('invoice_logs').insert({ invoice_id: pending.invoice_id, status: 'paid' })
      await supabase.from('bcc_pending_matches').delete().eq('id', pending.id)
      setBccPending(prev => prev.filter(p => p.id !== pending.id))
      setOpenInvoices(prev => prev.filter(i => i.id !== pending.invoice_id))
    } finally {
      setConfirmingId(null)
    }
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">{t.loadingLabel}</p>
    </main>
  )

  const ap = getActivePlan(profile)

  return (
    <main className="min-h-screen bg-gray-50 pb-8">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/profile')} className="back-btn text-gray-400 text-xl" aria-label={backLabel(lang)}>‹</button>
        <span className="font-semibold text-[#1C2056]">{t.headerLabel}</span>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {!ap.canAcquiring ? (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-[#1C2056]/5 flex items-center justify-center text-xl">🏦</div>
              <div className="text-sm font-medium text-[#1C2056] flex-1">{t.headerLabel}</div>
              <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full flex-shrink-0">
                🔒 {t.proBadge}
              </span>
            </div>
            <div className="text-xs text-gray-400 mb-3">{t.proLockedHint}</div>
            <button onClick={() => router.push('/upgrade')}
              className="w-full bg-[#1C2056] text-white rounded-xl py-2.5 text-sm font-medium">
              {t.goToPlansButton}
            </button>
          </div>
        ) : (
          <>
            <div className="bg-blue-50 rounded-2xl p-4">
              <p className="text-xs text-gray-600 leading-relaxed">{t.introText}</p>
            </div>

            {bccMessage && <p className="text-xs text-[#1C2056] px-1">{bccMessage}</p>}

            <div className="bg-white rounded-2xl shadow-sm p-4">
              <div className="text-sm font-medium text-[#1C2056] mb-2">{t.bccSectionTitle}</div>
              {bccConnection ? (
                <>
                  <div className="text-xs text-gray-500">{t.bccConnectedIbanLabel}: {bccConnection.iban}</div>
                  <div className="text-xs text-gray-400 mb-3">{t.bccLastCheckedLabel}: {new Date(bccConnection.last_checked_at).toLocaleString('ru-KZ')}</div>
                  <button onClick={disconnectBcc} disabled={bccDisconnecting}
                    className="w-full bg-gray-100 text-gray-600 rounded-xl py-2.5 text-sm font-medium">
                    {bccDisconnecting ? t.bccDisconnectingLabel : t.bccDisconnectButton}
                  </button>
                </>
              ) : (
                <button onClick={connectBcc} disabled={bccConnecting}
                  className="w-full bg-[#1C2056] text-white rounded-xl py-2.5 text-sm font-medium">
                  {bccConnecting ? t.bccConnectingLabel : t.bccConnectButton}
                </button>
              )}
            </div>

            {bccPending.length > 0 && (
              <>
                <div className="text-xs text-gray-400 px-1">{t.bccPendingMatchesLabel(bccPending.length)}</div>
                {confirmError && <p className="text-xs text-red-500 mt-2">{t.errorPrefix(confirmError)}</p>}
                {bccPending.map(pending => pending.invoices && (
                  <div key={pending.id} className="bg-white rounded-2xl shadow-sm p-4">
                    <div className="text-sm font-medium text-[#1C2056]">{t.invoiceLabel(pending.invoices.number)}</div>
                    <div className="text-xs text-gray-500 mt-1">{t.clientLabel}: {pending.invoices.client_name || '—'}</div>
                    <div className="text-xs text-gray-500">{t.amountLabel}: {Number(pending.invoices.amount).toLocaleString('ru-KZ')} ₸</div>
                    {pending.matched_date && <div className="text-xs text-gray-400 mt-1">{t.statementDateLabel}: {pending.matched_date}</div>}
                    {pending.matched_description && <div className="text-xs text-gray-400">{t.descriptionLabel}: {pending.matched_description}</div>}
                    <button onClick={() => confirmBccMatch(pending)} disabled={confirmingId === pending.invoice_id}
                      className="w-full bg-[#2DC48D] text-white rounded-xl py-2.5 text-sm font-medium mt-3">
                      {confirmingId === pending.invoice_id ? t.confirmingLabel : t.confirmPaymentButton}
                    </button>
                  </div>
                ))}
              </>
            )}

            <div className="bg-white rounded-2xl shadow-sm p-4">
              <label className="block border-2 border-dashed border-gray-200 rounded-xl py-4 text-center cursor-pointer">
                <span className="text-sm text-[#1C2056]">
                  {fileName ? t.fileChosenLabel(fileName) : t.chooseFileButton}
                </span>
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onFileChange} />
              </label>
              {processing && <p className="text-xs text-gray-400 text-center mt-2">{t.processingLabel}</p>}
              {error && <p className="text-xs text-red-500 mt-2">{t.errorPrefix(error)}</p>}
            </div>

            {openInvoices.length === 0 && (
              <div className="text-center py-8">
                <p className="text-sm text-gray-400">{t.noOpenInvoicesHint}</p>
              </div>
            )}

            {fileName && !processing && !error && (
              <>
                <div className="text-xs text-gray-400 px-1">
                  {matches.length > 0 ? t.matchesFoundLabel(matches.length) : t.noMatchesFoundHint}
                  {unmatchedCount !== null && unmatchedCount > 0 && (
                    <span> · {t.unmatchedRowsLabel(unmatchedCount)}</span>
                  )}
                </div>

                {confirmError && <p className="text-xs text-red-500 mt-2">{t.errorPrefix(confirmError)}</p>}

                {matches.map(match => {
                  const rowMatchCount = matches.filter(m => m.row === match.row).length
                  return (
                    <div key={`${match.invoice.id}-${match.row.date}-${match.row.amount}-${match.row.description}`} className="bg-white rounded-2xl shadow-sm p-4">
                      <div className="text-sm font-medium text-[#1C2056]">{t.invoiceLabel(match.invoice.number)}</div>
                      <div className="text-xs text-gray-500 mt-1">{t.clientLabel}: {match.invoice.client_name || '—'}</div>
                      <div className="text-xs text-gray-500">{t.amountLabel}: {Number(match.invoice.amount).toLocaleString('ru-KZ')} ₸</div>
                      {match.row.date && <div className="text-xs text-gray-400 mt-1">{t.statementDateLabel}: {match.row.date}</div>}
                      {match.row.description && <div className="text-xs text-gray-400">{t.descriptionLabel}: {match.row.description}</div>}
                      {rowMatchCount > 1 && <div className="text-xs text-amber-600 mt-1">{t.multipleMatchesHint}</div>}
                      <button onClick={() => confirmPayment(match)} disabled={confirmingId === match.invoice.id}
                        className="w-full bg-[#2DC48D] text-white rounded-xl py-2.5 text-sm font-medium mt-3">
                        {confirmingId === match.invoice.id ? t.confirmingLabel : t.confirmPaymentButton}
                      </button>
                    </div>
                  )
                })}
              </>
            )}
          </>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual smoke test**

Run `npm run dev`, sign in as a Pro user, open `/profile/acquiring`. Confirm:
- The new "Автоматическая проверка через BCC" card renders with a "Подключить счёт BCC" button when no connection exists.
- Clicking it redirects to a BCC URL (or shows the `bccErrorNoBin` message if the test profile has no `bin_iin` set).
- After completing Task 7's manual OAuth verification once, reloading the page shows the connected IBAN and a "Отключить" button instead.
- If Task 9's cron verification produced a `bcc_pending_matches` row, it renders as a match card with a working "Подтвердить оплату" button, and disappears after clicking it (confirm via `execute_sql` that the invoice's `status` became `paid`).
- The existing manual Excel-upload flow (file picker, parse, match, confirm) still works exactly as before — this task must not regress it.

- [ ] **Step 4: Commit**

```bash
git add src/app/profile/acquiring/page.tsx
git commit -m "add BCC connect/disconnect UI and pending-match list to /profile/acquiring"
```

---

### Task 12: Full verification, Vercel env vars, push, memory update

**Files:** none (verification + configuration only)

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors anywhere in the project.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all tests pass, including the 5 new `bccState.test.ts` tests and 4 new `bccStatement.test.ts` tests.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: builds successfully; `/api/bcc/connect`, `/api/bcc/callback`, `/api/bcc/disconnect`, `/api/cron/bcc-check` all appear in the route list.

- [ ] **Step 4: Add production secrets to Vercel**

In the Vercel dashboard (Project → Settings → Environment Variables → Production), add:
- `BCC_CLIENT_ID` (from Task 1)
- `BCC_CLIENT_SECRET` (from Task 1)
- `BCC_STATE_SECRET` (from Task 1)

This mirrors exactly how `XPAYMENT_WEBHOOK_SECRET` was added earlier this session — the user pastes these into the Vercel dashboard themselves (do not ask for the values to be typed into chat).

- [ ] **Step 5: Push and redeploy**

```bash
git push origin main
```

Vercel auto-deploys on push, but since these are the FIRST reads of the three new `BCC_*` env vars, the deployment that picks up the code must happen after the env vars are saved in Step 4 (same gotcha as the earlier `XPAYMENT_WEBHOOK_SECRET` fix — Vercel doesn't retroactively inject new env vars into an already-built deployment). If the push in this step completes before Step 4's env vars are saved, trigger one more empty-commit redeploy afterward:

```bash
git commit --allow-empty -m "trigger redeploy to pick up BCC_* env vars"
git push origin main
```

- [ ] **Step 6: Update memory**

Extend `bcc_developer_portal_reference.md` and `acquiring_feature_invoices_kz.md` to record: the BCC-connect v2 feature shipped, its architecture (OAuth2 authorization-code flow, daily cron, two-token statement auth), and that it's the first BCC-specific integration in the codebase (the manual-Excel path remains the only option for every other bank). Update `MEMORY.md`'s index accordingly.

**Note for the acceptance step:** the very first real production connection (a real BCC business account, not the sandbox) is the true acceptance test — watch for the client-credentials request-encoding question flagged in Task 6, and for any statement response fields that differ from the documented example (e.g., date formats, whether `partyIdn` is ever absent for card transactions vs. wire transfers).
