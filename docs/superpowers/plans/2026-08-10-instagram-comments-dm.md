# Instagram Comments & DM Auto-Reply Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically reply to Instagram comments and DMs — instantly via keyword-matched templates, or via an AI-generated draft that requires Telegram approval before it's ever published — with every AI reply logged for later review.

**Architecture:** A new Meta webhook (`/api/instagram/webhook`) receives comment/DM events, checks a global pause switch and a dedup key, then either sends a matched template immediately or asks Claude (via the Anthropic API — a new capability for this codebase, nothing here previously called an LLM API server-side) to draft a reply and pushes it to the existing admin Telegram bot for approval. The existing `/api/instagram/telegram-webhook` gets extended (not replaced) with the new approval buttons. A new admin-only page under `/profile` manages templates, the pause switch, and the reply log.

**Tech Stack:** Next.js App Router, Supabase (Postgres, service-role only for new tables), Telegram Bot API (existing admin bot), Instagram API with Instagram Login (`graph.instagram.com`), Anthropic Messages API (new), Vitest.

## Global Constraints

- Template match → send immediately, no approval needed. No template match → generate an AI draft → send to Telegram for approval (buttons: Send / Edit / Skip). AI-generated text is never auto-published — only a human "Send" click publishes it.
- Applies to comments AND DMs, on ALL posts on the account — not scoped to rows already in `instagram_drafts`. Meta delivers webhook events account-wide.
- `instagram_autoreply_settings.paused` is a single-row global kill switch, checked FIRST before any template/AI logic. When paused, the incoming event is still logged (so nothing silently vanishes) but nothing is sent.
- `instagram_auto_replies.external_id` (the Instagram comment/message ID) must be unique and checked before processing, to no-op cleanly on Meta's duplicate webhook redelivery.
- The templates page and the AI-reply log are on ONE new page under `/profile`, gated to `profiles.is_admin = true` only — copy the exact gate already used on `/admin` (`src/app/admin/page.tsx:36-38`), don't invent a new pattern.
- The new webhook (`/api/instagram/webhook`) is a separate route from the existing `/api/instagram/telegram-webhook` — different platform, different verification (Meta's `X-Hub-Signature-256` HMAC + a GET `hub.challenge` handshake, vs. Telegram's static secret header).
- No Meta App Review is needed — confirmed live on 2026-08-10 that the required permissions (`instagram_business_basic`, `instagram_business_manage_comments`, `instagram_business_manage_messages`) are already configured for the app's "Instagram API" use case and the account already has the Instagram Tester role. Manual steps remaining on Meta's side (generating a new access token, filling in the webhook URL/verify token fields, publishing the app) are the user's own post-deploy steps — see Task 8.

---

### Task 1: Database migration — three new tables

