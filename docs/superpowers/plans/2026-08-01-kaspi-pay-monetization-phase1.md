# Kaspi Pay Monetization Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire xpayment.kz for invoices.kz's own subscription billing, replace the Pro-plan gate on Kaspi Pay Cashier with a 5% commission funded by a prepaid wallet balance, and move the feature's UI from its own page into `/profile/acquiring`.

**Architecture:** invoices.kz's own admin account (`profiles.is_admin = true`) already has, or will have, an ordinary `kaspi_connections` row — the same shape as any customer's. That one connection becomes the "platform merchant": every payment invoices.kz needs to collect from a user (a plan upgrade, a wallet top-up) is created by calling the existing `createPayment()`/new `createInvoiceByPhone()` against it, exactly the way a customer's own site calls it against theirs. A new `wallet_ledger` + `profiles.kaspi_wallet_balance` tracks each user's prepaid balance; a Postgres function does the balance debit atomically so two concurrent settlements can never corrupt it. The existing `checkAndSettleKaspiPayment` gains a commission-deduction step; two new parallel settlement paths (`checkAndSettlePlanPayment`, `checkAndSettleWalletTopup`) reuse the same live-`checkStatus` pattern for subscription and top-up payments.

**Tech Stack:** Same as the base Kaspi Pay Cashier feature — Next.js App Router route handlers (Node runtime), Node's built-in `crypto`, Supabase JS client (service-role for privileged tables), Vitest. No new npm dependency.

## Global Constraints

- **Full spec:** `docs/superpowers/specs/2026-08-01-kaspi-pay-monetization-phase1-design.md` — read it if anything below is ambiguous.
- **The admin's connection is an ordinary `kaspi_connections` row, not a new concept.** Locate it at runtime via `profiles.is_admin = true` (exactly one such row exists today — `alikhan2505@gmail.com`) — never hardcode a user id or email in source.
- **Commission is 5% of the settled amount, rounded to the nearest tenge** (`Math.round(amount * 0.05)`), debited **only** when a payment actually reaches `paid` — never at link-creation time, never for expired/failed payments.
- **Balance is gated at mint time, debited at settlement time.** Before creating any NEW Kaspi payment link (invoice auto-mint, or the external `POST /api/kaspi/pay`), the caller's `kaspi_wallet_balance` must be `>= computeCommission(amount)` or the request is refused with `402 { error: 'insufficient_balance', required, balance }`. An already-existing pending link is never affected by a balance change.
- **Balance mutations are never read-then-write in application code.** Both directions go through the single Postgres function `debit_wallet_balance` (a credit is just a call with a negative amount) so no concurrent pair of settlements can ever race against each other.
- **The Pro-plan requirement (`canAcquiring`) is removed entirely from Kaspi-specific routes** — `connect/init`, `connect/verify`, invoice-side minting, `POST /api/kaspi/pay`. It stays exactly as-is for the Excel-import and BCC-connect acquiring methods (different files, not touched by this plan).
- **No repo-tracked migration file** — this codebase has no `supabase/migrations` directory; schema changes are applied directly via the Supabase MCP tools (`apply_migration`), same as every other table added this project.
- **`payment_requests` (existing table)** is reused as-is for subscription/plan payments — columns already present: `id, user_id, email, plan, amount, status, created_at, activated_at, order_id, qr_operation_id`.
- **`/api/payment/create` and `/upgrade/page.tsx` keep their existing request/response shape** (`{ qr_token, ext_tran_id, expire_date }`) — only the internal transport changes from xpayment's HTTP API to `createPayment()`/`createInvoiceByPhone()` against the admin's connection.
- **This project's test convention for this module:** only pure functions get unit tests (see `crypto.test.ts`, `webhookSafety.test.ts`, `phone.test.ts`) — Supabase-dependent settlement/route logic has no test file and is verified live instead, same as the existing `settlePayment.ts`/`invoicePayment.ts` have no test file today. Follow this precedent; do not invent a mocking framework for Supabase calls.
- Env vars to retire once Phase 1 is confirmed live: `XPAYMENT_API_KEY`, `XPAYMENT_WEBHOOK_SECRET` — Task 9 removes their last usages; do not delete the env vars from Vercel until after that task ships and is verified.

---

### Task 1: Wallet schema, ledger, and atomic commission math — `src/lib/kaspiPay/wallet.ts`

**Files:**
- Create: `src/lib/kaspiPay/wallet.ts`
- Test: `src/lib/kaspiPay/wallet.test.ts`

**Interfaces:**
- Consumes: nothing new (Supabase service-role client, same pattern as every other file in this directory).
- Produces: `COMMISSION_RATE = 0.05`, `computeCommission(amount: number): number`, `getWalletBalance(userId: string): Promise<number>`, `creditWallet(userId: string, amount: number, topupId: string): Promise<void>`, `debitWalletForCommission(userId: string, amount: number, kaspiPaymentRequestId: string): Promise<number>` (returns the new balance) — consumed by Task 3 (gating), Task 4 (deduction), Task 7 (top-up settlement), Task 10 (dashboard).

- [ ] **Step 1: Apply the schema via Supabase MCP**

Run `apply_migration` (project id from `mcp__claude_ai_Supabase__list_projects` — `invoices.kz`) with:

```sql
alter table profiles add column if not exists kaspi_wallet_balance numeric not null default 0;

create table if not exists wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  type text not null check (type in ('topup', 'commission', 'adjustment')),
  amount numeric not null,
  balance_after numeric not null,
  kaspi_wallet_topup_id uuid,
  kaspi_payment_request_id uuid references kaspi_payment_requests(id),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists kaspi_wallet_topups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  amount numeric not null,
  kaspi_operation_id text not null,
  qr_token text,
  payment_link text,
  status text not null default 'pending',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table wallet_ledger add constraint wallet_ledger_topup_fk
  foreign key (kaspi_wallet_topup_id) references kaspi_wallet_topups(id);

create or replace function debit_wallet_balance(p_user_id uuid, p_amount numeric)
returns numeric as $$
  update profiles set kaspi_wallet_balance = kaspi_wallet_balance - p_amount
  where id = p_user_id
  returning kaspi_wallet_balance;
$$ language sql;
```

