# Real Per-User Telegram Notifications — Design

## Motivation

`/profile/notifications` already has a full preferences UI saving to `profiles`: `notify_email`, `notify_telegram`, `notify_client_viewed`, `notify_payment_reminder`, `notify_overdue`, `notify_weekly_report`. Every `notify_*` toggle except `notify_telegram` is wired to a real email send (shipped 2026-07-17). `notify_telegram` is decorative — toggling it on shows a card linking to `https://t.me/invoiceskz_support_bot` with instructions to send `/start`, but no webhook anywhere captures a per-user chat_id from that interaction, and `profiles` has no telegram-related column besides the boolean itself.

This spec makes it real: every invoices.kz customer can connect their own Telegram and receive the same notification events they already get by email, over Telegram too.

## Explicitly NOT reusing the existing bot

`TELEGRAM_BOT_TOKEN` (env var) already powers two things: internal admin alerts (`src/app/api/telegram/route.ts`, sends to a single hardcoded `TELEGRAM_CHAT_ID`) and the Instagram-draft-approval flow (`src/app/api/instagram/telegram-webhook/route.ts`, inline-button callbacks scoped to the admin's own chat). Per the user's explicit decision, this feature uses a **new, dedicated bot** with its own token — kept fully separate from the admin/ops bot rather than overloading one bot's webhook with two unrelated concerns.

## Data model

One new column, one new (reused) column pattern — no new table:

- `profiles.telegram_chat_id text null` — set once a connection succeeds; `null` means not connected.
- `profiles.telegram_connect_token text null` — a single-use, single-slot pending-connection token. Set when the user clicks "Подключить", cleared the moment it's consumed by the webhook (or overwritten if they click "Подключить" again before finishing — only the most recent attempt is ever valid, matching how `pendingConnect.ts`-style single-attempt flows already work elsewhere in this codebase).

## Connect flow

1. **`POST /api/telegram-connect/init`** (authenticated, same Bearer-token pattern as every other `/api/*` route in this app): generates `crypto.randomBytes(24).toString('hex')`, stores it on the caller's `profiles.telegram_connect_token`, returns `{ token, botUsername }`.
2. Client redirects to `https://t.me/<botUsername>?start=<token>` — Telegram's own deep-link convention; opening this pre-fills a Start button that sends `/start <token>` as the first message once tapped.
3. **`POST /api/telegram-notify-webhook`** (new, unauthenticated by design — Telegram calls it directly — verified via Telegram's `X-Telegram-Bot-Api-Secret-Token` header against a new `TELEGRAM_NOTIFY_WEBHOOK_SECRET`, exactly the same verification shape `instagram/telegram-webhook` already uses for `IG_AUTOMATION_SECRET`): parses an incoming `/start <token>` message, looks up `profiles` where `telegram_connect_token = token`, and if found: sets `telegram_chat_id` to the message's `chat.id`, clears `telegram_connect_token`, and replies in that chat with a confirmation ("✅ Telegram подключён к вашему аккаунту invoices.kz"). An unrecognized or already-consumed token gets a generic "Ссылка недействительна, вернитесь в приложение и нажмите «Подключить» ещё раз" reply, not a silent drop — Telegram delivery has no other feedback channel, and a confused user with no error message has no way to know what to do next. A registration route (`POST /api/telegram-notify-webhook/setup`, mirroring `instagram/setup-webhook`'s idempotent re-registration pattern) points Telegram's `setWebhook` at this URL with the secret token.

## Disconnect flow

**`POST /api/telegram-connect/disconnect`** (authenticated): clears `telegram_chat_id` (and any stray `telegram_connect_token`) for the caller. Surfaced as its own "Отключить Telegram" button, shown only while connected — separate from the `notify_telegram` toggle by design (see below).

## Toggle semantics

`notify_telegram` is a **master switch that never touches the connection**. Turning it off pauses sending without discarding `telegram_chat_id`; turning it back on resumes immediately, no reconnect needed. Only the explicit disconnect button clears the link. This matches how `notify_email` already behaves relative to `profiles.email` (the toggle never un-sets the email address itself) — the same mental model, extended to Telegram.

## Sending

New shared helper, `src/lib/telegramNotify.ts`:

```ts
export async function sendTelegramNotification(chatId: string, text: string): Promise<void> {
  const token = process.env.CUSTOMER_TELEGRAM_BOT_TOKEN
  if (!token) { console.error('sendTelegramNotification: CUSTOMER_TELEGRAM_BOT_TOKEN not configured'); return }
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  }).catch(e => console.error('sendTelegramNotification delivery failed:', e.message))
}
```

Wired into every existing notification-firing path, immediately after (never instead of) the existing email send, gated on `notify_telegram && telegram_chat_id` (both required — a connected-but-toggled-off user, or a toggled-on-but-never-connected user, sends nothing):

- `POST /api/notify-viewed` (sent→viewed transition)
- `POST /api/notify-paid` (invoice marked paid, any channel — manual, Kaspi, BCC)
- `GET/POST /api/cron/notifications` — the three sub-cases already there: `notify_payment_reminder`, `notify_overdue`, `notify_weekly_report`

Each call site already loads the owning profile for the email send; the Telegram branch reads `telegram_chat_id`/`notify_telegram` off the same already-fetched row, no extra query.

## UI (`/profile/notifications`)

- **Not connected**: existing card becomes real — "Подключить" button calls `init`, then does `window.location.href = `https://t.me/${botUsername}?start=${token}``.
- **Connected**: card shows "✅ Telegram подключён" plus a "Отключить" button (calls `disconnect`, then reloads local state).
- The `notify_telegram` toggle itself is unchanged in position/behavior — still a plain toggle, independent of connection state per the semantics above.

## External setup required before this works live (not code — flagged now so it isn't a surprise at deploy time)

1. ~~Create a new bot via @BotFather~~ — **done 2026-08-06**: `@invoices_notify_bot` (`t.me/invoices_notify_bot`).
2. ~~Add `CUSTOMER_TELEGRAM_BOT_TOKEN`, `TELEGRAM_NOTIFY_WEBHOOK_SECRET`, `CUSTOMER_TELEGRAM_BOT_USERNAME` to `.env.local`~~ — **done 2026-08-06** (local only). Still needed: the same three vars added to Vercel's Production env vars, then a redeploy — can happen right before this ships, doesn't block implementation.
3. Hit `POST /api/telegram-notify-webhook/setup` once (same one-time, idempotent step this project already uses for the Instagram webhook) to register the webhook URL with Telegram — happens after deploy, not before.

## Explicitly out of scope

- Customers bringing their own bot/token (considered and explicitly rejected this session — a shared bot with per-chat isolation is Telegram's own standard pattern, no privacy trade-off, and a self-hosted-bot option would be a real technical barrier for a non-technical business owner with no corresponding benefit).
- Inbound replies/commands beyond `/start <token>` (e.g. a customer replying to a notification) — this bot is send-and-confirm only, not a two-way support channel.
- Token expiry beyond single-use-then-cleared (a stale unused token sitting in `telegram_connect_token` is harmless — it just gets overwritten the next time the user clicks "Подключить," and can only ever be consumed by someone in possession of the exact random value that was never sent anywhere but a Telegram deep-link URL the user opened themselves).
