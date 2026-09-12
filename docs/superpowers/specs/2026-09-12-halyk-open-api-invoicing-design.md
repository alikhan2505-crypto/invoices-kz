# Halyk Open API — «Счета на оплату» Integration Design

**Goal:** Add Halyk Bank as a second payment-acceptance rail alongside the existing Kaspi Pay Cashier product, so a merchant can let their payer settle an invoice via Halyk (bank-to-bank QR/link, Halyk Homebank/Onlinebank) in addition to Kaspi Pay.

**Scope note:** This is the first of two Halyk sub-projects the founder wants. This spec covers only **Halyk Open API's "Счета на оплату"** (bank-to-bank invoicing, payer must have a Halyk account). A separate, later sub-project covers **ePay** (card acquiring, works for any Visa/Mastercard payer) — deliberately out of scope here, not to be built as part of this work.

## Why this shape

invoices.kz already has one working payment-acceptance product, Kaspi Pay Cashier (`src/lib/kaspiPay/`, `src/app/api/kaspi/*`). Halyk's integration should follow that established shape rather than invent a new one — same table structure, same settlement/wallet pattern, same payer-facing UI slot on `/view/[token]`. Two things differ from Kaspi on purpose, not by oversight:

- **Connect flow is real OAuth 2.0**, not phone/SMS device-pairing. Kaspi's flow reverse-engineers an unofficial mobile protocol because Kaspi has no sanctioned merchant API for this; Halyk's Open API is official and documented, so the standard authorization-code flow applies — redirect the merchant to Halyk's consent screen, exchange the returned code for tokens, store them.
- **Settlement is webhook-primary with polling as a safety net**, not polling-only. Kaspi has no real inbound webhook at all (invoices.kz only sends outbound webhooks to its own customers). Halyk's marketing copy claims "мгновенные уведомления о поступлении денег" — if that's a real push webhook (to be confirmed once real docs exist), it becomes the primary settlement trigger, with a cron sweep mirroring `/api/cron/kaspi-poll` as the fallback for missed or delayed webhooks.

## Known unknown — blocks implementation, not architecture

Halyk publishes no public API reference without registering as a developer (confirmed: `onlinebank.kz/public`, the "Документация" link from the Open API page, renders a client-side app shell with no readable content, and the marketing page itself has no self-serve portal link — only a "Оставить заявку" form and a phone line, 9595). This spec fixes the architecture; it deliberately does **not** guess at exact request/response JSON, OAuth scopes, or webhook payload shape, since a plan built on invented schemas would need rewriting the moment real docs arrive — the same trap a "no placeholders" plan is meant to avoid.

**Phase 0 (founder-only, blocks everything below):** register as a developer/ISV on Halyk's Open API, specifically requesting **sandbox access to "Счета на оплату" for a third-party accounting/invoicing platform** (not personal business-banking access, which is a different, more limited product). Concretely:
1. Go to `halykbank.kz/business/other/halyk-open-api` → "Оставить заявку", or call 9595.
2. State explicitly: integrating a SaaS invoicing platform (invoices.kz) that issues Halyk payment requests on behalf of its own merchant customers — this is an ISV/platform integration, not a single company's own account automation. This distinction matters because Halyk's stated 6-step onboarding (docs → register → test/prod keys → build → sandbox test → sign agreement) may route ISVs through a different agreement than a single merchant.
3. Ask specifically for: OAuth 2.0 client credentials + authorization endpoint, the "Счета на оплату" create/status API reference (Swagger/Postman/PDF), whether a real inbound webhook exists and its payload/signature format, and the sandbox base URL.
4. Expect this to take real time — Halyk's own page states 2–4 weeks for a custom integration, and there is no guarantee an ISV-style request is even a defined path yet (may need a follow-up call). Treat like the BCC Dev→Production wait: don't block other work on it.

Everything in the "Architecture" section below is stable regardless of what Phase 0 turns up. The implementation plan (writing-plans) is deferred until Phase 0 returns real API access — building it now would mean writing fake JSON schemas into a plan, which is exactly what the no-placeholders rule exists to prevent.

## Architecture