Neither `wallet_ledger` nor `kaspi_wallet_topups` needs a client-facing RLS policy — both are read only through authenticated routes (Task 10's dashboard route), same posture as `kaspi_connections`.

- [ ] **Step 2: Write the failing test for `computeCommission`**

Create `src/lib/kaspiPay/wallet.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeCommission, COMMISSION_RATE } from './wallet'

describe('computeCommission', () => {
  it('is 5% of the amount', () => {
    expect(COMMISSION_RATE).toBe(0.05)
    expect(computeCommission(1000)).toBe(50)
  })

  it('rounds to the nearest tenge', () => {
    expect(computeCommission(999)).toBe(50)   // 49.95 -> 50
    expect(computeCommission(101)).toBe(5)    // 5.05 -> 5
    expect(computeCommission(111)).toBe(6)    // 5.55 -> 6
  })

  it('is zero for a zero amount', () => {
    expect(computeCommission(0)).toBe(0)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- wallet.test.ts`
Expected: FAIL — `computeCommission` is not defined (module doesn't exist yet).

- [ ] **Step 4: Implement `src/lib/kaspiPay/wallet.ts`**

```ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const COMMISSION_RATE = 0.05

export function computeCommission(amount: number): number {
  return Math.round(amount * COMMISSION_RATE)
}

export async function getWalletBalance(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('profiles')
    .select('kaspi_wallet_balance')
    .eq('id', userId)
    .single()
  if (error) throw new Error(`wallet balance lookup failed for user ${userId}: ${error.message}`)
  return Number(data?.kaspi_wallet_balance ?? 0)
}

// A credit is commutative (two concurrent top-ups adding to the same
// balance arrive at the correct sum regardless of order), so it doesn't
// strictly need the same atomicity guard the debit path does -- but reusing
// debit_wallet_balance with a negative amount is simplest: one Postgres
// function, one call site pattern, still safe either way.
export async function creditWallet(userId: string, amount: number, topupId: string): Promise<void> {
  const { data, error } = await supabase.rpc('debit_wallet_balance', { p_user_id: userId, p_amount: -amount })
  if (error) throw new Error(`wallet credit failed for user ${userId}: ${error.message}`)
  await supabase.from('wallet_ledger').insert({
    user_id: userId,
    type: 'topup',
    amount,
    balance_after: data,
    kaspi_wallet_topup_id: topupId,
  })
}

// The only balance mutation that MUST be atomic: two settlements racing
// against a balance that can only cover one must not both succeed. The
// Postgres function does the check-free debit in one statement; going
// negative here is an accepted outcome (see Global Constraints — gating
// happens at mint time, not here), not a bug to guard against.
export async function debitWalletForCommission(userId: string, amount: number, kaspiPaymentRequestId: string): Promise<number> {
  const commission = computeCommission(amount)
  const { data, error } = await supabase.rpc('debit_wallet_balance', { p_user_id: userId, p_amount: commission })
  if (error) throw new Error(`wallet commission debit failed for user ${userId}: ${error.message}`)
  await supabase.from('wallet_ledger').insert({
    user_id: userId,
    type: 'commission',
    amount: -commission,
    balance_after: data,
    kaspi_payment_request_id: kaspiPaymentRequestId,
  })
  return data as number
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- wallet.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/kaspiPay/wallet.ts src/lib/kaspiPay/wallet.test.ts
git commit -m "feat(kaspi-pay): add wallet balance schema and commission math"
```

---

### Task 2: Platform (admin) connection lookup — `src/lib/kaspiPay/connection.ts`

**Files:**
- Modify: `src/lib/kaspiPay/connection.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `loadPlatformConnection(): Promise<KaspiConnection | null>` — consumed by Task 6 (subscription payments) and Task 7 (wallet top-ups).

- [ ] **Step 1: Add `loadPlatformConnection` to `connection.ts`**

Add this function to `src/lib/kaspiPay/connection.ts`, right after `loadConnectionByUserId`:

```ts
// invoices.kz's own Kaspi Cashier connection, used to collect money FROM
// users (plan payments, wallet top-ups) -- not a new connection type, just
// whichever kaspi_connections row belongs to the one admin profile. Looked
// up dynamically rather than a hardcoded user id so this keeps working if
// the admin account ever changes.
export async function loadPlatformConnection(): Promise<KaspiConnection | null> {
  const { data: admin, error: adminError } = await supabase
    .from('profiles')
    .select('id')
    .eq('is_admin', true)
    .maybeSingle()
  if (adminError) throw new Error(`admin profile lookup failed: ${adminError.message}`)
  if (!admin) return null
  return loadConnectionByUserId(admin.id)
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/kaspiPay/connection.ts
git commit -m "feat(kaspi-pay): add loadPlatformConnection for platform-collected payments"
```

---

### Task 3: Remove the Pro gate, add balance gating on new-payment creation

**Files:**
- Modify: `src/lib/kaspiPay/invoicePayment.ts`
- Modify: `src/app/api/kaspi/pay/route.ts`
- Modify: `src/app/api/kaspi/connect/init/route.ts`
- Modify: `src/app/api/kaspi/connect/verify/route.ts`

**Interfaces:**
- Consumes: `getWalletBalance`, `computeCommission` from `./wallet` (Task 1).
- Produces: nothing new — this task only changes gating logic inside existing functions/routes.

- [ ] **Step 1: Remove the Pro check from `invoicePayment.ts`, add balance gating**

In `src/lib/kaspiPay/invoicePayment.ts`, replace:

```ts
  // Kaspi Pay is Pro-only, enforced server-side on every route that lets a
  // user set one up or spend it directly — but this helper mints on the
  // owner's behalf from two call sites (send-invoice, and the public
  // invoice-payment endpoint) with no auth header to gate. Checked here,
  // right before minting, so a lapsed Pro user's still-valid existing link
  // (returned above) keeps working, but no further Kaspi payment is ever
  // created for their invoices once Pro expires.
  const { data: ownerProfile } = await supabase
    .from('profiles')
    .select('plan, plan_expires_at, bonus_expires_at, trial_expires_at')
    .eq('id', invoice.user_id)
    .single()
  if (!getActivePlan(ownerProfile).canAcquiring) return null
```

with:

```ts
  // Kaspi Pay Cashier is open to every plan; it's monetized per-payment
  // instead (5% commission funded by the connection owner's prepaid wallet
  // balance — see wallet.ts). Checked here, right before minting a NEW
  // payment, so an owner with insufficient balance keeps their still-valid
  // existing link (returned above) but gets no further payment created for
  // their invoices until they top up.
  const balance = await getWalletBalance(invoice.user_id)
  if (balance < computeCommission(Number(invoice.amount))) return null
```

Remove the now-unused `import { getActivePlan } from '@/lib/plan'` line and add:

```ts
import { getWalletBalance, computeCommission } from './wallet'
```

- [ ] **Step 2: Remove the Pro check from `POST /api/kaspi/pay`, add balance gating**

In `src/app/api/kaspi/pay/route.ts`, replace:

```ts
  // The real enforcement point for the whole feature. This route is called
  // by the customer's own site indefinitely, so without a plan check here a
  // user could subscribe to Pro for one month, connect, and keep full
  // production API access forever. Deliberately NOT applied to the polling
  // cron: that only resolves already-created requests (money that may
  // already have moved), so gating it would strand real payments — creation
  // is the point where the paid capability is actually consumed.
  const { data: ownerProfile } = await supabase
    .from('profiles')
    .select('plan, plan_expires_at, bonus_expires_at, trial_expires_at')
    .eq('id', found.userId)
    .single()
  if (!getActivePlan(ownerProfile).canAcquiring) {
    return NextResponse.json({ error: 'not_pro' }, { status: 403 })
  }

  const { amount, order_id, callback_url } = await req.json()
  if (!amount || !order_id) {
    return NextResponse.json({ error: 'amount and order_id required' }, { status: 400 })
  }
```

with:

```ts
  const { amount, order_id, callback_url } = await req.json()
  if (!amount || !order_id) {
    return NextResponse.json({ error: 'amount and order_id required' }, { status: 400 })
  }

  // The real enforcement point for the whole feature: creating a NEW payment
  // is what's monetized (5% of it, debited on settlement), not connecting or
  // holding a connection. Deliberately NOT applied to the polling cron: that
  // only resolves already-created requests (money that may already have
  // moved), so gating it would strand real payments.
  const balance = await getWalletBalance(found.userId)
  const required = computeCommission(Number(amount))
  if (balance < required) {
    return NextResponse.json({ error: 'insufficient_balance', required, balance }, { status: 402 })
  }
```

Remove the now-unused `import { getActivePlan } from '@/lib/plan'` line and add:

```ts
import { getWalletBalance, computeCommission } from '@/lib/kaspiPay/wallet'
```

- [ ] **Step 3: Remove the Pro check from `connect/init` and `connect/verify`**

In `src/app/api/kaspi/connect/init/route.ts`, delete this whole block (and its now-unused `getActivePlan`/`profiles` query and `import { getActivePlan } from '@/lib/plan'` line):

```ts
  // Kaspi Pay is Pro-only, enforced server-side — the page hides the form for
  // non-Pro accounts, but that is UX, not enforcement. Same gate and same
  // 403 {error:'not_pro'} shape as /api/bcc/connect: connecting here starts
  // an ongoing automated capability (a live device pairing against the
  // customer's own Kaspi account, plus cron polling), not a one-off action.
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, plan_expires_at, bonus_expires_at, trial_expires_at')
    .eq('id', user.id)
    .single()
  if (!getActivePlan(profile).canAcquiring) {
    return NextResponse.json({ error: 'not_pro' }, { status: 403 })
  }
```

replacing the comment with a one-liner: `// Connecting a Cashier is free on every plan — usage is what's monetized (see /api/kaspi/pay, invoicePayment.ts).`

Do the same in `src/app/api/kaspi/connect/verify/route.ts` (delete its equivalent Pro-gate block and unused import).

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors (no unused-import warnings for `getActivePlan` in these four files).

- [ ] **Step 5: Run the existing test suite**

Run: `npm test -- kaspiPay`
Expected: all existing tests still PASS (this task changes gating logic only, no existing test asserts the old Pro-gate behavior since these are route files with no test coverage per this project's convention).

- [ ] **Step 6: Commit**

```bash
git add src/lib/kaspiPay/invoicePayment.ts src/app/api/kaspi/pay/route.ts src/app/api/kaspi/connect/init/route.ts src/app/api/kaspi/connect/verify/route.ts
git commit -m "feat(kaspi-pay): open Kaspi Pay Cashier to all plans, gate new payments on wallet balance instead"
```

---

### Task 4: Commission deduction on settlement — `src/lib/kaspiPay/settlePayment.ts`

**Files:**
- Modify: `src/lib/kaspiPay/settlePayment.ts`

**Interfaces:**
- Consumes: `debitWalletForCommission` from `./wallet` (Task 1).
- Produces: nothing new — `checkAndSettleKaspiPayment`'s signature and `SettleOutcome` type are unchanged; it now has a side effect (debiting commission) on the `'paid'` path.

- [ ] **Step 1: Add the debit call to `checkAndSettleKaspiPayment`**

In `src/lib/kaspiPay/settlePayment.ts`, add the import:

```ts
import { debitWalletForCommission } from './wallet'
```

Right after the block that marks the invoice paid and logs it (after the `if (reqRow.invoice_id) { ... }` block, before the `if (reqRow.callback_url) { ... }` webhook block), add:

```ts
  // Commission is charged exactly once, here — the moment a payment is
  // confirmed paid, never at link-creation time and never for anything that
  // expires unpaid. This applies uniformly whether the payment came from an
  // invoice auto-mint link or the external API — one rule, no special cases.
  try {
    await debitWalletForCommission(reqRow.user_id, Number(reqRow.amount), reqRow.id)
  } catch (e: any) {
    // A failed debit must never un-confirm a real payment the customer
    // already received — logged for manual reconciliation, not retried
    // automatically (retrying here could double-charge if the RPC itself
    // partially succeeded before erroring).
    console.error('Kaspi settle: commission debit failed for request', reqRow.id, 'user', reqRow.user_id, ':', e.message)
  }
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/kaspiPay/settlePayment.ts
git commit -m "feat(kaspi-pay): debit 5% commission from the payer's wallet on settlement"
```

---

### Task 5: Phone-push payment support — `createInvoiceByPhone` in `client.ts`

**Files:**
- Modify: `src/lib/kaspiPay/client.ts`

**Interfaces:**
- Consumes: nothing new (reuses this file's own `buildSignedHeaders`, unexported).
- Produces: `createInvoiceByPhone(connection: KaspiConnection, params: { phoneNumber: string, amount: number, comment?: string }): Promise<{ operationId: string }>` — consumed by Task 6.

- [ ] **Step 1: Add `createInvoiceByPhone` to `client.ts`**

xpayment's phone-push ("push an invoice straight to a payer's phone, no QR") is a *different* Kaspi endpoint than `createPayment`'s QR flow — confirmed from the reference project's `src/routes/invoice.js`: `POST https://qrpay.kaspi.kz/v01/remote/create`, body `{ PhoneNumber, Amount, Comment }`, returning `{ Data: { QrOperationId, ... } }`. The returned `QrOperationId` is the same kind of id `checkStatus` already polls, so no new settlement logic is needed for it.

Add this function to `src/lib/kaspiPay/client.ts`, right after `createPayment`:

```ts
export async function createInvoiceByPhone(
  connection: KaspiConnection,
  params: { phoneNumber: string, amount: number, comment?: string }
): Promise<{ operationId: string }> {
  const url = `${KASPI_QRPAY_URL}/v01/remote/create`
  const payload = JSON.stringify({
    PhoneNumber: params.phoneNumber,
    Amount: params.amount,
    Comment: params.comment || '',
  })
  const headers = { ...buildSignedHeaders(url, connection, payload), 'Content-Type': 'application/json' }
  const res = await fetch(url, { method: 'POST', headers, body: payload })
  const json = await res.json()
  const d = json.Data
  if (!d?.QrOperationId) throw new Error('Kaspi remote/create failed: ' + JSON.stringify(json))
  return { operationId: String(d.QrOperationId) }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/kaspiPay/client.ts
git commit -m "feat(kaspi-pay): add createInvoiceByPhone (Kaspi's phone-push payment, distinct from the QR flow)"
```

---

### Task 6: Subscription billing migration — retire xpayment for plan payments

**Files:**
- Create: `src/lib/kaspiPay/settlePlanPayment.ts`
- Modify: `src/app/api/payment/create/route.ts`
- Modify: `src/app/api/payment/create-phone/route.ts`
- Modify: `src/app/upgrade/page.tsx`

**Interfaces:**
- Consumes: `loadPlatformConnection` (Task 2), `createPayment`/`createInvoiceByPhone`/`checkStatus` (`./client`).
- Produces: `checkAndSettlePlanPayment(row: PlanPaymentRow): Promise<'paid' | 'not_paid'>` where `PlanPaymentRow = { id: string, user_id: string, plan: string, amount: number, qr_operation_id: string }` — consumed by Task 8's cron sweep and this task's own `/upgrade` polling.

- [ ] **Step 1: Write `checkAndSettlePlanPayment`**

Create `src/lib/kaspiPay/settlePlanPayment.ts`:

```ts
import { createClient } from '@supabase/supabase-js'
import { loadPlatformConnection } from './connection'
import { checkStatus } from './client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface PlanPaymentRow {
  id: string
  user_id: string
  plan: string
  amount: number
  qr_operation_id: string
}

// Parallel to checkAndSettleKaspiPayment, but for invoices.kz's OWN
// subscription payments: settles against the admin's platform connection
// instead of the paying customer's, and activates a plan instead of marking
// an invoice paid. Ported from the old /api/payment/webhook's bonus-days
// carry-over logic rather than dropping it.
export async function checkAndSettlePlanPayment(row: PlanPaymentRow): Promise<'paid' | 'not_paid'> {
  const connection = await loadPlatformConnection()
  if (!connection) return 'not_paid'

  const result = await checkStatus(connection, row.qr_operation_id)
  if (result.status !== 'paid') return 'not_paid'

  const { data: claimed, error: claimError } = await supabase
    .from('payment_requests')
    .update({ status: 'paid', activated_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('id')
  if (claimError) throw new Error(`failed to claim paid plan payment: ${claimError.message}`)
  if (!claimed || claimed.length === 0) return 'paid' // already settled by another caller

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  const { data: profile } = await supabase
    .from('profiles')
    .select('bonus_expires_at')
    .eq('id', row.user_id)
    .single()
  if (profile?.bonus_expires_at) {
    const bonusEnd = new Date(profile.bonus_expires_at)
    if (bonusEnd > new Date()) {
      const bonusDays = Math.ceil((bonusEnd.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
      expiresAt.setDate(expiresAt.getDate() + bonusDays)
    }
  }

  await supabase.from('profiles').update({ plan: row.plan, plan_expires_at: expiresAt.toISOString() }).eq('id', row.user_id)

  return 'paid'
}
```

- [ ] **Step 2: Swap `/api/payment/create`'s transport**

In `src/app/api/payment/create/route.ts`, replace the xpayment `fetch` call and its surrounding logic with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadPlatformConnection } from '@/lib/kaspiPay/connection'
import { createPayment } from '@/lib/kaspiPay/client'

const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { userId, plan } = await req.json()
    if (!userId || !plan || (plan !== 'pro' && plan !== 'basic')) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 })
    }

    const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
    const { data: { user } } = accessToken
      ? await supabaseAuth.auth.getUser(accessToken)
      : { data: { user: null } }
    if (!user || user.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const connection = await loadPlatformConnection()
    if (!connection) return NextResponse.json({ error: 'Platform Kaspi connection not set up' }, { status: 500 })

    const amount = plan === 'pro' ? 5990 : 2990
    const payment = await createPayment(connection, { amount, orderId: `${userId}__${plan}__${Date.now()}` })

    const { error: insertError } = await supabase.from('payment_requests').insert({
      user_id: userId,
      email: user.email,
      plan,
      amount,
      status: 'pending',
      order_id: payment.operationId,
      qr_operation_id: payment.operationId,
    })
    if (insertError) {
      console.error('Plan payment created but failed to persist for tracking — operation', payment.operationId, ':', insertError.message)
      return NextResponse.json({ error: 'tracking_failed' }, { status: 502 })
    }

    return NextResponse.json({
      qr_token: payment.paymentLink,
      ext_tran_id: payment.operationId,
      expire_date: payment.expiresAt,
    })
  } catch (e: any) {
    console.error('Payment create error:', e)
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
```

Note: `qr_token` in the response is kept as the field name for compatibility with `/upgrade/page.tsx` (`data.qr_token`), even though it now holds `payment.paymentLink` — the page just needs a URL to redirect to or render as a link, which `paymentLink` is.

- [ ] **Step 3: Swap `/api/payment/create-phone`'s transport**

In `src/app/api/payment/create-phone/route.ts`, replace the xpayment `fetch` call with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadPlatformConnection } from '@/lib/kaspiPay/connection'
import { createInvoiceByPhone } from '@/lib/kaspiPay/client'

const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { userId, plan, phone } = await req.json()
    if (!userId || !plan || !phone || (plan !== 'pro' && plan !== 'basic')) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 })
    }

    const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
    const { data: { user } } = accessToken
      ? await supabaseAuth.auth.getUser(accessToken)
      : { data: { user: null } }
    if (!user || user.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const connection = await loadPlatformConnection()
    if (!connection) return NextResponse.json({ error: 'Platform Kaspi connection not set up' }, { status: 500 })

    const amount = plan === 'pro' ? 5990 : 2990
    const comment = plan === 'pro' ? 'INVOICES.KZ Pro тариф' : 'INVOICES.KZ Basic тариф'
    const invoice = await createInvoiceByPhone(connection, { phoneNumber: phone, amount, comment })

    const { error: insertError } = await supabase.from('payment_requests').insert({
      user_id: userId,
      email: user.email,
      plan,
      amount,
      status: 'pending',
      order_id: invoice.operationId,
      qr_operation_id: invoice.operationId,
    })
    if (insertError) {
      console.error('Plan phone-payment created but failed to persist — operation', invoice.operationId, ':', insertError.message)
      return NextResponse.json({ error: 'tracking_failed' }, { status: 502 })
    }

    return NextResponse.json({ payment_id: invoice.operationId, status: 'pending' })
  } catch (e: any) {
    console.error('Phone payment error:', e)
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Add a plan-payment status endpoint and live-poll it from `/upgrade`**

Create `src/app/api/payment/status/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAndSettlePlanPayment } from '@/lib/kaspiPay/settlePlanPayment'

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

  const orderId = req.nextUrl.searchParams.get('order_id')
  if (!orderId) return NextResponse.json({ error: 'order_id required' }, { status: 400 })

  const { data: row } = await supabase
    .from('payment_requests')
    .select('id, user_id, plan, amount, qr_operation_id, status')
    .eq('order_id', orderId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!row) return NextResponse.json({ status: null })

  if (row.status === 'pending') {
    try {
      const outcome = await checkAndSettlePlanPayment(row as any)
      return NextResponse.json({ status: outcome === 'paid' ? 'paid' : 'pending' })
    } catch (e: any) {
      console.error('Plan payment status check failed for', orderId, ':', e.message)
      return NextResponse.json({ status: 'pending' })
    }
  }
  return NextResponse.json({ status: row.status })
}
```

In `src/app/upgrade/page.tsx`, right after the existing code that sets `qrToken`/`ext_tran_id` from `/api/payment/create`'s response (near line 91, where `setQrToken(data.qr_token)` is called), add a polling effect mirroring `/view/[token]`'s pattern:

```ts
useEffect(() => {
  if (!extTranId) return
  let cancelled = false
  let polls = 0
  const interval = setInterval(async () => {
    polls++
    if (polls > 150 || cancelled) { clearInterval(interval); return }
    const { data: { session } } = await supabase.auth.getSession()
    try {
      const res = await fetch(`/api/payment/status?order_id=${extTranId}`, {
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      })
      const data = await res.json()
      if (data.status === 'paid' && !cancelled) {
        clearInterval(interval)
        router.push('/profile?upgraded=1')
      }
    } catch {
      // Transient network hiccup — the next tick tries again.
    }
  }, 5000)
  return () => { cancelled = true; clearInterval(interval) }
}, [extTranId])
```

(`extTranId` is whatever local state variable already holds `data.ext_tran_id` from the existing `/api/payment/create` call — use that exact variable name from the surrounding code rather than introducing a second one.)

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/kaspiPay/settlePlanPayment.ts src/app/api/payment/create/route.ts src/app/api/payment/create-phone/route.ts src/app/api/payment/status/route.ts src/app/upgrade/page.tsx
git commit -m "feat(kaspi-pay): replace xpayment with in-house Kaspi rail for subscription payments"
```

