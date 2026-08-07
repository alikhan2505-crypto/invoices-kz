# Per-User Telegram Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing decorative `notify_telegram` toggle real — every invoices.kz customer can connect their own Telegram via a deep-link and receive the same notification events they already get by email (client viewed, invoice paid, payment reminder, overdue, weekly report), sent through a dedicated new bot.

**Architecture:** A single shared bot (`@invoices_notify_bot`, own token — deliberately NOT the existing admin-alerts/Instagram bot) with per-user isolation via Telegram's own chat_id model. A user clicks "Подключить" → app generates a single-use token → user opens a `t.me/<bot>?start=<token>` deep-link → a new webhook receives `/start <token>`, links their `chat_id` to their `profiles` row. Every existing email-notification call site gains an additive Telegram branch, gated on `notify_telegram && telegram_chat_id`.

**Tech Stack:** Next.js API routes, Supabase (Postgres + supabase-js), Telegram Bot API (raw `fetch`, no SDK — matches this codebase's existing Telegram integration), Vitest.

## Global Constraints

- **Shared bot, chat_id isolation — never per-customer bots.** This was an explicit, deliberate decision this session (a shared bot is Telegram's own standard pattern, no privacy trade-off vs. per-customer bots, and per-customer bots would be a real technical barrier for a non-technical business owner). Do not second-guess this in review.
- **`notify_telegram` toggle NEVER clears `telegram_chat_id`.** Only the explicit disconnect action does. The toggle is a pure send/don't-send switch, independent of connection state — same mental model as `notify_email` never touching `profiles.email`.
- **Both channels fire additively, never exclusively.** `notify_email` and `notify_telegram` are independent booleans already; a user with both on gets both an email and a Telegram message for the same event. Do not build any either/or channel-picker logic.
- **This is a genuinely different bot from the existing `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` (admin alerts) and the Instagram-approval webhook.** New env vars: `CUSTOMER_TELEGRAM_BOT_TOKEN`, `TELEGRAM_NOTIFY_WEBHOOK_SECRET`, `CUSTOMER_TELEGRAM_BOT_USERNAME` — all three already exist in `.env.local` (bot `@invoices_notify_bot` was created and configured locally on 2026-08-06). They still need to be added to Vercel's Production env vars and the webhook needs to be registered via a one-time `POST` — both are the LAST task in this plan, and both are steps the user runs themselves after everything is deployed, not something to build.
- **No due-date/business-hours logic changes.** This plan only adds a delivery channel to notification events that already fire on their existing schedule (`created_at`-based reminder/overdue windows, Monday weekly report) — do not touch when/why a notification fires, only how it's delivered.
- Full spec: `docs/superpowers/specs/2026-08-06-telegram-notifications-design.md` — read it if anything below is ambiguous.

---

### Task 1: Database migration — new `profiles` columns

**Files:**
- Migration applied directly via Supabase MCP (`apply_migration`), controller-executed — this project's established pattern for schema changes (see every prior plan's Task 1/2).

**Interfaces:**
- Produces: `profiles.telegram_chat_id text null` (set once connected, null = not connected), `profiles.telegram_connect_token text null` (set while a connect attempt is pending, cleared once consumed).

- [ ] **Step 1: Apply the migration**

Run via the Supabase MCP `apply_migration` tool (name: `add_profiles_telegram_notify_columns`):

```sql
alter table profiles add column if not exists telegram_chat_id text;
alter table profiles add column if not exists telegram_connect_token text;
```

- [ ] **Step 2: Verify**

Run via the Supabase MCP `execute_sql` tool:

```sql
select column_name, data_type from information_schema.columns
where table_name = 'profiles' and column_name in ('telegram_chat_id', 'telegram_connect_token');
```

Expected: both rows present, `data_type` = `text`.

No RLS changes needed — `profiles` already has its existing RLS policies (owner-scoped read/update); these are just two more nullable columns on an already-covered table, and every route in this plan that touches them uses the service-role client (matching every other `/api/*` route in this codebase), not the client-side anon key.

- [ ] **Step 3: Record in the plan's progress ledger** (handled by whichever skill executes this plan — no code step here).

---

### Task 2: `sendTelegramNotification` + `parseStartToken` — `src/lib/telegramNotify.ts`

**Files:**
- Create: `src/lib/telegramNotify.ts`
- Test: `src/lib/telegramNotify.test.ts`

**Interfaces:**
- Produces: `parseStartToken(text: string): string | null` (pure, exported for testing), `sendTelegramNotification(chatId: string, text: string): Promise<void>` (async I/O, used by Tasks 5/6).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/telegramNotify.test.ts
import { describe, it, expect } from 'vitest'
import { parseStartToken } from './telegramNotify'

describe('parseStartToken', () => {
  it('extracts the token from a /start command', () => {
    expect(parseStartToken('/start abc123def456')).toBe('abc123def456')
  })

  it('returns null for a bare /start with no payload', () => {
    expect(parseStartToken('/start')).toBeNull()
  })

  it('returns null for a message that is not /start', () => {
    expect(parseStartToken('hello')).toBeNull()
  })

  it('returns null for /start with extra whitespace-only payload', () => {
    expect(parseStartToken('/start   ')).toBeNull()
  })

  it('ignores a bot-mention suffix Telegram sometimes adds in group chats', () => {
    expect(parseStartToken('/start@invoices_notify_bot abc123')).toBe('abc123')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/telegramNotify.test.ts`
Expected: FAIL — `telegramNotify.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/telegramNotify.ts

// Matches "/start <token>" or "/start@bot_username <token>" (Telegram appends
// the bot's own username to commands in some contexts) -- returns the token,
// or null for anything else (bare "/start", a non-command message, etc.).
export function parseStartToken(text: string): string | null {
  const match = text.match(/^\/start(?:@\S+)?\s+(\S+)$/)
  return match ? match[1] : null
}

// Fire-and-forget by design, matching every other outbound Telegram call in
// this codebase (src/app/api/instagram/telegram-webhook/route.ts's own
// `telegram()` helper) -- a failed send here must never break the caller's
// own primary action (marking an invoice paid, the daily notification cron
// continuing to the next row), so this never throws.
export async function sendTelegramNotification(chatId: string, text: string): Promise<void> {
  const token = process.env.CUSTOMER_TELEGRAM_BOT_TOKEN
  if (!token) {
    console.error('sendTelegramNotification: CUSTOMER_TELEGRAM_BOT_TOKEN is not configured')
    return
  }
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    })
  } catch (e: any) {
    console.error('sendTelegramNotification delivery failed for chat', chatId, ':', e.message)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/telegramNotify.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add src/lib/telegramNotify.ts src/lib/telegramNotify.test.ts
git commit -m "feat(telegram-notify): add sendTelegramNotification + parseStartToken"
```

---

### Task 3: Connect-init and disconnect routes

**Files:**
- Create: `src/app/api/telegram-connect/init/route.ts`
- Create: `src/app/api/telegram-connect/disconnect/route.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (talks to `profiles` directly).
- Produces: `POST /api/telegram-connect/init` → `{ token: string, botUsername: string }`. `POST /api/telegram-connect/disconnect` → `{ ok: true }`. Both used by Task 7's UI.

- [ ] **Step 1: Write the init route**

```ts
// src/app/api/telegram-connect/init/route.ts
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

// Generates a single-use token and stores it on the caller's own profile —
// the webhook (Task 4) looks a user up BY this token when the deep-link's
// /start message arrives. Calling this again before finishing a previous
// attempt just overwrites the old token; only the most recent one is ever
// valid, which is fine since a user can only be mid-deep-link once at a time.
export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const botUsername = process.env.CUSTOMER_TELEGRAM_BOT_USERNAME
  if (!botUsername) return NextResponse.json({ error: 'not_configured' }, { status: 500 })

  const token = crypto.randomBytes(24).toString('hex')
  const { error } = await supabase
    .from('profiles')
    .update({ telegram_connect_token: token })
    .eq('id', user.id)
  if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500 })

  return NextResponse.json({ token, botUsername })
}
```

- [ ] **Step 2: Write the disconnect route**

```ts
// src/app/api/telegram-connect/disconnect/route.ts
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

// Explicit disconnect — the ONLY thing that clears telegram_chat_id. The
// notify_telegram toggle itself must never call this (see Global Constraints).
export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('profiles')
    .update({ telegram_chat_id: null, telegram_connect_token: null })
    .eq('id', user.id)
  if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/telegram-connect/init/route.ts src/app/api/telegram-connect/disconnect/route.ts
git commit -m "feat(telegram-notify): add connect-init and disconnect routes"
```

---

### Task 4: Webhook + one-time setup route

**Files:**
- Create: `src/app/api/telegram-notify-webhook/route.ts`
- Create: `src/app/api/telegram-notify-webhook/setup/route.ts`

**Interfaces:**
- Consumes: `parseStartToken` from Task 2 (`src/lib/telegramNotify.ts`).
- Produces: a live webhook endpoint Telegram calls on every update to the new bot; a one-time registration route the user calls after deploy.

- [ ] **Step 1: Write the webhook route**

```ts
// src/app/api/telegram-notify-webhook/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseStartToken } from '@/lib/telegramNotify'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function reply(chatId: number, text: string) {
  const token = process.env.CUSTOMER_TELEGRAM_BOT_TOKEN
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
}

// Telegram calls this for every update to @invoices_notify_bot. This bot is
// send-and-confirm only (see design doc's "Explicitly out of scope") -- the
// only inbound interaction handled is "/start <token>" from the deep-link
// generated by /api/telegram-connect/init. Anything else gets a short
// explanatory reply, not silence -- a curious user who messages the bot
// directly (no deep-link) deserves to know what it's for.
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-telegram-bot-api-secret-token')
  if (!secret || secret !== process.env.TELEGRAM_NOTIFY_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const update = await req.json()
  const msg = update.message
  const text = msg?.text
  const chatId = msg?.chat?.id
  if (typeof text !== 'string' || typeof chatId !== 'number') {
    return NextResponse.json({ ok: true })
  }

  const token = parseStartToken(text)
  if (!token) {
    await reply(chatId, 'Этот бот используется только для уведомлений invoices.kz. Чтобы подключить его к своему аккаунту, перейдите в Профиль → Уведомления и нажмите «Подключить».')
    return NextResponse.json({ ok: true })
  }

  const { data: owner, error } = await supabase
    .from('profiles')
    .update({ telegram_chat_id: String(chatId), telegram_connect_token: null })
    .eq('telegram_connect_token', token)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('telegram-notify-webhook: link update failed:', error.message)
    await reply(chatId, 'Не удалось подключить — попробуйте ещё раз из приложения.')
    return NextResponse.json({ ok: true })
  }

  if (!owner) {
    await reply(chatId, 'Ссылка недействительна, вернитесь в приложение и нажмите «Подключить» ещё раз.')
    return NextResponse.json({ ok: true })
  }

  await reply(chatId, '✅ Telegram подключён к вашему аккаунту invoices.kz.')
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Write the one-time setup route**

```ts
// src/app/api/telegram-notify-webhook/setup/route.ts
import { NextRequest, NextResponse } from 'next/server'

// One-time (idempotent — re-running just overwrites Telegram's stored
// webhook config) registration call, run by the user after deploy. Mirrors
// src/app/api/instagram/setup-webhook/route.ts's shape exactly, for the new
// bot/webhook/secret instead of the admin-alerts one.
export async function POST(req: NextRequest) {
  const internalSecret = req.headers.get('x-internal-secret')
  if (!internalSecret || internalSecret !== process.env.TELEGRAM_NOTIFY_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = process.env.CUSTOMER_TELEGRAM_BOT_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'CUSTOMER_TELEGRAM_BOT_TOKEN not configured' }, { status: 500 })
  }

  // Must be the canonical host — the bare domain 307-redirects to www, and
  // Telegram treats a redirect as delivery failure rather than following it
  // (same gotcha the Instagram webhook setup already documents).
  const webhookUrl = 'https://www.invoices.kz/api/telegram-notify-webhook'
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: process.env.TELEGRAM_NOTIFY_WEBHOOK_SECRET,
      allowed_updates: ['message'],
    }),
  })
  const data = await res.json()
  return NextResponse.json(data)
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/telegram-notify-webhook/route.ts src/app/api/telegram-notify-webhook/setup/route.ts
git commit -m "feat(telegram-notify): add webhook + one-time setup route"
```

---

### Task 5: Wire Telegram into `notify-viewed` and `notify-paid`

**Files:**
- Modify: `src/app/api/notify-viewed/route.ts`
- Modify: `src/app/api/notify-paid/route.ts`

**Interfaces:**
- Consumes: `sendTelegramNotification` from Task 2.

- [ ] **Step 1: Replace `notify-viewed`'s full route body**

Replace the entire contents of `src/app/api/notify-viewed/route.ts` with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import { sendTelegramNotification } from '@/lib/telegramNotify'

const resend = new Resend(process.env.RESEND_API_KEY!)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Called from the public invoice page right after a client's first view flips
// status sent -> viewed. No auth (page is anonymous, gated by public_token) —
// invoiceId alone can't do anything beyond sending this one notification, and
// only for an invoice that's actually in `viewed` status.
export async function POST(request: NextRequest) {
  try {
    const { invoiceId } = await request.json()
    if (!invoiceId) return NextResponse.json({ error: 'Missing invoiceId' }, { status: 400 })

    const { data: inv } = await supabase
      .from('invoices')
      .select('number, amount, client_name, status, user_id')
      .eq('id', invoiceId)
      .single()

    if (!inv || inv.status !== 'viewed') {
      return NextResponse.json({ ok: true, skipped: true })
    }

    const { data: owner } = await supabase
      .from('profiles')
      .select('email, notify_client_viewed, notify_telegram, telegram_chat_id')
      .eq('id', inv.user_id)
      .single()

    if (!owner) {
      return NextResponse.json({ ok: true, skipped: true })
    }

    const amount = Number(inv.amount).toLocaleString('ru-KZ')

    // Email and Telegram are independent channels (see plan's Global
    // Constraints) — each gets its own guard, neither nested inside the
    // other, so a user with only one channel enabled still gets that one.
    if (owner.email && owner.notify_client_viewed !== false) {
      await resend.emails.send({
        from: 'invoices.kz <mail@invoices.kz>',
        to: owner.email,
        subject: `Клиент открыл счёт №${inv.number}`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; background:#f5f5f5; font-family: Arial, sans-serif;">
<div style="max-width:560px; margin:30px auto; background:white; border:1px solid #e0e0e0;">
  <div style="background:#1C2056; padding:24px 32px;">
    <div style="color:white; font-size:18px; font-weight:bold; letter-spacing:1px;">Счёт открыт</div>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 12px; font-size:14px; color:#333;">
      Клиент <strong>${inv.client_name || ''}</strong> открыл счёт №${inv.number} на сумму
      <strong>${amount} ₸</strong>.
    </p>
    <p style="margin:0; font-size:12px; color:#aaa;">
      Отключить это письмо можно в Профиль → Уведомления.
    </p>
  </div>
</div>
</body>
</html>
        `,
      })
    }

    if (owner.notify_telegram && owner.telegram_chat_id) {
      await sendTelegramNotification(owner.telegram_chat_id,
        `👀 Клиент <b>${inv.client_name || ''}</b> открыл счёт №${inv.number} на сумму <b>${amount} ₸</b>.`)
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
```

(the only logic change from the current file, besides the new Telegram branch: `if (!owner?.email || owner.notify_client_viewed === false) { return ... skipped }` — which returned early and would have skipped a Telegram-only subscriber entirely — becomes `if (!owner) return ... skipped` plus two independent `if`s below, so a missing/opted-out email no longer blocks the Telegram branch from running).

- [ ] **Step 2: Replace `notify-paid`'s full route body**

Replace the entire contents of `src/app/api/notify-paid/route.ts` with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import { sendTelegramNotification } from '@/lib/telegramNotify'

const resend = new Resend(process.env.RESEND_API_KEY!)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Called from the public invoice page after a client marks an invoice paid.
// No auth (the page itself is anonymous, gated only by the unguessable
// public_token) — invoiceId alone can't do anything beyond sending this one
// notification, and only for an invoice that's actually in `paid` status.
export async function POST(request: NextRequest) {
  try {
    const { invoiceId } = await request.json()
    if (!invoiceId) return NextResponse.json({ error: 'Missing invoiceId' }, { status: 400 })

    const { data: inv } = await supabase
      .from('invoices')
      .select('number, amount, client_name, status, user_id')
      .eq('id', invoiceId)
      .single()

    if (!inv || inv.status !== 'paid') {
      return NextResponse.json({ ok: true, skipped: true })
    }

    const { data: owner } = await supabase
      .from('profiles')
      .select('email, notify_email, notify_telegram, telegram_chat_id')
      .eq('id', inv.user_id)
      .single()

    if (!owner) {
      return NextResponse.json({ ok: true, skipped: true })
    }

    const amount = Number(inv.amount).toLocaleString('ru-KZ')

    if (owner.email && owner.notify_email !== false) {
      await resend.emails.send({
        from: 'invoices.kz <mail@invoices.kz>',
        to: owner.email,
        subject: `Счёт №${inv.number} отмечен как оплаченный`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; background:#f5f5f5; font-family: Arial, sans-serif;">
<div style="max-width:560px; margin:30px auto; background:white; border:1px solid #e0e0e0;">
  <div style="background:#2DC48D; padding:24px 32px;">
    <div style="color:white; font-size:18px; font-weight:bold; letter-spacing:1px;">Оплата получена</div>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 12px; font-size:14px; color:#333;">
      Клиент <strong>${inv.client_name || ''}</strong> отметил счёт №${inv.number} на сумму
      <strong>${amount} ₸</strong> как оплаченный.
    </p>
    <p style="margin:0; font-size:12px; color:#aaa;">
      Отключить это письмо можно в Профиль → Уведомления.
    </p>
  </div>
</div>
</body>
</html>
        `,
      })
    }

    if (owner.notify_telegram && owner.telegram_chat_id) {
      await sendTelegramNotification(owner.telegram_chat_id,
        `💰 Клиент <b>${inv.client_name || ''}</b> отметил счёт №${inv.number} на сумму <b>${amount} ₸</b> как оплаченный.`)
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
```

(same shape of change as Step 1: `if (!owner?.email || owner.notify_email === false)` — which would have blocked a Telegram-only subscriber — becomes `if (!owner)` plus two independent per-channel `if`s).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual smoke check**

Run: `npx vitest run` (full suite — confirms nothing else broke)
Expected: all existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/notify-viewed/route.ts src/app/api/notify-paid/route.ts
git commit -m "feat(telegram-notify): send Telegram alongside email for viewed/paid events"
```

---

### Task 6: Wire Telegram into the daily notifications cron

**Files:**
- Modify: `src/app/api/cron/notifications/route.ts`

**Interfaces:**
- Consumes: `sendTelegramNotification` from Task 2.

- [ ] **Step 1: Add the import and extend all three Supabase selects**

```ts
import { sendTelegramNotification } from '@/lib/telegramNotify'
```

The reminder query's `profiles(...)` embed becomes:

```ts
    .select('id, number, amount, client_name, profiles(email, notify_payment_reminder, notify_telegram, telegram_chat_id)')
```

The overdue query's `profiles(...)` embed becomes:

```ts
    .select('id, number, amount, client_name, profiles(email, notify_overdue, notify_telegram, telegram_chat_id)')
```

The weekly-report profiles query becomes:

```ts
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, notify_weekly_report, notify_telegram, telegram_chat_id')
      .or('notify_weekly_report.eq.true,notify_telegram.eq.true')
```

(the OR is needed because the current query filters `.eq('notify_weekly_report', true)` — a user who wants the Telegram report but not the email one, or vice versa, must still be fetched; the per-channel `if` inside the loop decides what actually sends, same pattern as everywhere else in this task. **Because the outer filter is now broader than before** — it previously implied `notify_weekly_report === true` for every fetched row, and code below relied on that — `notify_weekly_report` must be explicitly re-checked inside the email branch in Step 2 below, not assumed from having been fetched at all).

- [ ] **Step 2: Add the three independent Telegram branches**

**Cross-task correctness note (found during Task 5's review, applies here even more since this loop touches every subscriber, not just one request):** each `resend.emails.send(...)` call must have its OWN `try/catch` (log-and-continue), not rely on the surrounding loop/route to absorb a failure. Unlike the per-request routes in Task 5, this file's loop bodies currently have NO enclosing try/catch at all — an unhandled Resend exception here would throw out of the whole `GET` handler, abandoning every remaining user in every remaining loop for the rest of this cron run, not just skipping one channel for one user. Wrap each `resend.emails.send` call individually as shown below; `sendTelegramNotification` never throws (see `src/lib/telegramNotify.ts`) so it needs no wrapping.

After the existing reminder email block (the `if (!owner?.email || owner.notify_payment_reminder === false) continue` line stays, but add a **separate** check right after it — do not let the `continue` skip Telegram for a user with email off but Telegram on; restructure as two independent `if`s, matching Task 5's reasoning):

```ts
  for (const inv of (reminderInvoices || []) as any[]) {
    const owner = inv.profiles
    if (owner?.email && owner.notify_payment_reminder !== false) {
      try {
        await resend.emails.send({
          from: 'invoices.kz <mail@invoices.kz>',
          to: owner.email,
          subject: `Напоминание: счёт №${inv.number} ещё не оплачен`,
          html: wrapEmail('#F5A623', 'Напоминание об оплате', `
            <p style="margin:0 0 12px; font-size:14px; color:#333;">
              Счёт №${inv.number} для <strong>${inv.client_name || ''}</strong> на сумму
              <strong>${Number(inv.amount).toLocaleString('ru-KZ')} ₸</strong> отправлен 3 дня назад и всё ещё не оплачен.
            </p>
          `),
        })
        reminders++
      } catch (e: any) {
        console.error('cron/notifications: reminder email failed for invoice', inv.id, ':', e.message)
      }
    }
    if (owner?.notify_telegram && owner.telegram_chat_id) {
      await sendTelegramNotification(owner.telegram_chat_id,
        `⏰ Счёт №${inv.number} для <b>${inv.client_name || ''}</b> на сумму <b>${Number(inv.amount).toLocaleString('ru-KZ')} ₸</b> отправлен 3 дня назад и всё ещё не оплачен.`)
    }
  }
```

For the overdue loop, the status-transition `await supabase.from('invoices').update(...)` stays unconditional (it already runs before the email guard), then the same split:

```ts
  for (const inv of (overdueInvoices || []) as any[]) {
    await supabase.from('invoices').update({ status: 'overdue' }).eq('id', inv.id)
    const owner = inv.profiles
    if (owner?.email && owner.notify_overdue !== false) {
      try {
        await resend.emails.send({
          from: 'invoices.kz <mail@invoices.kz>',
          to: owner.email,
          subject: `Счёт №${inv.number} просрочен`,
          html: wrapEmail('#E05252', 'Счёт просрочен', `
            <p style="margin:0 0 12px; font-size:14px; color:#333;">
              Счёт №${inv.number} для <strong>${inv.client_name || ''}</strong> на сумму
              <strong>${Number(inv.amount).toLocaleString('ru-KZ')} ₸</strong> не оплачен уже 7 дней и помечен как просроченный.
            </p>
          `),
        })
        overdue++
      } catch (e: any) {
        console.error('cron/notifications: overdue email failed for invoice', inv.id, ':', e.message)
      }
    }
    if (owner?.notify_telegram && owner.telegram_chat_id) {
      await sendTelegramNotification(owner.telegram_chat_id,
        `🔴 Счёт №${inv.number} для <b>${inv.client_name || ''}</b> на сумму <b>${Number(inv.amount).toLocaleString('ru-KZ')} ₸</b> не оплачен уже 7 дней и помечен как просроченный.`)
    }
  }
```

For the weekly report block (inside `if (new Date().getUTCDay() === 1)`), after computing `list`/`paid`/`paidSum`/`unpaidCount` (unchanged), split the send:

```ts
      if (p.email && (p as any).notify_weekly_report) {
        try {
          await resend.emails.send({
            from: 'invoices.kz <mail@invoices.kz>',
            to: p.email,
            subject: 'Ваш еженедельный отчёт invoices.kz',
            html: wrapEmail('#1C2056', 'Отчёт за неделю', `
              <p style="margin:0 0 12px; font-size:14px; color:#333;">За последние 7 дней:</p>
              <ul style="margin:0 0 12px; padding-left:18px; font-size:14px; color:#333;">
                <li>Создано счетов: <strong>${list.length}</strong></li>
                <li>Оплачено: <strong>${paid.length}</strong> на сумму <strong>${paidSum.toLocaleString('ru-KZ')} ₸</strong></li>
                <li>Ожидают оплаты: <strong>${unpaidCount}</strong></li>
              </ul>
            `),
          })
          reports++
        } catch (e: any) {
          console.error('cron/notifications: weekly report email failed for profile', p.id, ':', e.message)
        }
      }
      if ((p as any).notify_telegram && (p as any).telegram_chat_id) {
        await sendTelegramNotification((p as any).telegram_chat_id,
          `📊 <b>Отчёт за неделю</b>\nСоздано счетов: ${list.length}\nОплачено: ${paid.length} на сумму ${paidSum.toLocaleString('ru-KZ')} ₸\nОжидают оплаты: ${unpaidCount}`)
      }
```

**Important — this is a real behavior change from the pre-existing code, not just an addition:** the original query filtered `.eq('notify_weekly_report', true)`, so every fetched row already implied that preference and the email branch never needed to re-check it. Broadening the outer query to an `.or(...)` (necessary so a Telegram-only subscriber is fetched at all) means a row can now arrive with `notify_weekly_report: false` — the explicit `&& (p as any).notify_weekly_report` in the email `if` above is what keeps that row from wrongly getting an email it never opted into. Do not drop this check when implementing.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: all existing tests still pass (this file has no dedicated test file today — its logic is exercised via the cron in production, matching this codebase's existing convention of not unit-testing Resend-email-composing cron routes directly).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/notifications/route.ts
git commit -m "feat(telegram-notify): send Telegram alongside email in the daily notifications cron"
```

---

### Task 7: Real connect/disconnect UI on `/profile/notifications`

**Files:**
- Modify: `src/app/profile/notifications/page.tsx`
- Modify: `src/lib/i18n/profileAccounts.ts`

**Interfaces:**
- Consumes: `POST /api/telegram-connect/init`, `POST /api/telegram-connect/disconnect` (Task 3).

- [ ] **Step 1: Add new i18n keys**

In `src/lib/i18n/profileAccounts.ts`, add to the interface (near the existing `connectTelegram*` keys):

```ts
  telegramConnectedLabel: string
  telegramConnectedHint: string
  disconnectTelegramButton: string
  disconnectingLabel: string
  telegramConnectErrorGeneric: string
```

Add to the `ru` block:

```ts
    telegramConnectedLabel: '✅ Telegram подключён',
    telegramConnectedHint: 'Вы будете получать уведомления в этот чат, пока включён тумблер выше.',
    disconnectTelegramButton: 'Отключить Telegram',
    disconnectingLabel: 'Отключаем...',
    telegramConnectErrorGeneric: 'Не удалось подключить Telegram. Попробуйте ещё раз.',
```

Add to the `kk` block:

```ts
    telegramConnectedLabel: '✅ Telegram қосылды',
    telegramConnectedHint: 'Жоғарыдағы қосқыш қосулы тұрғанда осы чатқа хабарландырулар келеді.',
    disconnectTelegramButton: 'Telegram-ды ажырату',
    disconnectingLabel: 'Ажыратылуда...',
    telegramConnectErrorGeneric: 'Telegram қосу мүмкін болмады. Қайталап көріңіз.',
```

Add to the `en` block:

```ts
    telegramConnectedLabel: '✅ Telegram connected',
    telegramConnectedHint: "You'll get notifications in this chat while the toggle above is on.",
    disconnectTelegramButton: 'Disconnect Telegram',
    disconnectingLabel: 'Disconnecting...',
    telegramConnectErrorGeneric: 'Could not connect Telegram. Please try again.',
```

- [ ] **Step 2: Add state and handlers to the page**

In `src/app/profile/notifications/page.tsx`, add new state near the existing `loading`/`saving`:

```ts
  const [telegramChatId, setTelegramChatId] = useState<string | null>(null)
  const [telegramConnecting, setTelegramConnecting] = useState(false)
  const [telegramDisconnecting, setTelegramDisconnecting] = useState(false)
  const [telegramError, setTelegramError] = useState('')
```

In the existing `load()` effect, alongside the current `setSettings(...)` call, read the connection state from the same already-fetched `data` row:

```ts
        setTelegramChatId(data.telegram_chat_id ?? null)
```

Add two new handler functions (near `toggle`):

```ts
  async function connectTelegram() {
    setTelegramError('')
    setTelegramConnecting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/telegram-connect/init', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      })
      const data = await res.json()
      if (!res.ok || !data.token) {
        setTelegramError(t.telegramConnectErrorGeneric)
        return
      }
      window.location.href = `https://t.me/${data.botUsername}?start=${data.token}`
    } finally {
      setTelegramConnecting(false)
    }
  }

  async function disconnectTelegram() {
    setTelegramDisconnecting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('/api/telegram-connect/disconnect', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      })
      setTelegramChatId(null)
    } finally {
      setTelegramDisconnecting(false)
    }
  }
```

- [ ] **Step 3: Replace the decorative Telegram card**

Replace the existing block:

```tsx
        {/* Telegram подключение */}
        {settings.notify_telegram && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="text-sm font-medium text-[#1C2056] mb-2">{t.connectTelegramTitle}</div>
            <div className="text-xs text-gray-500 mb-3">
              {t.connectTelegramBodyBefore} <span className="font-mono bg-gray-100 px-1 rounded">/start</span> {t.connectTelegramBodyAfter}
            </div>
            <a href="https://t.me/invoiceskz_support_bot"
              target="_blank"
              className="flex items-center justify-center gap-2 w-full bg-[#1C2056] text-white rounded-xl py-3 text-sm font-medium">
              {t.connectTelegramBotButton}
            </a>
          </div>
        )}
