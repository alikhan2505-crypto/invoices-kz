# AI-агент: оператор-takeover + стоп-фразы — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A customer asking for a human (stop-phrase) or the owner just typing a reply (manual takeover) pauses the AI on that one conversation; the owner replies from a new in-app inbox («Переписка») across all three channels.

**Architecture:** Two new columns (`ai_agents.stop_phrases`, `ai_agent_conversations.paused_for_human`), one new pure matcher (`findStopPhraseMatch`, same home/shape as `findFlowTriggerMatch`), one shared sender extracted from `invoiceSend.ts` into `channelSend.ts`, a new gate wired into all three tenant handlers immediately after the existing `is_enabled` check, and a new list+thread inbox page/API built on the exact `leads/route.ts` batched-query pattern.

**Tech Stack:** Next.js App Router, Supabase service-role, vitest, existing `nav-glass`/`--nav-*` visual system, `TriggerChipsEditor`.

**Spec:** `docs/superpowers/specs/2026-08-26-ai-agent-operator-takeover-design.md`

## Global Constraints

- Naming: the new inbox page is **«Переписка»** at route `/ai-agent/dialogs` — NOT «Диалоги» (already the nav label for `/ai-agent/review`, the approval queue). Do not reuse «Диалоги» anywhere in this feature's UI copy.
- Priority chain per channel handler: `is_enabled` (unchanged, first) → `paused_for_human` check (new) → stop-phrase check (new, only when not yet paused) → template match → flow match → AI reply (all unchanged below).
- If `paused_for_human === true`: log inbound message only, return immediately. No template/flow/AI, no repeated acknowledgement.
- Stop-phrase match (not yet paused): set `paused_for_human=true`, send the FIXED text `Передаю ваш вопрос менеджеру, он ответит здесь в ближайшее время.` via the handler's OWN existing per-channel send call (`sendTelegramBotMessage`/`sendWhatsAppMessage`/`replyToComment`or`sendDirectMessage`), log it exactly like the existing template-match branch does (`direction:'outbound', is_ai_generated:false, status:'sent'`), fire an owner notification, return. Do NOT use `channelSend.ts` for this — the handler already has the channel connection in scope.
- `findStopPhraseMatch(text: string, phrases: string[]): boolean` lives in `webhookHandler.ts` next to `findTemplateMatch`, same case-insensitive-substring rule (`text.toLowerCase().includes(phrase.toLowerCase())`), imported by all three handlers. Applies on ALL Instagram sources (comment AND dm) — unlike the invoice tool, no DM-only restriction.
- `channelSend.ts` is a straight extraction of `sendIntoConversation` out of `invoiceSend.ts` — same signature, same behavior, `invoiceSend.ts` re-imports it. No behavior change.
- Manual takeover has NO customer-facing message — sending a reply just flips `paused_for_human=true` as a side effect. Release (`Вернуть боту`) also sends nothing to the customer.
- Out of scope, do not build: real-time push/polling in the inbox, media previews (text placeholders only), configurable ack text, `paused_reason`/`paused_at` columns, auto-resume on idle.
- Migration (Task 1, name `ai_agent_operator_takeover`):

```sql
alter table ai_agents
  add column stop_phrases text[] not null default array['оператор','человек','менеджер','позовите','поговорить с человеком'];

alter table ai_agent_conversations
  add column paused_for_human boolean not null default false;
```

---

### Task 1: Migration

**Files:** none in repo (DB-only).

- [ ] **Step 1:** Supabase MCP `apply_migration` (project `terjitbqgrjlqezyydql`, name `ai_agent_operator_takeover`) with the Global Constraints SQL verbatim.
- [ ] **Step 2:** Verify via `execute_sql`:

```sql
select column_name, data_type, column_default from information_schema.columns
where table_name = 'ai_agents' and column_name = 'stop_phrases';
select column_name, data_type, column_default from information_schema.columns
where table_name = 'ai_agent_conversations' and column_name = 'paused_for_human';
```

Expected: `stop_phrases` is `ARRAY`/`text[]` with the 5-element default; `paused_for_human` is `boolean` default `false`.

No commit (no repo files changed).

---

### Task 2: `findStopPhraseMatch` — TDD