---

### Task 7: Wallet top-up route and settlement

**Files:**
- Create: `src/app/api/kaspi/wallet/topup/route.ts`
- Create: `src/app/api/kaspi/wallet/topup-status/route.ts`
- Modify: `src/lib/kaspiPay/wallet.ts`

**Interfaces:**
- Consumes: `loadPlatformConnection` (Task 2), `createPayment`/`checkStatus` (`./client`), `creditWallet` (Task 1).
- Produces: `checkAndSettleWalletTopup(row: { id, user_id, amount, kaspi_operation_id, status }): Promise<'paid' | 'not_paid'>` in `wallet.ts` — consumed by both new routes and Task 8's cron sweep.

- [ ] **Step 1: Add `checkAndSettleWalletTopup` to `wallet.ts`**

Add to `src/lib/kaspiPay/wallet.ts`:

```ts
import { loadPlatformConnection } from './connection'
import { checkStatus } from './client'

export interface WalletTopupRow {
  id: string
  user_id: string
  amount: number
  kaspi_operation_id: string
  status: string
}

export async function checkAndSettleWalletTopup(row: WalletTopupRow): Promise<'paid' | 'not_paid'> {
  const connection = await loadPlatformConnection()
  if (!connection) return 'not_paid'

  const result = await checkStatus(connection, row.kaspi_operation_id)
  if (result.status !== 'paid') return 'not_paid'

  const { data: claimed, error: claimError } = await supabase
    .from('kaspi_wallet_topups')
    .update({ status: 'paid' })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('id')
  if (claimError) throw new Error(`failed to claim paid topup: ${claimError.message}`)
  if (!claimed || claimed.length === 0) return 'paid' // already settled by another caller

  await creditWallet(row.user_id, row.amount, row.id)
  return 'paid'
}
```

