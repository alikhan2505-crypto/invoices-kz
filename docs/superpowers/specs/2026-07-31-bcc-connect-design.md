# Подключение BCC (Connect BCC Account) — Acquiring v2 — Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let a Pro user connect their own BCC (Bank CenterCredit) business account via OAuth2, so incoming payments are matched against their open invoices automatically, on a daily schedule, instead of requiring a manual Excel export/upload. This extends the already-shipped `/profile/acquiring` (see `docs/superpowers/specs/2026-07-21-acquiring-statement-import-design.md`) — the manual-Excel path is unchanged and remains the universal fallback for every bank other than BCC.

**Why now:** Research this session found `developer.bcc.kz` is a genuine, free, self-service developer portal (confirmed via a registered account, `invoiceskz_dev`) exposing a real bank-statement API with counterparty BIN (`GET /accounts/{iban}/statement`, `transactions[].partyIdn`), gated behind a standard per-user OAuth2 Authorization Code flow (Keycloak-backed) — not a shared/master-access shortcut. This is the one bank found this session where a real automated integration is buildable at all; see `bcc_developer_portal_reference.md` memory for the full provider-comparison trail.

## Global Constraints

- **Pro plan only**, gated by the existing `canAcquiring` flag (`src/lib/plan.ts`) — same rule as the manual-import path, no new flag needed.
- **This is a genuine new backend surface** — unlike v1, which deliberately added zero new tables/routes/secrets. A per-user OAuth connection cannot exist client-side-only. Keep the *new* surface as narrow as possible: two tables, four thin API routes (connect, callback, disconnect, and a status/pending-delete route added during review since bcc_connections and bcc_pending_matches have no client-facing write/select-of-connection policies), one cron route.
- **Tokens are never exposed to the browser.** All BCC API calls (connect, callback, statement fetch, revoke) happen server-side. The `bcc_connections` table holding access/refresh tokens has **no client-facing RLS policy at all** — only `service_role` (via server-side API routes) reads or writes it, the same access-control posture already used for `webhook_logs` and other server-only tables in this codebase. Encryption-at-rest of the token columns is not attempted (no existing precedent for column-level encryption in this codebase); the control is access-restriction, not encryption, matching how `SUPABASE_SERVICE_ROLE_KEY` itself and other secrets are handled.
- **Raw statement rows are never persisted long-term.** The cron job fetches a statement, computes matches in-memory, stores only the resulting **match summaries** (invoice id + matched amount/date/description) until the user confirms or dismisses them, then discards them. This preserves v1's privacy principle: a bank statement contains the owner's entire transaction history including unrelated counterparties, and there is no reason for that data to sit in our database.
- **No auto-confirmation.** Exactly like v1: a bank-verified match is still shown to the user with a one-click "Подтвердить оплату" button, reusing the exact same confirmation code path (`invoices.update({status:'paid'})` + `invoice_logs.insert(...)`) already in `src/app/profile/acquiring/page.tsx`. A false-positive "paid" mark is worse than a delayed confirmation, even from a bank-verified source — this session's established precedent for this feature is not being revisited without a separate explicit decision.
- **Exact BIN + exact amount matching only** — reuses `findMatches`/`normalizeBin` from `src/lib/acquiringMatch.ts` verbatim; no new matching logic.
- **Cron runs once daily**, matching the two existing crons in this project (`/api/cron/notifications`, `/api/cron/recurring`) and their `CRON_SECRET`-bearer-token auth pattern (`src/app/api/cron/notifications/route.ts:44-48`).
- **New env vars** (Vercel Production, same convention as `XPAYMENT_WEBHOOK_SECRET`/`CRON_SECRET`): `BCC_CLIENT_ID`, `BCC_CLIENT_SECRET` (app-level OAuth credentials from BCC's developer portal), `BCC_STATE_SECRET` (used to sign the OAuth `state` parameter — see Security below).
- **No repo-tracked migration file** — this codebase has no `supabase/migrations` directory; schema changes are applied directly against the live project (as the `is_admin`/webhook fixes this session were). The new table's exact SQL is specified below for the implementer to apply via the Supabase MCP tools.

## Architecture

```
Connect (one-time per user):
  User clicks "Подключить BCC" on /profile/acquiring
    → POST /api/bcc/connect (authenticated)
    → server: app-level client-credentials token (BCC_CLIENT_ID/SECRET)
    → server: POST generate-auth-url { client_idn: profile.bin_iin, redirect_uri, scope }
    → server: mint signed `state` (HMAC of user_id + nonce + timestamp, key = BCC_STATE_SECRET)
    → 302 redirect the browser to the returned authUrl (+ state)
  User logs into THEIR OWN BCC online banking, grants consent
    → BCC redirects to /api/bcc/callback?code=...&state=...
    → server: verify state signature + timestamp freshness (reject if invalid/expired/replayed)
    → server: POST /token { code } → { access_token, refresh_token, expires_in }
    → server: upsert bcc_connections row for that user_id
    → redirect to /profile/acquiring?bcc=connected

Daily check (cron):
  /api/cron/bcc-check (CRON_SECRET-gated, like existing crons)
    → for each row in bcc_connections where status = 'active':
        refresh access_token if expired (refresh_token grant)
        GET /accounts/{iban}/statement (dateFrom = last_checked_at, dateTo = now)
        findMatches(rows, user's open invoices)         // src/lib/acquiringMatch.ts, unchanged
        store match summaries in bcc_pending_matches (see schema)
        update last_checked_at
        if new matches found: send email via Resend (existing pattern in notifications cron)

Confirming a match:
  /profile/acquiring page, "Connected account" section
    → client reads bcc_pending_matches directly (RLS SELECT policy scopes it to auth.uid(), see Components §1)
    → render with the exact same match-card + confirmPayment() already built for the manual path
    → on confirm: existing invoices.update + invoice_logs.insert, then DELETE /api/bcc/pending/[id]
      (server route, service-role — bcc_pending_matches has no client-facing DELETE policy, only SELECT)

Disconnect:
  "Отключить BCC" button → POST /api/bcc/disconnect
    → POST /revoke with the stored token
    → delete the bcc_connections row (and any pending matches)
```

## Components

### 1. Database (applied directly, no migration file in repo)

```sql
create table bcc_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  iban text not null,
  currency text not null, -- from GET /accounts; required on every statement call
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  status text not null default 'active', -- 'active' | 'revoked' | 'error'
  last_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id) -- one BCC connection per user in v1; revisit if multi-account support is ever requested
);
alter table bcc_connections enable row level security;
-- No policies created: service_role bypasses RLS by default, and that is the
-- only role permitted to touch this table. Deliberately no SELECT policy for
-- `authenticated` — the page never queries this table directly from the browser.

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
-- INSERT/UPDATE/DELETE: service_role only (cron writes, confirm-flow deletes
-- via a server route, not directly from the client) — no policy for those,
-- same reasoning as bcc_connections.
```

`bcc_pending_matches` gets a client-readable SELECT policy (unlike `bcc_connections`) because the page needs to list them; it never contains tokens, only invoice-facing data the user's own RLS already lets them see via `invoices` anyway.

### 2. `src/app/api/bcc/connect/route.ts` (new)

- `POST`, requires an authenticated Supabase session (reject 401 otherwise).
- Reads `profile.bin_iin`; if missing, returns an error the page surfaces as "Заполните БИН/ИИН в реквизитах перед подключением" (this is an existing profile field, already required for invoices).
- Calls BCC's app-level client-credentials token endpoint — confirmed live on the portal: `POST https://api.bcc.kz:11443/bcc/production/v2/oauth/token`, OAuth2 `application` (client-credentials) flow, scope `bcc.application.business.account.management`, using `BCC_CLIENT_ID`/`BCC_CLIENT_SECRET`.
- With that app-level bearer token, calls `POST generate-auth-url` (base `https://api.bcc.kz:11443/bcc/production/v1/auth-client`, confirmed live) with `{ redirect_uri: 'https://www.invoices.kz/api/bcc/callback', client_idn: profile.bin_iin, scope: 'oapi.business.account.api' }`.
- Signs `state = base64(user_id + ':' + nonce + ':' + timestamp)` with HMAC-SHA256 (`BCC_STATE_SECRET`), appends as the `state` query param on the returned `authUrl`.
- Returns `{ authUrl }`; the page does `window.location.href = authUrl` (a real cross-origin redirect must be a full navigation, not a fetch).

### 3. `src/app/api/bcc/callback/route.ts` (new)

- `GET`, receives `code` and `state` from BCC.
- Verifies `state`'s HMAC signature and that its timestamp is within a short window (e.g. 10 minutes) — rejects otherwise with a redirect to `/profile/acquiring?bcc=error`. This prevents a forged or replayed callback from attaching BCC access to the wrong `user_id`.
- Exchanges `code` via `POST https://api.bcc.kz:11443/bcc/production/v1/auth-client/token` (confirmed live on the portal), body `{ redirect_uri, grant_type: 'authorization_code', client_secret: BCC_CLIENT_SECRET, code }`, with an `Authorization: Bearer <app-level token>` header (same app-level token minted in `connect`, re-minted here since it's short-lived). Response: `{ access_token, token_type, refresh_token, expires_in, scope }` — this `access_token` is the **per-user** token, distinct from the app-level one.
- Calls `GET https://api.bcc.kz:11443/bcc/production/v1/business-account-management/accounts` (confirmed live on the portal) with **both** `Authorization: Bearer <app-level token>` **and** `x-client-token: <the user access_token just obtained>` — the statement API's auth model requires both headers on every call: the app-level token authenticates invoices.kz as a registered application, the `x-client-token` scopes the call to this specific user's consented account. Response is an array of `{ iban, currency, status, is_main, ... }`; picks the one with `is_main: true` (or the sole entry if there's only one) to store as the connection's `iban`/`currency`.
- Upserts the `bcc_connections` row (service-role Supabase client, same pattern as `src/app/api/cron/notifications/route.ts:5-8`) keyed on `user_id`.
- Redirects to `/profile/acquiring?bcc=connected`.

### 4. `src/app/api/bcc/disconnect/route.ts` (new)

- `POST`, authenticated.
- Loads the caller's `bcc_connections` row (service-role client, filtered by `user_id` from the session — never trust a client-supplied id), calls `POST /revoke`, deletes the row and any `bcc_pending_matches` for that user.

### 5. `src/app/api/cron/bcc-check/route.ts` (new)

- `GET`, `CRON_SECRET` bearer-token gate, copying `src/app/api/cron/notifications/route.ts:44-48` verbatim.
- Iterates `bcc_connections` where `status = 'active'`. For each: refresh the access token if `expires_at` has passed (same `/v1/auth-client/token` endpoint, body `{ grant_type: 'refresh_token', refresh_token, client_secret: BCC_CLIENT_SECRET }` — confirmed on the live portal docs, both grant types share one endpoint); fetch `GET .../accounts/{iban}/statement?dateFrom=...&dateTo=...&currency=...` with **both** `Authorization: Bearer <app-level token>` and `x-client-token: <user access_token>` headers (confirmed live — this endpoint requires both simultaneously, see Components §3); map BCC's `transactions[]` to `StatementRow[]` (`{ date: valueDate, amount, bin: String(partyIdn), description: purpose }` — `partyIdn` is returned as a number in BCC's example response, must be stringified before digit-normalizing); fetch the user's open invoices (same query already in `acquiring/page.tsx:38-44`); call `findMatches` unchanged; insert any new `bcc_pending_matches` rows (dedupe against already-pending ones for the same invoice+amount+date); update `last_checked_at`; if any new matches were inserted, send one summary email via the existing `Resend` client (pattern: `src/app/api/cron/notifications/route.ts:9`, `wrapEmail` helper) — "Найдены N возможных оплат — проверьте раздел Эквайринг" with a link to `/profile/acquiring`.
- On a per-connection API error (expired refresh token, revoked consent, BCC outage): set that connection's `status = 'error'`, continue to the next connection — one user's failure must not stop the batch.

### 6. `src/app/profile/acquiring/page.tsx` (modify)

- Add a "Connected account" section above the existing file-upload card: if no `bcc_connections` row exists for the user, show a "Подключить BCC" button (calls `/api/bcc/connect`, then navigates to the returned `authUrl`); if one exists, show the connected IBAN, last-checked time, and an "Отключить" button.
- Fetch pending matches (`bcc_pending_matches` joined to `invoices` for display fields) alongside the existing `openInvoices` load in `load()`. Connection status itself is read via `GET /api/bcc/status` (added during review), not a direct client query — `bcc_connections` has zero client-facing RLS policies.
- Render pending BCC matches using the **same match-card markup** already used for file-based matches (lines 156-172 today) — both are visually `{invoice, row-like fields}`, so this is a shared render, not a duplicate. The confirm button, for a BCC-sourced match, additionally calls `DELETE /api/bcc/pending/[id]` after the existing `invoices.update`/`invoice_logs.insert` succeeds (added during review — see §1).
- Handle `?bcc=connected` / `?bcc=error` query params from the callback redirect to show a one-time toast/message, then strip the param from the URL.

### 8. `src/app/api/bcc/status/route.ts` and `src/app/api/bcc/pending/[id]/route.ts` (new, added during review)

- `GET /api/bcc/status`: Bearer-auth, service-role read of the caller's own `bcc_connections` row. Required because `bcc_connections` has no client-facing SELECT policy (§1) — without this route the page's "connected account" status can never populate.
- `DELETE /api/bcc/pending/[id]`: Bearer-auth, service-role delete of the caller's own `bcc_pending_matches` row, scoped by both `id` and `user_id`. Required because that table has no client-facing DELETE policy (§1) — a direct client-side delete silently affects zero rows.

### 7. `src/lib/i18n/acquiring.ts` (modify)

- Add keys for: connect button, connected-state display, disconnect button/confirmation, connect error (missing BIN), callback error message, pending-match email copy is server-side only (see below) so does not need a client dict entry — but the summary-email subject/body text needs Russian copy, added as plain constants in the cron route itself (matching how `notifications/route.ts` inlines its own email copy today, not the client i18n dict).

## Security

- **State-parameter signing (CSRF/session-fixation protection):** without a signed `state`, an attacker could initiate their own BCC authorization and trick a victim into completing the callback under the victim's session (or vice versa) — a documented OAuth2 authorization-code-flow risk. Signing `state` server-side with a secret only our backend holds, and checking that signature (plus a short timestamp window) on callback, closes this.
- **Redirect URI allow-listing:** BCC's app registration itself only accepts pre-registered redirect URIs (confirmed on the live `/ru/application/new` form) — this is the primary defense against the authorization code being redirected anywhere else; our own `state` check is the second layer.
- **Token access control:** `bcc_connections` has no client-reachable RLS policy in either direction — verified as part of task review before this ships, the same way `protect_profile_privileged_columns` was verified this session for `profiles`.
- **Least privilege on disconnect:** `/api/bcc/disconnect` must look up the connection by the *session's* `user_id`, never a client-supplied id, so one user cannot revoke another's connection.

## Testing

- No unit tests for the OAuth routes themselves (they're thin glue over network calls to BCC — the existing codebase convention, per `docs/superpowers/specs/2026-07-21-acquiring-statement-import-design.md`'s own testing section, is to unit-test pure logic and manually verify I/O-heavy glue).
- The state-signing/verification helper (sign + verify + expiry check) is pure and testable — add `src/lib/bccState.ts` with `signState`/`verifyState`, and `src/lib/bccState.test.ts` covering: valid state round-trips, tampered signature rejected, expired timestamp rejected.
- Mapping BCC's `transactions[]` shape to `StatementRow[]` is pure and testable — add `src/lib/bccStatement.ts` with `mapBccTransactions(transactions): StatementRow[]`, tested against a fixture matching the real response shape captured from BCC's docs this session (`partyIdn`, `amount`, `valueDate`, `purpose`).
- Manual end-to-end verification against BCC's sandbox (`api-sandbox.bcc.kz` / `api-test.bcc.kz`, per `bcc_developer_portal_reference.md`) is the acceptance step before this touches production credentials — no real BCC bank account is needed to test the connect → callback → statement-fetch loop.

## Out of scope for this iteration (explicitly, not silently dropped)

- Multiple BCC accounts per user (schema has a `unique(user_id)` constraint; revisit if requested).
- Banks other than BCC — the manual Excel path remains the only option for everyone else.
- Real-time/webhook-pushed statement updates (BCC's docs describe polling; no webhook capability was found for this API).
- Automatic reconnect UX if a refresh token expires/is revoked externally — v1-of-v2 surfaces this as `status = 'error'` and the user must manually reconnect; a nicer in-app prompt is a later refinement.
- Encrypting `bcc_connections` token columns at rest — access-control only, matching this codebase's existing precedent for other secrets.

## Known open items to resolve during implementation

- The client-credentials (`v2/oauth/token`) request's exact client-authentication encoding (HTTP Basic auth header vs. `client_id`/`client_secret` in the body) was not shown on the overview page — this is a one-page check on the live portal (or trial-and-error against the sandbox) before writing the connect route.
- Sandbox vs. production hosts differ only in subdomain (`api-test.bcc.kz`, `api-sandbox.bcc.kz` vs `api.bcc.kz`) per the portal's own listing — confirm which of the two non-production hosts is the intended one for pre-production testing (the portal lists both under the same "Production, Development" label, which reads as a documentation quirk rather than two genuinely different environments; worth a quick support-channel check if it matters before go-live).
- **Transaction-direction flag (`dbcrfl`) semantics are unconfirmed.** Unlike the Kaspi Pay export (incoming-only), a BCC business-account statement carries outgoing transactions too, so `mapBccTransactions` must filter them out — otherwise money the user *sends* to a counterparty whose BIN and amount match an open invoice surfaces as a "payment received" candidate. The only real example available shows `dbcrfl: 1` on a transaction described as "Для зачисления на картсчета сотрудникам" (i.e. incoming/credit), so `src/lib/bccStatement.ts` currently keeps `dbcrfl === 1` and drops everything else, with a warning comment on that filter and tests pinning the intended behavior. **This must be verified against a real live statement pull before the feature is used with a production BCC account** — if the flag is inverted (or uses different values, e.g. `'C'`/`'D'`), that single filter line is the fix, but until it's confirmed the direction filter is an assumption, not a guarantee.
