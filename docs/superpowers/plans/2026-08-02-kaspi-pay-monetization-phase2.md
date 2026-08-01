# Kaspi Pay Monetization Phase 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 1 must be executed by the session controller directly, not a fresh subagent — do not dispatch it to a subagent.** (See Task 1's own note for why; every other task is a normal dispatch.)

**Goal:** Sync every connected customer's full Kaspi Cashier transaction history (not just payments minted through our own QR/API), auto-match incoming transactions to open invoices by amount, charge the same 5% commission on matches, and replace the current narrow per-source payment history with one wide, filterable dashboard.

**Architecture:** A new Kaspi client call (`getOperationsHistory`) reads Kaspi's real, previously-undocumented transaction feed. A new sync module persists every operation exactly once (idempotent on Kaspi's own operation id) and matches unmatched incoming ones against the customer's open invoices — an unambiguous match auto-confirms and debits commission (mirroring how a self-created QR already settles today); an ambiguous match (two open invoices share the same amount) falls back to the same manual-confirm safety pattern BCC already uses. Sync runs from the existing daily cron, no new cron. The dashboard becomes one wide table on `/profile/acquiring`, filterable by direction and by platform/other.

**Tech Stack:** Same as Phase 1 — Next.js App Router route handlers, Supabase JS (service-role for privileged tables), Vitest, no new npm dependency.

## Global Constraints

- **Full spec:** `docs/superpowers/specs/2026-08-02-kaspi-pay-monetization-phase2-design.md` — read it if anything below is ambiguous.
- **Confirmed real response shape for `POST https://qrpay.kaspi.kz/v02/history/operations`** (read live against the production admin connection this session — do not re-derive from the reference project, which never documents the response body, only the request):
  ```json
  {
    "Data": {
      "FormattedPeriod": "27 июля - 2 августа",
      "Statistics": { "SalesCount": "1 продажа", "ReturnsCount": "0 возвратов", "...": "..." },
      "DailySets": [
        {
          "DateTitle": "1 августа, сб",
          "Operations": [
            {
              "Id": 16817884445,
              "OrderNumber": "QR16817884445",
              "OrderRegDate": "2026-08-01T19:52:11.417+05:00",
              "OperationType": 0,
              "Amount": " 100 ₸",
              "OperationMethod": 0,
              "SourceType": "GOLD",
              "SaleType": "Dynamic",
              "ClientShortName": "Алихан А.",
              "Features": 0
            }
          ]
        }
      ]
    },
    "StatusCode": 0,
    "Message": "OK"
  }
  ```
  Request body: `{ EndDate: 'YYYY-MM-DD', LastTransactionDate: '', StatementPeriodCode: 2 }` — `StatementPeriodCode: 2` returns a multi-day rolling window (confirmed live: returned "27 июля - 2 августа" for a same-day `EndDate`); `0` returns only the current day. Use `2` for the sync so a daily cron run never misses a day between runs.
  **`Amount` is a pre-formatted display string with a leading space and a `₸` suffix, not a raw number** — parse with `Number(amount.replace(/[^\d]/g, ''))` (strips everything but digits, which also correctly collapses a thousands-separator space like `"10 000 ₸"` into `10000`).
  **`OperationType`'s exact meaning (which value means "sale/incoming" vs "return/outgoing") is NOT yet confirmed** — the only live sample obtained was a sale (`OperationType: 0`), and `Statistics.ReturnsCount` was `0` in that same window, so no refund/outgoing sample was observed. Task 1 must either find a real refund example to confirm the other value, or (if none is available) treat any operation as `'in'` for now with a code comment flagging this as unconfirmed — do not silently guess a value for `'out'` without a real observed sample.