- [ ] **Step 2: Create the top-up creation route**

Create `src/app/api/kaspi/wallet/topup/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadPlatformConnection } from '@/lib/kaspiPay/connection'
import { createPayment } from '@/lib/kaspiPay/client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const MIN_TOPUP = 1000

export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { amount } = await req.json()
  if (!amount || typeof amount !== 'number' || amount < MIN_TOPUP) {
    return NextResponse.json({ error: 'invalid_amount', min: MIN_TOPUP }, { status: 400 })
  }

  const connection = await loadPlatformConnection()
  if (!connection) return NextResponse.json({ error: 'Platform Kaspi connection not set up' }, { status: 500 })

  try {
    const payment = await createPayment(connection, { amount, orderId: `topup_${user.id}_${Date.now()}` })
    const { data: inserted, error: insertError } = await supabase
      .from('kaspi_wallet_topups')
      .insert({
        user_id: user.id,
        amount,
        kaspi_operation_id: payment.operationId,
        qr_token: payment.qrToken,
        payment_link: payment.paymentLink,
        status: 'pending',
        expires_at: payment.expiresAt,
      })
      .select('id')
      .single()
    if (insertError) {
      console.error('Wallet topup created but failed to persist — operation', payment.operationId, ':', insertError.message)
      return NextResponse.json({ error: 'tracking_failed' }, { status: 502 })
    }
    return NextResponse.json({ topup_id: inserted.id, payment_link: payment.paymentLink, expires_at: payment.expiresAt })
  } catch (e: any) {
    console.error('Wallet topup create error:', e.message)
    return NextResponse.json({ error: 'kaspi_unavailable' }, { status: 502 })
  }
}
```

