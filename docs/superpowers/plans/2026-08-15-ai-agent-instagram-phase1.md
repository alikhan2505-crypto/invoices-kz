# AI-агент (Phase 1: Instagram) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a multi-tenant AI chat-reply agent for Instagram — every invoices.kz user configures their own agent, connects their own Instagram account via real OAuth, and the agent auto-replies their customers (training-mode review first, then autonomous), billed from a dedicated wallet.

**Architecture:** Generalizes the existing single-tenant Instagram bot (`instagramAiReply.ts`, `instagram.ts`, `instagram/webhook/route.ts`) into a multi-tenant one, reusing its proven pieces (AI reply generation, template matching pattern, Telegram notify helper) rather than forking them. New: `ai_agents` config, OAuth per customer, a dedicated wallet (mirrors Kaspi Shop Wallet), and an in-app training-mode review queue.

**Tech Stack:** Next.js (App Router), Supabase (Postgres + `@supabase/supabase-js`), Anthropic SDK (`claude-haiku-4-5-20251001`, already in use), Meta Instagram Platform API (Business Login OAuth + Graph API).

## Global Constraints

- v1: one agent per user (`ai_agents.user_id` has a `unique` constraint at the DB level already).
- The only knowledge source for an agent in v1 is the free-text `business_description` field — no file upload, no RAG.
- Wallet debits only for a real AI-generated reply (`ai_agent_messages.is_ai_generated = true`). A template match never touches the Anthropic API and is never billed.
- Training-mode does not require Telegram — `sendTelegramNotification` is a best-effort bonus nudge only, never a blocker to the agent working.
- This plan is Instagram only. WhatsApp is a separate future plan, not started here.
- Phase 3 (issuing invoices/накладные from the chat, reading Kaspi Shop prices) is explicitly out of scope for every task in this plan.
- The existing single-tenant bot (`instagram_auto_replies`, `instagram_reply_templates`, `instagramAiReply.ts`'s existing caller) must keep working completely unchanged — every task that touches shared code must preserve its exact current behavior.
- Direct-to-main commits, push after every commit (no feature branches, no confirmation prompts).
- Every task ends with `npx tsc --noEmit`. Only pure, no-I/O functions get Vitest coverage — routes, pages, and anything calling a live API (Anthropic, Meta, Supabase) get none, matching this codebase's existing convention (`generateAiReply`, `sendTelegramNotification`, `kaspiShop/wallet.ts` are all untested today).
- All Supabase migrations for this plan are already applied (see below) — no task in this plan writes a migration.

### Migrations already applied (do not redo)

```sql
create table ai_agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id),
  name text not null default 'Ассистент',
  tone text not null default 'friendly',
  business_description text not null default '',
  goal text not null default 'answer_questions',
  collect_name boolean not null default true,
  collect_phone boolean not null default true,
  status text not null default 'training',
  training_started_at timestamptz not null default now(),
  training_message_count integer not null default 0,
  created_at timestamptz not null default now()
);
create table ai_agent_channel_connections (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references ai_agents(id) on delete cascade,
  channel text not null,
  external_account_id text not null,
  external_account_name text,
  access_token_enc text not null,
  status text not null default 'active',
  connected_at timestamptz not null default now(),
  unique (channel, external_account_id)
);
create table ai_agent_conversations (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references ai_agents(id) on delete cascade,
  channel text not null,
  external_thread_id text not null,
  customer_handle text,
  collected_name text,
  collected_phone text,
  created_at timestamptz not null default now(),
  unique (agent_id, channel, external_thread_id)
);
create table ai_agent_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references ai_agent_conversations(id) on delete cascade,
  direction text not null,
  text text not null,
  is_ai_generated boolean not null default false,
  status text not null default 'sent',
  urgent boolean not null default false,
  created_at timestamptz not null default now(),
  external_id text
);
create unique index ai_agent_messages_external_id_idx on ai_agent_messages(external_id) where external_id is not null;
create table ai_agent_reply_templates (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references ai_agents(id) on delete cascade,
  trigger_words text[] not null,
  reply_text text not null,
  channel text,
  created_at timestamptz not null default now()
);
create table ai_agent_wallet (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id),
  balance numeric not null default 0
);
create table ai_agent_wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references ai_agent_wallet(id),
  user_id uuid not null references auth.users(id),
  amount numeric not null,
  type text not null,
  note text,
  created_at timestamptz not null default now()
);
create table ai_agent_wallet_topups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  amount_tenge numeric not null,
  credits integer not null,
  kaspi_operation_id text not null,
  qr_token text,
  payment_link text,
  status text not null default 'pending',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

CREATE OR REPLACE FUNCTION public.debit_ai_agent_wallet_balance(p_user_id uuid, p_amount numeric)
 RETURNS numeric LANGUAGE plpgsql AS $function$
DECLARE new_balance numeric;
BEGIN
  UPDATE ai_agent_wallet SET balance = balance - p_amount WHERE user_id = p_user_id RETURNING balance INTO new_balance;
  RETURN new_balance;
END; $function$;
```

### New environment variables this plan introduces (not yet set anywhere — document, don't wait on)

- `AI_AGENT_ENCRYPTION_KEY` — 32-byte hex key for `encryptAtRest`/`decryptAtRest`, same shape as `KASPI_SHOP_ENCRYPTION_KEY` (generate with `openssl rand -hex 32`).
- `NEXT_PUBLIC_INSTAGRAM_APP_ID` — the existing Meta app's App ID (`1763701871429757`), exposed as a public env var since it's not secret (needed client-side to build the authorize URL... actually it's only ever used server-side in this plan, but named `NEXT_PUBLIC_` for consistency with how this codebase already exposes non-secret app-identity values — implementer should double check whether a plain server-only env var is more correct here and use that instead if so).
- `NEXT_PUBLIC_APP_URL` — if not already set elsewhere in this codebase (check first), `https://www.invoices.kz`, used to build the OAuth `redirect_uri`.
- Reuses the EXISTING `INSTAGRAM_APP_SECRET` (already configured for the single-tenant bot) for both webhook signature verification and the new OAuth token exchange — this plan does not introduce a second Meta app.

---

## Task 1: Agent lifecycle pure logic

**Files:**
- Create: `src/lib/aiAgent/promptContext.ts`
- Create: `src/lib/aiAgent/promptContext.test.ts`
- Create: `src/lib/aiAgent/trainingStatus.ts`
- Create: `src/lib/aiAgent/trainingStatus.test.ts`

**Interfaces:**
- Produces: `BusinessContext` type, `buildBusinessContextLine(ctx: BusinessContext): string` — used by Task 8's webhook dispatch to build the per-agent prompt line.
- Produces: `TrainingState` type, `shouldExitTraining(state: TrainingState, now: Date): boolean`, `TRAINING_DAYS_THRESHOLD = 7`, `TRAINING_MESSAGE_THRESHOLD = 20` — used by Task 9's review-queue route.

- [ ] **Step 1: Write the failing tests**

`src/lib/aiAgent/promptContext.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildBusinessContextLine } from './promptContext'

describe('buildBusinessContextLine', () => {
  it('includes the business name, description, tone label, and goal label', () => {
    const line = buildBusinessContextLine({ name: 'Cvety.kz', tone: 'friendly', description: 'доставка цветов', goal: 'answer_questions' })
    expect(line).toContain('Cvety.kz')
    expect(line).toContain('доставка цветов')
    expect(line).toContain('дружелюбный и тёплый')
    expect(line).toContain('отвечать на вопросы')
  })

  it('omits the description dash when description is empty', () => {
    const line = buildBusinessContextLine({ name: 'Cvety.kz', tone: 'professional', description: '', goal: 'qualify_lead' })
    expect(line).not.toContain(' — .')
    expect(line).toContain('(Cvety.kz)')
  })

  it('maps each tone preset to its own label', () => {
    expect(buildBusinessContextLine({ name: 'X', tone: 'energetic', description: '', goal: 'answer_questions' })).toContain('мотивирующий и энергичный')
    expect(buildBusinessContextLine({ name: 'X', tone: 'caring', description: '', goal: 'answer_questions' })).toContain('заботливый и внимательный')
  })

  it('maps the qualify_lead goal to its own label', () => {
    expect(buildBusinessContextLine({ name: 'X', tone: 'friendly', description: '', goal: 'qualify_lead' })).toContain('квалифицировать заявку')
  })
})
```

`src/lib/aiAgent/trainingStatus.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { shouldExitTraining, TRAINING_DAYS_THRESHOLD, TRAINING_MESSAGE_THRESHOLD } from './trainingStatus'

describe('shouldExitTraining', () => {
  const now = new Date('2026-08-15T12:00:00.000Z')

  it('is false when neither threshold is met', () => {
    expect(shouldExitTraining({ status: 'training', trainingStartedAt: '2026-08-14T12:00:00.000Z', trainingMessageCount: 3 }, now)).toBe(false)
  })

  it('is true once the day threshold is reached', () => {
    const startedAt = new Date(now.getTime() - TRAINING_DAYS_THRESHOLD * 24 * 60 * 60 * 1000).toISOString()
    expect(shouldExitTraining({ status: 'training', trainingStartedAt: startedAt, trainingMessageCount: 0 }, now)).toBe(true)
  })

  it('is true once the message-count threshold is reached, even before the day threshold', () => {
    expect(shouldExitTraining({ status: 'training', trainingStartedAt: '2026-08-15T11:00:00.000Z', trainingMessageCount: TRAINING_MESSAGE_THRESHOLD }, now)).toBe(true)
  })

  it('is false for an agent that is not currently in training', () => {
    const startedAt = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    expect(shouldExitTraining({ status: 'active', trainingStartedAt: startedAt, trainingMessageCount: 999 }, now)).toBe(false)
    expect(shouldExitTraining({ status: 'paused', trainingStartedAt: startedAt, trainingMessageCount: 999 }, now)).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/aiAgent/promptContext.test.ts src/lib/aiAgent/trainingStatus.test.ts`
Expected: FAIL — `Cannot find module './promptContext'` / `'./trainingStatus'`

- [ ] **Step 3: Implement**

`src/lib/aiAgent/promptContext.ts`:
```ts
export type AgentTone = 'friendly' | 'professional' | 'energetic' | 'caring'
export type AgentGoal = 'answer_questions' | 'qualify_lead'

export interface BusinessContext {
  name: string
  tone: AgentTone
  description: string
  goal: AgentGoal
}

const TONE_LABELS: Record<AgentTone, string> = {
  friendly: 'дружелюбный и тёплый',
  professional: 'профессиональный и деловой',
  energetic: 'мотивирующий и энергичный',
  caring: 'заботливый и внимательный',
}

const GOAL_LABELS: Record<AgentGoal, string> = {
  answer_questions: 'отвечать на вопросы клиентов',
  qualify_lead: 'квалифицировать заявку клиента -- понять, что ему нужно, и собрать контактные данные',
}

// Builds the one-sentence business-context line generateAiReply interpolates
// into its prompt (see instagramAiReply.ts's new businessContextLine param,
// Task 2). Only the multi-tenant webhook path (Task 8) calls this -- the
// existing single-tenant invoices.kz bot passes its own unchanged literal
// string straight to generateAiReply instead, so this function changing
// never affects it.
export function buildBusinessContextLine(ctx: BusinessContext): string {
  const desc = ctx.description.trim()
  return `Ты отвечаешь от имени бизнес-аккаунта в Instagram (${ctx.name}${desc ? ' — ' + desc : ''}). Твой стиль общения: ${TONE_LABELS[ctx.tone]}. Твоя основная задача: ${GOAL_LABELS[ctx.goal]}.`
}
```

`src/lib/aiAgent/trainingStatus.ts`:
```ts
export interface TrainingState {
  status: 'training' | 'active' | 'paused'
  trainingStartedAt: string
  trainingMessageCount: number
}

export const TRAINING_DAYS_THRESHOLD = 7
export const TRAINING_MESSAGE_THRESHOLD = 20

// Whichever comes first flips training -> active, per the design spec
// (docs/superpowers/specs/2026-08-15-ai-agent-design.md). Only ever true
// when currently 'training' -- an 'active' or manually 'paused' agent is
// untouched by this check.
export function shouldExitTraining(state: TrainingState, now: Date): boolean {
  if (state.status !== 'training') return false
  const daysElapsed = (now.getTime() - new Date(state.trainingStartedAt).getTime()) / (1000 * 60 * 60 * 24)
  return daysElapsed >= TRAINING_DAYS_THRESHOLD || state.trainingMessageCount >= TRAINING_MESSAGE_THRESHOLD
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/aiAgent/promptContext.test.ts src/lib/aiAgent/trainingStatus.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors

```bash
git add src/lib/aiAgent/promptContext.ts src/lib/aiAgent/promptContext.test.ts src/lib/aiAgent/trainingStatus.ts src/lib/aiAgent/trainingStatus.test.ts
git commit -m "feat(ai-agent): agent lifecycle pure logic -- prompt context line, training-exit threshold"
git push
```

---

## Task 2: Generalize `generateAiReply`'s business context

**Files:**
- Modify: `src/lib/instagramAiReply.ts`
- Modify: `src/app/api/instagram/webhook/route.ts` (only the `generateAiReply(...)` call site)

**Interfaces:**
- Consumes: nothing new from earlier tasks.
- Produces: `generateAiReply`'s params gain a required `businessContextLine: string` field — Task 8 passes `buildBusinessContextLine(...)` (from Task 1) here for the multi-tenant path.

- [ ] **Step 1: Read the live file first**

Open `src/lib/instagramAiReply.ts` and find the line inside the `client.messages.create` call that currently reads:
```ts
      content: `Ты отвечаешь от имени бизнес-аккаунта в Instagram (invoices.kz — сервис для выставления счетов в Казахстане). ${contextLine}${historyBlock}
```
Confirm this exact text is still there before editing (this codebase's `instagramAiReply.ts` has changed several times this session — if the line differs from this, use the CURRENT wording, not this plan's copy of it, for Step 3's caller update, so the existing bot's behavior is preserved exactly either way).

- [ ] **Step 2: Modify the function signature and interpolation**

In `src/lib/instagramAiReply.ts`, change the `generateAiReply` params type to add `businessContextLine: string`:
```ts
export async function generateAiReply(params: {
  incomingText: string
  fromUsername: string
  postCaption?: string
  source: 'comment' | 'dm'
  conversationHistory?: { incoming: string; reply: string }[]
  businessContextLine: string
}): Promise<{ replyText: string; urgent: boolean }> {
```
Replace the hardcoded sentence with the new param:
```ts
      content: `${params.businessContextLine} ${contextLine}${historyBlock}
```
(Leave everything else in the file — `contextLine`, `historyBlock`, `lengthInstruction`, the rest of the prompt, `parseUrgentReply`, `extractTriggerWords` — completely untouched.)

- [ ] **Step 3: Update the one existing caller to preserve exact current behavior**

In `src/app/api/instagram/webhook/route.ts`, find the `generateAiReply({...})` call inside `handleIncoming` and add the new field with the EXACT text that was hardcoded before Step 2:
```ts
    const result = await generateAiReply({
      incomingText: params.incomingText,
      fromUsername: params.fromUsername,
      postCaption: params.postCaption,
      source: params.source,
      conversationHistory,
      businessContextLine: 'Ты отвечаешь от имени бизнес-аккаунта в Instagram (invoices.kz — сервис для выставления счетов в Казахстане).',
    })
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (a missing `businessContextLine` at any other call site would show up here — there should be exactly one call site right now)

- [ ] **Step 5: Commit**

```bash
git add src/lib/instagramAiReply.ts src/app/api/instagram/webhook/route.ts
git commit -m "feat(ai-agent): parameterize generateAiReply's business context, preserve existing bot's exact prompt"
git push
```

---

## Task 3: Per-connection Instagram credentials

**Files:**
- Modify: `src/lib/instagram.ts` (only `replyToComment` and `sendDirectMessage`)

**Interfaces:**
- Produces: `InstagramApiError` (an `Error` subclass carrying the HTTP `status`), `replyToComment(commentId, message, credentials?: { accessToken: string })`, `sendDirectMessage(recipientId, message, credentials?: { igUserId: string; accessToken: string })` — Task 8 and Task 9 catch `InstagramApiError` specifically to detect a 401 (expired/revoked token) and mark the connection accordingly; the existing single-tenant caller keeps calling both functions with no third argument and only ever does `console.error(err.message)` on failure, which still works unchanged since `InstagramApiError extends Error`.

- [ ] **Step 1: Read the live file, confirm current signatures**

Open `src/lib/instagram.ts`, confirm `replyToComment(commentId: string, message: string)` and `sendDirectMessage(recipientId: string, message: string)` still read `process.env.INSTAGRAM_ACCESS_TOKEN`/`INSTAGRAM_BUSINESS_ACCOUNT_ID` directly with no way to override — this task adds an optional override, it does not change any other function in this file (`publishToInstagram`, `getMediaInsights` stay untouched, they're single-tenant-only and out of scope for this plan).

- [ ] **Step 2: Add optional per-call credentials and a status-carrying error**

```ts
// Thrown instead of a bare Error so callers that need to distinguish "the
// token is dead" (401 -- Task 8/9 mark the connection token_expired) from
// any other failure (transient, malformed request, etc.) can do so without
// parsing error message text. Still an Error, so the existing
// single-tenant caller's `console.error(err.message)` handling needs no
// changes.
export class InstagramApiError extends Error {
  constructor(message: string, public status: number) {
    super(message)
    this.name = 'InstagramApiError'
  }
}

export async function replyToComment(commentId: string, message: string, credentials?: { accessToken: string }): Promise<void> {
  const accessToken = credentials?.accessToken ?? process.env.INSTAGRAM_ACCESS_TOKEN
  if (!accessToken) throw new Error('Instagram not configured')

  const res = await fetch(`${GRAPH_API}/${commentId}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: accessToken }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new InstagramApiError(data.error?.message || 'Failed to reply to comment', res.status)
  }
}