**Files:**
- Modify: `src/lib/aiAgent/webhookHandler.ts` (add export, near `findTemplateMatch`)
- Test: `src/lib/aiAgent/webhookHandler.test.ts` (create if it doesn't exist — check first with a directory listing; if a test file already exists for this module, append to it instead of creating a duplicate)

**Interfaces:**
- Produces: `export function findStopPhraseMatch(text: string, phrases: string[]): boolean` — consumed by Tasks 3-5.

- [ ] **Step 1: Check for an existing test file** — run `ls src/lib/aiAgent/webhookHandler.test.ts` (or equivalent). If it exists, append the block below to it; if not, create it with just this block plus the vitest import.

- [ ] **Step 2: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { findStopPhraseMatch } from './webhookHandler'

describe('findStopPhraseMatch', () => {
  it('matches case-insensitively against a substring', () => {
    expect(findStopPhraseMatch('позовите ОПЕРАТОРА пожалуйста', ['оператор', 'человек'])).toBe(true)
  })
  it('returns false when nothing matches', () => {
    expect(findStopPhraseMatch('привет, сколько стоит?', ['оператор', 'человек'])).toBe(false)
  })
  it('returns false for an empty phrase list', () => {
    expect(findStopPhraseMatch('позовите оператора', [])).toBe(false)
  })
  it('matches a multi-word phrase as a substring', () => {
    expect(findStopPhraseMatch('хочу поговорить с человеком срочно', ['поговорить с человеком'])).toBe(true)
  })
})
```

- [ ] **Step 3: Run, verify it fails**

Run: `npx vitest run src/lib/aiAgent/webhookHandler.test.ts`
Expected: FAIL — `findStopPhraseMatch` not exported.

- [ ] **Step 4: Implement.** Add to `src/lib/aiAgent/webhookHandler.ts`, right after `findTemplateMatch`'s closing brace:

```ts
// Same case-insensitive substring rule as findTemplateMatch/
// findFlowTriggerMatch, applied to the agent's configurable stop-phrase
// list (ai_agents.stop_phrases) instead of templates/flows. Checked
// BEFORE template/flow matching in every tenant handler -- a customer
// asking for a human must never accidentally match a template or flow
// trigger word first.
export function findStopPhraseMatch(text: string, phrases: string[]): boolean {
  const lower = text.toLowerCase()
  return phrases.some(p => lower.includes(p.toLowerCase()))
}
```

- [ ] **Step 5: Run, verify it passes**

Run: `npx vitest run src/lib/aiAgent/webhookHandler.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/aiAgent/webhookHandler.ts src/lib/aiAgent/webhookHandler.test.ts
git commit -m "feat(ai-agent): findStopPhraseMatch for operator-takeover"
```

---

### Task 3: Extract `channelSend.ts`

**Files:**
- Create: `src/lib/aiAgent/channelSend.ts`
- Modify: `src/lib/aiAgent/invoiceSend.ts`

**Interfaces:**
- Produces: `export async function sendIntoConversation(supabase: SupabaseClient, conversation: { id: string; channel: string; external_thread_id: string; agent_id: string }, text: string): Promise<string | null>` — consumed by Task 3 (invoiceSend.ts, re-import) and Task 6 (dialogs reply route).

- [ ] **Step 1: Read the current function** to copy it verbatim — `sendIntoConversation` in `src/lib/aiAgent/invoiceSend.ts` (it's the private, non-exported helper near the bottom of the file, using `decryptAtRest`, `getKey`, `sendTelegramBotMessage`, `sendWhatsAppMessage`, `sendDirectMessage`).

- [ ] **Step 2: Create `src/lib/aiAgent/channelSend.ts`** with the function moved here verbatim (export it), plus its own imports:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptAtRest } from '@/lib/kaspiPay/crypto'
import { getKey } from './connection'
import { sendTelegramBotMessage } from './telegram'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { sendDirectMessage } from '@/lib/instagram'

// Sends one plain-text message into a conversation via its channel's
// active connection, and records it as an outbound ai_agent_messages row
// so the dialog history shows it. Shared by invoiceSend.ts (invoice
// links) and the dialogs reply route (manual operator replies) --
// extracted here since a second feature now needs it. Returns null on
// success, an error string on failure (caller decides how to surface it).
export async function sendIntoConversation(
  supabase: SupabaseClient,
  conversation: { id: string; channel: string; external_thread_id: string; agent_id: string },
  text: string,
): Promise<string | null> {
  const { data: connection } = await supabase.from('ai_agent_channel_connections')
    .select('external_account_id, access_token_enc, status')
    .eq('agent_id', conversation.agent_id)
    .eq('channel', conversation.channel)
    .eq('status', 'active')
    .maybeSingle()
  if (!connection) return `нет активного подключения канала ${conversation.channel}`

  try {
    const accessToken = decryptAtRest(connection.access_token_enc, getKey()).toString('utf8')
    if (conversation.channel === 'telegram') {
      await sendTelegramBotMessage(accessToken, conversation.external_thread_id, text)
    } else if (conversation.channel === 'whatsapp') {
      await sendWhatsAppMessage(connection.external_account_id, conversation.external_thread_id, text, { accessToken })
    } else if (conversation.channel === 'instagram') {
      await sendDirectMessage(conversation.external_thread_id, text, {
        igUserId: connection.external_account_id,
        accessToken,
      })
    } else {
      return `неизвестный канал ${conversation.channel}`
    }
  } catch (err: any) {
    return String(err?.message || err)
  }

  await supabase.from('ai_agent_messages').insert({
    conversation_id: conversation.id,
    direction: 'outbound',
    text,
    is_ai_generated: false,
    status: 'sent',
  })
  return null
}
```

- [ ] **Step 3: Remove the function from `invoiceSend.ts`** and replace its imports. Remove these now-unused imports from `invoiceSend.ts`: `decryptAtRest`, `getKey`, `sendTelegramBotMessage`, `sendWhatsAppMessage`, `sendDirectMessage` (check each is not used elsewhere in the file before removing — it shouldn't be). Add:

```ts
import { sendIntoConversation } from './channelSend'
```

- [ ] **Step 4: Verify no other call sites broke** — run `grep -n "sendIntoConversation" src/lib/aiAgent/*.ts` and confirm `invoiceSend.ts` still calls it (now via import) with the same call shape as before.

- [ ] **Step 5: Run the gate**

Run: `npx tsc --noEmit` → expect clean.
Run: `npx vitest run` → expect all existing tests still pass (no test covers this network function directly, per established convention).

- [ ] **Step 6: Commit**

```bash
git add src/lib/aiAgent/channelSend.ts src/lib/aiAgent/invoiceSend.ts
git commit -m "refactor(ai-agent): extract sendIntoConversation into channelSend.ts for reuse"
```

---

### Task 4: Wire the takeover gate into all three tenant handlers

**Files:**
- Modify: `src/lib/aiAgent/telegramWebhookHandler.ts`
- Modify: `src/lib/aiAgent/whatsappWebhookHandler.ts`
- Modify: `src/lib/aiAgent/webhookHandler.ts`

**Interfaces:**
- Consumes: `findStopPhraseMatch` (Task 2), `createNotification` (already imported in all three).

- [ ] **Step 1: Telegram handler** (`telegramWebhookHandler.ts`). Add `findStopPhraseMatch` to the existing import line:

```ts
import { findTemplateMatch, mergeCollectedData, findStopPhraseMatch } from './webhookHandler'
```

Change the conversation upsert's `.select(...)` to include the new column:

```ts
    .select('id, active_flow_id, paused_for_human')
```

Immediately after the existing block:

```ts
  if (conversation.active_flow_id) {
    await supabase.from('ai_agent_conversations').update({ active_flow_id: null, active_step_id: null }).eq('id', conversation.id)
  }
```

insert:

```ts
  // Operator-takeover gate: already-paused conversations get NOTHING
  // beyond the inbound log above -- no template, no flow, no AI, no
  // repeated acknowledgement. The owner is already handling it in
  // /ai-agent/dialogs.
  if (conversation.paused_for_human) return

  // Not yet paused -- check for a stop-phrase BEFORE template/flow
  // matching, so a customer asking for a human can't accidentally match
  // a template/flow trigger word first.
  if (findStopPhraseMatch(params.incomingText, Array.isArray(agent.stop_phrases) ? agent.stop_phrases : [])) {
    await supabase.from('ai_agent_conversations').update({ paused_for_human: true }).eq('id', conversation.id)
    const ackText = 'Передаю ваш вопрос менеджеру, он ответит здесь в ближайшее время.'
    try {
      await sendTelegramBotMessage(conn.botToken, params.chatId, ackText)
      await supabase.from('ai_agent_messages').insert({
        conversation_id: conversation.id,
        direction: 'outbound',
        text: ackText,
        is_ai_generated: false,
        status: 'sent',
      })
    } catch (err: any) {
      console.error('ai-agent telegram webhook: stop-phrase ack send failed for', params.externalId, ':', err.message)
      await markTelegramTokenExpiredIfUnauthorized(conn.connectionId, err)
    }
    await createNotification(agent.user_id, 'Клиент попросил оператора', params.incomingText.slice(0, 120), '/ai-agent/dialogs')
    return
  }
```

- [ ] **Step 2: WhatsApp handler** (`whatsappWebhookHandler.ts`). Add the import:

```ts
import { findTemplateMatch, mergeCollectedData, findStopPhraseMatch } from './webhookHandler'
```

Change the conversation upsert's `.select('id')` to `.select('id, paused_for_human')`.

Immediately after the inbound-message-insert error-handling block (right before the `// Template match first` comment), insert:

```ts
  // Operator-takeover gate -- see telegramWebhookHandler.ts's identical block for rationale.
  if (conversation.paused_for_human) return

  if (findStopPhraseMatch(params.incomingText, Array.isArray(agent.stop_phrases) ? agent.stop_phrases : [])) {
    await supabase.from('ai_agent_conversations').update({ paused_for_human: true }).eq('id', conversation.id)
    const ackText = 'Передаю ваш вопрос менеджеру, он ответит здесь в ближайшее время.'
    try {
      await sendWhatsAppMessage(conn.phoneNumberId, params.from, ackText, { accessToken: conn.accessToken })
      await supabase.from('ai_agent_messages').insert({
        conversation_id: conversation.id,
        direction: 'outbound',
        text: ackText,
        is_ai_generated: false,
        status: 'sent',
      })
    } catch (err: any) {
      console.error('ai-agent whatsapp webhook: stop-phrase ack send failed for', params.externalId, ':', err.message)
      await markWhatsAppTokenExpiredIfUnauthorized(conn.connectionId, err)
    }
    await createNotification(agent.user_id, 'Клиент попросил оператора', params.incomingText.slice(0, 120), '/ai-agent/dialogs')
    return
  }
```

- [ ] **Step 3: Instagram handler** (`webhookHandler.ts`). Add `findStopPhraseMatch` to its own export list is unnecessary (it's defined here); just use it directly, no import needed for this file.

Change the conversation upsert's `.select('id')` to `.select('id, paused_for_human')`.

Immediately after the inbound-message-insert error-handling block (right before the `// Template match first` comment), insert:

```ts
  // Operator-takeover gate. Applies to BOTH comment and dm sources --
  // unlike the invoice tool, a stop-phrase request is legitimate under a
  // public comment too.
  if (conversation.paused_for_human) return

  if (findStopPhraseMatch(params.incomingText, Array.isArray(agent.stop_phrases) ? agent.stop_phrases : [])) {
    await supabase.from('ai_agent_conversations').update({ paused_for_human: true }).eq('id', conversation.id)
    const ackText = 'Передаю ваш вопрос менеджеру, он ответит здесь в ближайшее время.'
    try {
      if (params.source === 'comment') {
        await replyToComment(params.replyTarget, ackText, { accessToken: conn.accessToken })
      } else {
        await sendDirectMessage(params.replyTarget, ackText, { igUserId: conn.externalAccountId, accessToken: conn.accessToken })
      }
      await supabase.from('ai_agent_messages').insert({
        conversation_id: conversation.id,
        direction: 'outbound',
        text: ackText,
        is_ai_generated: false,
        status: 'sent',
      })
    } catch (err: any) {
      console.error('ai-agent webhook: stop-phrase ack send failed for', params.externalId, ':', err.message)
      await markTokenExpiredIfUnauthorized(conn.connectionId, err)
    }
    await createNotification(agent.user_id, 'Клиент попросил оператора', params.incomingText.slice(0, 120), '/ai-agent/dialogs')
    return
  }
```

- [ ] **Step 4: Verify `agent.stop_phrases` is available.** All three handlers already load the agent via `select('*')`, so the new column comes through automatically — no select-list change needed for the `ai_agents` query itself.

- [ ] **Step 5: Run the gate**

Run: `npx tsc --noEmit` → clean.
Run: `npx vitest run` → all pass.
Run: `npm run build` → clean (skip if another session's build lock is active — `.next/lock` present and < 5 min old — in that case rely on the Vercel deploy build in Task 6 instead of forcing a local build).

- [ ] **Step 6: Commit**

```bash
git add src/lib/aiAgent/telegramWebhookHandler.ts src/lib/aiAgent/whatsappWebhookHandler.ts src/lib/aiAgent/webhookHandler.ts
git commit -m "feat(ai-agent): operator-takeover gate + stop-phrase detection in all three channels"
```

---

### Task 5: Settings UI — stop-phrase editor

**Files:**
- Modify: `src/app/ai-agent/settings/page.tsx`
- Modify: `src/app/api/ai-agent/settings/route.ts`

**Interfaces:**
- Consumes: `TriggerChipsEditor` (existing component, `{ words: string[]; onChange: (words: string[]) => void }`).

- [ ] **Step 1: Settings route (GET).** In `src/app/api/ai-agent/settings/route.ts`, add to the returned `agent` object (next to `customInstructions`):

```ts
      stopPhrases: Array.isArray(agent.stop_phrases) ? agent.stop_phrases : [],
```

- [ ] **Step 2: Settings route (POST).** Destructure `stopPhrases` from `body` alongside the other fields:

```ts
  const { agentId, name, tone, businessDescription, goal, collectFields, timezone, currency, customInstructions, historyPairs, isEnabled, stopPhrases } = body
```

Add validation + normalization near the `collectFields` block:

```ts
  // stopPhrases: free-text list, same trim+cap shape as collectFields'
  // custom-field path -- these are interpolated into no prompt (matched
  // literally in code, not sent to the model), so the cap is generous.
  const phrases: string[] = Array.isArray(stopPhrases)
    ? stopPhrases
        .filter((p: unknown): p is string => typeof p === 'string')
        .map(p => p.trim().slice(0, 80))
        .filter(p => p.length > 0)
        .slice(0, 20)
    : ['оператор', 'человек', 'менеджер', 'позовите', 'поговорить с человеком']
```

Add to `payload`:

```ts
    stop_phrases: phrases,
```

- [ ] **Step 3: Settings page state.** In `src/app/ai-agent/settings/page.tsx`, add state next to `customInstructions`:

```ts
  const [stopPhrases, setStopPhrases] = useState<string[]>(['оператор', 'человек', 'менеджер', 'позовите', 'поговорить с человеком'])
```

- [ ] **Step 4: Load.** In the `load()` function, where `customInstructions` is set from the fetched agent, add:

```ts
          if (Array.isArray(data.agent.stopPhrases)) setStopPhrases(data.agent.stopPhrases)
```

- [ ] **Step 5: Save.** In `save()`'s `JSON.stringify` body, add `stopPhrases` to the object.

- [ ] **Step 6: UI.** Import `TriggerChipsEditor` is already present (used by Шаблоны/Сценарии). On the Промптинг tab, right after the custom-instructions `<label>` block and before its closing `saveButton`, add:

```tsx
                  <label className="block mb-6">
                    <span className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>Стоп-фразы (передают диалог вам)</span>
                    <TriggerChipsEditor words={stopPhrases} onChange={setStopPhrases} />
                    <span className="text-[11px] mt-1 block" style={{ color: 'var(--nav-text-muted)' }}>
                      Если клиент напишет одну из этих фраз, агент замолчит в этом диалоге и пришлёт вам уведомление — отвечайте в «Переписке».
                    </span>
                  </label>
```

- [ ] **Step 7: Run the gate**

Run: `npx tsc --noEmit` → clean.
Run: `npx vitest run` → all pass.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/ai-agent/settings/route.ts src/app/ai-agent/settings/page.tsx
git commit -m "feat(ai-agent): stop-phrase editor on Промптинг tab"
```

---

### Task 6: Dialogs API routes

**Files:**
- Create: `src/app/api/ai-agent/dialogs/route.ts`
- Create: `src/app/api/ai-agent/dialogs/messages/route.ts`
- Create: `src/app/api/ai-agent/dialogs/reply/route.ts`
- Create: `src/app/api/ai-agent/dialogs/release/route.ts`

**Interfaces:**
- Consumes: `sendIntoConversation` from `channelSend.ts` (Task 3).
- Produces (consumed by Task 7's UI):
  - `GET /api/ai-agent/dialogs` → `{ items: { id, agentId, agentName, channel, customerHandle, lastMessagePreview, lastActivityAt, pausedForHuman }[] }`
  - `GET /api/ai-agent/dialogs/messages?conversationId=` → `{ messages: { id, direction, text, isAiGenerated, createdAt }[] }`
  - `POST /api/ai-agent/dialogs/reply` `{ conversationId, text }` → `{ ok: true }` or `{ error }`
  - `POST /api/ai-agent/dialogs/release` `{ conversationId }` → `{ ok: true }` or `{ error }`

- [ ] **Step 1: `src/app/api/ai-agent/dialogs/route.ts`** — list, mirroring `leads/route.ts`'s auth/scoping/batched-query shape exactly:

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

async function isAdmin(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', userId).single()
  return !!profile?.is_admin
}

// «Переписка» -- every conversation across the caller's agents, newest
// activity first, with a last-message preview. Same batched-query shape
// as leads/route.ts's lastActivityByConversation (ai_agent_conversations
// has no updated_at column -- the latest message stands in for it), here
// also carrying the message TEXT for the preview, not just the timestamp.
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const { data: agents } = await supabase.from('ai_agents').select('id, name').eq('user_id', user.id)
  if (!agents || agents.length === 0) return NextResponse.json({ items: [] })
  const agentNameById: Record<string, string> = {}
  for (const a of agents) agentNameById[a.id] = a.name

  const { data: conversations, error: convError } = await supabase
    .from('ai_agent_conversations')
    .select('id, agent_id, channel, customer_handle, collected_name, created_at, paused_for_human')
    .in('agent_id', agents.map(a => a.id))
  if (convError) return NextResponse.json({ error: convError.message }, { status: 500 })
  if (!conversations || conversations.length === 0) return NextResponse.json({ items: [] })

  const conversationIds = conversations.map(c => c.id)
  const { data: messageRows } = await supabase
    .from('ai_agent_messages')
    .select('conversation_id, text, created_at')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: false })
  const previewByConversation: Record<string, { text: string; createdAt: string }> = {}
  for (const row of messageRows || []) {
    if (!previewByConversation[row.conversation_id]) previewByConversation[row.conversation_id] = { text: row.text, createdAt: row.created_at }
  }

  const items = conversations
    .map(c => ({
      id: c.id,
      agentId: c.agent_id,
      agentName: agentNameById[c.agent_id] || '',
      channel: c.channel || 'instagram',
      customerHandle: c.collected_name || c.customer_handle || 'клиент',
      lastMessagePreview: previewByConversation[c.id]?.text.slice(0, 140) || '',
      lastActivityAt: previewByConversation[c.id]?.createdAt || c.created_at,
      pausedForHuman: !!c.paused_for_human,
    }))
    .sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1))

  return NextResponse.json({ items })
}
```

- [ ] **Step 2: `src/app/api/ai-agent/dialogs/messages/route.ts`**:

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

async function isAdmin(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', userId).single()
  return !!profile?.is_admin
}

// Ownership check shared by this route and reply/release: a conversation
// belongs to the caller only if its agent_id is one of the caller's own
// agents.
async function loadOwnedConversation(userId: string, conversationId: string) {
  const { data: agents } = await supabase.from('ai_agents').select('id').eq('user_id', userId)
  const agentIds = (agents || []).map(a => a.id)
  if (agentIds.length === 0) return null
  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .select('id, agent_id, channel, external_thread_id, paused_for_human')
    .eq('id', conversationId)
    .in('agent_id', agentIds)
    .maybeSingle()
  return conversation
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const conversationId = req.nextUrl.searchParams.get('conversationId')
  if (!conversationId) return NextResponse.json({ error: 'conversationId обязателен' }, { status: 400 })

  const conversation = await loadOwnedConversation(user.id, conversationId)
  if (!conversation) return NextResponse.json({ error: 'Диалог не найден' }, { status: 404 })

  const { data: messages, error } = await supabase
    .from('ai_agent_messages')
    .select('id, direction, text, is_ai_generated, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    messages: (messages || []).map(m => ({
      id: m.id, direction: m.direction, text: m.text, isAiGenerated: m.is_ai_generated, createdAt: m.created_at,
    })),
  })
}