- [ ] **Step 3: Create the top-up status/poll route**

Create `src/app/api/kaspi/wallet/topup-status/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAndSettleWalletTopup } from '@/lib/kaspiPay/wallet'

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

  const topupId = req.nextUrl.searchParams.get('topup_id')
  if (!topupId) return NextResponse.json({ error: 'topup_id required' }, { status: 400 })

  const { data: row } = await supabase
    .from('kaspi_wallet_topups')
    .select('id, user_id, amount, kaspi_operation_id, status')
    .eq('id', topupId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!row) return NextResponse.json({ status: null })

  if (row.status === 'pending') {
    try {
      const outcome = await checkAndSettleWalletTopup(row as any)
      return NextResponse.json({ status: outcome === 'paid' ? 'paid' : 'pending' })
    } catch (e: any) {
      console.error('Wallet topup status check failed for', topupId, ':', e.message)
      return NextResponse.json({ status: 'pending' })
    }
  }
  return NextResponse.json({ status: row.status })
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/kaspi/wallet src/lib/kaspiPay/wallet.ts
git commit -m "feat(kaspi-pay): add wallet top-up creation and live-poll settlement"
```

---

### Task 8: Extend the daily cron to sweep plan payments and wallet top-ups

**Files:**
- Modify: `src/app/api/cron/kaspi-poll/route.ts`