**New tables** (mirroring `kaspi_connections` / `kaspi_payment_requests` in shape, applied directly against the live Supabase project per this repo's established pattern — no migration file):
- `halyk_connections` — one row per merchant: `user_id` (unique), `access_token_enc`/`refresh_token_enc` (AES-256-GCM under a new `HALYK_SESSION_ENCRYPTION_KEY`, following the same at-rest encryption as `kaspi_connections`), `halyk_account_id` (the merchant's connected Halyk business account reference — real field name TBD from docs), `status: active|error|disconnected`, `token_expires_at`.
- `halyk_payment_requests` — one row per invoice payment attempt: `user_id`, `invoice_id`, `amount`, `halyk_reference_id` (Halyk's own id for the payment request — field name TBD), `payment_link`/`qr_payload`, `status: pending|paid|expired|failed`, `expires_at`. Same partial-unique-index-per-invoice pattern as `kaspi_payment_requests` (one pending row per invoice).

**New library** `src/lib/halykPay/` (mirrors `src/lib/kaspiPay/`):
- `connection.ts` — load/decrypt a `halyk_connections` row; refresh the OAuth token when near expiry (Kaspi's connection never needed this — TOTP-derived tokens don't expire the same way — so this is genuinely new logic, not a copy).
- `client.ts` — real REST calls to Halyk's documented endpoints once known: create payment request, check status, (if it exists) verify webhook signature.
- `settlePayment.ts` — `checkAndSettleHalykPayment`, same responsibility as `checkAndSettleKaspiPayment`: confirm paid, debit commission via the existing `debit_wallet_balance` RPC (new `wallet_ledger` type, e.g. `halyk_pay_commission` — reusing `profiles.kaspi_wallet_balance`, not a second wallet; that column already isn't Kaspi-Pay-exclusive, it already covers Kaspi Shop checks and AI-agent replies), fire the same outbound customer webhook (`payment.success`) that Kaspi settlement fires today, generalized to name the provider.

**New routes** `src/app/api/halyk/*` (mirrors `/api/kaspi/*`): `connect/authorize` (redirect to Halyk consent), `connect/callback` (exchange code, store tokens), `disconnect`, `webhook` (inbound — only if Phase 0 confirms one exists), `invoice-payment` (payer-facing, mints/returns a pending payment request for `/view/[token]`).

**New cron sweep** — add `/api/cron/halyk-poll` as a sibling to `/api/cron/kaspi-poll` (not a rename — keep the Kaspi sweep independent so a bug in one provider's sweep can't take down the other's), sweeping pending `halyk_payment_requests` with the same shape as the existing Kaspi/plan-payment sweep.

**UI changes:**
- `/profile/acquiring` — add a "Подключить Halyk" card next to the existing Kaspi connect/dashboard/wallet UI, using the OAuth redirect flow above instead of Kaspi's phone/OTP form.
- `/view/[token]` (payer-facing) — show a "Оплатить через Halyk" QR/link block alongside Kaspi's, only when the invoice owner has an `active` `halyk_connections` row. If a merchant has both connected, both options render; a payer picks either.
- `profiles.halyk_pay_link` (the existing static-URL placeholder field) becomes dead once this ships — not removed in this spec (out of scope), but should not be confused with the new real integration when reviewing the codebase later.

## Error handling

Same posture as Kaspi: wallet-balance gating happens at mint time only (insufficient balance → `402`), never revokes an already-minted pending link; commission debit happens only on confirmed settlement and is allowed to push balance negative (existing platform-wide idiom, not new). OAuth token refresh failures mark the connection `error` (surfaced on `/profile/acquiring`) rather than silently failing invoice payment attempts — a merchant should see "reconnect Halyk" rather than a payer hitting a broken payment link.

## Testing

Once real API access exists, this follows the same test shape as `kaspiPay`: unit tests for `client.ts` against recorded/mocked Halyk responses, `settlePayment.ts` tested against the same idempotency and race-condition cases already covered for `checkAndSettleKaspiPayment` (double-settlement, expired request, mismatched amount). No tests are written in this spec's phase — there's nothing real to test against yet.

## What happens next

1. Founder completes Phase 0 (register, request ISV-level sandbox access). **Done 2026-09-12**: заявка отправлена через форму на `halykbank.kz/business/other/halyk-open-api`, цель подключения — «Выставление счетов и приём оплаты (Invoicing)», контактная почта `mail@invoices.kz` (форвардится и основателю, и на `otvet@zenesyon.resend.app`, так что ответ Halyk можно прочитать программно через тот же Resend-пайплайн, что и клиентские ответы). Ждём реакции банка.
2. Once real API docs/sandbox credentials exist, this spec's architecture section is revisited for any real-world corrections (exact field names, whether a real webhook exists, exact OAuth scopes) — then `writing-plans` produces the actual task-by-task implementation plan.
3. Until then, this work is blocked, exactly like the BCC v2 statement integration is currently blocked on BCC's own Dev→Production approval — not a reason to stall other founder-approved work in the meantime.