export async function sendDirectMessage(recipientId: string, message: string, credentials?: { igUserId: string; accessToken: string }): Promise<void> {
  const igUserId = credentials?.igUserId ?? process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID
  const accessToken = credentials?.accessToken ?? process.env.INSTAGRAM_ACCESS_TOKEN
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
    throw new InstagramApiError(data.error?.message || 'Failed to send direct message', res.status)
  }
}
```
(Body logic is unchanged from today — only the `accessToken`/`igUserId` resolution line changes, from a bare `process.env.X` read to `credentials?.X ?? process.env.X`. The existing single-tenant caller passes no third argument anywhere, so `credentials` is `undefined` there and both functions resolve to today's exact env-var values, unchanged behavior.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/instagram.ts
git commit -m "feat(ai-agent): optional per-call Instagram credentials on replyToComment/sendDirectMessage"
git push
```

---

## Task 4: Encryption and OAuth state helpers

**Files:**
- Create: `src/lib/aiAgent/connection.ts`
- Create: `src/lib/aiAgent/oauthState.ts`
- Create: `src/lib/aiAgent/oauthState.test.ts`

**Interfaces:**
- Consumes: `encryptAtRest`/`decryptAtRest` from `src/lib/kaspiPay/crypto.ts` (existing, read-only reuse).
- Produces: `getKey(): string` (throws if `AI_AGENT_ENCRYPTION_KEY` unset) — used by Task 6 (OAuth callback) and Task 9 (decrypting a token to send a reply). `createOAuthState(userId: string): string`, `verifyOAuthState(state: string): { userId: string } | null` — used by Task 6.