```

with:

```tsx
        {/* Telegram подключение */}
        {settings.notify_telegram && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            {telegramChatId ? (
              <>
                <div className="text-sm font-medium text-[#1C2056] mb-1">{t.telegramConnectedLabel}</div>
                <div className="text-xs text-gray-500 mb-3">{t.telegramConnectedHint}</div>
                <button onClick={disconnectTelegram} disabled={telegramDisconnecting}
                  className="w-full bg-gray-100 text-gray-600 rounded-xl py-3 text-sm font-medium">
                  {telegramDisconnecting ? t.disconnectingLabel : t.disconnectTelegramButton}
                </button>
              </>
            ) : (
              <>
                <div className="text-sm font-medium text-[#1C2056] mb-2">{t.connectTelegramTitle}</div>
                <div className="text-xs text-gray-500 mb-3">
                  {t.connectTelegramBodyBefore} <span className="font-mono bg-gray-100 px-1 rounded">/start</span> {t.connectTelegramBodyAfter}
                </div>
                {telegramError && <p className="text-xs text-red-500 mb-2">{telegramError}</p>}
                <button onClick={connectTelegram} disabled={telegramConnecting}
                  className="flex items-center justify-center gap-2 w-full bg-[#1C2056] text-white rounded-xl py-3 text-sm font-medium">
                  {telegramConnecting ? t.disconnectingLabel : t.connectTelegramBotButton}
                </button>
              </>
            )}
          </div>
        )}