export { loadOwnedConversation }
```

- [ ] **Step 3: `src/app/api/ai-agent/dialogs/reply/route.ts`**:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendIntoConversation } from '@/lib/aiAgent/channelSend'

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

async function isAdmin(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', userId).single()
  return !!profile?.is_admin
}

// Sending a manual reply IS the takeover -- no separate "Взять диалог"
// action. Idempotent on an already-paused conversation.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const conversationId = typeof body?.conversationId === 'string' ? body.conversationId : null
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!conversationId || !text) return NextResponse.json({ error: 'conversationId и text обязательны' }, { status: 400 })

  const { data: agents } = await supabase.from('ai_agents').select('id').eq('user_id', user.id)
  const agentIds = (agents || []).map(a => a.id)
  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .select('id, agent_id, channel, external_thread_id, paused_for_human')
    .eq('id', conversationId)
    .in('agent_id', agentIds)
    .maybeSingle()
  if (!conversation) return NextResponse.json({ error: 'Диалог не найден' }, { status: 404 })

  if (!conversation.paused_for_human) {
    await supabase.from('ai_agent_conversations').update({ paused_for_human: true }).eq('id', conversationId)
  }

  const sendError = await sendIntoConversation(supabase, conversation, text)
  if (sendError) return NextResponse.json({ error: sendError }, { status: 502 })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: `src/app/api/ai-agent/dialogs/release/route.ts`**:

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

async function isAdmin(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', userId).single()
  return !!profile?.is_admin
}

// «Вернуть боту» -- no customer-facing message, same rule as takeover.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const conversationId = typeof body?.conversationId === 'string' ? body.conversationId : null
  if (!conversationId) return NextResponse.json({ error: 'conversationId обязателен' }, { status: 400 })

  const { data: agents } = await supabase.from('ai_agents').select('id').eq('user_id', user.id)
  const agentIds = (agents || []).map(a => a.id)
  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .select('id')
    .eq('id', conversationId)
    .in('agent_id', agentIds)
    .maybeSingle()
  if (!conversation) return NextResponse.json({ error: 'Диалог не найден' }, { status: 404 })

  const { error } = await supabase.from('ai_agent_conversations').update({ paused_for_human: false }).eq('id', conversationId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Fix the duplicate helper.** Step 2's route exports `loadOwnedConversation` but Steps 3-4 re-implement the ownership check inline rather than importing it (Next.js route files should only export `GET`/`POST`/etc — an extra named export from a route file is non-standard and Next.js will warn/ignore it). Remove the `export { loadOwnedConversation }` line from Step 2's file — it's dead code, each route inlines its own ownership check as written above. This is intentional duplication (3 small ownership checks) over an awkward cross-route-file import.

- [ ] **Step 6: Run the gate**

Run: `npx tsc --noEmit` → clean.
Run: `npx vitest run` → all pass.
Run: `npm run build` → clean (respect the `.next/lock` concurrency check from Task 4 Step 5).

- [ ] **Step 7: Commit**

```bash
git add src/app/api/ai-agent/dialogs
git commit -m "feat(ai-agent): dialogs API -- list, messages, reply, release"
```

---

### Task 7: «Переписка» page + nav entry

**Files:**
- Create: `src/app/ai-agent/dialogs/page.tsx`
- Modify: `src/components/SiteNav.tsx`

**Interfaces:**
- Consumes: the four routes from Task 6.

- [ ] **Step 1: Nav entry.** In `src/components/SiteNav.tsx`, add to `aiAgentLinks` (right after the `/ai-agent/review` entry, before `/ai-agent/test-chat`):

```ts
  { href: '/ai-agent/dialogs', label: { ru: 'Переписка', kk: 'Хат алмасу', en: 'Correspondence' } },
