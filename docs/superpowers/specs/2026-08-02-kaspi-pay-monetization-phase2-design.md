# Kaspi Pay Monetization Phase 2 — Design

**Status:** approved, ready for planning
**Builds on:** [[2026-08-01-kaspi-pay-monetization-phase1-design]] (shipped, live) — wallet balance, 5% commission on payments created through our own QR/API, basic per-source payment history.
**Explicitly out of scope, carried over unchanged from Phase 1's own "out of scope" note:** this is exactly the work that note deferred.

## Goal

Right now, invoices.kz only ever learns about a Kaspi payment if we ourselves minted the QR/link (via `createPayment`/`createInvoiceByPhone`) and later see it settle. Any payment made on a connected customer's Kaspi Cashier account through a *different* channel — the customer's own native Kaspi QR, a manual transfer, anything not created through our API — is invisible to us entirely, even though Kaspi's own protocol has a full account-activity feed we could read. Phase 2 closes that gap: sync that feed for every connected customer, match incoming transactions to their open invoices by amount, auto-confirm the match, and charge the same 5% commission — because from the business's perspective, a payment that reached their Kaspi account for an open invoice is a payment we helped collect, regardless of which specific link the payer clicked. Alongside this, replace the current narrow, per-source payment history on `/profile/acquiring` with one wide, filterable table covering all Kaspi account activity.

## Architecture

**New Kaspi client capability.** `src/lib/kaspiPay/client.ts` gains `getOperationsHistory(connection: KaspiConnection, params: { endDate: string, lastTransactionDate?: string }): Promise<KaspiHistoryOperation[]>`, calling Kaspi's real `POST https://qrpay.kaspi.kz/v02/history/operations` — signed the same way `createPayment`/`checkStatus` already are (`buildSignedHeaders`). **The exact response shape (field names, how direction/incoming-vs-outgoing is represented, date format) is not yet known** — the reference project's `src/routes/history.js` only proxies the call, it doesn't describe the payload. Confirming this against the reference project's actual current source (or a live test call) is the first implementation task, the same way the original Kaspi Pay Cashier feature's Task 1/2 had to read `crypto.js`/`config.js` fresh rather than guess.

**New sync + match module**, `src/lib/kaspiPay/historySync.ts`, mirroring `src/lib/acquiringMatch.ts`'s existing amount-matching pattern (the established precedent for BCC/Excel-import) rather than inventing a new one:
- `syncKaspiHistory(userId: string): Promise<void>` — loads the connection, calls `getOperationsHistory` from the connection's `created_at` onward (never earlier — a freshly-connected Cashier's pre-existing personal Kaspi history is out of scope and out of consent), and for each transaction not already recorded:
  - Looks up the user's open invoices (`status not in (paid, cancelled)`) for one matching the transaction's amount.
  - **Exactly one match** → auto-confirms: marks the invoice paid, logs it, and debits the 5% commission (via the existing `debitWalletForCommission`) — same effect as a self-created QR settling, no click required.
  - **More than one open invoice shares that amount** → does NOT guess. Recorded as a pending match requiring manual confirmation, the same safety fallback already used by BCC/Excel-import for exactly this ambiguity (`bcc_pending_matches`'s pattern) — this is the one case where Phase 2's "auto-confirm" default doesn't apply, deliberately, because guessing wrong would close the wrong customer's invoice.
  - **No match** → recorded as "other" activity, for visibility only. Never charged commission — 5% is scoped strictly to invoice-matched transactions, not "anything that reached the account."
- A new table, `kaspi_operations` (service-role only, RLS enabled with zero client policies — same posture as `kaspi_connections`/`wallet_ledger`), records every synced operation exactly once (idempotency keyed on Kaspi's own operation id) so a re-sync never double-processes or double-charges: `id, user_id, kaspi_operation_id, amount, direction ('in'|'out'), matched_invoice_id (nullable), category ('platform'|'other'), synced_at`.
- Sync runs from the same daily cron this feature's Phase 1 poller already uses (`src/app/api/cron/kaspi-poll/route.ts`), once per connected customer per run — no new cron, no new Vercel-plan constraint.

**Commission and balance mechanics are unchanged from Phase 1** — `debitWalletForCommission` is reused as-is; a matched-and-confirmed operation debits exactly the way an own-QR settlement does today, including going negative on insufficient balance (gating still only blocks *new link creation*, never an already-detected payment, per Phase 1's own rule).

## Dashboard

Replaces the current narrow (`max-w-lg`-constrained) Kaspi history list on `/profile/acquiring` with a wide table (breaks out of the page's current single-column card layout for this section specifically). Columns: date, amount, direction (in/out), matched invoice + client name (when `category = 'platform'`) or a generic description (when `'other'`), status. Two independent filters above the table: **direction** (all / in / out) and **category** (all / platform / other) — matching the exact two-axis framing from the original brainstorm ("поступления/списания" × "платформа/прочие"). Kaspi's own transaction history and BCC's bank-transfer history stay in **separate** sections on the same page — explicitly not merged, per this session's clarification.

## Error handling

- `getOperationsHistory` failing for one connection during the cron's sync loop is logged and skipped, exactly like every other per-connection failure in that cron today — never aborts the whole run.
- A commission debit failure on an auto-confirmed match logs loudly (`CRITICAL:`, matching Phase 1's own established pattern for this exact failure class) rather than silently dropping it or un-confirming the invoice.
- Sync is idempotent per `kaspi_operation_id` — a re-run (retry after a transient failure, or the next day's normal run re-covering an overlapping date range) cannot re-charge commission or re-confirm an already-matched invoice.

## Testing

- Unit tests for the pure matching logic (exactly-one-match vs ambiguous-multiple-match vs no-match), mirroring `acquiringMatch.test.ts`'s existing style if one exists, or `wallet.test.ts`'s pure-function convention otherwise.
- `getOperationsHistory`/`syncKaspiHistory` themselves are Kaspi-calling/Supabase-dependent — no test coverage, per this codebase's established convention for this class of function (same as `createPayment`, `checkAndSettleKaspiPayment`).
- Manual/live verification: at least one real transaction reaching a connected Cashier account through a channel other than invoices.kz's own QR, confirmed to auto-match and settle correctly.

## Explicitly out of scope for Phase 2

- Merging BCC (bank-transfer) history into this same dashboard — confirmed to stay separate.
- Historical backfill of transactions from before the customer connected their Cashier.
- Any UI for manually re-categorizing an "other" transaction as "platform" after the fact.