**Interfaces:**
- Consumes: `checkAndSettlePlanPayment` (Task 6), `checkAndSettleWalletTopup` (Task 7).
- Produces: nothing new — same route, same response shape, now also sweeps two more tables.

- [ ] **Step 1: Add the two sweeps to the cron**

In `src/app/api/cron/kaspi-poll/route.ts`, add after the existing `kaspi_payment_requests` loop (before the final `return NextResponse.json(...)`):

```ts
  const { data: pendingPlans } = await supabase
    .from('payment_requests')
    .select('id, user_id, plan, amount, qr_operation_id')
    .eq('status', 'pending')
  let plansPaid = 0
  for (const row of (pendingPlans || []) as any[]) {
    try {
      if ((await checkAndSettlePlanPayment(row)) === 'paid') plansPaid++
    } catch (e: any) {
      console.error('Kaspi poll: plan payment check failed for', row.id, '— retrying next run:', e.message)
    }
  }

  const { data: pendingTopups } = await supabase
    .from('kaspi_wallet_topups')
    .select('id, user_id, amount, kaspi_operation_id, status')
    .eq('status', 'pending')
  let topupsPaid = 0
  for (const row of (pendingTopups || []) as any[]) {
    try {
      if ((await checkAndSettleWalletTopup(row)) === 'paid') topupsPaid++
    } catch (e: any) {
      console.error('Kaspi poll: wallet topup check failed for', row.id, '— retrying next run:', e.message)
    }
  }

  return NextResponse.json({ ok: true, paid, expired, plansPaid, topupsPaid })
```