- **Idempotency:** every synced operation is recorded in a new `kaspi_operations` table keyed on Kaspi's own `Id` (`kaspi_operation_id`, unique per `user_id`) — a re-sync of an overlapping date range must never reprocess, re-confirm, or re-charge commission for an operation already recorded.
- **Commission (5%, via the existing `computeCommission`/`debitWalletForCommission` from Phase 1) is charged ONLY on operations that match exactly one open invoice by amount.** Never on ambiguous matches (until a human confirms which invoice), never on unmatched ("other") operations, never on outgoing operations.
- **Ambiguous match (2+ open invoices share the operation's amount) requires manual confirmation** — same UX pattern as `bcc_pending_matches`/BCC's `confirmBccMatch` (`src/app/profile/acquiring/page.tsx`), not a new pattern.
- **`kaspi_operations` and `kaspi_pending_matches` get RLS enabled with a SELECT-only client policy scoped to `auth.uid() = user_id`** (the dashboard needs to read them from the browser) — no client-facing INSERT/UPDATE/DELETE, all writes go through the service-role sync/cron and a service-role confirm route, mirroring the `payment_requests` posture fixed in Phase 1's final review.
- **No repo-tracked migration file** — schema changes applied directly via Supabase MCP `apply_migration`, same as every other table in this project.
- **This project's test convention** carries over from Phase 1: only pure functions (the matching logic) get unit tests; Supabase/Kaspi-calling code has no test file, verified live instead.
- **BCC and Kaspi history stay in separate sections** on `/profile/acquiring` — confirmed explicitly during design, do not merge them into one combined feed.

---

### Task 1: Kaspi client history call — `src/lib/kaspiPay/client.ts`

**CONTROLLER-EXECUTED, not dispatched to a subagent** — the response shape above was confirmed via a live call this session; if anything about it seems off when this task actually runs (Kaspi API drift, a missing field), the controller needs to re-verify against a fresh live call rather than have a subagent guess from stale documentation.

**Files:**
- Modify: `src/lib/kaspiPay/client.ts`

**Interfaces:**
- Consumes: nothing new (reuses this file's own `buildSignedHeaders`).
- Produces: `interface KaspiHistoryOperation { id: string, orderNumber: string, regDate: string, amount: number, clientName: string | null, direction: 'in' | 'out' }` and `getOperationsHistory(connection: KaspiConnection, params: { endDate: string }): Promise<KaspiHistoryOperation[]>` — consumed by Task 4.

- [ ] **Step 1: Add `getOperationsHistory` to `client.ts`**

Add after `checkStatus`:

```ts
export interface KaspiHistoryOperation {
  id: string
  orderNumber: string
  regDate: string
  amount: number
  clientName: string | null
  direction: 'in' | 'out'
}

// Kaspi's real transaction-history feed -- not just what we ourselves
// created via createPayment/createInvoiceByPhone, but every operation on
// the connected Cashier account. StatementPeriodCode: 2 returns a rolling
// multi-day window (confirmed live) rather than just endDate's single day,
// so a daily sync never has a gap between runs.
export async function getOperationsHistory(
  connection: KaspiConnection,
  params: { endDate: string }
): Promise<KaspiHistoryOperation[]> {
  const url = `${KASPI_QRPAY_URL}/v02/history/operations`
  const payload = JSON.stringify({ EndDate: params.endDate, LastTransactionDate: '', StatementPeriodCode: 2 })
  const headers = { ...buildSignedHeaders(url, connection, payload), 'Content-Type': 'application/json' }
  const res = await fetch(url, { method: 'POST', headers, body: payload })
  const json = await res.json()
  const dailySets = json.Data?.DailySets
  if (!Array.isArray(dailySets)) throw new Error('Kaspi history/operations failed: ' + JSON.stringify(json))

  const operations: KaspiHistoryOperation[] = []
  for (const day of dailySets) {
    for (const op of day.Operations || []) {
      operations.push({
        id: String(op.Id),
        orderNumber: op.OrderNumber,
        regDate: op.OrderRegDate,
        // Amount arrives as a pre-formatted display string (" 100 ₸", or
        // "10 000 ₸" for larger amounts where the space is a thousands
        // separator) -- stripping everything but digits handles both.
        amount: Number(String(op.Amount).replace(/[^\d]/g, '')),
        clientName: op.ClientShortName || null,
        // OperationType's exact value-to-direction mapping is not fully
        // confirmed (no live refund/outgoing sample was ever observed) --
        // every observed sample so far had OperationType 0 and was a sale.
        // Treated as 'in' unless a future live sample proves another value
        // means 'out'; do not extend this without a real observed example.
        direction: 'in',
      })
    }
  }
  return operations
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/kaspiPay/client.ts
git commit -m "feat(kaspi-pay): add getOperationsHistory (Kaspi's real transaction-history feed)"
```

---

### Task 2: Schema — `kaspi_operations` and `kaspi_pending_matches`

**Files:** none (schema-only task, applied via Supabase MCP)

**Interfaces:**
- Consumes: nothing.
- Produces: the two tables below — consumed by Task 3 (matching), Task 4 (sync/settle), Task 6 (dashboard read), Task 7 (confirm route).

- [ ] **Step 1: Apply the schema via Supabase MCP**

Run `apply_migration` (project id from `mcp__claude_ai_Supabase__list_projects` — `invoices.kz`) with:

```sql
create table if not exists kaspi_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  kaspi_operation_id text not null,
  order_number text,
  amount numeric not null,
  direction text not null check (direction in ('in', 'out')),
  client_name text,
  matched_invoice_id uuid references invoices(id),
  category text not null check (category in ('platform', 'other')),
  operation_date timestamptz not null,
  synced_at timestamptz not null default now(),
  unique (user_id, kaspi_operation_id)
);

create table if not exists kaspi_pending_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  kaspi_operation_id text not null,
  invoice_id uuid not null references invoices(id),
  matched_amount numeric not null,
  matched_date timestamptz not null,
  client_name text,
  created_at timestamptz not null default now()
);

alter table kaspi_operations enable row level security;
alter table kaspi_pending_matches enable row level security;

create policy "Users can select own kaspi operations" on kaspi_operations
  for select to authenticated
  using (auth.uid() = user_id);

create policy "Users can select own kaspi pending matches" on kaspi_pending_matches
  for select to authenticated
  using (auth.uid() = user_id);
```

No INSERT/UPDATE/DELETE policy on either table — all writes go through the service-role sync (Task 4) and the service-role confirm route (Task 7), same posture Phase 1's final review established for `payment_requests`.

- [ ] **Step 2: Verify**

Run this via Supabase MCP `execute_sql` to confirm both tables exist with RLS enabled and exactly one SELECT policy each:

```sql
select tablename, rowsecurity from pg_tables where tablename in ('kaspi_operations', 'kaspi_pending_matches');
select tablename, policyname, cmd from pg_policies where tablename in ('kaspi_operations', 'kaspi_pending_matches');
```

Expected: both `rowsecurity = true`; each table has exactly one policy, `cmd = SELECT`.

---

### Task 3: Matching logic — `src/lib/kaspiPay/historyMatch.ts`

**Files:**
- Create: `src/lib/kaspiPay/historyMatch.ts`
- Test: `src/lib/kaspiPay/historyMatch.test.ts`

**Interfaces:**
- Consumes: `KaspiHistoryOperation` (Task 1).
- Produces: `interface OpenInvoiceForMatch { id: string, number: string, client_name: string | null, amount: number }`, `type MatchResult = { kind: 'unmatched' } | { kind: 'unambiguous', invoice: OpenInvoiceForMatch } | { kind: 'ambiguous', invoices: OpenInvoiceForMatch[] }`, `matchOperation(operation: KaspiHistoryOperation, openInvoices: OpenInvoiceForMatch[]): MatchResult` — consumed by Task 4.

This mirrors `src/lib/acquiringMatch.ts`'s existing `findMatches` (BCC/Excel-import's established amount-matching pattern) rather than inventing new matching logic — read that file first.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/kaspiPay/historyMatch.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { matchOperation, OpenInvoiceForMatch, MatchResult } from './historyMatch'
import { KaspiHistoryOperation } from './client'

function op(amount: number, direction: 'in' | 'out' = 'in'): KaspiHistoryOperation {
  return { id: '1', orderNumber: 'QR1', regDate: '2026-08-01T00:00:00+05:00', amount, clientName: 'Test', direction }
}

function invoice(id: string, amount: number): OpenInvoiceForMatch {
  return { id, number: `INV-${id}`, client_name: 'Client', amount }
}

describe('matchOperation', () => {
  it('returns unmatched when no open invoice has this amount', () => {
    const result = matchOperation(op(500), [invoice('a', 1000)])
    expect(result.kind).toBe('unmatched')
  })

  it('returns unambiguous when exactly one open invoice matches the amount', () => {
    const result = matchOperation(op(1000), [invoice('a', 1000), invoice('b', 2000)])
    expect(result.kind).toBe('unambiguous')
    expect((result as any).invoice.id).toBe('a')
  })

  it('returns ambiguous when two or more open invoices share the amount', () => {
    const result = matchOperation(op(1000), [invoice('a', 1000), invoice('b', 1000)])
    expect(result.kind).toBe('ambiguous')
    expect((result as any).invoices).toHaveLength(2)
  })

  it('returns unmatched for an empty invoice list', () => {
    const result = matchOperation(op(1000), [])
    expect(result.kind).toBe('unmatched')
  })

  it('never matches an outgoing operation, even if the amount coincides', () => {
    const result = matchOperation(op(1000, 'out'), [invoice('a', 1000)])
    expect(result.kind).toBe('unmatched')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- historyMatch.test.ts`
Expected: FAIL — `historyMatch` module does not exist yet.

- [ ] **Step 3: Implement `src/lib/kaspiPay/historyMatch.ts`**

```ts
import { KaspiHistoryOperation } from './client'

export interface OpenInvoiceForMatch {
  id: string
  number: string
  client_name: string | null
  amount: number
}

export type MatchResult =
  | { kind: 'unmatched' }
  | { kind: 'unambiguous', invoice: OpenInvoiceForMatch }
  | { kind: 'ambiguous', invoices: OpenInvoiceForMatch[] }

// Mirrors acquiringMatch.ts's findMatches (the established BCC/Excel-import
// amount-matching pattern) rather than a new approach: match by amount,
// nothing more. Outgoing operations never match -- a payment collected
// FROM invoices.kz's connection owner is never itself an invoice being
// paid.
export function matchOperation(operation: KaspiHistoryOperation, openInvoices: OpenInvoiceForMatch[]): MatchResult {
  if (operation.direction !== 'in') return { kind: 'unmatched' }
  const candidates = openInvoices.filter(inv => Number(inv.amount) === Number(operation.amount))
  if (candidates.length === 0) return { kind: 'unmatched' }
  if (candidates.length === 1) return { kind: 'unambiguous', invoice: candidates[0] }
  return { kind: 'ambiguous', invoices: candidates }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- historyMatch.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/kaspiPay/historyMatch.ts src/lib/kaspiPay/historyMatch.test.ts
git commit -m "feat(kaspi-pay): add pure amount-matching logic for Kaspi history sync"
```

---

### Task 4: Sync + settle — `src/lib/kaspiPay/historySync.ts`

**Files:**
- Modify: `src/lib/kaspiPay/wallet.ts`
- Create: `src/lib/kaspiPay/historySync.ts`

**Interfaces:**
- Consumes: `getOperationsHistory` (Task 1), `matchOperation`/`OpenInvoiceForMatch` (Task 3), `loadConnectionByUserId` (existing, `./connection`), `debitWalletForCommission` (modified below, `./wallet`).
- Produces: `syncKaspiHistory(userId: string): Promise<{ synced: number, autoConfirmed: number, pending: number }>` — consumed by Task 5 (cron). `debitWalletForCommission`'s new signature — consumed by Task 6's confirm route too.

**IMPORTANT — a bug caught during this plan's own self-review, fix it before writing `historySync.ts`:** `debitWalletForCommission`'s third parameter is a `kaspi_payment_requests.id` foreign key — every Phase 1 call site (`settlePayment.ts`) has a real one. A Kaspi history-sync-detected payment has no `kaspi_payment_requests` row at all (it's tracked in the new `kaspi_operations` table instead), so passing Kaspi's raw operation id there would violate the foreign key. Fix: widen the parameter to accept `null`, and add a `note` for traceability instead.

- [ ] **Step 1: Widen `debitWalletForCommission` in `src/lib/kaspiPay/wallet.ts`**

Change its signature from:

```ts
export async function debitWalletForCommission(userId: string, amount: number, kaspiPaymentRequestId: string): Promise<number> {
```

to:

```ts
export async function debitWalletForCommission(userId: string, amount: number, kaspiPaymentRequestId: string | null, note?: string): Promise<number> {
```

And update the `wallet_ledger` insert inside it (still the same function body otherwise) to:

```ts
  const { error: ledgerError } = await supabase.from('wallet_ledger').insert({
    user_id: userId,
    type: 'commission',
    amount: -commission,
    balance_after: data,
    kaspi_payment_request_id: kaspiPaymentRequestId,
    note: note ?? null,
  })
```

`settlePayment.ts`'s existing call (`debitWalletForCommission(reqRow.user_id, Number(reqRow.amount), reqRow.id)`) needs no change — passing a real id as the third argument still type-checks against `string | null`.

Run `npx tsc --noEmit` now to confirm this alone doesn't break the existing call site, before moving on.

- [ ] **Step 2: Implement `src/lib/kaspiPay/historySync.ts`**

```ts
import { createClient } from '@supabase/supabase-js'
import { loadConnectionByUserId } from './connection'
import { getOperationsHistory } from './client'
import { matchOperation, OpenInvoiceForMatch } from './historyMatch'
import { debitWalletForCommission } from './wallet'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Syncs one connected customer's Kaspi transaction history, records every
// operation exactly once (unique on user_id+kaspi_operation_id makes a
// re-sync of an overlapping window a safe no-op via the insert's own
// conflict), and auto-settles unambiguous invoice matches -- same effect
// as a self-created QR settling, no click required, commission charged the
// same way. Ambiguous matches are recorded for manual confirmation instead
// (never auto-picked), and never charged commission until confirmed.
export async function syncKaspiHistory(userId: string): Promise<{ synced: number, autoConfirmed: number, pending: number }> {
  const connection = await loadConnectionByUserId(userId)
  if (!connection) return { synced: 0, autoConfirmed: 0, pending: 0 }

  const endDate = new Date().toISOString().slice(0, 10)
  const operations = await getOperationsHistory(connection, { endDate })

  const { data: openInvoicesRaw } = await supabase
    .from('invoices')
    .select('id, number, client_name, amount')
    .eq('user_id', userId)
    .not('status', 'in', '(paid,cancelled)')
  const openInvoices: OpenInvoiceForMatch[] = (openInvoicesRaw || []) as any[]

  let synced = 0
  let autoConfirmed = 0
  let pending = 0

  for (const op of operations) {
    const match = matchOperation(op, openInvoices)
    const category = match.kind === 'unambiguous' ? 'platform' : 'other'

    // The unique(user_id, kaspi_operation_id) constraint makes this the
    // idempotency guard: a re-sync of an already-recorded operation hits
    // 23505 and is skipped entirely -- never re-matched, never re-charged.
    const { error: insertError } = await supabase.from('kaspi_operations').insert({
      user_id: userId,
      kaspi_operation_id: op.id,
      order_number: op.orderNumber,
      amount: op.amount,
      direction: op.direction,
      client_name: op.clientName,
      matched_invoice_id: match.kind === 'unambiguous' ? match.invoice.id : null,
      category,
      operation_date: op.regDate,
    })
    if (insertError) {
      if (insertError.code === '23505') continue // already synced, not an error
      console.error('Kaspi history sync: failed to record operation', op.id, 'for user', userId, ':', insertError.message)
      continue
    }
    synced++

    if (match.kind === 'unambiguous') {
      await supabase.from('invoices').update({ status: 'paid' }).eq('id', match.invoice.id)
      await supabase.from('invoice_logs').insert({ invoice_id: match.invoice.id, status: 'paid' })
      try {
        await debitWalletForCommission(userId, op.amount, null, `kaspi_operation:${op.id}`)
      } catch (e: any) {
        console.error('CRITICAL: Kaspi history sync commission debit failed for user', userId, 'operation', op.id, ':', e.message)
      }
      autoConfirmed++
      // Remove this invoice from the in-memory pool so a later operation
      // in the same sync run (e.g. a duplicate transfer) can't match it
      // again in the same pass.
      const idx = openInvoices.findIndex(i => i.id === match.invoice.id)
      if (idx !== -1) openInvoices.splice(idx, 1)
    } else if (match.kind === 'ambiguous') {
      for (const invoice of match.invoices) {
        await supabase.from('kaspi_pending_matches').insert({
          user_id: userId,
          kaspi_operation_id: op.id,
          invoice_id: invoice.id,
          matched_amount: op.amount,
          matched_date: op.regDate,
          client_name: op.clientName,
        })
      }
      pending++
    }
  }

  return { synced, autoConfirmed, pending }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/kaspiPay/wallet.ts src/lib/kaspiPay/historySync.ts
git commit -m "feat(kaspi-pay): sync Kaspi transaction history, auto-settle unambiguous invoice matches"
```

---

### Task 5: Wire sync into the daily cron

**Files:**
- Modify: `src/app/api/cron/kaspi-poll/route.ts`

**Interfaces:**
- Consumes: `syncKaspiHistory` (Task 4).
- Produces: nothing new — same route, extended response shape.

- [ ] **Step 1: Add the sync loop to the cron**

In `src/app/api/cron/kaspi-poll/route.ts`, add the import `import { syncKaspiHistory } from '@/lib/kaspiPay/historySync'` and, after the existing `pendingTopups` loop (before the final `return NextResponse.json(...)`), add:

```ts
  const { data: activeConnections } = await supabase
    .from('kaspi_connections')
    .select('user_id')
    .eq('status', 'active')
  let historySynced = 0
  let historyAutoConfirmed = 0
  for (const { user_id } of (activeConnections || []) as any[]) {
    try {
      const result = await syncKaspiHistory(user_id)
      historySynced += result.synced
      historyAutoConfirmed += result.autoConfirmed
    } catch (e: any) {
      console.error('Kaspi poll: history sync failed for user', user_id, '— retrying next run:', e.message)
    }
  }
```

Update the final return statement to:

```ts
  return NextResponse.json({ ok: true, paid, expired, plansPaid, plansExpired, topupsPaid, topupsExpired, historySynced, historyAutoConfirmed })
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/kaspi-poll/route.ts
git commit -m "feat(kaspi-pay): run Kaspi history sync for every active connection in the daily cron"
```

---

### Task 6: Dashboard API — full operations list with filters

**Files:**
- Create: `src/app/api/kaspi/operations/route.ts`
- Create: `src/app/api/kaspi/pending-matches/confirm/route.ts`

**Interfaces:**
- Consumes: nothing new (reads `kaspi_operations`/`kaspi_pending_matches` directly, service-role).
- Produces: `GET /api/kaspi/operations?direction=in|out|all&category=platform|other|all` → `{ operations: Array<{ id, orderNumber, amount, direction, category, clientName, matchedInvoiceId, matchedInvoiceNumber, matchedClientName, operationDate }>, pendingMatches: Array<{ id, kaspiOperationId, invoiceId, invoiceNumber, clientName, matchedAmount, matchedDate }> }`; `POST /api/kaspi/pending-matches/confirm` (body `{ pendingMatchId }`) — consumed by Task 7's UI.

- [ ] **Step 1: Create the operations-list route**

Create `src/app/api/kaspi/operations/route.ts`:

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

export async function GET(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const direction = req.nextUrl.searchParams.get('direction') || 'all'
  const category = req.nextUrl.searchParams.get('category') || 'all'

  let query = supabase
    .from('kaspi_operations')
    .select('id, order_number, amount, direction, category, client_name, matched_invoice_id, operation_date, invoices(number, client_name)')
    .eq('user_id', user.id)
    .order('operation_date', { ascending: false })
    .limit(200)
  if (direction !== 'all') query = query.eq('direction', direction)
  if (category !== 'all') query = query.eq('category', category)

  const { data: ops } = await query

  const { data: pending } = await supabase
    .from('kaspi_pending_matches')
    .select('id, kaspi_operation_id, invoice_id, matched_amount, matched_date, client_name, invoices(number)')
    .eq('user_id', user.id)

  return NextResponse.json({
    operations: (ops || []).map((o: any) => ({
      id: o.id,
      orderNumber: o.order_number,
      amount: Number(o.amount),
      direction: o.direction,
      category: o.category,
      clientName: o.client_name,
      matchedInvoiceId: o.matched_invoice_id,
      matchedInvoiceNumber: o.invoices?.number ?? null,
      operationDate: o.operation_date,
    })),
    pendingMatches: (pending || []).map((p: any) => ({
      id: p.id,
      kaspiOperationId: p.kaspi_operation_id,
      invoiceId: p.invoice_id,
      invoiceNumber: p.invoices?.number ?? null,
      clientName: p.client_name,
      matchedAmount: Number(p.matched_amount),
      matchedDate: p.matched_date,
    })),
  })
}
```

- [ ] **Step 2: Create the pending-match confirm route**

Create `src/app/api/kaspi/pending-matches/confirm/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { debitWalletForCommission } from '@/lib/kaspiPay/wallet'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Confirms ONE candidate out of an ambiguous set (multiple open invoices
// shared the same amount) -- the customer picks which invoice this
// operation actually paid. Commission is charged here, not at sync time,
// since an ambiguous match was never auto-confirmed or charged.
export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { pendingMatchId } = await req.json()
  if (!pendingMatchId) return NextResponse.json({ error: 'pendingMatchId required' }, { status: 400 })

  const { data: pendingMatch } = await supabase
    .from('kaspi_pending_matches')
    .select('id, user_id, invoice_id, kaspi_operation_id, matched_amount')
    .eq('id', pendingMatchId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!pendingMatch) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  await supabase.from('invoices').update({ status: 'paid' }).eq('id', pendingMatch.invoice_id)
  await supabase.from('invoice_logs').insert({ invoice_id: pendingMatch.invoice_id, status: 'paid' })
  await supabase.from('kaspi_operations')
    .update({ matched_invoice_id: pendingMatch.invoice_id, category: 'platform' })
    .eq('user_id', user.id)
    .eq('kaspi_operation_id', pendingMatch.kaspi_operation_id)

  try {
    await debitWalletForCommission(user.id, Number(pendingMatch.matched_amount), null, `kaspi_operation:${pendingMatch.kaspi_operation_id}`)
  } catch (e: any) {
    console.error('CRITICAL: commission debit failed on manual pending-match confirm for user', user.id, ':', e.message)
  }

  // Every other candidate for the SAME operation is now resolved -- a
  // single payment can only ever settle one invoice, mirroring
  // confirmBccMatch's identical cleanup on the client side.
  await supabase.from('kaspi_pending_matches')
    .delete()
    .eq('user_id', user.id)
    .eq('kaspi_operation_id', pendingMatch.kaspi_operation_id)

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/kaspi/operations/route.ts src/app/api/kaspi/pending-matches/confirm/route.ts
git commit -m "feat(kaspi-pay): add filterable operations-list API and pending-match confirm route"
```

---

### Task 7: Wide filterable dashboard UI

**Files:**
- Modify: `src/app/profile/acquiring/page.tsx`
- Modify: `src/lib/i18n/acquiring.ts`

**Interfaces:**
- Consumes: `GET /api/kaspi/operations` and `POST /api/kaspi/pending-matches/confirm` (Task 6).
- Produces: nothing new for later tasks — this is the final UI task.

- [ ] **Step 1: Replace the current narrow Kaspi history block**

In `src/app/profile/acquiring/page.tsx`, the existing "История платежей" block (rendering `kaspiRecentPayments`, added in the Phase 1 fix-up pass) is replaced by a new, wider section. Add state:

```ts
const [kaspiOperations, setKaspiOperations] = useState<{ id: string, orderNumber: string, amount: number, direction: string, category: string, clientName: string | null, matchedInvoiceNumber: string | null, operationDate: string }[]>([])
const [kaspiPendingMatches, setKaspiPendingMatches] = useState<{ id: string, invoiceNumber: string | null, clientName: string | null, matchedAmount: number, matchedDate: string }[]>([])
const [kaspiDirectionFilter, setKaspiDirectionFilter] = useState<'all' | 'in' | 'out'>('all')
const [kaspiCategoryFilter, setKaspiCategoryFilter] = useState<'all' | 'platform' | 'other'>('all')
const [kaspiConfirmingMatchId, setKaspiConfirmingMatchId] = useState<string | null>(null)
```

Add a loader (called from `load()`, and re-run whenever a filter changes):

```ts
async function loadKaspiOperations(direction = kaspiDirectionFilter, category = kaspiCategoryFilter) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`/api/kaspi/operations?direction=${direction}&category=${category}`, {
    headers: { 'Authorization': `Bearer ${session?.access_token}` },
  })
  if (res.ok) {
    const data = await res.json()
    setKaspiOperations(data.operations || [])
    setKaspiPendingMatches(data.pendingMatches || [])
  }
}
```

Call `loadKaspiOperations()` inside the existing `load()` function, right after the `/api/kaspi/dashboard` fetch (guard it the same way — only when `kaspiConnected` would end up true; simplest is to call it unconditionally, since it returns an empty list for a disconnected user).

Add a confirm handler:

```ts
async function confirmKaspiPendingMatch(pendingMatchId: string) {
  setKaspiConfirmingMatchId(pendingMatchId)
  try {
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/kaspi/pending-matches/confirm', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pendingMatchId }),
    })
    await loadKaspiOperations()
  } finally {
    setKaspiConfirmingMatchId(null)
  }
}
```

- [ ] **Step 2: Render the wide table, breaking out of the page's `max-w-lg` column for this section**

Replace the existing history-list JSX block (the one iterating `kaspiRecentPayments`) with:

```tsx
{kaspiPendingMatches.length > 0 && (
  <div className="bg-amber-50 rounded-2xl shadow-sm p-4 mb-3 -mx-1 sm:mx-0 sm:max-w-3xl">
    <div className="text-sm font-medium text-[#1C2056] mb-2">{t.kaspiPendingMatchesTitle}</div>
    {kaspiPendingMatches.map(pm => (
      <div key={pm.id} className="flex items-center justify-between py-2 border-b border-amber-100 last:border-0">
        <div className="text-xs text-gray-600">
          {pm.matchedAmount.toLocaleString('ru-KZ')} ₸ — {t.kaspiPendingMatchCandidate}: {pm.invoiceNumber} ({pm.clientName || '—'})
        </div>
        <button onClick={() => confirmKaspiPendingMatch(pm.id)} disabled={kaspiConfirmingMatchId === pm.id}
          className="bg-[#1C2056] text-white rounded-lg px-3 py-1.5 text-xs font-medium">
          {t.kaspiConfirmMatchButton}
        </button>
      </div>
    ))}
  </div>
)}

<div className="bg-white rounded-2xl shadow-sm p-4 -mx-1 sm:mx-0 sm:max-w-3xl">
  <div className="text-sm font-medium text-[#1C2056] mb-3">{t.kaspiHistoryTitle}</div>
  <div className="flex gap-2 mb-3 flex-wrap">
    {(['all', 'in', 'out'] as const).map(d => (
      <button key={d} onClick={() => { setKaspiDirectionFilter(d); loadKaspiOperations(d, kaspiCategoryFilter) }}
        className={`rounded-lg px-3 py-1.5 text-xs font-medium ${kaspiDirectionFilter === d ? 'bg-[#1C2056] text-white' : 'bg-gray-100 text-[#1C2056]'}`}>
        {d === 'all' ? t.kaspiFilterAll : d === 'in' ? t.kaspiFilterIn : t.kaspiFilterOut}
      </button>
    ))}
    {(['all', 'platform', 'other'] as const).map(c => (
      <button key={c} onClick={() => { setKaspiCategoryFilter(c); loadKaspiOperations(kaspiDirectionFilter, c) }}
        className={`rounded-lg px-3 py-1.5 text-xs font-medium ${kaspiCategoryFilter === c ? 'bg-[#1C2056] text-white' : 'bg-gray-100 text-[#1C2056]'}`}>
        {c === 'all' ? t.kaspiFilterAll : c === 'platform' ? t.kaspiFilterPlatform : t.kaspiFilterOther}
      </button>
    ))}
  </div>

  {kaspiOperations.length === 0 ? (
    <p className="text-xs text-gray-400 text-center py-3">{t.kaspiHistoryEmptyLabel}</p>
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-400 text-left border-b border-gray-100">
            <th className="py-2 pr-3 font-normal">{t.kaspiColDate}</th>
            <th className="py-2 pr-3 font-normal">{t.kaspiColAmount}</th>
            <th className="py-2 pr-3 font-normal">{t.kaspiColDirection}</th>
            <th className="py-2 pr-3 font-normal">{t.kaspiColInvoice}</th>
            <th className="py-2 font-normal">{t.kaspiColCategory}</th>
          </tr>
        </thead>
        <tbody>
          {kaspiOperations.map(op => (
            <tr key={op.id} className="border-b border-gray-50 last:border-0">
              <td className="py-2 pr-3 text-gray-500">{new Date(op.operationDate).toLocaleString('ru-KZ')}</td>
              <td className="py-2 pr-3 text-[#1C2056] font-medium">{op.amount.toLocaleString('ru-KZ')} ₸</td>
              <td className="py-2 pr-3 text-gray-500">{op.direction === 'in' ? t.kaspiFilterIn : t.kaspiFilterOut}</td>
              <td className="py-2 pr-3 text-gray-500">{op.matchedInvoiceNumber || op.clientName || '—'}</td>
              <td className="py-2 text-gray-500">{op.category === 'platform' ? t.kaspiFilterPlatform : t.kaspiFilterOther}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
</div>
```

This replaces (does not sit alongside) the old `kaspiStats`/`kaspiRecentPayments` block from the Phase 1 fix-up — remove that block's JSX and its now-unused `kaspiStats`/`kaspiRecentPayments` state and the `/api/kaspi/dashboard` fields they read (the `walletBalance`/`connected`/`status` fields from that same response are still used — only the `stats`/`recentPayments` consumption is replaced by this task's own `/api/kaspi/operations` call).

- [ ] **Step 3: Add the new i18n keys**

Add to `src/lib/i18n/acquiring.ts`'s interface and all three (`ru`/`kk`/`en`) language blocks, following the file's existing style: `kaspiPendingMatchesTitle`, `kaspiPendingMatchCandidate`, `kaspiConfirmMatchButton`, `kaspiFilterAll`, `kaspiFilterIn`, `kaspiFilterOut`, `kaspiFilterPlatform`, `kaspiFilterOther`, `kaspiColDate`, `kaspiColAmount`, `kaspiColDirection`, `kaspiColInvoice`, `kaspiColCategory`. (`kaspiHistoryTitle`/`kaspiHistoryEmptyLabel` already exist from Phase 1's fix-up pass — reuse them, don't redefine.)

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run `npm run dev`, visit `/profile/acquiring`, confirm the new table renders (even empty), filters are clickable, and no console errors appear.

- [ ] **Step 6: Commit**

```bash
git add src/app/profile/acquiring/page.tsx src/lib/i18n/acquiring.ts
git commit -m "feat(kaspi-pay): replace narrow Kaspi history with a wide, filterable transaction table"
```

---

### Task 8: Final whole-branch review

Dispatch the final code-reviewer subagent (most capable available model) per `superpowers:subagent-driven-development`'s standard closing step, covering the full diff from this plan's starting commit to `HEAD`. Point it at:

- The Global Constraints section above, especially: commission charged ONLY on unambiguous matches (never ambiguous, never unmatched, never outgoing); idempotency via the `unique(user_id, kaspi_operation_id)` constraint actually preventing a re-sync from re-charging; RLS on both new tables being SELECT-only (no client-facing write path).
- Whether the ambiguous-match cleanup (deleting every `kaspi_pending_matches` row for an operation once one candidate is confirmed) could ever leave a stale pending-match row pointing at an invoice that's already been closed by a *different* means (e.g. manually marked paid, or matched by BCC) in the meantime.
- Whether two connections' cron sync loops (Task 5) could run long enough to hit Vercel's function timeout with many active connections, and whether that would leave any connection's sync partially applied in an unsafe way (it should not, since each connection's sync is independently idempotent — confirm this is actually true rather than assumed).

Address any Critical/Important findings with one bundled fix subagent, then proceed to `superpowers:finishing-a-development-branch`.
