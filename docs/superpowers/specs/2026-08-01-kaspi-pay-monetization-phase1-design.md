# Kaspi Pay Monetization — Phase 1 Design

**Status:** approved, ready for planning
**Supersedes (partially):** the Pro-plan gate on [[2026-08-01-kaspi-pay-cashier-design]]
**Followed by:** Phase 2 (Kaspi operations-history reconciliation + full transaction dashboard) — out of scope here

## Goal

Retire xpayment.kz entirely (it was only ever used for invoices.kz's own subscription billing), and turn Kaspi Pay Cashier from a Pro-plan perk into a directly monetized, pay-per-use feature open to every plan: 5% commission per settled Kaspi payment, funded by a prepaid balance the customer tops up in advance. Move the feature's UI from its own page into `/profile/acquiring`, alongside the existing Excel-import and BCC-connect acquiring methods.

## Why now

- The Kaspi Pay Cashier automation (shipped earlier the same day) proved reliable enough in production to also carry invoices.kz's own subscription payments — there is no longer a reason to pay a third party (xpayment) for a capability we've already built ourselves.
- The Pro-plan gate under-monetizes a feature that moves real money on every use; a percentage-of-volume model captures more value from heavy users while staying free to try for everyone else.

## Architecture

**The platform's own Kaspi Cashier connection is just an ordinary `kaspi_connections` row — the one belonging to whichever user has `profiles.is_admin = true`.** No new connection type, table, or flag. Any payment invoices.kz needs to collect from a customer (a plan payment, a wallet top-up) is created by calling the existing `createPayment()` against *that* connection, exactly the way a customer's own site calls it against theirs. The only new plumbing is: "load the connection belonging to the admin user" instead of "load the connection belonging to the caller."

This means invoices.kz becomes, structurally, its own first customer of the feature it sells — which is also literally true in practice (the admin's own business uses this same connection to invoice its own clients).

## Data model

```sql
alter table profiles add column kaspi_wallet_balance numeric not null default 0;

create table wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  type text not null check (type in ('topup', 'commission', 'adjustment')),
  amount numeric not null,          -- positive for topup/adjustment-credit, negative for commission
  balance_after numeric not null,   -- snapshot, for audit — never recomputed from history
  kaspi_wallet_topup_id uuid references kaspi_wallet_topups(id),
  kaspi_payment_request_id uuid references kaspi_payment_requests(id),
  note text,
  created_at timestamptz not null default now()
);

create table kaspi_wallet_topups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  amount numeric not null,
  kaspi_operation_id text not null,
  qr_token text,
  payment_link text,
  status text not null,             -- pending | paid | expired
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
```

`payment_requests` (existing table, already shaped for `user_id, email, plan, amount, status, order_id, qr_operation_id`) is reused as-is for subscription payments — only its transport changes.

**Balance mutations are atomic, never read-then-write in application code.** A Postgres function does the check-and-debit in one statement:

```sql
create or replace function debit_wallet_balance(p_user_id uuid, p_amount numeric, p_kaspi_payment_request_id uuid)
returns numeric as $$
  update profiles set kaspi_wallet_balance = kaspi_wallet_balance - p_amount
  where id = p_user_id
  returning kaspi_wallet_balance;
$$ language sql;
```
(credit-on-topup is a simple additive update, which is commutative and safe without the same guard; the debit path is the one that must never race — this mirrors the partial-unique-index fix already used elsewhere in this project to close a concurrent-mint race.)

## Subscription billing migration (xpayment retirement)

- `/api/payment/create` keeps its route and response shape (`qr_token`, `ext_tran_id`, `expire_date`) — `/upgrade/page.tsx` needs no changes for this path. Internally it stops calling `https://api.xpayment.kz/...` and instead calls the existing `createPayment()` against the admin's connection, inserting into `payment_requests`.
- `/api/payment/create-phone` is not a simple transport swap: xpayment's phone-push is a *different Kaspi capability* than the QR flow our `client.ts` already has. The reference project's `src/routes/invoice.js` shows it as `POST https://qrpay.kaspi.kz/v01/remote/create` with `{ PhoneNumber, Amount, Comment }`, returning a `QrOperationId` that the *same* `checkStatus()` can then poll — so this phase adds one new client function, `createInvoiceByPhone(connection, { phoneNumber, amount, comment })`, built the same way `createPayment` is (same signed-header helper, different endpoint/payload), rather than reusing `createPayment` itself.
- A new `checkAndSettlePlanPayment(paymentRequestRow)` (parallel to `checkAndSettleKaspiPayment`) does: live `checkStatus` → on `paid`, update `profiles.plan` + `plan_expires_at` (preserving the existing bonus-days carry-over logic from the old webhook) → mark the `payment_requests` row `paid`. Both the QR path and the phone-push path settle through this one function, since both ultimately produce a Kaspi `QrOperationId`.
- `/upgrade` polls live (same 5s-interval pattern as `/view/[token]`) instead of waiting on xpayment's webhook.
- The daily `kaspi-poll` cron is extended to also sweep pending `payment_requests` and `kaspi_wallet_topups`, as the safety net for an abandoned tab.
- `/api/payment/webhook`, `XPAYMENT_API_KEY`, `XPAYMENT_WEBHOOK_SECRET` are deleted/retired once the new path is confirmed working in production.

## Wallet top-up

- New `POST /api/kaspi/wallet/topup` — authenticated, body `{ amount }` (any of the presets 1000/5000/10000/50000 ₸, or a custom amount ≥ 1000 ₸). Creates a payment via the admin's connection, inserts into `kaspi_wallet_topups`.
- Settlement (live poll on the dashboard + daily cron sweep) calls `debit_wallet_balance`'s credit counterpart — a plain additive update — and inserts a `wallet_ledger` row (`type = 'topup'`).

## Commission: gating and deduction

- **The Pro-plan requirement is removed entirely** from every Kaspi-specific route: `connect/init`, `connect/verify`, invoice-side minting (`getOrCreateKaspiPaymentForInvoice`), and `POST /api/kaspi/pay`. Connecting a Cashier is free on every plan.
- **Minting a NEW payment link** (either path) first checks `profiles.kaspi_wallet_balance >= amount * 0.05`. If not, the request is refused — `402 { error: 'insufficient_balance', required, balance }` — without creating anything on Kaspi's side. An already-existing pending link is never affected.
- **On settlement** (inside `checkAndSettleKaspiPayment`, the moment a payment's status flips to `paid`), the commission — `round(amount * 0.05)`, nearest tenge — is debited via `debit_wallet_balance`, and a `wallet_ledger` row (`type = 'commission'`) is inserted linking back to the `kaspi_payment_requests` row. An expired or failed payment never charges anything.
- This applies uniformly to invoice auto-mint links and external-API-created payments — one rule, no special cases.

## UI / IA changes

- The connect/dashboard experience moves from `/profile/kaspi-pay` into `/profile/acquiring`, as a third method alongside Excel-import and BCC. `/profile/kaspi-pay` becomes a redirect to `/profile/acquiring` so existing links/bookmarks keep working.
- Dashboard (building on the paused work from earlier the same day) shows: connection status, wallet balance + top-up control (presets + custom amount), recent payment history, webhook URL setting, API-token regeneration. Full transaction-history browsing with platform/other and in/out filters is explicitly Phase 2 — this phase only shows invoices.kz's own tracked payments (`kaspi_payment_requests`), not the raw Kaspi operations feed.
- The old static `profile.kaspi_pay_link` button is removed from `/view/[token]` outright (not conditionally hidden) — the paid, tracked feature supersedes it.

## Error handling

- `insufficient_balance` (402) — new, as above.
- Existing `KaspiAuthError` / `KaspiConnectionSecretsError` handling in the cron and settlement path is unchanged.
- A webhook URL failing the existing SSRF check (`isSafeWebhookUrl`) — unchanged, `400 unsafe_url`.

## Testing

- Unit tests: commission rounding at boundary amounts, `debit_wallet_balance` under concurrent calls (two settlements racing against a balance that can only cover one), insufficient-balance gating on both mint paths, the plan-payment settlement's bonus-days carry-over logic (ported from the old webhook, must not regress).
- Manual/live: one real top-up, one real plan payment, one real customer-side Kaspi payment settling with a correct commission debit — mirroring how the Cashier feature itself was verified live earlier the same day.

## Explicitly out of scope for Phase 1

- Kaspi operations-history (`/v02/history/operations`) reconciliation — catching payments made outside invoices.kz's own QR/API entirely.
- The full transaction dashboard with platform/other and in/out filters.
- Both are Phase 2, specced separately once Phase 1 is live.
