# Приём платежей через Kaspi Pay (свой Кассир-API) — Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let a Pro user connect their own Kaspi Pay "Кассир" (Cashier) role to invoices.kz, once, via the same phone-number + SMS-code flow they'd use to connect a third-party service like xpayment.kz/apipay.kz today. Once connected, two things become possible without paying a third party a monthly fee:

1. **Automatic payment links on invoices.kz's own invoices.** When a user with a connected Cashier sends an invoice to their own client, invoices.kz generates a Kaspi QR/payment link for the exact invoice amount alongside it — automatically, no extra click — and marks the invoice paid automatically once Kaspi confirms the payment, with no manual "Подтвердить оплату" step.
2. **A documented public API + per-customer token**, so a user can wire "accept a Kaspi payment for this amount" into their *own* website or app for cases that have nothing to do with invoices.kz's own invoice records — e.g. a clothing store's product page, where clicking a specific item shows a QR for that item's price. This is the exact shape of xpayment.kz's own public API (`POST amount, order_id` → `{qr_token, payment_link}`), just self-hosted.

**Why this, why now:** the user currently pays xpayment.kz ~10,000₸/month for exactly this capability (they are already a live xpayment customer — see `create/route.ts`/`create-phone/route.ts` for the exact wire shape invoices.kz already depends on for its own subscription billing) and wants to own the capability instead of renting it, and resell it to invoices.kz's own Pro customers as a second acquiring-adjacent feature next to the BCC-connect statement-checking feature (`docs/superpowers/specs/2026-07-31-bcc-connect-design.md`).

## Global Constraints