- [ ] **Step 1: Write the failing test**

`src/lib/aiAgent/oauthState.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createOAuthState, verifyOAuthState } from './oauthState'

describe('createOAuthState / verifyOAuthState', () => {
  beforeEach(() => {
    process.env.AI_AGENT_ENCRYPTION_KEY = 'a'.repeat(64) // 32 bytes hex, matches AES-256 key length used elsewhere in this codebase
  })
  afterEach(() => {
    delete process.env.AI_AGENT_ENCRYPTION_KEY
    vi.useRealTimers()
  })

  it('round-trips the user id through a created state', () => {
    const state = createOAuthState('user-123')
    expect(verifyOAuthState(state)).toEqual({ userId: 'user-123' })
  })

  it('rejects a tampered state', () => {
    const state = createOAuthState('user-123')
    const tampered = state.slice(0, -1) + (state.endsWith('a') ? 'b' : 'a')
    expect(verifyOAuthState(tampered)).toBeNull()
  })

  it('rejects a malformed state with no signature', () => {
    expect(verifyOAuthState('not-a-real-state')).toBeNull()
  })

  it('rejects an expired state', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-15T12:00:00.000Z'))
    const state = createOAuthState('user-123')
    vi.setSystemTime(new Date('2026-08-15T12:11:00.000Z')) // 11 minutes later, past the 10-minute window
    expect(verifyOAuthState(state)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/aiAgent/oauthState.test.ts`
Expected: FAIL — `Cannot find module './oauthState'`

- [ ] **Step 3: Implement**

`src/lib/aiAgent/connection.ts`:
```ts
// Same pattern as getKey() in src/lib/kaspiShop/connection.ts -- one
// dedicated encryption key per feature area, not shared across features.
export function getKey(): string {
  const key = process.env.AI_AGENT_ENCRYPTION_KEY
  if (!key) throw new Error('AI_AGENT_ENCRYPTION_KEY is not configured')
  return key
}
```

`src/lib/aiAgent/oauthState.ts`:
```ts
import crypto from 'crypto'
import { getKey } from './connection'

const STATE_TTL_MS = 10 * 60 * 1000 // 10 minutes -- generous for a user to complete Instagram's own consent screen

// The Instagram OAuth callback (Task 6) is a real browser redirect from
// Meta, not our own fetch -- there's no Authorization bearer header to
// identify the user from, unlike every other route in this codebase. This
// signed, self-contained state param carries the user id through the
// redirect instead, HMAC'd with the same AI_AGENT_ENCRYPTION_KEY so it
// can't be forged (a forged state could otherwise let one user attach
// their own Instagram OAuth grant to a DIFFERENT user's agent).
export function createOAuthState(userId: string): string {
  const payload = JSON.stringify({ userId, nonce: crypto.randomBytes(8).toString('hex'), exp: Date.now() + STATE_TTL_MS })
  const payloadB64 = Buffer.from(payload).toString('base64url')
  const sig = crypto.createHmac('sha256', getKey()).update(payloadB64).digest('base64url')
  return `${payloadB64}.${sig}`
}

export function verifyOAuthState(state: string): { userId: string } | null {
  const parts = state.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, sig] = parts
  const expectedSig = crypto.createHmac('sha256', getKey()).update(payloadB64).digest('base64url')
  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expectedSig)
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null
  let payload: { userId: string; exp: number }
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (Date.now() > payload.exp) return null
  return { userId: payload.userId }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/aiAgent/oauthState.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors

```bash
git add src/lib/aiAgent/connection.ts src/lib/aiAgent/oauthState.ts src/lib/aiAgent/oauthState.test.ts
git commit -m "feat(ai-agent): encryption key helper + signed OAuth state for the Instagram connect flow"
git push
```

---

## Task 5: AI-agent wallet

**Files:**
- Create: `src/lib/aiAgent/wallet.ts`
- Create: `src/app/api/ai-agent/wallet/route.ts`
- Create: `src/app/api/ai-agent/wallet/topup/route.ts`
- Create: `src/app/api/ai-agent/wallet/topup-status/route.ts`

**Interfaces:**
- Consumes: `loadPlatformConnection` (`@/lib/kaspiPay/connection`), `createPayment`/`checkStatus` (`@/lib/kaspiPay/client`) — existing, reused as-is (same shared platform Kaspi connection Kaspi Shop Wallet already uses).
- Produces: `AI_AGENT_CREDIT_PRICE_TENGE`, `AI_AGENT_CREDITS_PER_AI_REPLY`, `getAiAgentWalletBalance(userId)`, `debitAiAgentWallet(userId, credits, note)` — Task 8 calls this after a real AI-generated reply sends successfully.

- [ ] **Step 1: Implement the wallet library**

`src/lib/aiAgent/wallet.ts`:
```ts
import { createClient } from '@supabase/supabase-js'
import { loadPlatformConnection } from '@/lib/kaspiPay/connection'
import { checkStatus } from '@/lib/kaspiPay/client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const AI_AGENT_CREDIT_PRICE_TENGE = 5

// Real Claude Haiku 4.5 pricing (confirmed live at platform.claude.com/docs,
// 2026-08-15): $1/MTok input, $5/MTok output. generateAiReply's typical
// call (~600 input tokens including the prompt template and up to 5 prior
// DM exchanges, ~150 output tokens averaged across short public-comment
// replies capped near 12 words and fuller 2-3 sentence DM replies) costs
// roughly (600 * $1 + 150 * $5) / 1,000,000 = $0.00135 -- at an
// approximate 500 tenge/$1 (this codebase has no live FX source to pull an
// exact rate from), about 0.14 credits of real cost. Rounded up to a
// clean, easy-to-communicate 1 credit per AI-generated reply, comfortably
// covering the real cost with margin -- template matches stay free, same
// as the single-tenant bot's templates never touching the Anthropic API.
export const AI_AGENT_CREDITS_PER_AI_REPLY = 1

export async function getAiAgentWalletBalance(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('ai_agent_wallet')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`ai_agent_wallet lookup failed for user ${userId}: ${error.message}`)
  return Number(data?.balance ?? 0)
}

export async function debitAiAgentWallet(userId: string, credits: number, note: string): Promise<number> {
  const { data, error } = await supabase.rpc('debit_ai_agent_wallet_balance', { p_user_id: userId, p_amount: credits })
  if (error) throw new Error(`ai_agent_wallet debit failed for user ${userId}: ${error.message}`)

  const { data: wallet } = await supabase.from('ai_agent_wallet').select('id').eq('user_id', userId).single()
  const { error: ledgerError } = await supabase.from('ai_agent_wallet_ledger').insert({
    wallet_id: wallet?.id,
    user_id: userId,
    amount: -credits,
    type: 'reply_debit',
    note,
  })
  if (ledgerError) console.error('ai_agent_wallet_ledger insert failed after reply debit for user', userId, ':', ledgerError.message)
  return data as number
}

export async function creditAiAgentWallet(userId: string, credits: number, note: string): Promise<number> {
  const { data, error } = await supabase.rpc('debit_ai_agent_wallet_balance', { p_user_id: userId, p_amount: -credits })
  if (error) throw new Error(`ai_agent_wallet credit failed for user ${userId}: ${error.message}`)

  const { data: wallet } = await supabase.from('ai_agent_wallet').select('id').eq('user_id', userId).single()
  const { error: ledgerError } = await supabase.from('ai_agent_wallet_ledger').insert({
    wallet_id: wallet?.id,
    user_id: userId,
    amount: credits,
    type: 'topup',
    note,
  })
  if (ledgerError) console.error('ai_agent_wallet_ledger insert failed after topup credit for user', userId, ':', ledgerError.message)
  return data as number
}

export interface AiAgentWalletTopupRow {
  id: string
  user_id: string
  credits: number
  kaspi_operation_id: string
  status: string
  expires_at?: string | null
}

function isPastExpiry(row: AiAgentWalletTopupRow): boolean {
  return !!row.expires_at && new Date(row.expires_at) <= new Date()
}