Remove the original `return NextResponse.json({ ok: true, paid, expired })` line it replaces, and add the imports:

```ts
import { checkAndSettlePlanPayment } from '@/lib/kaspiPay/settlePlanPayment'
import { checkAndSettleWalletTopup } from '@/lib/kaspiPay/wallet'
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/kaspi-poll/route.ts
git commit -m "feat(kaspi-pay): sweep pending plan payments and wallet top-ups in the daily cron"
```

---

### Task 9: Retire xpayment

**Files:**
- Delete: `src/app/api/payment/webhook/route.ts`
- Modify: `src/app/profile/kaspi-pay/docs/page.tsx` (no xpayment references expected — verify only)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing — cleanup only.

- [ ] **Step 1: Delete the xpayment webhook route**

```bash
git rm src/app/api/payment/webhook/route.ts
```

- [ ] **Step 2: Grep for any remaining xpayment references**

Run: `grep -rn "xpayment\|XPAYMENT" src/`
Expected: no matches (Task 6 already removed the only two call sites; this step is a safety net for anything missed).

If any remain, remove them following the same pattern as Task 6.

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(kaspi-pay): retire xpayment webhook route, now fully replaced by in-house Kaspi rail"
```

Note for the human operator (not part of this task's automated steps): once this is confirmed live, `XPAYMENT_API_KEY` and `XPAYMENT_WEBHOOK_SECRET` can be removed from Vercel's environment variables.

---

### Task 10: Dashboard additions — balance, top-up, token regeneration

**Files:**
- Modify: `src/app/api/kaspi/dashboard/route.ts` (already exists — extend, don't replace)
- Create: `src/app/api/kaspi/regenerate-token/route.ts`

**Interfaces:**
- Consumes: `getWalletBalance` (Task 1).
- Produces: dashboard route now also returns `walletBalance: number`; new route returns `{ apiToken: string }` once.

- [ ] **Step 1: Add wallet balance to the dashboard route**

In `src/app/api/kaspi/dashboard/route.ts`, add the import `import { getWalletBalance } from '@/lib/kaspiPay/wallet'` and, in the `GET` handler right after the existing `conn` lookup (before building the `rows` query), add:

```ts
  const walletBalance = await getWalletBalance(user.id)
