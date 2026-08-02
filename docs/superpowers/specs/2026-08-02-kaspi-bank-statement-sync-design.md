# Kaspi Bank Statement Sync — Design

> **STATUS: SHELVED (2026-08-02).** Live testing found the Бухгалтер-role web login (`pay.kaspi.kz`) requires a QR-code device-confirmation step (scan with the phone's Kaspi app) on any browser/device Kaspi hasn't already trusted — and that trust is short-lived: inspecting the full cookie jar (including HttpOnly) of an already-trusted session found no cookie surviving more than ~6 days (`KB_SPECIAL_USER`), with the actual session cookie (`ASP.NET_SessionId`) being a pure browser-session cookie with no persistence at all. This invalidates the core premise of this spec (§ "As a real HTTP client... a fresh login every sync run") — an unattended daily cron is, from Kaspi's perspective, always an untrusted new device, and there is no human available to scan a QR on its behalf. Automating this would need the customer to re-scan a QR every few days, which is no better than the existing manual Excel/PDF upload fallback it was meant to replace. Shelved rather than deleted: the confirmed protocol details below (particularly the real `/api/statement/account` response shape with genuine counterparty BIN) remain valid and useful if a future session finds a different way to establish durable device trust.

## Motivation

invoices.kz already has three separate Kaspi/bank reconciliation paths on `/profile/acquiring`:

1. **Kaspi Pay Cashier** (`src/lib/kaspiPay/`) — per-customer device-paired connection to Kaspi's Кассир (Cashier/POS) role, using ECDSA/TOTP-signed requests against `qrpay.kaspi.kz`. Phase 2 added a daily sync of this role's sales history (`/v02/history/operations`), matched to open invoices by **amount only** — this feed exposes no payer BIN, only a display name.
2. **BCC bank connect** — OAuth, matches by BIN+amount using BCC's own statement API. Blocked on BCC's own Development→Production approval; zero live connections exist as of this writing.
3. **Manual Excel/PDF statement upload** — the customer downloads their actual Kaspi Bank current-account statement (a different thing from the Кассир sales feed — this is the real bank account, showing bank transfers with real counterparty BIN) from the Kaspi Business app and uploads it; matched by BIN+amount via the same logic BCC uses (`src/lib/acquiringMatch.ts`).

A live investigation (this session, with the user) found that Kaspi Business supports assigning a **Бухгалтер (Accountant)** role to a phone number, separate from Кассир. That role's own description in the app states it can "view accounts, sales analytics, create payments, pay taxes, accept payment." Logging into `pay.kaspi.kz` (the web version of Kaspi Pay Business) with a phone number holding this role, and inspecting live network traffic, found a real, working, scriptable API for exactly the same bank-account statement the manual-upload feature already parses — but automatable, with real counterparty BIN in the response.

This spec covers automating that path: **Kaspi Bank Statement Sync**, a fourth reconciliation channel, available to every invoices.kz customer.

## Confirmed protocol (live-verified this session)

Host: `https://pay.kaspi.kz` (a different host from the Кассир protocol's `qrpay.kaspi.kz`/`mtoken.kaspi.kz`, and a completely different auth scheme — plain password login + session cookie, not ECDSA/TOTP signing).

1. `POST /api/auth/sign-in` — body form-encoded with the phone number and password. No SMS/OTP step was observed for this login in the live session. Response sets an **HttpOnly session cookie** (not readable from JS, and not surfaced by the browser-automation tooling used to observe it — a real HTTP client must handle `Set-Cookie`/cookie-jar semantics itself) and returns a rotating `X-Csrf-Token` response header.
2. `POST /api/auth/choose-organization` — body `ProfileId=<id>`, header `X-Csrf-Token` from the previous response. Selects the organization/account context for the session. The `ProfileId` to send is **not yet confirmed how to discover generically** for a brand-new customer's login — in the live session it was read off the already-logged-in page state, not returned explicitly by `sign-in`. **Open question for the implementation plan's first task.**
3. `POST /api/statement/account` — body form-encoded: `period=<code>&url=account&accountId=<id>&TransactionType=<code|empty>&LastTransactionId=<id|empty>`, header `X-Csrf-Token` (from the previous response — rotates per request, must be threaded through every call, not cached as a fixed value).
   - `period`: only `week` and `month` were exercised live. The UI also offers Сегодня/Вчера/Квартал/Год/Период (custom range) — their exact param values are **unconfirmed**.
   - `accountId`: a numeric ID specific to one bank account (`608495` in the live session). **Not yet confirmed how to discover generically** — likely returned by `choose-organization` or a sibling accounts-list call not yet observed.
   - `TransactionType`: empty returned all transactions. The UI's Все/Дебет/Кредит buttons imply a filter value exists; **exact values unconfirmed**. Not needed for v1 — always fetch all, filter client-side/server-side after parsing.
   - `LastTransactionId`: empty fetches from the most recent transaction backward. Presumed pagination cursor; unconfirmed how many transactions come back per call or how to page further back.
   - Response: `{ formattedPeriod, transactions: [{ status, tranId, tranNumber, tranDate, tranAmount, isCredit, tranSign, contragentName, showContragentBin, contragentBin, contragentBik, contragentIban, purpose, knp, tranType }], remnantCount, openingBalance, closingBalance, debitTurnover, creditTurnover, ... }`. Money fields (`tranAmount`, `openingBalance`, etc.) are formatted display strings (` 1 089 000 ₸`) requiring the same digit-strip parsing already used for Кассир's `Amount` field. `isCredit` is a clean boolean direction flag — more reliable than Кассир's `OperationType` (which Phase 2 already documented as not-fully-confirmed). `contragentBin` is the real counterparty BIN, confirmed to match the manually-uploaded-statement's BIN column for the same transactions.

This is genuinely undocumented, reverse-engineered from live traffic, not from any published API reference — same risk category the Кассир feature's own docs already carry ("unofficial, may change or break without notice, no SLA").

## Architecture

New module `src/lib/kaspiBank/`, parallel in shape to `src/lib/kaspiPay/`:

- **`client.ts`** — `signIn(phone, password)`, `chooseOrganization(session, profileId)`, `getStatement(session, accountId, period, lastTransactionId)`. Owns the raw HTTP calls, cookie-jar handling, and CSRF-token threading.
- **`connection.ts`** — `loadConnectionByUserId`, mirroring the existing Кассир/BCC connection loaders: decrypts the stored password (same AES-256-GCM-at-rest scheme already used for the Кассир TOTP seed, same `KASPI_SESSION_ENCRYPTION_KEY`).
- **`bankSync.ts`** — the sync orchestrator, structurally mirroring `historySync.ts`: log in fresh (per the earlier decision — no session caching, one extra login round-trip per daily run is cheap and avoids session-expiry edge cases entirely), fetch the statement, match each transaction against open invoices via **the existing `acquiringMatch.ts`** (BIN+amount — reused directly, not reimplemented), auto-settle unambiguous matches, record ambiguous ones for manual confirmation. Uses the **exact claim-then-settle-then-mark-settled pattern** established (after three iterations) in Phase 2's `historySync.ts` — a durable claim row inserted before any money-moving side effect, `settled_at` set only after settling completes, idempotent commission debit guarded by a `wallet_ledger` note check. This is not optional or "adapt as convenient" — reusing this exact shape is how this spec avoids re-discovering the same double-charge bug class Phase 2 took three rounds to close.

New tables (RLS enabled, zero client policies — service-role only, matching every other connection table in this codebase):

- **`kaspi_bank_connections`**: `id, user_id (unique), phone_number, password_enc, account_id, profile_id, status ('active'|'error'), last_synced_at, created_at`. One connection per customer in v1 — if a customer's organization has multiple bank accounts, only the one resolved at connect time is used; multi-account support is out of scope (see below).
- **`kaspi_bank_transactions`**: mirrors `kaspi_operations`'s claim/settle columns (`settled_at`, unique `(user_id, tran_id)`) but with this source's own fields — `tran_id, tran_number, amount, is_credit, contragent_name, contragent_bin, contragent_iban, purpose, matched_invoice_id, category, transaction_date, settled_at`. Kept **separate from `kaspi_operations`** rather than merged: the field shapes genuinely differ (BIN/IBAN/purpose here, none of that from Кассир), and merging would mean most columns are always null for one source or the other.
- **`kaspi_bank_pending_matches`**: mirrors `kaspi_pending_matches`'s shape (ambiguous-match candidates awaiting manual confirmation), scoped to this source.

Cron: the existing daily `kaspi-poll` cron gains one more loop, over active `kaspi_bank_connections`, calling `bankSync` — same shape as the Кассир history-sync loop added in Phase 2. A manual "Обновить" button (same UX as the Kaspi statement section, `POST /api/kaspi-bank/sync`) lets a customer pull sooner, same reasoning as Phase 2's own manual-sync addition.

## Matching and commission

Reuses `acquiringMatch.ts` exactly as BCC and the manual-upload feature already do: match by BIN + amount against the customer's open invoices. An unambiguous match (one open invoice shares both BIN and amount) auto-confirms without a click — same behavior as Кассир's history sync, and **charges the 5% platform commission**, per the user's explicit decision this session (this channel behaves like Кассир commission-wise, not like BCC, since it also auto-confirms without human review). An ambiguous match (multiple open invoices share BIN+amount) is recorded for manual confirmation, never auto-picked, never charged until confirmed — identical rule to every other channel in this codebase.

## UI

A new card on `/profile/acquiring`, positioned **immediately after "Выписка Kaspi"** (the Phase 2 Кассир-history section) and before the BCC section — grouping stays "everything Kaspi-related together," with bank alternatives (BCC, Excel) following.

Connect flow: phone number + password fields (not SMS/OTP, unlike the Кассир pairing flow) — a real, immediate `signIn` + `chooseOrganization` + account-discovery round trip on submit, so a wrong password fails fast at connect time rather than silently on the first cron run. The card carries an explicit risk-disclosure line: this is a broader-access credential than the Кассир connection (view accounts, sales analytics, create payments, pay taxes — not just accept payment), and the customer is **strongly advised to create a dedicated phone number with only the Бухгалтер role assigned** rather than reuse their own daily-use Kaspi login. This mirrors the "unofficial/reverse-engineered, accept the risk" disclosure pattern already used on the Кассир docs page.

The existing manual Excel/PDF upload block **stays exactly as-is**, unconditionally — not hidden or removed once a customer connects this new channel. It remains a fallback for customers who don't want to set up a second phone number, and for anyone whose auto-sync connection goes into `status = 'error'`.

## Explicitly out of scope

- Multiple bank accounts per organization (v1 uses whichever one is resolved at connect time).
- Session caching/reuse across sync runs (always fresh login, per the earlier decision).
- Automatic password rotation/recovery if Kaspi invalidates the stored password (surfaces as `status = 'error'`, same as the Кассир/BCC connections' existing error-state handling — customer must reconnect).
- `TransactionType` server-side filtering (always fetch all, since matching only cares about `isCredit`/amount/BIN, computed after parsing).
- Historical backfill beyond whatever `period`/pagination the sync window covers on first connect (same explicit non-goal Phase 2 already carried for the Кассир history sync).

## Open protocol questions for the implementation plan's first task

Same shape as Phase 2's own Task 1 (which resolved the Кассир history endpoint's real response shape before the plan's remaining tasks were written): before implementation proceeds past the protocol client, one more short live-verification pass is needed to confirm:

1. How to discover `ProfileId` and `accountId` generically for a brand-new customer's login (not hardcoded to the one account observed this session) — likely a response field from `sign-in` or `choose-organization` not yet inspected closely enough, or a sibling endpoint.
2. The exact `period` values for Сегодня/Вчера/Квартал/Год and how a custom `Период` range is expressed, so the sync can pick a sensible default window (e.g. `month`, matching what was live-verified) with confidence it is documented, not guessed.