```

(reusing `disconnectingLabel` as a generic "working..." label for the connecting state too, rather than adding a third near-duplicate string — matches this codebase's existing preference for reusing an existing loading-label key where the meaning is close enough, e.g. `kaspiRegeneratingLabel` vs `kaspiDisconnectingLabel` are kept distinct only because their button copy differs meaningfully; here both buttons already say "..." so one shared label is fine).

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/profile/notifications/page.tsx src/lib/i18n/profileAccounts.ts
git commit -m "feat(telegram-notify): wire real connect/disconnect UI"
```

---

### Task 8: Final verification and deploy checklist

**Files:** none new — verification only.

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all tests pass (existing suite + Task 2's 5 new `parseStartToken` tests).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds, with `/api/telegram-connect/init`, `/api/telegram-connect/disconnect`, `/api/telegram-notify-webhook`, `/api/telegram-notify-webhook/setup` all present in the route list.

- [ ] **Step 4: Push**

```bash
git push origin main
```

- [ ] **Step 5: Remaining steps for the user to run themselves, AFTER this deploys** (not part of this plan's code — recorded here so nothing is forgotten):
  1. Add `CUSTOMER_TELEGRAM_BOT_TOKEN`, `TELEGRAM_NOTIFY_WEBHOOK_SECRET`, `CUSTOMER_TELEGRAM_BOT_USERNAME` to Vercel's Production environment variables (values already sit in `.env.local`), then trigger a redeploy.
  2. Once redeployed, call `POST https://www.invoices.kz/api/telegram-notify-webhook/setup` with header `x-internal-secret: <TELEGRAM_NOTIFY_WEBHOOK_SECRET>` once, to register the webhook with Telegram.
  3. Live-test: open `/profile/notifications`, turn on the Telegram toggle, click "Подключить", confirm the bot replies "✅ Telegram подключён...", then trigger a real event (e.g. view a sent invoice's public link) and confirm the Telegram message arrives alongside the email.