```

- [ ] **Step 2: Page.** Create `src/app/ai-agent/dialogs/page.tsx` — master-detail layout, mirroring `leads/page.tsx`'s admin-gate/load/DesktopShell skeleton for the list pane, plus a new thread pane:

```tsx
'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'

const EASE = [0.16, 1, 0.3, 1] as const

type DialogItem = {
  id: string; agentId: string; agentName: string; channel: string
  customerHandle: string; lastMessagePreview: string; lastActivityAt: string; pausedForHuman: boolean
}
type MessageItem = { id: string; direction: 'inbound' | 'outbound'; text: string; isAiGenerated: boolean; createdAt: string }

function InstagramIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  )
}
function TelegramIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4z" />
    </svg>
  )
}
function WhatsAppIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
}
const CHANNEL_META: Record<string, { label: string; icon: () => React.ReactElement }> = {
  instagram: { label: 'Instagram', icon: InstagramIcon },
  telegram: { label: 'Telegram', icon: TelegramIcon },
  whatsapp: { label: 'WhatsApp', icon: WhatsAppIcon },
}

function formatRelative(iso: string): string {
  return new Date(iso).toLocaleString('ru-KZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function AiAgentDialogs() {
  const router = useRouter()
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [items, setItems] = useState<DialogItem[]>([])
  const [fetching, setFetching] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<MessageItem[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  const loadItems = useCallback(async () => {
    setFetching(true)
    const headers = await authHeader()
    const res = await fetch('/api/ai-agent/dialogs', { headers })
    if (res.ok) {
      const data = await res.json()
      setItems(Array.isArray(data.items) ? data.items : [])
    }
    setFetching(false)
  }, [])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
      if (!profile?.is_admin) { setForbidden(true); setLoading(false); return }
      await loadItems()
      setLoading(false)
    }
    load()
  }, [router, loadItems])

  async function openConversation(id: string) {
    setSelectedId(id)
    setMessagesLoading(true)
    setError(null)
    const headers = await authHeader()
    const res = await fetch(`/api/ai-agent/dialogs/messages?conversationId=${encodeURIComponent(id)}`, { headers })
    if (res.ok) {
      const data = await res.json()
      setMessages(Array.isArray(data.messages) ? data.messages : [])
    }
    setMessagesLoading(false)
  }

  async function sendReply() {
    if (!selectedId || !replyText.trim()) return
    setSending(true)
    setError(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/dialogs/reply', {
        method: 'POST', headers, body: JSON.stringify({ conversationId: selectedId, text: replyText.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Не удалось отправить сообщение')
        return
      }
      setReplyText('')
      await openConversation(selectedId)
      await loadItems()
    } catch {
      setError('Ошибка сети. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setSending(false)
    }
  }

  async function releaseConversation() {
    if (!selectedId) return
    setSending(true)
    setError(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/dialogs/release', {
        method: 'POST', headers, body: JSON.stringify({ conversationId: selectedId }),
      })
      if (!res.ok) { setError('Не удалось вернуть диалог боту'); return }
      await loadItems()
    } catch {
      setError('Ошибка сети. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setSending(false)
    }
  }

  const selected = items.find(i => i.id === selectedId) || null

  if (loading) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загрузка…</div>
    </main>
    </DesktopShell>
  )

  if (forbidden) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Эта функция пока доступна только администраторам.</div>
    </main>
    </DesktopShell>
  )

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-7xl mx-auto p-4 lg:p-6 pb-24 lg:pb-6">
        <motion.div
          className="flex items-center justify-between gap-3 mb-4 flex-wrap"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>Переписка</h1>
            <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Живая переписка с клиентами по всем каналам — перехватите диалог, просто ответив</p>
          </div>
          <button onClick={loadItems} disabled={fetching} className="nav-glass rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50" style={{ color: 'var(--nav-accent)' }}>
            {fetching ? 'Обновляем…' : 'Обновить'}
          </button>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
          <div className="space-y-2" style={{ opacity: fetching ? 0.6 : 1 }}>
            {items.length === 0 && !fetching && (
              <div className="nav-glass rounded-2xl p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Пока нет ни одного диалога</div>
            )}
            {items.map(item => {
              const channel = CHANNEL_META[item.channel] || CHANNEL_META.instagram
              const ChannelIcon = channel.icon
              const active = selectedId === item.id
              return (
                <button key={item.id} onClick={() => openConversation(item.id)}
                  className="w-full text-left nav-glass rounded-2xl p-3 transition-colors"
                  style={{ outline: active ? '2px solid var(--nav-accent)' : 'none', outlineOffset: -2 }}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold" style={{ color: 'var(--nav-text-secondary)' }}>
                      <ChannelIcon /> {channel.label}
                    </span>
                    {item.pausedForHuman && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--nav-critical)', color: '#fff' }}>ждёт вас</span>
                    )}
                  </div>
                  <div className="text-sm font-semibold truncate" style={{ color: 'var(--nav-text-primary)' }}>{item.customerHandle}</div>
                  <div className="text-xs truncate mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{item.lastMessagePreview}</div>
                  <div className="text-[10px] mt-1" style={{ color: 'var(--nav-text-muted)' }}>{formatRelative(item.lastActivityAt)}</div>
                </button>
              )
            })}
          </div>

          <div className="nav-glass rounded-2xl p-4 flex flex-col" style={{ minHeight: 420 }}>
            {!selected ? (
              <div className="flex-1 flex items-center justify-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Выберите диалог слева</div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 mb-3 pb-3" style={{ borderBottom: '1px solid var(--nav-border-soft)' }}>
                  <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{selected.customerHandle}</div>
                  {selected.pausedForHuman && (
                    <button onClick={releaseConversation} disabled={sending}
                      className="text-xs font-semibold nav-glass rounded-lg px-3 py-1.5 disabled:opacity-50" style={{ color: 'var(--nav-text-secondary)' }}>
                      Вернуть боту
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 mb-3" style={{ maxHeight: 420 }}>
                  {messagesLoading ? (
                    <div className="text-center text-sm py-8" style={{ color: 'var(--nav-text-muted)' }}>Загрузка…</div>
                  ) : messages.map(m => (
                    <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-[75%] rounded-2xl px-3 py-2 text-sm"
                        style={{
                          background: m.direction === 'outbound' ? 'var(--nav-accent)' : 'var(--nav-bg)',
                          color: m.direction === 'outbound' ? 'var(--nav-accent-ink)' : 'var(--nav-text-primary)',
                        }}>
                        {m.text}
                        {m.direction === 'outbound' && (
                          <div className="text-[10px] mt-1 opacity-70">{m.isAiGenerated ? 'ИИ' : 'Вы'}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {error && <div className="text-xs mb-2" style={{ color: 'var(--nav-critical)' }}>{error}</div>}

                <div className="flex gap-2">
                  <input value={replyText} onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !sending) sendReply() }}
                    placeholder="Ваш ответ клиенту…"
                    className="flex-1 rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)]"
                    style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
                  <button onClick={sendReply} disabled={sending || !replyText.trim()}
                    className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                    Отправить
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
    </DesktopShell>
  )
}
```

- [ ] **Step 3: Run the gate**

Run: `npx tsc --noEmit` → clean.
Run: `npx vitest run` → all pass.
Run: `npm run build` → clean (respect `.next/lock` concurrency check).

- [ ] **Step 4: Commit**

```bash
git add src/app/ai-agent/dialogs/page.tsx src/components/SiteNav.tsx
git commit -m "feat(ai-agent): Переписка -- live inbox with reply-to-take-over"
```

---

### Task 8: Ship + live verification

**Files:** none (verification only).

- [ ] **Step 1:** Full gate: `npx vitest run`, `npx tsc --noEmit`, `npm run build` (wait out any concurrent `.next/lock` from a parallel session rather than deleting it — poll with `until [ ! -f .next/lock ] || [ $(( $(date +%s) - $(stat -c %Y .next/lock) )) -gt 300 ]; do sleep 5; done`, i.e. treat a lock older than 5 minutes as stale).
- [ ] **Step 2:** `git pull --rebase --autostash` (a parallel session may have pushed), then `git push origin main`.
- [ ] **Step 3:** Confirm the Vercel deployment for the pushed commit reaches READY (targeted `get_deployment` check by id, not a broad list).
- [ ] **Step 4: Founder live-test script** (hand to user, needs their own Telegram test bot):
  1. Open `/ai-agent/settings` → Промптинг tab → confirm the 5 default stop-phrases are visible, add/remove one to confirm it saves.
  2. In the test bot, write a message containing "оператор" → confirm the bot replies with the fixed handoff message and stops responding to anything further in that chat.
  3. Open `/ai-agent/dialogs` → confirm the conversation shows the «ждёт вас» badge → open it, see the message history, type a reply, send it → confirm it arrives in the real Telegram chat.
  4. Send another customer message → confirm the bot STILL stays silent (still paused).
  5. Click «Вернуть боту» → send another customer message → confirm the bot resumes answering normally.
  6. In a second conversation, WITHOUT any stop-phrase, open it in `/ai-agent/dialogs` and just type+send a reply → confirm that alone pauses the bot for that conversation too (manual takeover).

## Self-Review (done at write time)

- **Spec coverage:** migration (T1), pure matcher with tests (T2), shared sender extraction (T3), priority-chain wiring in all three channels incl. IG's comment+dm scope (T4), settings UI for stop phrases (T5), all four API routes incl. ownership scoping (T6), the inbox page incl. reply-is-takeover and release button (T7), live-test script covering both handoff paths (T8). Out-of-scope list from the spec has no tasks — correct (no realtime, no media, no configurable ack, no extra columns, no auto-resume).
- **Naming collision fix carried through:** the plan uses «Переписка» everywhere in UI copy and never reintroduces «Диалоги» for this feature; the nav entry is placed distinctly from the existing `/ai-agent/review` «Диалоги» entry.
- **Type consistency:** `findStopPhraseMatch(text, phrases): boolean` (T2) signature matches its call sites in T4 exactly (`agent.stop_phrases` passed as `phrases`, guarded with `Array.isArray`). `sendIntoConversation`'s signature is unchanged across the T3 extraction and its T6 reply-route usage. API response field names (`agentId`, `agentName`, `customerHandle`, `lastMessagePreview`, `lastActivityAt`, `pausedForHuman`, `isAiGenerated`) match exactly between T6's routes and T7's page types.
- **Fixed a real bug during self-review:** Task 6 Step 2 originally exported a helper (`loadOwnedConversation`) from a route file for reuse by Steps 3-4, which is invalid Next.js route-file shape (only HTTP-method exports are recognized) — corrected in Step 5 to have each route inline its own small ownership check instead, matching how every other multi-route AI-агент API surface in this codebase already does it (e.g. `review/route.ts` vs `review/regenerate/route.ts` don't share a helper import either).
