# Unified Wallet Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge invoices.kz's three separate wallet systems (Kaspi Pay commission ₸-wallet, Kaspi Shop credits, AI-agent credits) into one unified tenge-denominated wallet, with a full ledger backfill, a hard balance-verification gate before cutover, and legacy tables preserved (renamed, never dropped).

**Architecture:** Rather than creating new tables, the existing Kaspi Pay wallet system (`profiles.kaspi_wallet_balance` + `wallet_ledger` + `kaspi_wallet_topups` + atomic RPC `debit_wallet_balance`) **becomes** the unified wallet — it is already denominated in real ₸, already serves all users, and already has the battle-tested atomic debit path. Kaspi Shop and AI-agent credits (fixed price 5₸/credit in both) are converted ×5 into it; their code modules become thin delegates preserving existing function signatures so debit call-sites don't change. This means the highest-stakes code path (2% Kaspi Pay commission for all real users) is **not modified at all**.

**Tech Stack:** Next.js (App Router) + Supabase (supabase-js, service-role clients in server code). No SQL migration files exist in the repo — schema changes are applied live via the Supabase MCP `apply_migration`/`execute_sql` tools (this project's established convention).

## Global Constraints

- All balance mutations MUST go through the existing atomic RPC `debit_wallet_balance(p_user_id, p_amount)` (positive = debit, negative = credit). Never a read-then-write balance update.
- Ledger sign convention (all three legacy systems already agree): debits stored as **negative** `amount`, credits positive.
- Conversion rate: **1 credit = 5 ₸** exactly (`KASPI_SHOP_CREDIT_PRICE_TENGE = 5`, `AI_AGENT_CREDIT_PRICE_TENGE = 5` — both confirmed in code).
- New `wallet_ledger.type` values: `'kaspi_shop_check'` (was shop `'check_debit'`), `'ai_agent_reply'` (was ai `'reply_debit'`). Existing values `'topup'`/`'commission'` unchanged. Legacy `'topup'` rows from both credit ledgers map to `'topup'`.
- The 6 legacy tables are **renamed** with a `_legacy` suffix, never dropped. `profiles.kaspi_wallet_balance` column stays (it IS the unified balance). Legacy RPCs `debit_kaspi_shop_wallet_balance` / `debit_ai_agent_wallet_balance` are renamed `_legacy` so any stale code fails loudly instead of silently debiting a merged-away table.
- API route **paths** `/api/kaspi/wallet/*`, `/api/kaspi-shop/wallet/*`, `/api/ai-agent/wallet/*` all stay; the latter two delegate internally to the unified module.
- **Cutover order is mandatory:** all code tasks (2–4) are committed locally FIRST (nothing pushed — there are already ~20 unpushed commits on main; production still runs the pre-redesign code), THEN the DB migration + verification gate (Task 5), THEN one push deploying everything (Task 6). This makes the stale-code window ≈ one Vercel build, and only for admin-only features (founder's own accounts).
- **Verification gate (Task 5) is a hard STOP:** if any user's post-merge balance ≠ snapshot-computed expected value, or any row-count check fails, do NOT proceed to Task 6. Report BLOCKED.
- Accepted behavior note (not a bug): after the merge, Kaspi Shop / AI-agent spend draws from the same balance that gates Kaspi Pay payment-link minting. Low-risk today (both features admin-only), revisit before opening them to all users.

## Current-state map (verified against code 2026-08-18)

| | Kaspi Pay (unified base) | Kaspi Shop | AI-agent |
|---|---|---|---|
| Balance | `profiles.kaspi_wallet_balance` (₸) | `kaspi_shop_wallet.balance` (credits) | `ai_agent_wallet.balance` (credits) |
| Ledger | `wallet_ledger` (has `balance_after`) | `kaspi_shop_wallet_ledger` | `ai_agent_wallet_ledger` |
| Topups | `kaspi_wallet_topups` (`amount` ₸) | `kaspi_shop_wallet_topups` (`credits`) | `ai_agent_wallet_topups` (`credits`) |
| RPC | `debit_wallet_balance` | `debit_kaspi_shop_wallet_balance` | `debit_ai_agent_wallet_balance` |
| Module | `src/lib/kaspiPay/wallet.ts` | `src/lib/kaspiShop/wallet.ts` | `src/lib/aiAgent/wallet.ts` |
| Debit sites | historySync.ts:65, settlePayment.ts:89, pending-matches/confirm:80 (unchanged by this plan) | checkCycle.ts:422 (signature preserved) | webhookHandler.ts:243, api/ai-agent/review:134 (signatures preserved) |
| Seeding | — (profiles row always exists) | connection.ts:116 (remove) | api/ai-agent/settings:83-87 (remove) |
| Topup settle | `checkAndSettleWalletTopup` + kaspi-poll cron sweep | client polling only | client polling only |

---

### Task 1: Pre-flight DB inspection (read-only, no code changes)

**Files:** none modified. Uses Supabase MCP `execute_sql` (read-only queries) against the production project.

**Interfaces:**
- Produces: a written findings file `.superpowers/sdd/wallet-merge-preflight.md` that Task 5 consumes — it must contain the exact RPC signatures, column types, constraint list, and row counts listed below.

- [ ] **Step 1: Confirm schemas & constraints.** Run each query, record output verbatim in the findings file:

```sql
-- column types & nullability of every table involved
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN
  ('wallet_ledger','kaspi_wallet_topups','kaspi_shop_wallet','kaspi_shop_wallet_ledger',
   'kaspi_shop_wallet_topups','ai_agent_wallet','ai_agent_wallet_ledger','ai_agent_wallet_topups')
ORDER BY table_name, ordinal_position;

-- any CHECK constraints (esp. on wallet_ledger.type — would reject the two new type values)
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid::regclass::text IN
  ('wallet_ledger','kaspi_wallet_topups','kaspi_shop_wallet','kaspi_shop_wallet_ledger',
   'kaspi_shop_wallet_topups','ai_agent_wallet','ai_agent_wallet_ledger','ai_agent_wallet_topups');

-- exact RPC signatures (needed for the ALTER FUNCTION ... RENAME statements in Task 5)
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN
  ('debit_wallet_balance','debit_kaspi_shop_wallet_balance','debit_ai_agent_wallet_balance');

-- RLS status
SELECT relname, relrowsecurity FROM pg_class
WHERE relname IN ('wallet_ledger','kaspi_wallet_topups','kaspi_shop_wallet','kaspi_shop_wallet_ledger',
   'kaspi_shop_wallet_topups','ai_agent_wallet','ai_agent_wallet_ledger','ai_agent_wallet_topups');
```

- [ ] **Step 2: Record current money state** (this is the human-readable pre-merge picture):

```sql
SELECT (SELECT COUNT(*) FROM profiles WHERE COALESCE(kaspi_wallet_balance,0) <> 0) AS users_with_kaspi_balance,
       (SELECT COALESCE(SUM(kaspi_wallet_balance),0) FROM profiles) AS total_kaspi_tenge,
       (SELECT COUNT(*) FROM kaspi_shop_wallet) AS shop_wallets,
       (SELECT COALESCE(SUM(balance),0) FROM kaspi_shop_wallet) AS total_shop_credits,
       (SELECT COUNT(*) FROM ai_agent_wallet) AS ai_wallets,
       (SELECT COALESCE(SUM(balance),0) FROM ai_agent_wallet) AS total_ai_credits,
       (SELECT COUNT(*) FROM kaspi_shop_wallet_ledger) AS shop_ledger_rows,
       (SELECT COUNT(*) FROM ai_agent_wallet_ledger) AS ai_ledger_rows,
       (SELECT COUNT(*) FROM kaspi_shop_wallet_topups WHERE status='pending') AS shop_pending_topups,
       (SELECT COUNT(*) FROM ai_agent_wallet_topups WHERE status='pending') AS ai_pending_topups;
```

- [ ] **Step 3: STOP conditions.** If any of these hold, report BLOCKED with details instead of writing "all clear": (a) `wallet_ledger.type` has a CHECK constraint enumerating allowed values (Task 5 must then include dropping/recreating it — record the exact `pg_get_constraintdef` output); (b) any column type is not numeric/integer where the plan multiplies by 5; (c) either legacy ledger has rows whose `type` is outside the documented sets (`check_debit|topup`, `reply_debit|topup`); check with `SELECT DISTINCT type FROM kaspi_shop_wallet_ledger; SELECT DISTINCT type FROM ai_agent_wallet_ledger;`.

- [ ] **Step 4: Write findings file and stop.** No commit (nothing in the repo changed).

---

### Task 2: Unified wallet module (generic debit + thin delegates)

**Files:**
- Modify: `src/lib/kaspiPay/wallet.ts` (add one generic function; touch nothing else in it)
- Rewrite: `src/lib/kaspiShop/wallet.ts`, `src/lib/aiAgent/wallet.ts`

**Interfaces:**
- Consumes: existing `debit_wallet_balance` RPC, existing `getWalletBalance`/`creditWallet`/`checkAndSettleWalletTopup`/`WalletTopupRow` in `kaspiPay/wallet.ts`.
- Produces (later tasks + existing call-sites rely on these EXACT signatures):
  - `debitWallet(userId: string, amountTenge: number, type: 'kaspi_shop_check' | 'ai_agent_reply', note: string): Promise<number>` (new, in kaspiPay/wallet.ts)
  - `debitKaspiShopWallet(userId: string, credits: number, note: string): Promise<number>` (kept signature, now delegates ×5)
  - `getKaspiShopWalletBalance(userId: string): Promise<number>` (kept, now returns unified ₸ balance)
  - `debitAiAgentWallet(userId: string, credits: number, note: string): Promise<number>` (kept, delegates ×5)
  - `getAiAgentWalletBalance(userId: string): Promise<number>` (kept, unified ₸)
  - `KASPI_SHOP_CREDIT_PRICE_TENGE = 5`, `AI_AGENT_CREDIT_PRICE_TENGE = 5`, `AI_AGENT_CREDITS_PER_AI_REPLY = 1` (kept exports — other files import them)

- [ ] **Step 1: Add the generic debit to `src/lib/kaspiPay/wallet.ts`** (below `debitWalletForCommission`, which stays byte-identical):

```typescript
// Generic unified-wallet debit for non-commission spend categories
// (Kaspi Shop price checks, AI-agent replies). Same atomic RPC + loud
// ledger-failure contract as debitWalletForCommission.
export async function debitWallet(
  userId: string,
  amountTenge: number,
  type: 'kaspi_shop_check' | 'ai_agent_reply',
  note: string
): Promise<number> {
  const { data, error } = await supabase.rpc('debit_wallet_balance', { p_user_id: userId, p_amount: amountTenge })
  if (error) throw new Error(`wallet debit (${type}) failed for user ${userId}: ${error.message}`)
  const { error: ledgerError } = await supabase.from('wallet_ledger').insert({
    user_id: userId,
    type,
    amount: -amountTenge,
    balance_after: data,
    note,
  })
  if (ledgerError) console.error(`wallet_ledger insert failed after ${type} debit for user`, userId, ':', ledgerError.message)
  return data as number
}
```

(Ledger-insert failure here is logged, not thrown — matching the legacy shop/ai debit behavior these categories had, NOT commission's throw-contract: nothing keys off these rows' existence for double-charge protection.)

- [ ] **Step 2: Rewrite `src/lib/kaspiShop/wallet.ts`** — full replacement content:

```typescript
// Unified-wallet delegates. Since the 2026-08-18 wallet merge, Kaspi Shop
// spend lives in the shared tenge wallet (profiles.kaspi_wallet_balance +
// wallet_ledger). Signatures preserved so checkCycle.ts and the API routes
// didn't have to change; "credits" params are converted ×5 to tenge here.
import {
  getWalletBalance,
  debitWallet,
  checkAndSettleWalletTopup,
  type WalletTopupRow,
} from '@/lib/kaspiPay/wallet'

export const KASPI_SHOP_CREDIT_PRICE_TENGE = 5

export async function getKaspiShopWalletBalance(userId: string): Promise<number> {
  return getWalletBalance(userId)
}

export async function debitKaspiShopWallet(userId: string, credits: number, note: string): Promise<number> {
  return debitWallet(userId, credits * KASPI_SHOP_CREDIT_PRICE_TENGE, 'kaspi_shop_check', note)
}

export type KaspiShopWalletTopupRow = WalletTopupRow

export async function checkAndSettleKaspiShopWalletTopup(row: WalletTopupRow): Promise<'paid' | 'not_paid' | 'expired'> {
  return checkAndSettleWalletTopup(row)
}
```

- [ ] **Step 3: Rewrite `src/lib/aiAgent/wallet.ts`** — full replacement content:

```typescript
// Unified-wallet delegates (see kaspiShop/wallet.ts for the merge context).
import {
  getWalletBalance,
  debitWallet,
  checkAndSettleWalletTopup,
  type WalletTopupRow,
} from '@/lib/kaspiPay/wallet'

export const AI_AGENT_CREDIT_PRICE_TENGE = 5
export const AI_AGENT_CREDITS_PER_AI_REPLY = 1

export async function getAiAgentWalletBalance(userId: string): Promise<number> {
  return getWalletBalance(userId)
}

export async function debitAiAgentWallet(userId: string, credits: number, note: string): Promise<number> {
  return debitWallet(userId, credits * AI_AGENT_CREDIT_PRICE_TENGE, 'ai_agent_reply', note)
}

export type AiAgentWalletTopupRow = WalletTopupRow

export async function checkAndSettleAiAgentWalletTopup(row: WalletTopupRow): Promise<'paid' | 'not_paid' | 'expired'> {
  return checkAndSettleWalletTopup(row)
}
```

Deleted functions `creditKaspiShopWallet`/`creditAiAgentWallet` — grep for remaining imports first (`grep -rn "creditKaspiShopWallet\|creditAiAgentWallet" src/`); they were only called from the settle functions being replaced, but verify and fix any other importer by switching it to `creditWallet` from kaspiPay (converting credits ×5).

- [ ] **Step 4: Verify.** `npx tsc --noEmit` — expect failures ONLY in files this task doesn't own if the tree has parallel work; failures in wallet-related files must be fixed. Then `grep -rn "kaspi_shop_wallet\|ai_agent_wallet" src/lib/` — expect zero table references left in `src/lib/kaspiShop/wallet.ts` and `src/lib/aiAgent/wallet.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kaspiPay/wallet.ts src/lib/kaspiShop/wallet.ts src/lib/aiAgent/wallet.ts
git commit -m "feat(wallet): unify all three wallets onto the Kaspi Pay tenge wallet (module layer)"
```

---

### Task 3: API routes delegate to the unified wallet; remove legacy seeding

**Files:**
- Modify: `src/app/api/kaspi-shop/wallet/route.ts`, `src/app/api/kaspi-shop/wallet/history/route.ts`, `src/app/api/kaspi-shop/wallet/topup/route.ts`, `src/app/api/kaspi-shop/wallet/topup-status/route.ts`
- Modify: `src/app/api/ai-agent/wallet/route.ts`, `src/app/api/ai-agent/wallet/history/route.ts`, `src/app/api/ai-agent/wallet/topup/route.ts`, `src/app/api/ai-agent/wallet/topup-status/route.ts`
- Modify: `src/lib/kaspiShop/connection.ts` (remove wallet-row seeding around line 116), `src/app/api/ai-agent/settings/route.ts` (remove seeding at ~83-87)

**Interfaces:**
- Consumes: Task 2's delegates; existing `/api/kaspi/wallet/*` route implementations as the reference pattern.
- Produces: all 8 legacy-path routes still respond at their old paths with their old response shapes, but read/write ONLY unified tables.

- [ ] **Step 1: Balance + history routes.** For each of the two `wallet/route.ts` files: they already call `getKaspiShopWalletBalance`/`getAiAgentWalletBalance`, which Task 2 re-pointed — verify by reading, change nothing unless they query legacy tables directly. For each `history/route.ts`: they currently select from `kaspi_shop_wallet_ledger`/`ai_agent_wallet_ledger` — change the table to `wallet_ledger` filtered to that route's categories, preserving each route's existing response shape exactly. E.g. for kaspi-shop history, the query becomes:

```typescript
const { data, error } = await supabase
  .from('wallet_ledger')
  .select('type, amount, note, created_at')
  .eq('user_id', user.id)
  .in('type', ['kaspi_shop_check'])
  .order('created_at', { ascending: false })
  .limit(20)
```

(and `['ai_agent_reply']` for the ai-agent one). Read each file first and keep its auth pattern and response mapping as-is; amounts are now ₸ (5× the old credit numbers) — that's expected, not a bug.

- [ ] **Step 2: Topup-create routes.** Read `src/app/api/kaspi/wallet/topup/route.ts` (the unified reference). Rewrite the shop/ai `topup/route.ts` handlers to be functionally identical to it — creating rows in `kaspi_wallet_topups` with `amount` in ₸ — while preserving each route's existing request field (`amountTenge`) so any cached client keeps working. If the unified route's logic lives inline, extract nothing: copy its exact flow (same Kaspi QR-creation helper it uses, same expiry, same response shape as the unified route).

- [ ] **Step 3: Topup-status routes.** The shop/ai `topup-status/route.ts` currently load a row from their legacy topups table and call `checkAndSettle*`. Re-point the row lookup to `kaspi_wallet_topups` and keep calling the (Task-2-delegated) settle function. Compare against `src/app/api/kaspi/wallet/topup-status/route.ts` and make the internals match it.

- [ ] **Step 4: Remove seeding.** In `src/lib/kaspiShop/connection.ts` (~line 116) delete the `kaspi_shop_wallet` insert block. In `src/app/api/ai-agent/settings/route.ts` (~83-87) delete the `ai_agent_wallet` insert block. The unified balance needs no seeding — `profiles` row always exists and `getWalletBalance` COALESCEs to 0.

- [ ] **Step 5: Verify.** `npx tsc --noEmit` clean for touched files. `grep -rn "kaspi_shop_wallet\|ai_agent_wallet" src/ --include="*.ts" --include="*.tsx"` — remaining hits must ONLY be comments or the two RPC names inside migration docs; zero live table references. 

- [ ] **Step 6: Commit**

```bash
git add src/app/api/kaspi-shop/wallet src/app/api/ai-agent/wallet src/lib/kaspiShop/connection.ts src/app/api/ai-agent/settings/route.ts
git commit -m "feat(wallet): route all wallet API paths onto the unified tenge wallet, drop legacy seeding"
```

---

### Task 4: TopUtilityBar — single wallet + segmented 30-day spend breakdown

**Files:**
- Modify: `src/components/TopUtilityBar.tsx` (WALLETS array at ~39-61, wallet panel), `src/app/api/kaspi/wallet/history/route.ts`

**Interfaces:**
- Consumes: `/api/kaspi/wallet` (balance), `/api/kaspi/wallet/history` (extended below), `/api/kaspi/wallet/topup`, `/api/kaspi/wallet/topup-status`.
- Produces: history endpoint response gains a `breakdown` field: `{ entries: [...unchanged...], breakdown: { topup: number, commission: number, kaspi_shop_check: number, ai_agent_reply: number } }` — absolute ₸ sums over the last 30 days (spend categories summed as positive numbers, `topup` as the credited total).

- [ ] **Step 1: Extend the history endpoint.** In `src/app/api/kaspi/wallet/history/route.ts`: extend `TYPE_LABELS` with `kaspi_shop_check: 'Kaspi Магазин: проверка цены'` and `ai_agent_reply: 'ИИ-агент: ответ'`, and add the 30-day aggregate after the existing entries query:

```typescript
const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
const { data: recent } = await supabase
  .from('wallet_ledger')
  .select('type, amount')
  .eq('user_id', user.id)
  .gte('created_at', since)
const breakdown: Record<string, number> = { topup: 0, commission: 0, kaspi_shop_check: 0, ai_agent_reply: 0 }
for (const row of recent || []) {
  if (row.type in breakdown) breakdown[row.type] += Math.abs(Number(row.amount))
}
return NextResponse.json({ entries, breakdown })
```

- [ ] **Step 2: Collapse WALLETS to one entry.** In `TopUtilityBar.tsx` replace the 3-entry array with:

```typescript
const WALLETS: WalletConfig[] = [
  {
    key: 'unified', label: 'Кошелёк', adminOnly: false,
    balanceUrl: '/api/kaspi/wallet', historyUrl: '/api/kaspi/wallet/history',
    topupUrl: '/api/kaspi/wallet/topup', topupStatusUrl: '/api/kaspi/wallet/topup-status',
    amountField: 'amount', minAmount: 1000, presets: [1000, 2000, 5000, 10000],
    formatBalance: (n: number) => `${n} ₸`,
  },
]
```

Then simplify the wallet panel: remove the left "Кошельки" switcher rail entirely (single wallet needs no switcher); keep balance, top-up flow, and history exactly as they work today for the `invoices` wallet. Keep the `WalletConfig` type and the array shape (minimal diff — the panel code already maps over `WALLETS`).

- [ ] **Step 3: Segmented breakdown bar.** In the wallet panel, between the balance figure and the history list, render a 30-day spend summary from the `breakdown` field fetched with history: a single horizontal segmented bar (flex row, each segment `flex-grow` proportional to its share) using the categorical identity colors already defined in `globals.css`: `var(--nav-accent)` for `commission` (Счета), `var(--nav-teal)` for `kaspi_shop_check`, `var(--nav-magenta)` for `ai_agent_reply` (identity use — allowed), plus a legend row beneath: colored 8px dot + label + `{n} ₸` per non-zero category (labels: «Счета», «Kaspi Магазин», «ИИ-агент»). Hide the whole block when all three spend categories are 0. `topup` is not a bar segment; show it as one muted line under the legend: `Пополнено за 30 дней: {n} ₸`, hidden when 0.

- [ ] **Step 4: Verify.** `npx tsc --noEmit` clean. With the dev server running, open any page logged out → no crash of the pill; if an authenticated session is available, open the wallet panel and confirm: single wallet (no switcher rail), ₸ balance, breakdown bar renders (or hides cleanly at all-zeros). NOTE: until Task 5 runs, the live DB still has legacy state — balance shows only the old Kaspi Pay ₸ figure; that's expected during this task.

- [ ] **Step 5: Commit**

```bash
git add src/components/TopUtilityBar.tsx src/app/api/kaspi/wallet/history/route.ts
git commit -m "feat(wallet): single unified wallet in TopUtilityBar with 30-day segmented spend breakdown"
```

---

### Task 5: Migration + HARD verification gate (live production DB)

**Files:** none in repo (DB-only). Uses Supabase MCP `apply_migration` (name: `unified_wallet_merge`) and `execute_sql`. Requires Task 1's findings file — read it first; substitute the exact RPC argument signatures recorded there into the two `ALTER FUNCTION` statements below.

**Interfaces:**
- Consumes: Task 1 findings (`.superpowers/sdd/wallet-merge-preflight.md`); Tasks 2–4 must already be committed.
- Produces: merged live balances; `wallet_merge_snapshot` table (kept for rollback); 6 `_legacy` tables; verification PASS recorded in `.superpowers/sdd/wallet-merge-verification.md`.

- [ ] **Step 1: Re-check preconditions.** Confirm via `git log` that Tasks 2–4 commits exist. Confirm from Task 1's findings that no STOP condition was recorded. If Task 1 recorded a CHECK constraint on `wallet_ledger.type`, prepend to the migration: `ALTER TABLE wallet_ledger DROP CONSTRAINT <name>;` followed by recreating it with the two new values added (use the exact definition Task 1 recorded, extended).

- [ ] **Step 2: Apply the migration** as ONE `apply_migration` call (single transaction):

```sql
-- Snapshot for verification + rollback (service-role only: RLS on, no policies)
CREATE TABLE wallet_merge_snapshot AS
SELECT p.id AS user_id,
       COALESCE(p.kaspi_wallet_balance, 0) AS kaspi_balance,
       COALESCE(ks.balance, 0) AS shop_credits,
       COALESCE(ai.balance, 0) AS ai_credits,
       now() AS snapshot_at
FROM profiles p
LEFT JOIN kaspi_shop_wallet ks ON ks.user_id = p.id
LEFT JOIN ai_agent_wallet ai ON ai.user_id = p.id;
ALTER TABLE wallet_merge_snapshot ENABLE ROW LEVEL SECURITY;

-- Merge balances: credits × 5₸ folded into the tenge wallet
UPDATE profiles p
SET kaspi_wallet_balance = COALESCE(p.kaspi_wallet_balance, 0)
  + 5 * COALESCE((SELECT balance FROM kaspi_shop_wallet ks WHERE ks.user_id = p.id), 0)
  + 5 * COALESCE((SELECT balance FROM ai_agent_wallet ai WHERE ai.user_id = p.id), 0);

-- Backfill ledger history (×5, original timestamps, balance_after unknown → NULL)
ALTER TABLE wallet_ledger ALTER COLUMN balance_after DROP NOT NULL;
INSERT INTO wallet_ledger (user_id, type, amount, note, created_at)
SELECT user_id,
       CASE type WHEN 'check_debit' THEN 'kaspi_shop_check' ELSE 'topup' END,
       amount * 5, note, created_at
FROM kaspi_shop_wallet_ledger;
INSERT INTO wallet_ledger (user_id, type, amount, note, created_at)
SELECT user_id,
       CASE type WHEN 'reply_debit' THEN 'ai_agent_reply' ELSE 'topup' END,
       amount * 5, note, created_at
FROM ai_agent_wallet_ledger;

-- Carry PENDING top-ups into the unified topups table (same id → the
-- kaspi-poll cron and the unified topup-status route sweep them from here on)
INSERT INTO kaspi_wallet_topups (id, user_id, amount, kaspi_operation_id, status, expires_at)
SELECT id, user_id, credits * 5, kaspi_operation_id, status, expires_at
FROM kaspi_shop_wallet_topups WHERE status = 'pending';
INSERT INTO kaspi_wallet_topups (id, user_id, amount, kaspi_operation_id, status, expires_at)
SELECT id, user_id, credits * 5, kaspi_operation_id, status, expires_at
FROM ai_agent_wallet_topups WHERE status = 'pending';

-- Legacy renames: preserved, never dropped. RPCs renamed so stale deployed
-- code fails loudly instead of silently debiting a merged-away balance.
ALTER TABLE kaspi_shop_wallet RENAME TO kaspi_shop_wallet_legacy;
ALTER TABLE kaspi_shop_wallet_ledger RENAME TO kaspi_shop_wallet_ledger_legacy;
ALTER TABLE kaspi_shop_wallet_topups RENAME TO kaspi_shop_wallet_topups_legacy;
ALTER TABLE ai_agent_wallet RENAME TO ai_agent_wallet_legacy;
ALTER TABLE ai_agent_wallet_ledger RENAME TO ai_agent_wallet_ledger_legacy;
ALTER TABLE ai_agent_wallet_topups RENAME TO ai_agent_wallet_topups_legacy;
ALTER FUNCTION debit_kaspi_shop_wallet_balance(/* exact args from Task 1 */) RENAME TO debit_kaspi_shop_wallet_balance_legacy;
ALTER FUNCTION debit_ai_agent_wallet_balance(/* exact args from Task 1 */) RENAME TO debit_ai_agent_wallet_balance_legacy;
```

- [ ] **Step 3: VERIFICATION GATE — run immediately after, expect exactly these results:**

```sql
-- (a) Per-user balance equality. MUST return 0 rows.
SELECT s.user_id,
       s.kaspi_balance + 5*s.shop_credits + 5*s.ai_credits AS expected,
       p.kaspi_wallet_balance AS actual
FROM wallet_merge_snapshot s JOIN profiles p ON p.id = s.user_id
WHERE p.kaspi_wallet_balance <> s.kaspi_balance + 5*s.shop_credits + 5*s.ai_credits;

-- (b) Ledger backfill counts. Each pair MUST be equal.
SELECT (SELECT COUNT(*) FROM kaspi_shop_wallet_ledger_legacy) AS shop_legacy,
       (SELECT COUNT(*) FROM wallet_ledger WHERE type = 'kaspi_shop_check'
          OR (type = 'topup' AND balance_after IS NULL AND note LIKE 'Пополнение:%')) AS backfilled_note;
-- simpler exact check: total backfilled rows
SELECT (SELECT COUNT(*) FROM kaspi_shop_wallet_ledger_legacy)
     + (SELECT COUNT(*) FROM ai_agent_wallet_ledger_legacy) AS legacy_total,
       (SELECT COUNT(*) FROM wallet_ledger WHERE balance_after IS NULL) AS backfilled_total;

-- (c) Pending topups carried over. Counts MUST match Task 1's recorded pending counts.
SELECT COUNT(*) FROM kaspi_wallet_topups k
WHERE EXISTS (SELECT 1 FROM kaspi_shop_wallet_topups_legacy l WHERE l.id = k.id)
   OR EXISTS (SELECT 1 FROM ai_agent_wallet_topups_legacy l WHERE l.id = k.id);
```

For (a): if any rows return, check whether a live debit/credit occurred between migration and verification (`SELECT * FROM wallet_ledger WHERE created_at > (SELECT MAX(snapshot_at) FROM wallet_merge_snapshot)`) — a mismatch fully explained by such rows (expected + their sum = actual) is a PASS; anything else is a FAIL.
For (b): `backfilled_total` may exceed `legacy_total` ONLY if pre-existing `wallet_ledger` rows already had NULL `balance_after` — check `SELECT COUNT(*) FROM wallet_ledger WHERE balance_after IS NULL AND created_at > now() - interval '10 minutes'` against `legacy_total` in that case (backfill inserts happened within the migration transaction just now — but note their `created_at` is the ORIGINAL timestamp, so instead compare: legacy_total vs count of rows whose (user_id, type, amount, created_at) matches a legacy row; a simple exact-count equality on the first query is sufficient when it matches).
**On ANY unexplained mismatch: STOP. Report BLOCKED with the failing query output. Do not proceed to Task 6. Rollback path exists: `wallet_merge_snapshot` holds pre-merge balances; legacy tables are intact under `_legacy` names.**

- [ ] **Step 4: Record results** in `.superpowers/sdd/wallet-merge-verification.md`: every verification query verbatim with its output, PASS/FAIL per check, and the pre/post total-money figures (Task 1 Step 2 query re-run against `_legacy` names + new state). No repo commit needed beyond this file:

```bash
git add .superpowers/sdd/wallet-merge-verification.md
git commit -m "docs(wallet): migration verification results (balance-sum gate passed)"
```

(`.superpowers/` may be git-ignored — if `git add` reports an ignore, skip the commit; the file still serves the session.)

---

### Task 6: Cutover push + live production verification

**Files:** none new — this task pushes everything and verifies live.

- [ ] **Step 1: Final build.** `npm run build` — must complete cleanly.
- [ ] **Step 2: Push.** `git push` (single push carrying the whole session: nav redesign + wallet merge). Confirm the Vercel deployment succeeds (via the Vercel MCP `get_deployment`/`list_deployments` for the invoices.kz project — check the newest deployment's state is READY, and pull runtime errors if not).
- [ ] **Step 3: Live smoke test** (production, real admin account = the founder's own): balance shows the merged ₸ figure (= verification's expected value for that user); wallet panel shows single wallet + breakdown bar; history shows legacy categories with ₸ amounts; `/api/kaspi-shop/wallet` and `/api/ai-agent/wallet` return the same unified balance. Do NOT make a real top-up payment as part of this test.
- [ ] **Step 4: Report** production state + any anomalies. Done.

---

## Out of scope (explicitly)

- Dropping the `_legacy` tables, the `wallet_merge_snapshot` table, or the legacy RPCs — separate decision after an observation period.
- Any balance-gating for Kaspi Shop checks / AI-agent replies (they remain debit-without-gate, matching today).
- Per-category budgets/limits, spend alerts, or the AI FAQ widget.
- Opening Kaspi Shop / AI-agent to non-admin users (locked in nav as of `b20500b`; unlocking is a future decision that should revisit the shared-balance note in Global Constraints).