- **This automates Kaspi Pay's Cashier role the same way xpayment.kz/apipay.kz already do — by design, not by accident.** Both explicitly state they are not an official Kaspi API and not a Kaspi partner (xpayment: *"не является официальным API Kaspi и не является партнёром АО Kaspi"*). The mechanism is: a business adds a limited "Кассир" employee role in their own Kaspi Pay app, verifies that role's phone number by SMS, and from then on a device-bound session (an emulated hardware-token pairing) can create payment requests on that Cashier's behalf. This is **not** a documented, Kaspi-sanctioned API — Kaspi could change or block the underlying protocol at any time without notice. The user has explicitly reviewed and accepted this risk (this session, twice). Every task built on this must assume the integration can break with no warning and needs monitoring + a clear "reconnect" recovery path, not silent failure.
- **Per-customer, non-aggregated model — same principle as the BCC-connect feature.** Each invoices.kz customer connects *their own* Kaspi Cashier role. invoices.kz never holds a shared/master Kaspi account and never receives money on another business's behalf — money always flows straight into the connecting customer's own Kaspi account. This keeps the feature out of payment-aggregation/money-transmission territory (a licensing question this session's earlier research already flagged as a hard line not to cross).
- **Reference implementation, not a dependency.** `tapter-dev/kaspi-pos-automation` (MIT-licensed, ~147 GitHub stars) is a mature, actively-used open-source implementation of this exact mechanism (3-step SMS auth, ECDH device pairing, TOTP/OCRA request codes, ECDSA request signing, AES-256-GCM at-rest encryption, QR/invoice creation, polling-based status, outbound webhooks). It is the primary technical reference for this build, but invoices.kz **writes its own implementation** in this codebase's own TypeScript/Next.js conventions rather than running that project as a subprocess/microservice — matching the decision made this session (Option B over Option A) so the protocol lives inside code we can audit and maintain ourselves. **If our own implementation proves unworkable, the fallback is Option A (vendor/run the reference project directly)** — this is an explicit, pre-approved fallback, not a failure state.
- **Pro plan only**, gated by the existing `canAcquiring` flag (`src/lib/plan.ts`) — same umbrella as the BCC-connect feature, per the user's own framing of this as "ещё одна платная фича внутри эквайринга."
- **Recommend, in the UI copy itself, that the customer create a dedicated limited Cashier role** (not their own primary Kaspi login) when connecting — this is the same advice xpayment/apipay give their own customers, and it contains the blast radius of a compromised session to payment-creation only.
- **Never touches card data.** Kaspi Pay is account-to-account/QR, not a card number — this feature stays outside PCI DSS scope entirely, unlike a hypothetical future card-acquiring feature (a separate, still-unstarted backlog item — see [[own-cashier-payment-links-backlog]]).
- **New backend surface, encrypted at rest, zero client-facing RLS on the connection table** — same posture as `bcc_connections`: a compromised Cashier session lets someone create payment requests as that business (bounded, since Cashier is a limited role) — access-controlled via service-role-only Supabase access, not column-level encryption (no precedent for that in this codebase, matching the BCC design's own reasoning).
- **New env var**: `KASPI_SESSION_ENCRYPTION_KEY` (32-byte hex, AES-256-GCM key for encrypting each connection's device keypair/TOTP secret at rest) — Vercel Production, same convention as existing secrets.

## Architecture

```
Connect (one-time per user):
  User goes to /profile/kaspi-pay, enters their Cashier's phone number
    → POST /api/kaspi/connect/init { phoneNumber }
    → server: generates an ECDH device keypair for this connection attempt,
      calls Kaspi's (undocumented) device-pairing/SMS-send endpoint
    → server: stores the pending attempt (keypair, phone) server-side, keyed
      by a short-lived process id; returns { processId } to the client
  User enters the SMS code they received
    → POST /api/kaspi/connect/verify { processId, otp }
    → server: completes the ECDH exchange with Kaspi, derives the shared
      secret, receives the TOTP/OCRA seed and token serial number
    → server: encrypts the device private key + TOTP seed (AES-256-GCM,
      KASPI_SESSION_ENCRYPTION_KEY), upserts kaspi_connections for this user
    → server: generates this customer's public API token (random 32 bytes,
      shown once, stored only as its SHA-256 hash)
    → page shows the token once + a link to the docs page

Creating a payment (the core, reused capability):
  src/lib/kaspiPayClient.ts: createPayment(connection, { amount, orderId })
    → loads + decrypts the connection's device key/TOTP seed
    → computes the current OCRA/TOTP code + ECDSA request signature
      (src/lib/kaspiPayCrypto.ts, ported from the reference protocol)
    → calls Kaspi's (undocumented) invoice/QR-creation endpoint
    → returns { qrToken, paymentLink, operationId, expiresAt }
  Two callers of this one function:
    (a) Public API — POST /api/kaspi/pay, Bearer <customer's own API token>,
        body { amount, orderId, callbackUrl? } → same response shape as
        xpayment's own `create/route.ts` today ({ qr_token, payment_link,
        ext_tran_id }), so this is a drop-in replacement for that call shape.
    (b) Invoice auto-link — when an invoice is created/sent and its owner
        has an active kaspi_connections row, the invoice-send code path
        calls createPayment(connection, { amount: invoice.amount, orderId:
        invoice.id }) server-side and stores the result in
        kaspi_payment_requests, linked to invoice_id.

Detecting payment completion (polling, not a real Kaspi webhook):
  /api/cron/kaspi-poll (CRON_SECRET-gated, runs every few minutes — Kaspi's
  own protocol has no genuine push webhook; the reference project polls its
  status endpoint every ~3s while a user's browser is open, but a serverless
  cron can only poll periodically, so payment confirmation here is not
  instant — see Known open items)
    → for each kaspi_payment_requests row with status = 'pending' and not
      expired: check status via Kaspi's status endpoint
    → on success:
        if linked to an invoice_id: invoices.update({status:'paid'}) +
          invoice_logs.insert(...) — same pattern as every other payment
          path in this codebase, no new logic
        if created via the public API with a callbackUrl: POST that URL
          with an HMAC-SHA256-signed payload (reusing the signing half of
          src/lib/webhookSignature.ts's scheme, mirrored for outbound use)
    → on expiry: mark the request 'expired'

Disconnect:
  /profile/kaspi-pay, "Отключить" → POST /api/kaspi/disconnect
    → deletes the kaspi_connections row (best-effort revoke against Kaspi
      if their protocol exposes one; if not, the customer removing the
      Cashier role on their own Kaspi side is the real revocation)
```

## Components

### 1. Database (applied directly, no migration file in repo — this codebase's established pattern)

```sql
create table kaspi_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phone_number text not null,
  device_private_key_enc text not null,   -- AES-256-GCM, KASPI_SESSION_ENCRYPTION_KEY
  totp_seed_enc text not null,            -- AES-256-GCM, same key
  token_sn text not null,
  api_token_hash text not null,           -- sha256(customer-facing API token); token itself never stored
  status text not null default 'active',  -- 'active' | 'disconnected' | 'error'
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id) -- one Kaspi Cashier connection per invoices.kz user in v1
);
alter table kaspi_connections enable row level security;
-- No policies: service_role only, same reasoning as bcc_connections — this
-- table never needs to be read from the browser, and holds material that
-- must never reach the client under any circumstance.

create table kaspi_payment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid references invoices(id) on delete cascade, -- null for public-API-only requests
  order_id text not null,          -- caller-supplied for the public API; invoice_id (as text) for invoice-linked ones
  amount numeric not null,
  kaspi_operation_id text not null,
  qr_token text,
  payment_link text,
  callback_url text,               -- only set for public-API requests that supplied one
  status text not null default 'pending', -- 'pending' | 'paid' | 'expired' | 'failed'
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
alter table kaspi_payment_requests enable row level security;
create policy "users read own payment requests" on kaspi_payment_requests
  for select using (auth.uid() = user_id);
-- INSERT/UPDATE: service_role only (created via server routes / invoice-send
-- path, updated by the polling cron) — no client-facing write policy.
```

### 2. `src/lib/kaspiPayCrypto.ts` (new) — pure crypto primitives, unit-tested

Ported from the reference protocol (ECDH P-256 key agreement, AES-256-GCM encrypt/decrypt for at-rest secrets, OCRA-1/TOTP-style HMAC-SHA256 code derivation from a token serial + 30-second time step, ECDSA request signing over `{url, selected headers, body}`). Exposes:
- `generateDeviceKeyPair(): {privateKey, publicKey}`
- `deriveSharedSecret(privateKey, serverPublicKey): Buffer`
- `encryptAtRest(plaintext, key): string` / `decryptAtRest(ciphertext, key): string`
- `computeRequestCode(tokenSn, seed, timestamp): string`
- `signRequest(privateKey, url, headers, body): string`

### 3. `src/lib/kaspiPayClient.ts` (new) — network calls to Kaspi's own backend

`initConnect(phoneNumber)`, `verifyOtp(processId, otp)`, `createPayment(connection, {amount, orderId})`, `checkStatus(connection, operationId)`. **The exact hostnames/paths for these calls are a Known open item (see below) — this file's shape is fixed by this design, its contents depend on research done as the first implementation task.**

### 4. `src/app/api/kaspi/connect/init/route.ts` and `.../verify/route.ts` (new)

`POST`, authenticated (Bearer Supabase session). `init` calls `kaspiPayClient.initConnect`, holds the in-progress attempt server-side (short-lived, keyed by `processId`, not yet in `kaspi_connections`). `verify` completes the exchange, encrypts and upserts `kaspi_connections`, generates and returns the plaintext API token exactly once (`crypto.randomBytes(32).toString('hex')`, stored only as `sha256(token)`).

### 5. `src/app/api/kaspi/disconnect/route.ts` (new)

`POST`, authenticated, deletes the caller's own `kaspi_connections` row (scoped by session `user_id`, never a client-supplied id — same rule as every disconnect route in this codebase).

### 6. `src/app/api/kaspi/pay/route.ts` (new) — the public, documented API

`POST`, `Authorization: Bearer <customer's own API token>` (looked up via `sha256(token) = api_token_hash`, **not** a Supabase session — this is called from the customer's *own* servers/sites, not a logged-in browser). Body `{ amount, order_id, callback_url? }`. Calls `kaspiPayClient.createPayment`, inserts a `kaspi_payment_requests` row (`invoice_id: null`), returns `{ qr_token, payment_link, operation_id, expire_date }` — deliberately matching the field names invoices.kz's own `create/route.ts` already returns from xpayment today, so this is a drop-in shape for anyone migrating.

### 7. `src/app/api/cron/kaspi-poll/route.ts` (new)

`GET`, `CRON_SECRET`-gated (copy `notifications/route.ts`'s pattern verbatim). Iterates `kaspi_payment_requests` where `status = 'pending'` and not expired; calls `kaspiPayClient.checkStatus`; on success, marks `paid`, and either (a) if `invoice_id` is set, runs the existing `invoices.update({status:'paid'})` + `invoice_logs.insert(...)` pair, or (b) if `callback_url` is set, POSTs the signed payload there. Per-row try/catch — one customer's broken connection must not stop the batch (same isolation principle as the BCC cron).

### 8. `src/app/profile/kaspi-pay/page.tsx` (new)

Connect/disconnect UI (phone → OTP, two-step form, not a redirect like BCC's OAuth), displays the API token **once** at generation time with a copy button and a clear "we cannot show this again" warning, links to the docs page. Pro-gated client-side (mirrors the BCC page's pattern) with server-side enforcement on every route above.

### 9. A documentation page for invoices.kz's own customers (new, static content)

Explains: how to connect, how to call `POST /api/kaspi/pay`, the response shape, how to verify the outbound webhook signature (mirrors `webhookSignature.ts`'s scheme, documented for the *consumer* side this time). Written the same way this codebase documents other public-facing things — exact location (a `/profile/kaspi-pay/docs` route vs. a static page) is an implementation decision, not fixed here.

### 10. Invoice creation/send path (modify — exact file TBD during planning)

When an invoice is created or sent and its owner has `kaspi_connections.status = 'active'`, call `kaspiPayClient.createPayment` server-side (`orderId = invoice.id`), store the resulting `kaspi_payment_requests` row (`invoice_id` set), and surface the QR/link on both the owner's invoice view and the public `/view/[token]` page the payer sees.

## Security

- **API token handling:** the plaintext token is shown exactly once (at generation) and never persisted — only its SHA-256 hash is stored, matching standard API-key practice (bcrypt/argon2 is unnecessary here since the token itself is high-entropy random, not a user-chosen password).
- **Device key/TOTP seed encryption:** AES-256-GCM with a server-only key (`KASPI_SESSION_ENCRYPTION_KEY`), not just access-restriction — stronger than the BCC design's access-control-only posture, because this material is more sensitive (it's the equivalent of a cloned hardware token, not an OAuth token BCC itself can revoke server-side on request).
- **Least privilege on disconnect/pay:** every route resolves the acting user from their own session or their own API token — never a client-supplied user/connection id.
- **Public API rate limiting:** the `/api/kaspi/pay` route is reachable by anyone holding a valid customer token, from anywhere — worth a basic per-token rate limit to avoid one compromised token being used to hammer Kaspi's backend and risk that customer's Cashier role getting flagged. Concrete mechanism TBD during planning (this codebase has no existing rate-limiting precedent to follow).
- **Explicit unofficial-integration risk, restated for implementers:** this is not covered by any Kaspi SLA. Log every failure clearly (which connection, which step) so breakage is visible immediately rather than discovered via a customer complaint.

## Testing

- `kaspiPayCrypto.ts` is pure and fully unit-testable: key generation round-trips, `encryptAtRest`/`decryptAtRest` round-trip (including tamper-detection via GCM's auth tag), `computeRequestCode` determinism for a fixed `(tokenSn, seed, timestamp)` triple, `signRequest` producing a verifiable signature against the generated public key.
- `kaspiPayClient.ts` is network glue — manually verified against Kaspi's real backend during implementation (no mocking a protocol we're still confirming), same convention as this codebase's existing I/O-heavy routes.
- The public `/api/kaspi/pay` route's request/response shape should get a contract test once the client is real (assert the response matches xpayment's existing shape, since other code may come to depend on that parity).
- Manual end-to-end acceptance: connect a real (test) Cashier role, create a payment via the public API, pay it from a Kaspi Pay app, confirm the poller marks it paid and fires the webhook — this is the actual acceptance bar, not a mock.

## Out of scope for this iteration (explicitly, not silently dropped)

- Real-time (sub-second) payment confirmation — polling-based, same limitation the reference project has for unattended/server-side use (its 3-second polling assumes a live browser tab; our cron polls on a coarser interval, TBD during planning based on Vercel cron minimum granularity).
- Refunds via this integration (Kaspi's protocol supports it per the reference project; not built until asked for).
- Multiple Kaspi connections per invoices.kz user (schema has `unique(user_id)`, same v1 constraint as BCC).
- Automatic recovery if Kaspi changes their protocol and the connection silently breaks — surfaced as `status = 'error'` requiring manual reconnect, not an auto-healing system.
- A full card-acquiring checkout form (Visa/Mastercard) — a separate, unstarted idea (Freedom Pay / BCC eCom / TipTop Pay / P-Pay were researched this session as candidate providers, but no work has started).

## Known open items to resolve during implementation

- **The real Kaspi backend hostnames/endpoint paths are not yet confirmed.** This session's research obtained the *cryptographic protocol* (ECDH/TOTP-OCRA/AES-256-GCM/ECDSA) from the reference project's `crypto.js`, but not the actual network routes (`routes/auth.js`, `routes/invoices.js`, etc., which contain the real Kaspi hostnames and paths) — that fetch was blocked by this session's tooling and not retried. **The first implementation task must resolve this** (reading the reference project's route handlers, or an equivalent source) before `kaspiPayClient.ts` can be written for real — mirroring how BCC's Task 1 (registering the app) was a controller-only research/setup task, not something an implementer subagent can do blind.
- **Polling interval and Vercel cron granularity.** This codebase's existing crons run daily; this feature needs a much tighter interval (minutes, not once a day) for payment confirmation to feel reasonably fast. Confirm Vercel's minimum cron interval on the current plan before committing to a specific number.
- **Rate limiting mechanism** for the public `/api/kaspi/pay` route — no existing precedent in this codebase to follow; needs a concrete decision (in-memory, Supabase-backed counter, or a third-party service) during planning.