**Files:**
- Migration (via Supabase MCP `apply_migration`, no local migration file in this codebase's convention — see how `admin_telegram_inbox` was added directly this session)

**Interfaces:**
- Produces: `instagram_reply_templates(id, trigger_words, reply_text, created_at)`, `instagram_autoreply_settings(id, paused, updated_at)` with exactly one row, `instagram_auto_replies(id, source, external_id, reply_target, from_username, incoming_text, reply_text, reply_type, template_id, status, telegram_chat_id, telegram_message_id, created_at, resolved_at)`. All later tasks read/write these.

- [ ] **Step 1: Apply the migration**

Run via the Supabase MCP `apply_migration` tool (project `terjitbqgrjlqezyydql`), name `add_instagram_autoreply_tables`, with this SQL:

```sql
create table public.instagram_reply_templates (
  id uuid primary key default gen_random_uuid(),
  trigger_words text[] not null,
  reply_text text not null,
  created_at timestamptz not null default now()
);

create table public.instagram_autoreply_settings (
  id uuid primary key default gen_random_uuid(),
  paused boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.instagram_autoreply_settings (paused) values (false);

create table public.instagram_auto_replies (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('comment', 'dm')),
  external_id text not null unique,
  -- Where the reply actually gets sent: the comment's own ID for comments
  -- (same value as external_id there), but the SENDER's IG-scoped user ID
  -- for DMs — external_id for a DM is the message ID (needed for dedup),
  -- which is not usable as a send-message recipient. Kept as a separate
  -- column so Task 6's later "Send" action has what it needs.
  reply_target text not null,
  from_username text,
  incoming_text text not null,
  reply_text text,
  reply_type text not null check (reply_type in ('template', 'ai')),
  template_id uuid references public.instagram_reply_templates(id),
  status text not null check (status in ('sent', 'pending_review', 'sent_after_review', 'skipped', 'paused')),
  telegram_chat_id text,
  telegram_message_id bigint,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.instagram_reply_templates enable row level security;
alter table public.instagram_autoreply_settings enable row level security;
alter table public.instagram_auto_replies enable row level security;
-- Service-role only, same posture as kaspi_connections/wallet_ledger/admin_telegram_inbox —
-- these tables are only ever written to by the webhook and the admin-only page's API routes
-- (both server-side, service role), never read directly by a client.
```

- [ ] **Step 2: Verify**

Via Supabase MCP `execute_sql`: `select count(*) from instagram_autoreply_settings;` — expect `1` (the seeded row). `select * from instagram_reply_templates limit 1;` and `select * from instagram_auto_replies limit 1;` — expect empty results with no error (confirms the tables and columns exist as specified).

No git commit for this task (no local file changes — matches how `admin_telegram_inbox` was added this session).

---

### Task 2: Template-matching logic (`src/lib/instagramReplyMatch.ts`)

**Files:**
- Create: `src/lib/instagramReplyMatch.ts`
- Test: `src/lib/instagramReplyMatch.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `findMatchingTemplate(incomingText: string, templates: { id: string; trigger_words: string[]; reply_text: string }[]): { id: string; reply_text: string } | null` — consumed by Task 5 (the webhook route).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { findMatchingTemplate } from './instagramReplyMatch'

const templates = [
  { id: 't1', trigger_words: ['цена', 'сколько стоит'], reply_text: 'Актуальные цены — в шапке профиля.' },
  { id: 't2', trigger_words: ['доставка'], reply_text: 'Доставка по всему Казахстану, 1-3 дня.' },
]

describe('findMatchingTemplate', () => {
  it('matches a single trigger word case-insensitively', () => {
    const result = findMatchingTemplate('А сколько это стоит?', templates)
    expect(result?.id).toBe('t1')
  })

  it('matches a multi-word trigger phrase', () => {
    const result = findMatchingTemplate('Здравствуйте, сколько стоит доставка?', templates)
    // Both templates' triggers appear; the first template in list order wins.
    expect(result?.id).toBe('t1')
  })

  it('matches regardless of surrounding punctuation', () => {
    const result = findMatchingTemplate('Доставка?!', templates)
    expect(result?.id).toBe('t2')
  })

  it('returns null when nothing matches', () => {
    const result = findMatchingTemplate('Красивый пост!', templates)
    expect(result).toBeNull()
  })

  it('returns null for an empty template list', () => {
    const result = findMatchingTemplate('сколько стоит', [])
    expect(result).toBeNull()
  })

  it('is case-insensitive on trigger words themselves', () => {
    const upperTemplates = [{ id: 't3', trigger_words: ['ЦЕНА'], reply_text: 'x' }]
    const result = findMatchingTemplate('какая цена?', upperTemplates)
    expect(result?.id).toBe('t3')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/instagramReplyMatch.test.ts`
Expected: FAIL — `Cannot find module './instagramReplyMatch'`

- [ ] **Step 3: Write the implementation**

```ts
// Plain case-insensitive substring matching against each template's trigger
// words/phrases — first template in list order wins on a tie. Deliberately
// simple (no stemming, no fuzzy matching): the spec's own tradeoff is
// "predictable but may miss unusual phrasing," with unmatched messages
// falling through to the AI-draft path instead of a bad auto-send.
export function findMatchingTemplate(
  incomingText: string,
  templates: { id: string; trigger_words: string[]; reply_text: string }[]
): { id: string; reply_text: string } | null {
  const normalized = incomingText.toLowerCase()
  for (const template of templates) {
    const hasMatch = template.trigger_words.some(word => normalized.includes(word.toLowerCase()))
    if (hasMatch) {
      return { id: template.id, reply_text: template.reply_text }
    }
  }
  return null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/instagramReplyMatch.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/instagramReplyMatch.ts src/lib/instagramReplyMatch.test.ts
git commit -m "feat(ig-autoreply): add keyword-based template matching"
```

---

### Task 3: Instagram reply-sending functions

**Files:**
- Modify: `src/lib/instagram.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `replyToComment(commentId: string, message: string): Promise<void>`, `sendDirectMessage(recipientId: string, message: string): Promise<void>` — both consumed by Task 5 (the webhook route) and Task 6 (the Telegram approval callback).

- [ ] **Step 1: Add the two functions**

Add to the end of `src/lib/instagram.ts` (after the existing `getMediaInsights`):

```ts
// Replies to a comment on any post on the account (not just ones published
// through our own draft-approval flow) — Instagram's own comment-reply
// endpoint, scoped by the comment's own ID rather than a media ID.
export async function replyToComment(commentId: string, message: string): Promise<void> {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN
  if (!accessToken) throw new Error('Instagram not configured')

  const res = await fetch(`${GRAPH_API}/${commentId}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: accessToken }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error?.message || 'Failed to reply to comment')
  }
}

// Sends a direct message reply. `recipientId` is the sender's Instagram-
// scoped user ID from the incoming webhook event, not a username.
export async function sendDirectMessage(recipientId: string, message: string): Promise<void> {
  const igUserId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN
  if (!igUserId || !accessToken) throw new Error('Instagram not configured')

  const res = await fetch(`${GRAPH_API}/${igUserId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: message },
      access_token: accessToken,
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error?.message || 'Failed to send direct message')
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/instagram.ts
git commit -m "feat(ig-autoreply): add comment reply and DM send functions"
```

---

### Task 4: AI reply generation (`src/lib/instagramAiReply.ts`)

**Files:**
- Create: `src/lib/instagramAiReply.ts`
- Modify: `package.json` (new dependency)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `generateAiReply(params: { incomingText: string; fromUsername: string; postCaption?: string }): Promise<string>` — consumed by Task 5 (the webhook route).

**Note:** no existing code in this repo calls an LLM API from a deployed route — every prior "AI-generated" post caption was written by Claude Code interactively, then posted via `/api/instagram/draft`. This task adds that capability for the first time, using the Anthropic Messages API directly.

- [ ] **Step 1: Install the SDK**

Run: `npm install @anthropic-ai/sdk`

- [ ] **Step 2: Write the implementation**

Create `src/lib/instagramAiReply.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk'

// No test file: this is a live network call to a paid API, matching this
// codebase's existing convention (e.g. sendTelegramNotification in
// telegramNotify.ts is likewise untested — only pure logic like
// parseStartToken gets a colocated test).
export async function generateAiReply(params: {
  incomingText: string
  fromUsername: string
  postCaption?: string
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const client = new Anthropic({ apiKey })

  const contextLine = params.postCaption
    ? `Комментарий оставлен под постом с подписью: "${params.postCaption}"`
    : 'Это личное сообщение (DM), не привязано к конкретному посту.'

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Ты отвечаешь от имени бизнес-аккаунта в Instagram (invoices.kz — сервис для выставления счетов в Казахстане). ${contextLine}

Пользователь ${params.fromUsername} написал: "${params.incomingText}"

Напиши короткий, вежливый, дружелюбный ответ на русском языке (2-3 предложения максимум). Не придумывай факты о ценах, сроках или функциях, которых ты не знаешь — в таком случае вежливо предложи написать в директ для уточнения деталей. Верни только текст ответа, без кавычек и пояснений.`,
    }],
  })

  const textBlock = message.content.find(block => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('AI reply generation returned no text')
  }
  return textBlock.text.trim()
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/instagramAiReply.ts package.json package-lock.json
git commit -m "feat(ig-autoreply): add AI reply generation via Anthropic API"
```

---

### Task 5: The Meta webhook (`/api/instagram/webhook`)

**Files:**
- Create: `src/app/api/instagram/webhook/route.ts`

**Interfaces:**
- Consumes: `findMatchingTemplate` (Task 2), `replyToComment`/`sendDirectMessage` (Task 3), `generateAiReply` (Task 4).
- Produces: the live endpoint Meta calls for both the verification handshake and real events. Task 8's manual steps register this URL with Meta.

- [ ] **Step 1: Write the route**

Create `src/app/api/instagram/webhook/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { findMatchingTemplate } from '@/lib/instagramReplyMatch'
import { replyToComment, sendDirectMessage } from '@/lib/instagram'
import { generateAiReply } from '@/lib/instagramAiReply'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Meta's one-time verification handshake when the webhook URL is registered
// in the App dashboard (see Task 8) — echoes hub.challenge back once the
// verify token matches, proving we control this URL.
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('hub.mode')
  const token = req.nextUrl.searchParams.get('hub.verify_token')
  const challenge = req.nextUrl.searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.IG_WEBHOOK_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
}

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.INSTAGRAM_APP_SECRET
  if (!appSecret || !signatureHeader) return false
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const expectedBuf = Buffer.from(expected)
  const actualBuf = Buffer.from(signatureHeader)
  if (expectedBuf.length !== actualBuf.length) return false
  return crypto.timingSafeEqual(expectedBuf, actualBuf)
}

async function handleIncoming(params: {
  source: 'comment' | 'dm'
  externalId: string
  fromUsername: string
  incomingText: string
  postCaption?: string
  // Where the reply goes: a comment ID for comments, a sender's IG-scoped
  // user ID for DMs.
  replyTarget: string
}) {
  // Dedup first — Meta can redeliver the same event.
  const { data: existing } = await supabase
    .from('instagram_auto_replies')
    .select('id')
    .eq('external_id', params.externalId)
    .maybeSingle()
  if (existing) return

  const { data: settings } = await supabase
    .from('instagram_autoreply_settings')
    .select('paused')
    .single()

  if (settings?.paused) {
    await supabase.from('instagram_auto_replies').insert({
      source: params.source,
      external_id: params.externalId,
      reply_target: params.replyTarget,
      from_username: params.fromUsername,
      incoming_text: params.incomingText,
      reply_type: 'template',
      status: 'paused',
    })
    return
  }

  const { data: templates } = await supabase
    .from('instagram_reply_templates')
    .select('id, trigger_words, reply_text')

  const match = findMatchingTemplate(params.incomingText, templates || [])

  if (match) {
    if (params.source === 'comment') {
      await replyToComment(params.replyTarget, match.reply_text)
    } else {
      await sendDirectMessage(params.replyTarget, match.reply_text)
    }
    await supabase.from('instagram_auto_replies').insert({
      source: params.source,
      external_id: params.externalId,
      reply_target: params.replyTarget,
      from_username: params.fromUsername,
      incoming_text: params.incomingText,
      reply_text: match.reply_text,
      reply_type: 'template',
      template_id: match.id,
      status: 'sent',
      resolved_at: new Date().toISOString(),
    })
    return
  }

  // No template — draft with AI, send to Telegram for approval. Never
  // published automatically.
  const draftReply = await generateAiReply({
    incomingText: params.incomingText,
    fromUsername: params.fromUsername,
    postCaption: params.postCaption,
  })

  const { data: inserted } = await supabase
    .from('instagram_auto_replies')
    .insert({
      source: params.source,
      external_id: params.externalId,
      reply_target: params.replyTarget,
      from_username: params.fromUsername,
      incoming_text: params.incomingText,
      reply_text: draftReply,
      reply_type: 'ai',
      status: 'pending_review',
    })
    .select()
    .single()
  if (!inserted) return

  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return

  const sourceLabel = params.source === 'comment' ? 'комментарий' : 'сообщение (DM)'
  const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: `💬 Новый ${sourceLabel} от <b>${params.fromUsername}</b>:\n"${params.incomingText}"\n\n<b>Черновик ответа:</b>\n${draftReply}`,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Отправить', callback_data: `ig_reply_send:${inserted.id}` },
          { text: '❌ Пропустить', callback_data: `ig_reply_skip:${inserted.id}` },
        ]],
      },
    }),
  })
  const tgData = await tgRes.json()
  if (tgData.ok) {
    await supabase
      .from('instagram_auto_replies')
      .update({ telegram_chat_id: String(chatId), telegram_message_id: tgData.result.message_id })
      .eq('id', inserted.id)
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-hub-signature-256')
  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const payload = JSON.parse(rawBody)

  for (const entry of payload.entry || []) {
    // Comments arrive under `changes` with field "comments".
    for (const change of entry.changes || []) {
      if (change.field !== 'comments') continue
      const value = change.value
      if (!value?.id || !value?.text) continue
      await handleIncoming({
        source: 'comment',
        externalId: value.id,
        fromUsername: value.from?.username || 'unknown',
        incomingText: value.text,
        // Comment payloads don't carry the post's caption directly — fetching
        // it would need a second call to `${GRAPH_API}/${value.media.id}?fields=caption`.
        // Skipped for v1 (postCaption is optional in generateAiReply, and the
        // AI prompt already handles its absence) — left as a real follow-up,
        // not built here, per YAGNI until it's actually needed.
        replyTarget: value.id,
      })
    }

    // DMs arrive under `messaging`.
    for (const messaging of entry.messaging || []) {
      const msg = messaging.message
      if (!msg?.mid || !msg?.text || msg.is_echo) continue
      await handleIncoming({
        source: 'dm',
        externalId: msg.mid,
        fromUsername: messaging.sender?.id || 'unknown',
        incomingText: msg.text,
        replyTarget: messaging.sender?.id,
      })
    }
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/instagram/webhook/route.ts
git commit -m "feat(ig-autoreply): add Meta webhook for comments and DMs"
```

- [ ] **Step 4: Flag the payload shape for live verification**

The `comments`/`messaging` field names above (`value.id`, `value.text`, `value.from.username`, `messaging.message.mid`,
`messaging.sender.id`) are based on Meta's documented Instagram webhook shape but have **not** been verified against
a real delivered payload in this codebase. Once Task 8's webhook registration is done, use the Meta App dashboard's
"Test" button (Webhooks page, next to the `comments`/`messaging` subscription) to send a real test event, check the
Vercel function logs for the actual `payload.entry[...]` shape received, and adjust the field paths in this route if
they differ. This is expected verification work, not a sign the implementation above is wrong — note any adjustment
made in the task report.

---

### Task 6: Extend the Telegram approval webhook

**Files:**
- Modify: `src/app/api/instagram/telegram-webhook/route.ts`

**Interfaces:**
- Consumes: `replyToComment`/`sendDirectMessage` (Task 3).
- Produces: handling for `ig_reply_send:<id>` / `ig_reply_skip:<id>` callback data, and a text-reply case for editing an AI draft before sending.

- [ ] **Step 1: Add the edit-draft text-reply case**

This mirrors the existing draft-feedback case but for editing an AI reply. Change:

```ts
  const msg = update.message
  if (msg && typeof msg.text === 'string' && msg.reply_to_message?.message_id) {
    if (String(msg.chat?.id) !== process.env.TELEGRAM_CHAT_ID) {
      return NextResponse.json({ ok: true })
    }
    const { data: draft } = await supabase
      .from('instagram_drafts')
      .select('id, status')
      .eq('telegram_message_id', msg.reply_to_message.message_id)
      .maybeSingle()
    if (draft && draft.status === 'pending') {
      await supabase.from('instagram_drafts').update({ feedback: msg.text }).eq('id', draft.id)
      await telegram('sendMessage', {
        chat_id: msg.chat.id,
        reply_to_message_id: msg.message_id,
        text: '📝 Записал — учту в следующей версии поста. Эта версия остаётся на ваше решение (Опубликовать/Отклонить).',
      })
    }
    return NextResponse.json({ ok: true })
  }
```

to:

```ts
  const msg = update.message
  if (msg && typeof msg.text === 'string' && msg.reply_to_message?.message_id) {
    if (String(msg.chat?.id) !== process.env.TELEGRAM_CHAT_ID) {
      return NextResponse.json({ ok: true })
    }
    const { data: draft } = await supabase
      .from('instagram_drafts')
      .select('id, status')
      .eq('telegram_message_id', msg.reply_to_message.message_id)
      .maybeSingle()
    if (draft && draft.status === 'pending') {
      await supabase.from('instagram_drafts').update({ feedback: msg.text }).eq('id', draft.id)
      await telegram('sendMessage', {
        chat_id: msg.chat.id,
        reply_to_message_id: msg.message_id,
        text: '📝 Записал — учту в следующей версии поста. Эта версия остаётся на ваше решение (Опубликовать/Отклонить).',
      })
      return NextResponse.json({ ok: true })
    }

    // A text reply to a pending AI-drafted comment/DM reply overwrites the
    // draft's text before it's sent — the original Send/Skip buttons stay
    // attached to the earlier message and still work against the updated row.
    const { data: pendingReply } = await supabase
      .from('instagram_auto_replies')
      .select('id, status')
      .eq('telegram_message_id', msg.reply_to_message.message_id)
      .maybeSingle()
    if (pendingReply && pendingReply.status === 'pending_review') {
      await supabase.from('instagram_auto_replies').update({ reply_text: msg.text }).eq('id', pendingReply.id)
      await telegram('sendMessage', {
        chat_id: msg.chat.id,
        reply_to_message_id: msg.message_id,
        text: '✏️ Текст ответа обновлён. Нажмите «✅ Отправить» на исходном сообщении, чтобы опубликовать новую версию.',
      })
    }
    return NextResponse.json({ ok: true })
  }
```

- [ ] **Step 2: Add the callback-button case**

Change:

```ts
  const [action, draftId] = cb.data.split(':')
  if (!draftId || (action !== 'ig_publish' && action !== 'ig_reject')) {
    return NextResponse.json({ ok: true })
  }

  const { data: draft } = await supabase.from('instagram_drafts').select('*').eq('id', draftId).single()
```

to:

```ts
  const [action, entityId] = cb.data.split(':')

  if (action === 'ig_reply_send' || action === 'ig_reply_skip') {
    const { data: reply } = await supabase.from('instagram_auto_replies').select('*').eq('id', entityId).single()
    if (!reply || reply.status !== 'pending_review') {
      await telegram('answerCallbackQuery', { callback_query_id: cb.id, text: 'Уже обработано' })
      return NextResponse.json({ ok: true })
    }

    if (action === 'ig_reply_skip') {
      await supabase
        .from('instagram_auto_replies')
        .update({ status: 'skipped', resolved_at: new Date().toISOString() })
        .eq('id', entityId)
      await telegram('answerCallbackQuery', { callback_query_id: cb.id, text: 'Пропущено' })
      await telegram('editMessageText', {
        chat_id: cb.message.chat.id,
        message_id: cb.message.message_id,
        text: `${cb.message.text}\n\n⏭️ Пропущено`,
        parse_mode: 'HTML',
      })
      return NextResponse.json({ ok: true })
    }

    try {
      if (reply.source === 'comment') {
        await replyToComment(reply.reply_target, reply.reply_text)
      } else {
        await sendDirectMessage(reply.reply_target, reply.reply_text)
      }
      await supabase
        .from('instagram_auto_replies')
        .update({ status: 'sent_after_review', resolved_at: new Date().toISOString() })
        .eq('id', entityId)
      await telegram('answerCallbackQuery', { callback_query_id: cb.id, text: 'Отправлено!' })
      await telegram('editMessageText', {
        chat_id: cb.message.chat.id,
        message_id: cb.message.message_id,
        text: `${cb.message.text}\n\n✅ Отправлено`,
        parse_mode: 'HTML',
      })
    } catch (err: any) {
      await telegram('answerCallbackQuery', { callback_query_id: cb.id, text: 'Ошибка отправки', show_alert: true })
      await telegram('editMessageText', {
        chat_id: cb.message.chat.id,
        message_id: cb.message.message_id,
        text: `${cb.message.text}\n\n⚠️ Ошибка: ${err.message}`,
        parse_mode: 'HTML',
      })
    }
    return NextResponse.json({ ok: true })
  }

  const draftId = entityId
  if (!draftId || (action !== 'ig_publish' && action !== 'ig_reject')) {
    return NextResponse.json({ ok: true })
  }

  const { data: draft } = await supabase.from('instagram_drafts').select('*').eq('id', draftId).single()
```

Note: `reply.reply_target` is the comment ID (for comments) or the sender's IG-scoped user ID (for DMs) — the column Task 1 added specifically because it differs from `external_id` for DMs (the dedup key there is the message ID, not something usable as a send-message recipient).

- [ ] **Step 3: Add the import**

Change:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { publishToInstagram } from '@/lib/instagram'
```

to:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { publishToInstagram, replyToComment, sendDirectMessage } from '@/lib/instagram'
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/instagram/telegram-webhook/route.ts
git commit -m "feat(ig-autoreply): handle Send/Skip and draft-edit in the Telegram webhook"
```

---

### Task 7: Admin page — templates, pause switch, reply log

**Files:**
- Create: `src/app/profile/instagram-replies/page.tsx`
- Create: `src/app/api/instagram/replies/templates/route.ts` (list/create/delete templates)
- Create: `src/app/api/instagram/replies/settings/route.ts` (get/update pause switch)
- Create: `src/app/api/instagram/replies/log/route.ts` (list recent log entries)

**Note:** `instagram_auto_replies` has RLS enabled with no client policies (service-role only, per Task 1) — the page
cannot read it via a direct client-side `supabase.from(...)` call the way some other `/profile` pages read
client-scoped tables. It goes through this new authenticated route instead, same as templates/settings.

**Interfaces:**
- Consumes: nothing from earlier tasks directly (reads the tables from Task 1 via its own API routes, following this codebase's pattern of authenticated API routes backing admin pages rather than direct client-side Supabase queries against service-role-only tables).

- [ ] **Step 1: Templates API route**

Create `src/app/api/instagram/replies/templates/route.ts`:

```ts
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

async function requireAdmin(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  return profile?.is_admin ? user : null
}

export async function GET(req: NextRequest) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('instagram_reply_templates')
    .select('*')
    .order('created_at', { ascending: false })
  return NextResponse.json({ templates: data || [] })
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { trigger_words, reply_text } = await req.json()
  if (!Array.isArray(trigger_words) || trigger_words.length === 0 || !reply_text) {
    return NextResponse.json({ error: 'trigger_words (non-empty array) and reply_text are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('instagram_reply_templates')
    .insert({ trigger_words, reply_text })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data })
}

export async function DELETE(req: NextRequest) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await supabase.from('instagram_reply_templates').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Settings (pause switch) API route**

Create `src/app/api/instagram/replies/settings/route.ts`:

```ts
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

async function requireAdmin(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  return profile?.is_admin ? user : null
}

export async function GET(req: NextRequest) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase.from('instagram_autoreply_settings').select('id, paused').single()
  return NextResponse.json({ paused: data?.paused ?? false })
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { paused } = await req.json()
  if (typeof paused !== 'boolean') return NextResponse.json({ error: 'paused (boolean) required' }, { status: 400 })

  const { data: existing } = await supabase.from('instagram_autoreply_settings').select('id').single()
  if (!existing) return NextResponse.json({ error: 'Settings row not found' }, { status: 500 })

  await supabase
    .from('instagram_autoreply_settings')
    .update({ paused, updated_at: new Date().toISOString() })
    .eq('id', existing.id)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Log API route**

Create `src/app/api/instagram/replies/log/route.ts`:

```ts
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

async function requireAdmin(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  return profile?.is_admin ? user : null
}

export async function GET(req: NextRequest) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('instagram_auto_replies')
    .select('id, source, from_username, incoming_text, reply_text, status, created_at')
    .order('created_at', { ascending: false })
    .limit(50)
  return NextResponse.json({ log: data || [] })
}
```

- [ ] **Step 4: The page**

Create `src/app/profile/instagram-replies/page.tsx`:

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import { backLabel } from '@/lib/a11yLabels'

type Template = { id: string; trigger_words: string[]; reply_text: string }
type LogEntry = {
  id: string
  source: string
  from_username: string | null
  incoming_text: string
  reply_text: string | null
  reply_type: string
  status: string
  created_at: string
}

export default function InstagramReplies() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState<Template[]>([])
  const [log, setLog] = useState<LogEntry[]>([])
  const [paused, setPaused] = useState(false)
  const [newWords, setNewWords] = useState('')
  const [newReply, setNewReply] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) { router.push('/dashboard'); return }

    const headers = await authHeader()
    const [templatesRes, settingsRes, logRes] = await Promise.all([
      fetch('/api/instagram/replies/templates', { headers }),
      fetch('/api/instagram/replies/settings', { headers }),
      fetch('/api/instagram/replies/log', { headers }),
    ])
    const templatesData = await templatesRes.json()
    const settingsData = await settingsRes.json()
    const logData = await logRes.json()
    setTemplates(templatesData.templates || [])
    setPaused(settingsData.paused || false)
    setLog(logData.log || [])
    setLoading(false)
  }

  async function togglePause() {
    const next = !paused
    setPaused(next)
    const headers = await authHeader()
    await fetch('/api/instagram/replies/settings', { method: 'POST', headers, body: JSON.stringify({ paused: next }) })
  }

  async function addTemplate() {
    const words = newWords.split(',').map(w => w.trim()).filter(Boolean)
    if (words.length === 0 || !newReply) return
    setSaving(true)
    const headers = await authHeader()
    await fetch('/api/instagram/replies/templates', {
      method: 'POST', headers, body: JSON.stringify({ trigger_words: words, reply_text: newReply }),
    })
    setNewWords('')
    setNewReply('')
    setSaving(false)
    load()
  }

  async function deleteTemplate(id: string) {
    const headers = await authHeader()
    await fetch('/api/instagram/replies/templates', { method: 'DELETE', headers, body: JSON.stringify({ id }) })
    load()
  }

  if (loading) return <LoadingSpinner />

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/profile')} className="back-btn text-gray-400 text-xl" aria-label={backLabel('ru')}>‹</button>
        <span className="font-semibold text-[#1C2056]">Автоответы Instagram</span>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        <div className="bg-white rounded-2xl shadow-sm p-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-[#1C2056]">Пауза автоответов</div>
            <div className="text-xs text-gray-400">Останавливает и шаблоны, и AI-черновики</div>
          </div>
          <button onClick={togglePause}
            className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${paused ? 'bg-red-500' : 'bg-gray-200'}`}>
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${paused ? 'left-7' : 'left-1'}`}></span>
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="text-sm font-medium text-[#1C2056] mb-3">Шаблоны</div>
          <div className="space-y-2 mb-3">
            {templates.map(t => (
              <div key={t.id} className="border border-gray-100 rounded-xl p-3">
                <div className="text-xs text-gray-400 mb-1">{t.trigger_words.join(', ')}</div>
                <div className="text-sm text-gray-700 mb-2">{t.reply_text}</div>
                <button onClick={() => deleteTemplate(t.id)} className="text-xs text-red-500">Удалить</button>
              </div>
            ))}
          </div>
          <input className="w-full border rounded-lg px-3 py-2 text-sm mb-2" placeholder="Триггер-слова через запятую"
            value={newWords} onChange={e => setNewWords(e.target.value)} />
          <textarea className="w-full border rounded-lg px-3 py-2 text-sm mb-2" placeholder="Текст ответа" rows={2}
            value={newReply} onChange={e => setNewReply(e.target.value)} />
          <button onClick={addTemplate} disabled={saving}
            className="w-full bg-[#1C2056] text-white rounded-xl py-2.5 text-sm font-medium">
            {saving ? 'Сохраняем...' : 'Добавить шаблон'}
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="text-sm font-medium text-[#1C2056] mb-3">Журнал (последние 50)</div>
          <div className="space-y-2">
            {log.map(entry => (
              <div key={entry.id} className="border border-gray-100 rounded-xl p-3 text-xs">
                <div className="text-gray-400 mb-1">{entry.from_username} · {entry.source} · {entry.status}</div>
                <div className="text-gray-700 mb-1">→ {entry.incoming_text}</div>
                {entry.reply_text && <div className="text-gray-500">← {entry.reply_text}</div>}
              </div>
            ))}
            {log.length === 0 && <div className="text-xs text-gray-400">Пока пусто</div>}
          </div>
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/profile/instagram-replies/page.tsx src/app/api/instagram/replies/templates/route.ts src/app/api/instagram/replies/settings/route.ts src/app/api/instagram/replies/log/route.ts
git commit -m "feat(ig-autoreply): add admin page for templates, pause switch, and reply log"
```

---

### Task 8: Final verification, push, and manual setup checklist

**Files:** none new — verification only.

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all tests pass (existing suite + Task 2's 6 new `instagramReplyMatch.ts` tests).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds, with `/api/instagram/webhook`, `/api/instagram/replies/templates`, `/api/instagram/replies/settings`, and `/profile/instagram-replies` all present in the route list.

- [ ] **Step 4: Push**

```bash
git push origin main
```

- [ ] **Step 5: Remaining steps for the user to run themselves, AFTER this deploys** (not part of this plan's code — recorded here so nothing is forgotten):
  1. Get an Anthropic API key (console.anthropic.com) and add `ANTHROPIC_API_KEY` to Vercel Production env vars.
  2. Generate `IG_WEBHOOK_VERIFY_TOKEN` (any random string, e.g. `openssl rand -hex 16`) and add it to Vercel Production env vars.
  3. On the Meta App dashboard (App ID 1763701871429757, "Настройка API для входа в Instagram" page), copy the "Секрет приложения Instagram" value and add it to Vercel Production as `INSTAGRAM_APP_SECRET`.
  4. On that same Meta dashboard page, generate a new Instagram access token (the Instagram Tester role is already assigned) and update `INSTAGRAM_ACCESS_TOKEN` in Vercel Production with it — the old token doesn't carry the new `instagram_business_manage_comments`/`instagram_business_manage_messages` scopes.
  5. Redeploy after adding the env vars above.
  6. Back on the Meta dashboard's Webhooks step: set Callback URL to `https://www.invoices.kz/api/instagram/webhook` and Verify Token to the same value used for `IG_WEBHOOK_VERIFY_TOKEN`, then save — Meta will call the GET handshake immediately.
  7. Publish the Meta App (currently "Не опубликовано") — required for real webhook delivery.
  8. Live-test: comment on a real post with text matching a template you've added on `/profile/instagram-replies` — confirm the reply appears within a few seconds. Then comment with unmatched text — confirm an AI-drafted reply arrives in the admin Telegram chat with Send/Skip buttons, and that pressing Send actually publishes it as a reply.