// Mirrors checkAndSettleKaspiShopWalletTopup's shape exactly (paid/not_paid/expired), retargeted at ai_agent_wallet.
export async function checkAndSettleAiAgentWalletTopup(row: AiAgentWalletTopupRow): Promise<'paid' | 'not_paid' | 'expired'> {
  const connection = await loadPlatformConnection()
  if (!connection) return 'not_paid'

  const result = await checkStatus(connection, row.kaspi_operation_id)
  if (result.status !== 'paid') {
    const expiredOnKaspi = result.status === 'expired'
    if (expiredOnKaspi || isPastExpiry(row)) {
      const { data } = await supabase
        .from('ai_agent_wallet_topups')
        .update({ status: 'expired' })
        .eq('id', row.id)
        .eq('status', 'pending')
        .select('id')
      if (data && data.length > 0) return 'expired'
    }
    return 'not_paid'
  }

  const { data: claimed, error: claimError } = await supabase
    .from('ai_agent_wallet_topups')
    .update({ status: 'paid' })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('id')
  if (claimError) throw new Error(`failed to claim paid ai_agent_wallet_topups row: ${claimError.message}`)
  if (!claimed || claimed.length === 0) return 'paid'

  try {
    await creditAiAgentWallet(row.user_id, row.credits, `Пополнение: топап ${row.id}`)
  } catch (e: any) {
    console.error('CRITICAL: ai_agent_wallet_topups', row.id, 'for user', row.user_id, 'confirmed paid on Kaspi but credit failed:', e.message)
  }
  return 'paid'
}
```

- [ ] **Step 2: Balance route**

`src/app/api/ai-agent/wallet/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAiAgentWalletBalance } from '@/lib/aiAgent/wallet'

const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const balance = await getAiAgentWalletBalance(user.id)
  return NextResponse.json({ balance })
}
```

- [ ] **Step 3: Topup route**

`src/app/api/ai-agent/wallet/topup/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadPlatformConnection } from '@/lib/kaspiPay/connection'
import { createPayment } from '@/lib/kaspiPay/client'
import { AI_AGENT_CREDIT_PRICE_TENGE } from '@/lib/aiAgent/wallet'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const MIN_TOPUP_TENGE = 500
const TOPUP_RATE_LIMIT = 5
const TOPUP_RATE_WINDOW_MS = 60_000

export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { amountTenge } = await req.json()
  if (!amountTenge || typeof amountTenge !== 'number' || amountTenge < MIN_TOPUP_TENGE) {
    return NextResponse.json({ error: 'invalid_amount', min: MIN_TOPUP_TENGE }, { status: 400 })
  }

  const { count: recentCount, error: rateError } = await supabase
    .from('ai_agent_wallet_topups')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', new Date(Date.now() - TOPUP_RATE_WINDOW_MS).toISOString())
  if (rateError) console.error('AI-agent wallet topup: rate-limit count failed, allowing request:', rateError.message)
  else if ((recentCount ?? 0) >= TOPUP_RATE_LIMIT) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const connection = await loadPlatformConnection()
  if (!connection) return NextResponse.json({ error: 'Platform Kaspi connection not set up' }, { status: 500 })

  const credits = Math.floor(amountTenge / AI_AGENT_CREDIT_PRICE_TENGE)

  try {
    const payment = await createPayment(connection, { amount: amountTenge, orderId: `aiagent_topup_${user.id}_${Date.now()}` })
    const { data: inserted, error: insertError } = await supabase
      .from('ai_agent_wallet_topups')
      .insert({
        user_id: user.id,
        amount_tenge: amountTenge,
        credits,
        kaspi_operation_id: payment.operationId,
        qr_token: payment.qrToken,
        payment_link: payment.paymentLink,
        status: 'pending',
        expires_at: payment.expiresAt,
      })
      .select('id')
      .single()
    if (insertError) {
      console.error('AI-agent wallet topup created but failed to persist -- operation', payment.operationId, ':', insertError.message)
      return NextResponse.json({ error: 'tracking_failed' }, { status: 502 })
    }
    return NextResponse.json({ topup_id: inserted.id, payment_link: payment.paymentLink, expires_at: payment.expiresAt, credits })
  } catch (e: any) {
    console.error('AI-agent wallet topup create error:', e.message)
    return NextResponse.json({ error: 'kaspi_unavailable' }, { status: 502 })
  }
}
```

- [ ] **Step 4: Topup-status route**

`src/app/api/ai-agent/wallet/topup-status/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAndSettleAiAgentWalletTopup } from '@/lib/aiAgent/wallet'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const topupId = req.nextUrl.searchParams.get('topup_id')
  if (!topupId) return NextResponse.json({ error: 'topup_id required' }, { status: 400 })

  const { data: row } = await supabase
    .from('ai_agent_wallet_topups')
    .select('id, user_id, credits, kaspi_operation_id, status, expires_at')
    .eq('id', topupId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!row) return NextResponse.json({ status: null })

  if (row.status === 'pending') {
    try {
      const outcome = await checkAndSettleAiAgentWalletTopup(row as any)
      return NextResponse.json({ status: outcome === 'not_paid' ? 'pending' : outcome })
    } catch (e: any) {
      console.error('AI-agent wallet topup status check failed for', topupId, ':', e.message)
      return NextResponse.json({ status: 'pending' })
    }
  }
  return NextResponse.json({ status: row.status })
}
```

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors

```bash
git add src/lib/aiAgent/wallet.ts src/app/api/ai-agent/wallet/
git commit -m "feat(ai-agent): dedicated wallet, mirrors Kaspi Shop Wallet's exact pattern"
git push
```

---

## Task 6: Agent settings + onboarding page

**Files:**
- Create: `src/app/api/ai-agent/settings/route.ts`
- Create: `src/app/ai-agent/settings/page.tsx`

**Interfaces:**
- Consumes: `AgentTone`/`AgentGoal` types (Task 1).
- Produces: an `ai_agents` row and an `ai_agent_wallet` row (balance 0) exist for the user once they save settings for the first time. Task 7 (OAuth) depends on an `ai_agents` row already existing (it looks one up by `user_id`).

- [ ] **Step 1: Settings route**

`src/app/api/ai-agent/settings/route.ts`:
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

async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

const VALID_TONES = ['friendly', 'professional', 'energetic', 'caring']
const VALID_GOALS = ['answer_questions', 'qualify_lead']

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: agent } = await supabase.from('ai_agents').select('*').eq('user_id', user.id).maybeSingle()
  const { data: profile } = await supabase.from('profiles').select('company_name').eq('id', user.id).maybeSingle()
  const { data: connections } = agent
    ? await supabase.from('ai_agent_channel_connections').select('channel, external_account_name, status').eq('agent_id', agent.id)
    : { data: [] }

  return NextResponse.json({
    agent: agent ? {
      id: agent.id,
      name: agent.name,
      tone: agent.tone,
      businessDescription: agent.business_description,
      goal: agent.goal,
      collectName: agent.collect_name,
      collectPhone: agent.collect_phone,
      status: agent.status,
    } : null,
    suggestedName: profile?.company_name || '',
    connections: connections || [],
  })
}

// Upsert on user_id. Deliberately omits status/training_started_at/
// training_message_count from the payload -- Supabase's upsert only sets
// the columns present in the object, so re-saving settings later (editing
// the business description, say) never resets an agent's training clock
// back to defaults. Those three columns are only ever set by their own
// defaults (first creation) or by Task 9's review-queue route (training
// progress).
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, tone, businessDescription, goal, collectName, collectPhone } = body

  if (!name || typeof name !== 'string') return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (!VALID_TONES.includes(tone)) return NextResponse.json({ error: 'invalid tone' }, { status: 400 })
  if (!VALID_GOALS.includes(goal)) return NextResponse.json({ error: 'invalid goal' }, { status: 400 })

  const { data: agent, error } = await supabase
    .from('ai_agents')
    .upsert({
      user_id: user.id,
      name,
      tone,
      business_description: typeof businessDescription === 'string' ? businessDescription : '',
      goal,
      collect_name: !!collectName,
      collect_phone: !!collectPhone,
    }, { onConflict: 'user_id' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { error: walletError } = await supabase.from('ai_agent_wallet').upsert(
    { user_id: user.id, balance: 0 },
    { onConflict: 'user_id', ignoreDuplicates: true }
  )
  if (walletError) console.error('ai_agent_wallet creation failed for user', user.id, ':', walletError.message)

  return NextResponse.json({ agent })
}
```

- [ ] **Step 2: Onboarding/settings page**