```

Add `walletBalance,` to the final `NextResponse.json({ ... })` object (alongside the existing `connected`, `status`, `phoneNumber`, etc. fields).

- [ ] **Step 2: Create the token-regeneration route**

Create `src/app/api/kaspi/regenerate-token/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Regenerates the API token WITHOUT touching the underlying Kaspi device
// pairing — same connection, same tokenSn/totpSeed, just a new bearer
// credential. For when a token may have been exposed (shown in a
// screenshot, pasted somewhere) but the Cashier pairing itself is fine.
export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiToken = crypto.randomBytes(32).toString('hex')
  const apiTokenHash = crypto.createHash('sha256').update(apiToken).digest('hex')

  const { error } = await supabase
    .from('kaspi_connections')
    .update({ api_token_hash: apiTokenHash })
    .eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500 })

  return NextResponse.json({ apiToken })
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/kaspi/dashboard/route.ts src/app/api/kaspi/regenerate-token/route.ts
git commit -m "feat(kaspi-pay): add wallet balance to dashboard, add token regeneration"
```

---

### Task 11: Move the UI into `/profile/acquiring`, remove the old static Kaspi button

**Files:**
- Modify: `src/app/profile/acquiring/page.tsx`
- Modify: `src/app/profile/kaspi-pay/page.tsx` (becomes a redirect)
- Delete: nothing (the old `/profile/kaspi-pay/docs` page stays at its existing path, linked from the new section)
- Modify: `src/lib/i18n/acquiring.ts` (add new keys)
- Verify: `src/app/view/[token]/page.tsx` (the old `profile.kaspi_pay_link` button was already hidden conditionally earlier this session — this task removes it outright per the approved spec)

**Interfaces:**
- Consumes: `/api/kaspi/dashboard`, `/api/kaspi/webhook-url`, `/api/kaspi/regenerate-token`, `/api/kaspi/wallet/topup`, `/api/kaspi/wallet/topup-status`, `/api/kaspi/connect/init`, `/api/kaspi/connect/verify`, `/api/kaspi/disconnect` (all existing or built in earlier tasks).
- Produces: nothing new for later tasks — this is the final UI task.

- [ ] **Step 1: Add a Kaspi Pay Cashier section to `/profile/acquiring`**

Port the connect/OTP form and the connected-state card from `src/app/profile/kaspi-pay/page.tsx` into `src/app/profile/acquiring/page.tsx`, as a third section rendered unconditionally (no `canAcquiring` gate — per Global Constraints, this feature is open to every plan). Add this state and logic to the existing component (alongside its BCC state):

```ts
const [kaspiConnected, setKaspiConnected] = useState(false)
const [kaspiStatus, setKaspiStatus] = useState<string | null>(null)
const [kaspiPhone, setKaspiPhone] = useState('')
const [kaspiOtp, setKaspiOtp] = useState('')
const [kaspiProcessId, setKaspiProcessId] = useState<string | null>(null)
const [kaspiApiToken, setKaspiApiToken] = useState<string | null>(null)
const [kaspiWalletBalance, setKaspiWalletBalance] = useState(0)
const [kaspiTopupAmount, setKaspiTopupAmount] = useState<number | null>(null)
const [kaspiTopupCustom, setKaspiTopupCustom] = useState('')
const [kaspiTopupPending, setKaspiTopupPending] = useState<{ topup_id: string, payment_link: string } | null>(null)
```

Fetch `/api/kaspi/dashboard` in the existing `load()` function (same auth-header pattern already used for `/api/bcc/status`), setting `kaspiConnected`, `kaspiStatus`, `kaspiWalletBalance` from its response.

Add handlers `sendKaspiCode()`, `verifyKaspiCode()`, `disconnectKaspi()` — same three calls (`/api/kaspi/connect/init`, `/api/kaspi/connect/verify`, `/api/kaspi/disconnect`) already used in `src/app/profile/kaspi-pay/page.tsx`, copied over.

Add `startTopup(amount: number)`:

```ts
async function startTopup(amount: number) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/kaspi/wallet/topup', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  })
  const data = await res.json()
  if (res.ok) setKaspiTopupPending({ topup_id: data.topup_id, payment_link: data.payment_link })
}
```

Add a poll effect for the pending top-up (same 5s-interval pattern used elsewhere in this codebase):

```ts
useEffect(() => {
  if (!kaspiTopupPending) return
  const interval = setInterval(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/kaspi/wallet/topup-status?topup_id=${kaspiTopupPending.topup_id}`, {
      headers: { 'Authorization': `Bearer ${session?.access_token}` },
    })
    const data = await res.json()
    if (data.status === 'paid') {
      clearInterval(interval)
      setKaspiTopupPending(null)
      load()
    }
  }, 5000)
  return () => clearInterval(interval)
}, [kaspiTopupPending?.topup_id])
```

Render, as a new section in the JSX (after the existing BCC section, before the closing `</div>` of the page's content column): connect form (if not connected) / connected card with balance, top-up presets (1000/5000/10000/50000) + custom-amount input + "Пополнить" button, disconnect button, link to `/profile/kaspi-pay/docs`. Follow the visual style already used for the BCC section (`bg-white rounded-2xl shadow-sm p-4` cards).

- [ ] **Step 2: Redirect the old `/profile/kaspi-pay` route**

Replace the entire contents of `src/app/profile/kaspi-pay/page.tsx` with:

```tsx
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function KaspiPayRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/profile/acquiring') }, [router])
  return null
}
```

- [ ] **Step 3: Remove the old static Kaspi button from `/view/[token]`**

In `src/app/view/[token]/page.tsx`, the "Коннекторы" block was already changed earlier this session to conditionally hide `profile.kaspi_pay_link` only when a live `kaspiPayment` exists. Per the approved spec, remove it outright instead — delete the `profile?.kaspi_pay_link` branch from that block entirely (keep `halyk_pay_link`, `website`, `social_links` as they are):

```tsx
{(profile?.halyk_pay_link || profile?.website || profile?.social_links?.length > 0) && (
  <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
    {profile?.halyk_pay_link && (
      ...unchanged...
    )}
    ...unchanged...
  </div>
)}
```

- [ ] **Step 4: Add i18n keys**

Add the new labels (balance, top-up presets/custom amount, "Пополнить", insufficient-balance message) to `src/lib/i18n/acquiring.ts` for all three languages (`ru`, `kk`, `en`), following that file's existing key-naming style (`kaspiSectionTitle`, `kaspiWalletBalanceLabel`, `kaspiTopupButton`, `kaspiTopupCustomPlaceholder`, `kaspiInsufficientBalanceHint`, etc.) and the exact same object shape already used for `bccSectionTitle` etc.

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Start the dev server (`npm run dev`), visit `/profile/kaspi-pay` — confirm it redirects to `/profile/acquiring`, and the new Kaspi section renders there with balance/top-up/connect controls.

- [ ] **Step 7: Commit**

```bash
git add src/app/profile/acquiring/page.tsx src/app/profile/kaspi-pay/page.tsx src/app/view/\[token\]/page.tsx src/lib/i18n/acquiring.ts
git commit -m "feat(kaspi-pay): move Kaspi Pay Cashier UI into /profile/acquiring, remove old static Kaspi button"
```

---

### Task 12: Final whole-branch review

Dispatch the final code-reviewer subagent (most capable available model) per `superpowers:subagent-driven-development`'s standard closing step, covering the full diff from this plan's starting commit to `HEAD`. Point it at:

- The Global Constraints section above (balance-gating-at-mint / debit-at-settlement split, atomic-RPC-only balance mutations, Pro-gate removal scoped to Kaspi-only routes).
- Whether `debit_wallet_balance` is ever called from application code with a read-then-write pattern instead of the RPC (would reintroduce the race it exists to prevent).
- Whether any Kaspi-specific route still references `getActivePlan`/`canAcquiring` (would mean Task 3 missed a call site).
- Whether the commission debit in `settlePayment.ts` could run twice for one payment (the `status='pending'` claim predicate should make this impossible — confirm the debit call is inside, not outside, that claimed branch).

Address any Critical/Important findings with one bundled fix subagent, then proceed to `superpowers:finishing-a-development-branch`.