`src/app/ai-agent/settings/page.tsx`:
```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const TONE_OPTIONS = [
  { value: 'friendly', label: '🤗 Дружелюбный и тёплый' },
  { value: 'professional', label: '💼 Профессиональный и деловой' },
  { value: 'energetic', label: '⚡️ Мотивирующий и энергичный' },
  { value: 'caring', label: '🫶 Заботливый и внимательный' },
]

const GOAL_OPTIONS = [
  { value: 'answer_questions', label: 'Отвечать на вопросы' },
  { value: 'qualify_lead', label: 'Квалифицировать заявку' },
]

export default function AiAgentSettings() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [tone, setTone] = useState('friendly')
  const [businessDescription, setBusinessDescription] = useState('')
  const [goal, setGoal] = useState('answer_questions')
  const [collectName, setCollectName] = useState(true)
  const [collectPhone, setCollectPhone] = useState(true)
  const [agentId, setAgentId] = useState<string | null>(null)
  const [connections, setConnections] = useState<{ channel: string; external_account_name: string | null; status: string }[]>([])
  const [connecting, setConnecting] = useState(false)

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/settings', { headers })
      if (res.ok) {
        const data = await res.json()
        if (data.agent) {
          setAgentId(data.agent.id)
          setName(data.agent.name)
          setTone(data.agent.tone)
          setBusinessDescription(data.agent.businessDescription)
          setGoal(data.agent.goal)
          setCollectName(data.agent.collectName)
          setCollectPhone(data.agent.collectPhone)
        } else {
          setName(data.suggestedName || 'Ассистент')
        }
        setConnections(data.connections || [])
      }
      setLoading(false)
    }
    load()
  }, [router])

  async function save() {
    setSaving(true)
    const headers = await authHeader()
    const res = await fetch('/api/ai-agent/settings', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, tone, businessDescription, goal, collectName, collectPhone }),
    })
    if (res.ok) {
      const data = await res.json()
      setAgentId(data.agent.id)
    }
    setSaving(false)
  }

  async function connectInstagram() {
    setConnecting(true)
    const headers = await authHeader()
    const res = await fetch('/api/ai-agent/instagram/connect', { headers })
    if (res.ok) {
      const data = await res.json()
      window.location.href = data.authorizeUrl
    } else {
      setConnecting(false)
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Загрузка…</div>

  const instagramConnection = connections.find(c => c.channel === 'instagram')

  return (
    <div className="max-w-xl mx-auto p-6 pb-24">
      <h1 className="text-xl font-bold text-[#1C2056] mb-1">AI-агент</h1>
      <p className="text-sm text-gray-500 mb-6">Настройте ассистента, который отвечает вашим клиентам в Instagram</p>

      <label className="block mb-4">
        <span className="text-xs text-gray-500 mb-1 block">Название компании</span>
        <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={name} onChange={e => setName(e.target.value)} />
      </label>

      <div className="mb-4">
        <span className="text-xs text-gray-500 mb-2 block">Формат общения</span>
        <div className="grid grid-cols-2 gap-2">
          {TONE_OPTIONS.map(t => (
            <button key={t.value} onClick={() => setTone(t.value)}
              className={`text-xs px-3 py-2 rounded-lg text-left ${tone === t.value ? 'bg-[#1C2056] text-white' : 'bg-gray-50 text-gray-600'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <label className="block mb-4">
        <span className="text-xs text-gray-500 mb-1 block">О бизнесе</span>
        <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm min-h-[100px]"
          placeholder="Опишите подробнее что вы продаёте и как работаете"
          value={businessDescription} onChange={e => setBusinessDescription(e.target.value)} />
      </label>

      <div className="mb-4">
        <span className="text-xs text-gray-500 mb-2 block">Основная цель</span>
        <div className="grid grid-cols-2 gap-2">
          {GOAL_OPTIONS.map(g => (
            <button key={g.value} onClick={() => setGoal(g.value)}
              className={`text-xs px-3 py-2 rounded-lg ${goal === g.value ? 'bg-[#1C2056] text-white' : 'bg-gray-50 text-gray-600'}`}>
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <span className="text-xs text-gray-500 mb-2 block">Что собирать у клиента</span>
        <label className="flex items-center gap-2 text-sm mb-1">
          <input type="checkbox" checked={collectName} onChange={e => setCollectName(e.target.checked)} /> Имя
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={collectPhone} onChange={e => setCollectPhone(e.target.checked)} /> Телефон
        </label>
      </div>

      <button onClick={save} disabled={saving}
        className="w-full bg-[#1C2056] text-white rounded-lg px-4 py-3 text-sm font-medium mb-4">
        {saving ? 'Сохраняем…' : 'Сохранить'}
      </button>

      {agentId && (
        <div className="border-t border-gray-100 pt-4">
          <span className="text-xs text-gray-500 mb-2 block">Instagram</span>
          {instagramConnection?.status === 'active' && (
            <div className="text-sm text-[#00A468]">✓ Подключено: {instagramConnection.external_account_name || instagramConnection.channel}</div>
          )}
          {instagramConnection?.status === 'token_expired' && (
            // Same sessionExpired-style reconnect banner this codebase
            // already uses in Kaspi Shop -- set by Task 8/9's 401 handling,
            // not guessed at here. Reconnecting reuses the same OAuth flow;
            // Task 7's callback upserts on (channel, external_account_id)
            // and always writes status: 'active', so a successful
            // reconnect clears this automatically.
            <div className="bg-red-50 rounded-lg p-3 mb-2">
              <div className="text-sm text-red-600 mb-2">⚠️ Instagram отключился — переподключите аккаунт, чтобы агент снова отвечал</div>
              <button onClick={connectInstagram} disabled={connecting}
                className="w-full bg-white border border-red-200 text-red-600 rounded-lg px-4 py-2 text-sm font-medium">
                {connecting ? 'Открываем Instagram…' : 'Переподключить Instagram'}
              </button>
            </div>
          )}
          {!instagramConnection && (
            <button onClick={connectInstagram} disabled={connecting}
              className="w-full bg-white border border-gray-200 text-[#1C2056] rounded-lg px-4 py-3 text-sm font-medium">
              {connecting ? 'Открываем Instagram…' : 'Подключить Instagram'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors

```bash
git add src/app/api/ai-agent/settings/route.ts src/app/ai-agent/settings/page.tsx
git commit -m "feat(ai-agent): agent settings API + onboarding page, one screen not a wizard"
git push
```

---

## Task 7: Instagram OAuth connect + callback

**Files:**
- Create: `src/app/api/ai-agent/instagram/connect/route.ts`
- Create: `src/app/api/ai-agent/instagram/callback/route.ts`

**Interfaces:**
- Consumes: `createOAuthState`/`verifyOAuthState` (Task 4), `getKey` (Task 4), `encryptAtRest` (`@/lib/kaspiPay/crypto`, existing).
- Produces: an `ai_agent_channel_connections` row with `channel = 'instagram'`, a real encrypted access token, and `external_account_id` set to the connected account's real Instagram-scoped user id — Task 8's webhook dispatch looks up this exact `external_account_id` for every incoming event.

- [ ] **Step 1: Connect route**

`src/app/api/ai-agent/instagram/connect/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createOAuthState } from '@/lib/aiAgent/oauthState'

const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Bearer-authed like every other route in this codebase -- called via a
// client-side fetch from the settings page (Task 6), NOT a plain browser
// navigation (a plain <a href> can't carry an Authorization header). The
// page reads the real authorizeUrl from this response, then does
// window.location.href = authorizeUrl itself to actually start the OAuth
// redirect to Instagram.
export async function GET(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appId = process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID
  if (!appId) return NextResponse.json({ error: 'Instagram app not configured' }, { status: 500 })

  const state = createOAuthState(user.id)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.invoices.kz'
  const redirectUri = `${appUrl}/api/ai-agent/instagram/callback`
  const scopes = 'instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments'
  const authorizeUrl = `https://www.instagram.com/oauth/authorize?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code&state=${encodeURIComponent(state)}`

  return NextResponse.json({ authorizeUrl })
}
```

- [ ] **Step 2: Callback route**

`src/app/api/ai-agent/instagram/callback/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyOAuthState } from '@/lib/aiAgent/oauthState'
import { getKey } from '@/lib/aiAgent/connection'
import { encryptAtRest } from '@/lib/kaspiPay/crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Instagram redirects the BROWSER here after the user authorizes -- no
// Authorization header available (this is a real navigation, not our own
// fetch), so the user is identified via the signed `state` param instead
// (Task 4's oauthState, not a session cookie this codebase doesn't use for
// API routes). Real Instagram Business Login flow, confirmed against
// Meta's own docs/examples 2026-08-15: authorize -> code -> short-lived
// token (api.instagram.com/oauth/access_token) -> long-lived token
// (graph.instagram.com/access_token?grant_type=ig_exchange_token) -> /me
// for the connected account's identity. VERIFY the exact request/response
// shape live against a real registered app before the first real connect
// attempt -- Meta's documentation for this specific multi-step exchange
// was not fully cross-confirmed during planning (the authorize step was
// confirmed live; the two-step token exchange below matches this
// codebase's best available reference for the flow, not a live-tested
// round trip).
export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.invoices.kz'
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const oauthError = req.nextUrl.searchParams.get('error')

  if (oauthError || !code || !state) {
    return NextResponse.redirect(`${appUrl}/ai-agent/settings?instagram_error=1`)
  }
  const verified = verifyOAuthState(state)
  if (!verified) {
    return NextResponse.redirect(`${appUrl}/ai-agent/settings?instagram_error=1`)
  }

  const appId = process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID
  const appSecret = process.env.INSTAGRAM_APP_SECRET
  const redirectUri = `${appUrl}/api/ai-agent/instagram/callback`
  if (!appId || !appSecret) {
    return NextResponse.redirect(`${appUrl}/ai-agent/settings?instagram_error=1`)
  }

  try {
    const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_message || 'short-lived token exchange failed')
    }

    const longLivedRes = await fetch(`https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${appSecret}&access_token=${tokenData.access_token}`)
    const longLivedData = await longLivedRes.json()
    if (!longLivedRes.ok || !longLivedData.access_token) {
      throw new Error('long-lived token exchange failed')
    }

    const meRes = await fetch(`https://graph.instagram.com/v21.0/me?fields=user_id,username&access_token=${longLivedData.access_token}`)
    const meData = await meRes.json()
    if (!meRes.ok || !meData.user_id) {
      throw new Error('failed to identify the connected Instagram account')
    }

    const { data: agent } = await supabase.from('ai_agents').select('id').eq('user_id', verified.userId).single()
    if (!agent) throw new Error('no agent found for this user -- settings must be saved before connecting a channel')

    const encryptedToken = encryptAtRest(longLivedData.access_token, getKey())
    const { error: upsertError } = await supabase.from('ai_agent_channel_connections').upsert({
      agent_id: agent.id,
      channel: 'instagram',
      external_account_id: String(meData.user_id),
      external_account_name: meData.username || null,
      access_token_enc: encryptedToken,
      status: 'active',
    }, { onConflict: 'channel,external_account_id' })
    if (upsertError) throw new Error(upsertError.message)

    return NextResponse.redirect(`${appUrl}/ai-agent/settings?instagram_connected=1`)
  } catch (e: any) {
    console.error('ai-agent Instagram OAuth callback failed:', e.message)
    return NextResponse.redirect(`${appUrl}/ai-agent/settings?instagram_error=1`)
  }
}
```

- [ ] **Step 3: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors

```bash
git add src/app/api/ai-agent/instagram/
git commit -m "feat(ai-agent): real Instagram Business Login OAuth, per-customer connect"
git push
```

---

## Task 8: Multi-tenant webhook dispatch

**Files:**
- Create: `src/lib/aiAgent/webhookHandler.ts`
- Modify: `src/app/api/instagram/webhook/route.ts`

**Interfaces:**
- Consumes: `buildBusinessContextLine` (Task 1), `generateAiReply` with `businessContextLine` (Task 2), `replyToComment`/`sendDirectMessage`/`InstagramApiError` with `credentials` (Task 3), `getKey`/`decryptAtRest` (Task 4 + existing crypto), `debitAiAgentWallet`/`AI_AGENT_CREDITS_PER_AI_REPLY` (Task 5), `shouldExitTraining` (Task 1).
- Produces: `ai_agent_conversations`/`ai_agent_messages` rows for every real Instagram event on a connected multi-tenant account, and marks `ai_agent_channel_connections.status = 'token_expired'` on a confirmed 401 from Meta. Task 9's review-queue route reads `ai_agent_messages` where `status = 'pending_review'`; Task 6's settings page reads `ai_agent_channel_connections.status` to show a reconnect banner.

**Important architectural fact discovered while planning this task, read before writing any code:** a Meta app registers exactly ONE webhook callback URL per subscribed object ("instagram") — Meta delivers events for every connected account (the existing single-tenant one AND every new multi-tenant one) to that SAME URL, `src/app/api/instagram/webhook/route.ts`. This task does NOT create a second webhook route. It extracts `entry.id` (the Instagram-scoped id of the account the event occurred on, present on every webhook payload entry) and branches: `entry.id === INSTAGRAM_BUSINESS_ACCOUNT_ID` → existing single-tenant path, completely unchanged; anything else → look up `ai_agent_channel_connections` by that id and use the new multi-tenant path.

- [ ] **Step 1: Read the live webhook route again**

Re-open `src/app/api/instagram/webhook/route.ts` (it may have shifted slightly since Task 2's edit) and confirm the current shape of `handleIncoming`, the `POST` handler's `entry`/`changes`/`messaging` loop, `verifySignature`, and `escapeHtml`. This task restructures `POST` and adds a new function alongside `handleIncoming` — it does not rewrite `handleIncoming` itself (that function keeps serving the single-tenant path exactly as today).

- [ ] **Step 2: Write the tenant-side handler**

`src/lib/aiAgent/webhookHandler.ts`:
```ts
import { createClient } from '@supabase/supabase-js'
import { decryptAtRest } from '@/lib/kaspiPay/crypto'
import { getKey } from './connection'
import { replyToComment, sendDirectMessage, InstagramApiError } from '@/lib/instagram'
import { generateAiReply } from '@/lib/instagramAiReply'
import { buildBusinessContextLine, AgentTone, AgentGoal } from './promptContext'
import { shouldExitTraining } from './trainingStatus'
import { debitAiAgentWallet, AI_AGENT_CREDITS_PER_AI_REPLY } from './wallet'
import { sendTelegramNotification } from '@/lib/telegramNotify'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface TenantConnection {
  connectionId: string
  agentId: string
  externalAccountId: string
  accessToken: string
}

// A 401 from Meta on an actual send means the stored token is dead
// (revoked, expired) -- per the design spec's "Обработка ошибок" section,
// this mirrors Kaspi Shop's own sessionExpired/markSessionExpired pattern:
// mark it in the DB so the settings page (Task 6) can show a reconnect
// banner, instead of silently retrying a token that will never work again.
// Any other error (network blip, malformed request, Meta outage) is left
// alone -- only a confirmed 401 means the token itself is the problem.
async function markTokenExpiredIfUnauthorized(connectionId: string, err: unknown): Promise<void> {
  if (err instanceof InstagramApiError && err.status === 401) {
    await supabase.from('ai_agent_channel_connections').update({ status: 'token_expired' }).eq('id', connectionId)
  }
}

// Looked up once per webhook entry (Task 8's POST handler calls this before
// its changes/messaging loop) -- null means this Instagram account isn't
// connected to any agent, which shouldn't happen for a real event but is
// handled as a defensive no-op rather than a crash.
export async function loadTenantConnection(externalAccountId: string): Promise<TenantConnection | null> {
  const { data } = await supabase
    .from('ai_agent_channel_connections')
    .select('id, agent_id, external_account_id, access_token_enc')
    .eq('channel', 'instagram')
    .eq('external_account_id', externalAccountId)
    .eq('status', 'active')
    .maybeSingle()
  if (!data) return null
  return {
    connectionId: data.id,
    agentId: data.agent_id,
    externalAccountId: data.external_account_id,
    accessToken: decryptAtRest(data.access_token_enc, getKey()).toString('utf8'),
  }
}

interface TenantIncomingParams {
  source: 'comment' | 'dm'
  externalId: string
  fromUsername: string
  incomingText: string
  replyTarget: string
}

export async function handleTenantIncoming(conn: TenantConnection, params: TenantIncomingParams): Promise<void> {
  // Dedup first, same principle as the single-tenant path's external_id
  // unique constraint -- Meta can redeliver the same event.
  const { data: existingMsg } = await supabase
    .from('ai_agent_messages')
    .select('id')
    .eq('external_id', params.externalId)
    .maybeSingle()
  if (existingMsg) return

  const { data: agent } = await supabase.from('ai_agents').select('*').eq('id', conn.agentId).single()
  if (!agent) return

  // Find or create the conversation thread for this sender.
  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .upsert({
      agent_id: conn.agentId,
      channel: 'instagram',
      external_thread_id: params.replyTarget,
      customer_handle: params.fromUsername,
    }, { onConflict: 'agent_id,channel,external_thread_id', ignoreDuplicates: false })
    .select('id')
    .single()
  if (!conversation) return

  // Log the inbound message.
  await supabase.from('ai_agent_messages').insert({
    conversation_id: conversation.id,
    direction: 'inbound',
    text: params.incomingText,
    external_id: params.externalId,
  })

  // Template match first, same channel-scoping rule as instagram_reply_templates.
  const { data: templates } = await supabase
    .from('ai_agent_reply_templates')
    .select('id, trigger_words, reply_text')
    .eq('agent_id', conn.agentId)
    .or(`channel.is.null,channel.eq.${params.source}`)
    .order('created_at', { ascending: true })

  const match = findTemplateMatch(params.incomingText, templates || [])

  if (match) {
    try {
      if (params.source === 'comment') {
        await replyToComment(params.replyTarget, match.reply_text, { accessToken: conn.accessToken })
      } else {
        await sendDirectMessage(params.replyTarget, match.reply_text, { igUserId: conn.externalAccountId, accessToken: conn.accessToken })
      }
      await supabase.from('ai_agent_messages').insert({
        conversation_id: conversation.id,
        direction: 'outbound',
        text: match.reply_text,
        is_ai_generated: false,
        status: 'sent',
      })
    } catch (err: any) {
      console.error('ai-agent webhook: template reply send failed for', params.externalId, ':', err.message)
      await markTokenExpiredIfUnauthorized(conn.connectionId, err)
    }
    return
  }

  // No template -- generate an AI reply.
  let draftReply: string
  let urgent: boolean
  try {
    const result = await generateAiReply({
      incomingText: params.incomingText,
      fromUsername: params.fromUsername,
      source: params.source,
      businessContextLine: buildBusinessContextLine({
        name: agent.name,
        tone: agent.tone as AgentTone,
        description: agent.business_description,
        goal: agent.goal as AgentGoal,
      }),
    })
    draftReply = result.replyText
    urgent = result.urgent
  } catch (err: any) {
    console.error('ai-agent webhook: AI reply generation failed for', params.externalId, ':', err.message)
    return
  }

  if (agent.status === 'training') {
    const { data: inserted } = await supabase.from('ai_agent_messages').insert({
      conversation_id: conversation.id,
      direction: 'outbound',
      text: draftReply,
      is_ai_generated: true,
      status: 'pending_review',
      urgent,
    }).select('id').single()

    // Best-effort nudge, exactly like every other sendTelegramNotification
    // call in this codebase -- never blocks, never throws.
    const { data: profile } = await supabase.from('profiles').select('telegram_chat_id, notify_telegram').eq('id', agent.user_id).single()
    if (profile?.notify_telegram && profile.telegram_chat_id && inserted) {
      await sendTelegramNotification(profile.telegram_chat_id, 'У вас новый черновик ответа на проверке в AI-агенте. Загляните в приложение, чтобы отправить или отредактировать.')
    }
    return
  }

  // Agent is active -- send immediately.
  try {
    if (params.source === 'comment') {
      await replyToComment(params.replyTarget, draftReply, { accessToken: conn.accessToken })
    } else {
      await sendDirectMessage(params.replyTarget, draftReply, { igUserId: conn.externalAccountId, accessToken: conn.accessToken })
    }
    await supabase.from('ai_agent_messages').insert({
      conversation_id: conversation.id,
      direction: 'outbound',
      text: draftReply,
      is_ai_generated: true,
      status: 'sent',
      urgent,
    })
    try {
      await debitAiAgentWallet(agent.user_id, AI_AGENT_CREDITS_PER_AI_REPLY, `ИИ-ответ: ${params.source === 'comment' ? 'комментарий' : 'DM'}`)
    } catch (walletErr: any) {
      console.error('ai-agent webhook: wallet debit failed for user', agent.user_id, ':', walletErr.message)
    }
  } catch (err: any) {
    console.error('ai-agent webhook: AI reply send failed for', params.externalId, ':', err.message)
    await markTokenExpiredIfUnauthorized(conn.connectionId, err)
  }
}

// Same contiguous-substring matching as this codebase's existing
// findMatchingTemplate (src/lib/instagramReplyMatch.ts) -- deliberately not
// reused directly since that function is typed against
// instagram_reply_templates's row shape; this is the same algorithm
// against ai_agent_reply_templates's identical trigger_words/reply_text
// shape. If instagramReplyMatch.ts's matching logic ever changes, mirror
// the change here too.
function findTemplateMatch(text: string, templates: { id: string; trigger_words: string[]; reply_text: string }[]): { id: string; reply_text: string } | null {
  const lower = text.toLowerCase()
  for (const t of templates) {
    if (t.trigger_words.some(w => lower.includes(w.toLowerCase()))) {
      return { id: t.id, reply_text: t.reply_text }
    }
  }
  return null
}
```

**Before Step 3:** open `src/lib/instagramReplyMatch.ts` and confirm `findMatchingTemplate`'s actual matching rule (contiguous substring, per the existing memory of this codebase) matches the `findTemplateMatch` written above. If it differs even slightly, use the REAL current algorithm from that file instead of what's written here — this is a place where a small mismatch (e.g., word-boundary matching vs. plain substring) would make the two template systems behave inconsistently for no reason.

- [ ] **Step 3: Restructure the webhook route's POST handler**

In `src/app/api/instagram/webhook/route.ts`, add the import:
```ts
import { loadTenantConnection, handleTenantIncoming } from '@/lib/aiAgent/webhookHandler'
```

Replace the `POST` function's body with:
```ts
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-hub-signature-256')
  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const payload = JSON.parse(rawBody)

  for (const entry of payload.entry || []) {
    // entry.id is the Instagram-scoped account id the event occurred on --
    // a Meta app has exactly one webhook callback URL per subscribed
    // object, so every connected account's events (the single-tenant
    // invoices.kz one AND every multi-tenant customer's one) arrive here.
    const accountId = entry.id
    const isLegacyAccount = accountId === process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID

    let tenantConnection: Awaited<ReturnType<typeof loadTenantConnection>> = null
    if (!isLegacyAccount) {
      tenantConnection = await loadTenantConnection(accountId)
      if (!tenantConnection) continue // unknown account -- shouldn't happen, defensive skip
    }
    const ownAccountId = isLegacyAccount ? process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID : tenantConnection!.externalAccountId

    for (const change of entry.changes || []) {
      if (change.field !== 'comments') continue
      const value = change.value
      if (!value?.id || !value?.text) continue
      // Self-reply-loop guard, now per-account instead of a single global
      // env var -- see the 2026-08-11 incident in this feature's own
      // history for why this check exists at all.
      if (value.from?.id && value.from.id === ownAccountId) continue

      if (isLegacyAccount) {
        await handleIncoming({
          source: 'comment',
          externalId: value.id,
          fromUsername: value.from?.username || 'unknown',
          incomingText: value.text,
          replyTarget: value.id,
        })
      } else {
        await handleTenantIncoming(tenantConnection!, {
          source: 'comment',
          externalId: value.id,
          fromUsername: value.from?.username || 'unknown',
          incomingText: value.text,
          replyTarget: value.id,
        })
      }
    }

    for (const messaging of entry.messaging || []) {
      const msg = messaging.message
      if (!msg?.mid || !msg?.text || msg.is_echo) continue
      if (isLegacyAccount) {
        await handleIncoming({
          source: 'dm',
          externalId: msg.mid,
          fromUsername: messaging.sender?.id || 'unknown',
          incomingText: msg.text,
          replyTarget: messaging.sender?.id,
        })
      } else {
        await handleTenantIncoming(tenantConnection!, {
          source: 'dm',
          externalId: msg.mid,
          fromUsername: messaging.sender?.id || 'unknown',
          incomingText: msg.text,
          replyTarget: messaging.sender?.id,
        })
      }
    }
  }

  return NextResponse.json({ ok: true })
}
```
Leave `GET` (Meta's verify handshake), `escapeHtml`, `verifySignature`, and `handleIncoming` completely untouched — this step only replaces `POST`'s body.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/aiAgent/webhookHandler.ts src/app/api/instagram/webhook/route.ts
git commit -m "feat(ai-agent): route Instagram webhook events to the right tenant by entry.id"
git push
```

---

## Task 9: Training-mode review queue

**Files:**
- Create: `src/app/api/ai-agent/review/route.ts`
- Create: `src/app/ai-agent/review/page.tsx`

**Interfaces:**
- Consumes: `shouldExitTraining` (Task 1), `replyToComment`/`sendDirectMessage`/`InstagramApiError` with credentials (Task 3), `getKey`/`decryptAtRest` (Task 4), `debitAiAgentWallet` (Task 5).
- Produces: marks `ai_agent_channel_connections.status = 'token_expired'` on a confirmed 401, same as Task 8 — Task 6's settings page reads this.

**Resolved design decision (the spec didn't pin this down, resolving it here rather than leaving it ambiguous for the implementer):** `training_message_count` increments when a pending-review message is resolved either way -- sent (with or without edits) OR skipped. A skip is still a completed review cycle for training purposes; only an agent that skips literally everything forever would otherwise never reach the message-count threshold, and the 7-day threshold already provides a backstop either way.

- [ ] **Step 1: Review route**

`src/app/api/ai-agent/review/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decryptAtRest } from '@/lib/kaspiPay/crypto'
import { getKey } from '@/lib/aiAgent/connection'
import { replyToComment, sendDirectMessage, InstagramApiError } from '@/lib/instagram'
import { shouldExitTraining } from '@/lib/aiAgent/trainingStatus'
import { debitAiAgentWallet, AI_AGENT_CREDITS_PER_AI_REPLY } from '@/lib/aiAgent/wallet'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: agent } = await supabase.from('ai_agents').select('id').eq('user_id', user.id).maybeSingle()
  if (!agent) return NextResponse.json({ items: [] })

  const { data: conversations } = await supabase
    .from('ai_agent_conversations')
    .select('id, customer_handle')
    .eq('agent_id', agent.id)
  const conversationIds = (conversations || []).map(c => c.id)
  const handleByConversation: Record<string, string> = {}
  for (const c of conversations || []) handleByConversation[c.id] = c.customer_handle || 'клиент'

  if (conversationIds.length === 0) return NextResponse.json({ items: [] })

  const { data: messages } = await supabase
    .from('ai_agent_messages')
    .select('id, conversation_id, text, urgent, created_at')
    .in('conversation_id', conversationIds)
    .eq('status', 'pending_review')
    .order('created_at', { ascending: true })

  return NextResponse.json({
    items: (messages || []).map(m => ({
      id: m.id,
      customerHandle: handleByConversation[m.conversation_id] || 'клиент',
      text: m.text,
      urgent: m.urgent,
      createdAt: m.created_at,
    })),
  })
}

// One action endpoint, mirroring how this codebase's other approve-queue
// features (e.g. the single-tenant bot's Telegram ig_reply_send/skip
// callbacks) keep send/edit/skip as one small state machine rather than
// three separate routes.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { messageId, action, editedText } = await req.json()
  if (!messageId || !['send', 'skip'].includes(action)) {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 })
  }

  const { data: message } = await supabase
    .from('ai_agent_messages')
    .select('id, conversation_id, text, status')
    .eq('id', messageId)
    .eq('status', 'pending_review')
    .maybeSingle()
  if (!message) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .select('id, agent_id, channel, external_thread_id')
    .eq('id', message.conversation_id)
    .single()
  if (!conversation) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: agent } = await supabase.from('ai_agents').select('*').eq('id', conversation.agent_id).eq('user_id', user.id).single()
  if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const finalText = action === 'send' && typeof editedText === 'string' && editedText.trim() ? editedText.trim() : message.text

  if (action === 'send') {
    const { data: connection } = await supabase
      .from('ai_agent_channel_connections')
      .select('id, access_token_enc, external_account_id')
      .eq('agent_id', agent.id)
      .eq('channel', conversation.channel)
      .single()
    if (!connection) return NextResponse.json({ error: 'channel_not_connected' }, { status: 400 })

    const accessToken = decryptAtRest(connection.access_token_enc, getKey()).toString('utf8')
    try {
      // ai_agent_conversations.external_thread_id doubles as the reply
      // target for both comment and DM sends, same as the single-tenant
      // bot's reply_target column.
      if (conversation.channel === 'instagram') {
        // A conversation thread doesn't record whether it's a comment
        // thread or a DM thread today -- v1 review-queue sends only ever
        // apply to DMs in practice (comment replies are short and public,
        // less likely to need editing before sending), but if a comment
        // draft ever reaches this queue, sendDirectMessage would be wrong.
        // Flagged here rather than silently guessed -- if comment drafts
        // do reach training-mode review in practice, this needs a
        // source column on ai_agent_conversations (or ai_agent_messages)
        // to pick the right send function.
        await sendDirectMessage(conversation.external_thread_id, finalText, { igUserId: connection.external_account_id, accessToken })
      }
    } catch (e: any) {
      console.error('ai-agent review: send failed for message', messageId, ':', e.message)
      // Same 401 -> token_expired marker as the webhook path (Task 8) --
      // per the design spec's error-handling section, a dead token surfaces
      // as a reconnect banner on the settings page (Task 6), not a retry
      // loop against a token that will never work again.
      if (e instanceof InstagramApiError && e.status === 401) {
        await supabase.from('ai_agent_channel_connections').update({ status: 'token_expired' }).eq('id', connection.id)
      }
      return NextResponse.json({ error: 'send_failed' }, { status: 502 })
    }

    await supabase.from('ai_agent_messages').update({ status: 'sent', text: finalText }).eq('id', messageId)
    try {
      await debitAiAgentWallet(user.id, AI_AGENT_CREDITS_PER_AI_REPLY, 'ИИ-ответ: одобрено в режиме обучения')
    } catch (e: any) {
      console.error('ai-agent review: wallet debit failed for user', user.id, ':', e.message)
    }
  } else {
    await supabase.from('ai_agent_messages').update({ status: 'skipped' }).eq('id', messageId)
  }

  const nextCount = agent.training_message_count + 1
  const exit = shouldExitTraining(
    { status: agent.status, trainingStartedAt: agent.training_started_at, trainingMessageCount: nextCount },
    new Date()
  )
  await supabase.from('ai_agents').update({
    training_message_count: nextCount,
    ...(exit ? { status: 'active' } : {}),
  }).eq('id', agent.id)

  return NextResponse.json({ ok: true, exitedTraining: exit })
}
```

- [ ] **Step 2: Review queue page**

`src/app/ai-agent/review/page.tsx`:
```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface ReviewItem {
  id: string
  customerHandle: string
  text: string
  urgent: boolean
  createdAt: string
}

export default function AiAgentReview() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<ReviewItem[]>([])
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [acting, setActing] = useState<string | null>(null)

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const headers = await authHeader()
    const res = await fetch('/api/ai-agent/review', { headers })
    if (res.ok) {
      const data = await res.json()
      setItems(data.items || [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function act(id: string, action: 'send' | 'skip') {
    setActing(id)
    const headers = await authHeader()
    await fetch('/api/ai-agent/review', {
      method: 'POST',
      headers,
      body: JSON.stringify({ messageId: id, action, editedText: edits[id] }),
    })
    setItems(prev => prev.filter(i => i.id !== id))
    setActing(null)
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Загрузка…</div>

  return (
    <div className="max-w-xl mx-auto p-6 pb-24">
      <h1 className="text-xl font-bold text-[#1C2056] mb-1">Диалоги на проверке</h1>
      <p className="text-sm text-gray-500 mb-6">Агент ещё обучается — черновики ответов ждут вашего одобрения</p>

      {items.length === 0 && <div className="text-sm text-gray-400 text-center py-8">Пока нечего проверять</div>}

      <div className="space-y-4">
        {items.map(item => (
          <div key={item.id} className="bg-white rounded-xl shadow-sm p-4">
            {item.urgent && <div className="text-xs text-red-500 font-medium mb-2">🔴 Похоже на срочное/негатив</div>}
            <div className="text-xs text-gray-400 mb-2">Клиент: {item.customerHandle}</div>
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 min-h-[80px]"
              value={edits[item.id] ?? item.text}
              onChange={e => setEdits(prev => ({ ...prev, [item.id]: e.target.value }))}
            />
            <div className="flex gap-2">
              <button onClick={() => act(item.id, 'send')} disabled={acting === item.id}
                className="flex-1 bg-[#1C2056] text-white rounded-lg px-3 py-2 text-sm font-medium">
                Отправить
              </button>
              <button onClick={() => act(item.id, 'skip')} disabled={acting === item.id}
                className="flex-1 bg-white border border-gray-200 text-gray-500 rounded-lg px-3 py-2 text-sm font-medium">
                Пропустить
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors

```bash
git add src/app/api/ai-agent/review/route.ts src/app/ai-agent/review/page.tsx
git commit -m "feat(ai-agent): in-app training-mode review queue, send/edit/skip"
git push
```

---

## Task 10: Nav entry

**Files:**
- Modify: `src/components/AppNav.tsx`

**Interfaces:**
- Consumes: nothing new.

- [ ] **Step 1: Read the live file, confirm the Kaspi Shop gate's current shape**

Open `src/components/AppNav.tsx` and confirm the `isAdmin`-gated Kaspi Shop entry's exact current structure (its `labels` entry, its spread-conditional in `items`, its icon) — mirror that shape exactly for the new entry, including the same reasoning-comment style.

- [ ] **Step 2: Add the label**

In the `labels` record, add `aiAgent` to the type and all three language rows:
```ts
const labels: Record<'ru' | 'kk' | 'en', { create: string; history: string; profile: string; kaspiShop: string; aiAgent: string }> = {
  ru: { create: 'Создать', history: 'История', profile: 'Профиль', kaspiShop: 'Kaspi Магазин', aiAgent: 'AI-агент' },
  kk: { create: 'Жасау', history: 'Тарих', profile: 'Профиль', kaspiShop: 'Kaspi Дүкені', aiAgent: 'AI-агент' },
  en: { create: 'Create', history: 'History', profile: 'Profile', kaspiShop: 'Kaspi Shop', aiAgent: 'AI Agent' },
}
```

- [ ] **Step 3: Add the nav item**

Right after the Kaspi Shop conditional block in `items`, add:
```ts
    // Same "still-being-verified feature" precedent as Kaspi Shop above --
    // admin-only until the multi-tenant Instagram OAuth flow has been
    // live-tested against a real Meta App Review approval, then opened to
    // everyone as the real cross-sell rollout.
    ...(isAdmin ? [{
      label: labels[lang].aiAgent,
      href: '/ai-agent/settings',
      icon: (active: boolean, invert = false) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9"
            stroke={active ? (invert ? 'white' : '#1C2056') : '#9CA3AF'} strokeWidth="1.5"/>
          <path d="M9 10h.01M15 10h.01M8 15c1 1 2 1.5 4 1.5s3-.5 4-1.5"
            stroke={active ? (invert ? 'white' : '#1C2056') : '#9CA3AF'} strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )
    }] : []),
```

- [ ] **Step 4: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors

```bash
git add src/components/AppNav.tsx
git commit -m "feat(ai-agent): add admin-gated AI-агент nav entry"
git push
```

---

## Task 11: Final build

- [ ] **Step 1: Full production build**

Run: `npm run build`
Expected: build succeeds with no errors (this catches route-shape issues `tsc --noEmit` alone can miss in this codebase — see this project's own prior history of a dynamic-route `params` shape mismatch that only surfaced here).

- [ ] **Step 2: If the build fails**

Fix the specific error, re-run `npm run build`, and commit the fix as its own small commit (do not silently fold it into an earlier task's commit).

- [ ] **Step 3: Manual checklist to hand to the user (this plan does not and cannot do these)**

Document these as an explicit follow-up, mirroring the existing single-tenant bot's own 8-step Meta/Vercel checklist:
1. Generate `AI_AGENT_ENCRYPTION_KEY` (`openssl rand -hex 32`), add to Vercel Production.
2. Add `NEXT_PUBLIC_INSTAGRAM_APP_ID` = `1763701871429757` (the existing app) to Vercel Production.
3. Confirm `NEXT_PUBLIC_APP_URL` is set (or add it) to `https://www.invoices.kz`.
4. In the Meta App dashboard for App ID `1763701871429757`: add `https://www.invoices.kz/api/ai-agent/instagram/callback` to Valid OAuth Redirect URIs for Instagram Business Login.
5. Redeploy after adding the env vars (Vercel freezes env vars at build time — a save alone does not apply them, per this project's own prior lesson).
6. Live-test the OAuth connect flow end-to-end on a real test Instagram account added as a Meta app tester, BEFORE publishing the app or submitting App Review — confirm the token exchange in Task 7 actually works against Meta's real endpoints (flagged in that task as not live-tested during planning).
7. Once the connect flow works for a manually-added tester: publish the Meta app and submit for App Review on `instagram_business_manage_messages`/`instagram_business_manage_comments` at Advanced Access. Expect a real, uncontrolled wait (days-weeks).
8. While waiting on review: onboard the first pilot customers by manually adding their Instagram accounts as testers in the Meta app dashboard, same mechanism the single-tenant bot already relies on.
