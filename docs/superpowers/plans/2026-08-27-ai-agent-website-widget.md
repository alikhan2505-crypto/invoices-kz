# Чат-виджет для сайта Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A seller embeds one `<script>` tag on their own website; visitors get a floating chat widget that talks to the same AI-агент pipeline (templates/scenarios/AI reply/operator pause) already live on Telegram/WhatsApp/Instagram.

**Architecture:** A new `channel = 'website'` reuses every existing table/pipeline as-is (both are free-text columns with no CHECK constraint). Delivery is two plain public HTTP endpoints (no webhook, no external platform) — a POST to send, a GET the widget polls every 5s — both open to cross-origin calls since the widget's JS runs on an arbitrary seller domain. A new `websiteWebhookHandler.ts` mirrors the WhatsApp tenant handler's exact structure; a new `flowEngine.ts`-based sender writes buttons directly onto the outbound message row (a new nullable column) since there is no external platform API to render them.

**Tech Stack:** Next.js API routes (public, CORS-enabled), Vitest, vanilla JS (no build step) for the embeddable widget script.

**Spec:** `docs/superpowers/specs/2026-08-27-ai-agent-website-widget-design.md`

## Global Constraints

- Delivery: POST to send (direct browser call, no webhook), GET polled every 5s while the widget panel is open (no polling while collapsed) — no WebSocket/Realtime, matching the codebase's existing Kaspi-payment-confirmation polling precedent.
- Anti-abuse: a per-`visitorId` message-count rate limit on the send endpoint (public widget key is not a secret, same trust model as any embeddable chat widget).
- Visitor identity: a `crypto.randomUUID()` generated once by the widget script and persisted in `localStorage`, used as `external_thread_id` for the `website` channel — same role Telegram's chat id / WhatsApp's phone number play for their channels.
- Both new public API routes need CORS (`Access-Control-Allow-Origin: *` — safe here because neither route carries any cookie/session auth; the widget key is the entire trust boundary) — this codebase has zero prior CORS-handling code, so this is new plumbing, not a copy of an existing pattern.
- Scenario buttons on the website channel render as real HTML buttons with no platform button-count limit (unlike WhatsApp's 3/10 or Instagram's 13 caps).
- Out of scope (do not build): domain restriction per widget key, widget color/theme customization, visitor file/photo upload, cross-device history, browser push notifications while collapsed.

---

### Task 1: Migration — outbound message buttons

**Files:** none in repo (DB-only).

- [ ] **Step 1:** Supabase MCP `apply_migration` (project `terjitbqgrjlqezyydql`, name `ai_agent_messages_buttons`):

```sql
alter table ai_agent_messages add column buttons jsonb;
```

`buttons` stays `null` for every existing channel and every non-flow website message — only the website channel's flow-step sender (Task 4) ever populates it, since Telegram/WhatsApp/Instagram render their buttons through their own platform API instead of storing them on the row.

- [ ] **Step 2:** Verify via `execute_sql`:

```sql
select column_name, data_type, is_nullable from information_schema.columns
where table_name = 'ai_agent_messages' and column_name = 'buttons';
```

Expected: `buttons` is `jsonb`, nullable.

No commit (no repo files changed).

---

### Task 2: `buildBusinessContextLine` — website channel wording

**Files:**
- Modify: `src/lib/aiAgent/promptContext.ts`
- Modify: `src/lib/aiAgent/promptContext.test.ts`

**Interfaces:**
- Produces (consumed by Task 4): `BusinessContext.channel` accepts `'website'` in addition to the existing three values.

- [ ] **Step 1: Write the failing test** — append to `src/lib/aiAgent/promptContext.test.ts`, inside the existing `describe` block that already has the telegram/whatsapp channel tests:

```ts
  it('uses website wording when channel is website', () => {
    const line = buildBusinessContextLine({ name: 'X', tone: 'friendly', description: '', goal: 'answer_questions', channel: 'website' })
    expect(line).toContain('бизнес-аккаунта в чате на сайте')
    expect(line).not.toContain('Instagram')
    expect(line).not.toContain('Telegram')
    expect(line).not.toContain('WhatsApp')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/aiAgent/promptContext.test.ts`
Expected: FAIL — `channel: 'website'` isn't assignable to `BusinessContext.channel`'s current type, and even if it were, the wording would say "Instagram" (the ternary's fallback).

- [ ] **Step 3: Extend the type and the wording** — in `src/lib/aiAgent/promptContext.ts`, change:

```ts
  channel?: 'instagram' | 'telegram' | 'whatsapp'
```

to:

```ts
  channel?: 'instagram' | 'telegram' | 'whatsapp' | 'website'
```

Then change:

```ts
  const channelLabel = ctx.channel === 'telegram' ? 'Telegram' : ctx.channel === 'whatsapp' ? 'WhatsApp' : 'Instagram'
```

to:

```ts
  const channelLabel = ctx.channel === 'telegram' ? 'Telegram' : ctx.channel === 'whatsapp' ? 'WhatsApp' : ctx.channel === 'website' ? 'чате на сайте' : 'Instagram'
```

(the surrounding sentence template is `Ты отвечаешь от имени бизнес-аккаунта в ${channelLabel} (...)` — "в чате на сайте" reads naturally there, unlike a bare platform-name substitution.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/aiAgent/promptContext.test.ts`
Expected: PASS (all tests in the file, including the 3 pre-existing channel tests unchanged).

- [ ] **Step 5: Run the gate**

Run: `npx tsc --noEmit` → expect clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/aiAgent/promptContext.ts src/lib/aiAgent/promptContext.test.ts
git status --short
git commit -m "feat(ai-agent): website channel wording in the AI prompt's business context line"
```

---

### Task 3: Widget key/rate-limit helpers + CORS response helper

**Files:**
- Create: `src/lib/aiAgent/widget.ts`
- Create: `src/lib/aiAgent/widget.test.ts`
- Create: `src/lib/aiAgent/corsJson.ts`

**Interfaces:**
- Produces (consumed by Task 5): `generateWidgetKey(): string`, `isValidWidgetKeyFormat(key: string): boolean`, `WIDGET_MESSAGE_RATE_LIMIT: number`, `WIDGET_MESSAGE_RATE_WINDOW_MS: number`, `exceedsRateLimit(recentMessageCount: number): boolean`, `corsJson(body: unknown, status?: number): NextResponse`, `corsPreflight(): NextResponse`.

- [ ] **Step 1: Write the failing tests** — full file `src/lib/aiAgent/widget.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { generateWidgetKey, isValidWidgetKeyFormat, exceedsRateLimit, WIDGET_MESSAGE_RATE_LIMIT } from './widget'

describe('generateWidgetKey', () => {
  it('produces a key matching the expected format', () => {
    const key = generateWidgetKey()
    expect(isValidWidgetKeyFormat(key)).toBe(true)
  })

  it('produces a different key on every call', () => {
    expect(generateWidgetKey()).not.toBe(generateWidgetKey())
  })
})

describe('isValidWidgetKeyFormat', () => {
  it('accepts a well-formed key', () => {
    expect(isValidWidgetKeyFormat('wgt_' + 'a'.repeat(24))).toBe(true)
  })

  it('rejects a missing prefix, wrong length, or non-hex characters', () => {
    expect(isValidWidgetKeyFormat('a'.repeat(24))).toBe(false)
    expect(isValidWidgetKeyFormat('wgt_' + 'a'.repeat(10))).toBe(false)
    expect(isValidWidgetKeyFormat('wgt_' + 'z'.repeat(24))).toBe(false)
    expect(isValidWidgetKeyFormat('')).toBe(false)
  })
})

describe('exceedsRateLimit', () => {
  it('is false below the limit, true at and above it', () => {
    expect(exceedsRateLimit(WIDGET_MESSAGE_RATE_LIMIT - 1)).toBe(false)
    expect(exceedsRateLimit(WIDGET_MESSAGE_RATE_LIMIT)).toBe(true)
    expect(exceedsRateLimit(WIDGET_MESSAGE_RATE_LIMIT + 1)).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/aiAgent/widget.test.ts`
Expected: FAIL — `./widget` does not exist yet.

- [ ] **Step 3: Implement** — full file `src/lib/aiAgent/widget.ts`:

```ts
import crypto from 'crypto'

const WIDGET_KEY_PATTERN = /^wgt_[0-9a-f]{24}$/

export function generateWidgetKey(): string {
  return 'wgt_' + crypto.randomBytes(12).toString('hex')
}

export function isValidWidgetKeyFormat(key: string): boolean {
  return WIDGET_KEY_PATTERN.test(key)
}

// A script tag's data-key is visible to anyone who views the seller's page
// source (the normal, accepted trust model for any embeddable chat widget --
// Intercom/Crisp work the same way), so this limit protects against
// wallet-draining spam, not identity spoofing.
export const WIDGET_MESSAGE_RATE_LIMIT = 10
export const WIDGET_MESSAGE_RATE_WINDOW_MS = 60_000

export function exceedsRateLimit(recentMessageCount: number): boolean {
  return recentMessageCount >= WIDGET_MESSAGE_RATE_LIMIT
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/aiAgent/widget.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Create the CORS helper** — full file `src/lib/aiAgent/corsJson.ts`:

```ts
import { NextResponse } from 'next/server'

// Public widget API routes run cross-origin -- the embed script executes on
// an arbitrary seller's own domain, never invoices.kz itself. Wide-open CORS
// is safe specifically because these routes carry NO cookie/session auth at
// all; the widget's public key (visible in the page source anyway) is the
// entire trust boundary, same as any embeddable chat widget's origin policy.
export function corsJson(body: unknown, status: number = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Access-Control-Allow-Origin': '*' } })
}

export function corsPreflight(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
```

- [ ] **Step 6: Run the gate**

Run: `npx tsc --noEmit` → expect clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/aiAgent/widget.ts src/lib/aiAgent/widget.test.ts src/lib/aiAgent/corsJson.ts
git status --short
git commit -m "feat(ai-agent): widget key/rate-limit helpers + CORS response helper"
```

---

### Task 4: `websiteWebhookHandler.ts`

**Files:**
- Modify: `src/lib/aiAgent/channelSend.ts`
- Create: `src/lib/aiAgent/websiteWebhookHandler.ts`

**Interfaces:**
- Consumes: `findTemplateMatch`, `mergeCollectedData`, `findStopPhraseMatch`, `STOP_PHRASE_ACK_TEXT` (`./webhookHandler`); `pairConversationHistory` (`./telegram`); `startFlow`, `handleFlowButtonClick`, `FLOW_STALE_TEXT`, `type FlowStepSender` (`./flowEngine`); `findFlowTriggerMatch`, `type FlowStep` (`./flow`); `sendIntoConversation` (`./channelSend`); `generateAiReply` (`@/lib/instagramAiReply`); `buildBusinessContextLine`, `buildCollectFieldsToExtract`, `buildCatalogBlock` (`./promptContext`); `loadAgentCatalog` (`./catalogContext`); `buildInvoiceToolExecutor` (`./invoiceSend`); `debitAiAgentWallet`, `AI_AGENT_CREDITS_PER_AI_REPLY` (`./wallet`); `createNotification` (`@/lib/notifications`); `sendTelegramNotification` (`@/lib/telegramNotify`).
- Produces (consumed by Task 5): `WebsiteTenantConnection = { connectionId: string; agentId: string; widgetKey: string }`, `loadWebsiteConnection(widgetKey: string): Promise<WebsiteTenantConnection | null>`, `handleWebsiteIncoming(conn: WebsiteTenantConnection, params: {externalId: string; visitorId: string; text: string; isButtonClick: boolean}): Promise<void>`.

- [ ] **Step 1: Give `sendIntoConversation` a website branch** — this shared function (`channelSend.ts`) is used by Task 4's own stop-phrase/template code below AND by anything else that ever calls it for a website-channel conversation; without this step, every one of those calls silently returns `'неизвестный канал website'` and nothing ever reaches the widget. In `src/lib/aiAgent/channelSend.ts`, change:

```ts
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
```

to:

```ts
    if (conversation.channel === 'telegram') {
      await sendTelegramBotMessage(accessToken, conversation.external_thread_id, text)
    } else if (conversation.channel === 'whatsapp') {
      await sendWhatsAppMessage(connection.external_account_id, conversation.external_thread_id, text, { accessToken })
    } else if (conversation.channel === 'instagram') {
      await sendDirectMessage(conversation.external_thread_id, text, {
        igUserId: connection.external_account_id,
        accessToken,
      })
    } else if (conversation.channel === 'website') {
      // No external send API for this channel -- the outbound row inserted
      // below IS the delivery mechanism (the widget's own poll picks it up).
    } else {
      return `неизвестный канал ${conversation.channel}`
    }
```

Run `npx tsc --noEmit` and `npx vitest run` right after this one-line change (before continuing to Step 2) to confirm the existing Telegram/WhatsApp/Instagram call sites are untouched.

- [ ] **Step 2: Create `src/lib/aiAgent/websiteWebhookHandler.ts`** — full file:

```ts
import { createClient } from '@supabase/supabase-js'
import { generateAiReply } from '@/lib/instagramAiReply'
import { buildBusinessContextLine, buildCollectFieldsToExtract, buildCatalogBlock, AgentTone, AgentGoal } from './promptContext'
import { loadAgentCatalog } from './catalogContext'
import { buildInvoiceToolExecutor } from './invoiceSend'
import { debitAiAgentWallet, AI_AGENT_CREDITS_PER_AI_REPLY } from './wallet'
import { sendTelegramNotification } from '@/lib/telegramNotify'
import { createNotification } from '@/lib/notifications'
import { findTemplateMatch, mergeCollectedData, findStopPhraseMatch, STOP_PHRASE_ACK_TEXT } from './webhookHandler'
import { pairConversationHistory } from './telegram'
import { findFlowTriggerMatch, type FlowStep } from './flow'
import { startFlow, handleFlowButtonClick, FLOW_STALE_TEXT, type FlowStepSender } from './flowEngine'
import { sendIntoConversation } from './channelSend'

// The website tenant pipeline -- a fourth twin of telegramWebhookHandler.ts/
// whatsappWebhookHandler.ts/webhookHandler.ts, driven by direct POSTs from
// the embed widget instead of a platform webhook. Genuinely simpler in one
// respect (no external send API to call -- "sending" a reply is just
// inserting the outbound row; the widget's own poll picks it up) and
// structurally different in one respect (a single POST endpoint carries
// BOTH ordinary messages and flow-button clicks, distinguished by
// isButtonClick, rather than a webhook route seeing a different payload
// shape per event type).

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface WebsiteTenantConnection {
  connectionId: string
  agentId: string
  widgetKey: string
}

export async function loadWebsiteConnection(widgetKey: string): Promise<WebsiteTenantConnection | null> {
  const { data } = await supabase
    .from('ai_agent_channel_connections')
    .select('id, agent_id, external_account_id')
    .eq('channel', 'website')
    .eq('external_account_id', widgetKey)
    .eq('status', 'active')
    .maybeSingle()
  if (!data) return null
  return { connectionId: data.id, agentId: data.agent_id, widgetKey: data.external_account_id }
}

// Website has no external send API -- "delivering" a flow step means
// writing the outbound row with its buttons attached (a nullable jsonb
// column only this channel ever populates); the widget's own poll renders
// them as real HTML buttons, with no platform button-count limit.
function makeWebsiteFlowSender(conversationId: string): FlowStepSender {
  return async (step: FlowStep) => {
    const { error } = await supabase.from('ai_agent_messages').insert({
      conversation_id: conversationId,
      direction: 'outbound',
      text: step.text,
      is_ai_generated: false,
      status: 'sent',
      buttons: step.buttons.length > 0 ? step.buttons.map((b, i) => ({ label: b.label, payload: `btn:${step.id}:${i}` })) : null,
    })
    if (error) {
      console.error('ai-agent website widget: flow step send failed:', error.message)
      return false
    }
    return true
  }
}

interface WebsiteIncomingParams {
  externalId: string
  visitorId: string
  text: string
  isButtonClick: boolean
}

export async function handleWebsiteIncoming(conn: WebsiteTenantConnection, params: WebsiteIncomingParams): Promise<void> {
  const { data: existingMsg } = await supabase
    .from('ai_agent_messages')
    .select('id')
    .eq('external_id', params.externalId)
    .maybeSingle()
  if (existingMsg) return

  const { data: agent } = await supabase.from('ai_agents').select('*').eq('id', conn.agentId).single()
  if (!agent) return
  if (agent.is_enabled === false) return

  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .upsert({
      agent_id: conn.agentId,
      channel: 'website',
      external_thread_id: params.visitorId,
      customer_handle: 'посетитель сайта',
    }, { onConflict: 'agent_id,channel,external_thread_id', ignoreDuplicates: false })
    .select('id, paused_for_human')
    .single()
  if (!conversation) return

  const conversationRef = { id: conversation.id, agent_id: conn.agentId, channel: 'website', external_thread_id: params.visitorId }

  // Conditional claim, same idiom as paused_for_human below -- see
  // whatsappWebhookHandler.ts's identical comment for why a plain "count
  // prior messages" check isn't safe against two genuinely concurrent
  // first messages. Skipped entirely for a button click: that can only ever
  // happen once a flow is already active, which itself requires at least
  // one prior message to have started it.
  let isFirstMessage = false
  if (!params.isButtonClick) {
    const { data: startClaim } = await supabase.from('ai_agent_conversations')
      .update({ start_flow_triggered: true }).eq('id', conversation.id).eq('start_flow_triggered', false).select('id')
    isFirstMessage = !!(startClaim && startClaim.length > 0)
  }

  const { error: insertError } = await supabase.from('ai_agent_messages').insert({
    conversation_id: conversation.id,
    direction: 'inbound',
    text: params.isButtonClick ? `[кнопка] ${params.text}` : params.text,
    external_id: params.externalId,
  })
  if (insertError) {
    if (insertError.code !== '23505') {
      console.error('ai-agent website widget: failed to log inbound message for', params.externalId, ':', insertError.message)
    }
    return
  }

  if (params.isButtonClick) {
    if (conversation.paused_for_human) return
    const result = await handleFlowButtonClick(supabase, conversationRef, params.text, makeWebsiteFlowSender(conversation.id))
    if (result.outcome === 'stale') {
      await sendIntoConversation(supabase, conversationRef, FLOW_STALE_TEXT)
    }
    return
  }

  if (isFirstMessage) {
    const { data: startFlowRow } = await supabase
      .from('ai_agent_flows')
      .select('id, definition')
      .eq('agent_id', conn.agentId)
      .eq('is_start', true)
      .maybeSingle()
    if (startFlowRow) {
      await startFlow(supabase, conversationRef, startFlowRow, makeWebsiteFlowSender(conversation.id))
      return
    }
  }

  if (conversation.paused_for_human) return

  if (findStopPhraseMatch(params.text, Array.isArray(agent.stop_phrases) ? agent.stop_phrases : [])) {
    const { data: claimed } = await supabase.from('ai_agent_conversations')
      .update({ paused_for_human: true }).eq('id', conversation.id).eq('paused_for_human', false).select('id')
    if (!claimed || claimed.length === 0) return
    await sendIntoConversation(supabase, conversationRef, STOP_PHRASE_ACK_TEXT)
    await createNotification(agent.user_id, 'Клиент попросил оператора', params.text.slice(0, 120), '/ai-agent/dialogs')
    return
  }

  const { data: templates } = await supabase
    .from('ai_agent_reply_templates')
    .select('id, trigger_words, reply_text')
    .eq('agent_id', conn.agentId)
    .or('channel.is.null,channel.eq.dm')
    .order('created_at', { ascending: true })
  const match = findTemplateMatch(params.text, templates || [])
  if (match) {
    await sendIntoConversation(supabase, conversationRef, match.reply_text)
    return
  }

  const { data: flows } = await supabase
    .from('ai_agent_flows')
    .select('id, trigger_words, definition')
    .eq('agent_id', conn.agentId)
    .order('created_at', { ascending: true })
  const matchedFlowId = findFlowTriggerMatch(params.text, flows || [])
  const matchedFlow = matchedFlowId ? (flows || []).find(f => f.id === matchedFlowId) : undefined
  if (matchedFlow) {
    await startFlow(supabase, conversationRef, matchedFlow, makeWebsiteFlowSender(conversation.id))
    return
  }

  const historyPairs = typeof agent.history_pairs === 'number' && agent.history_pairs >= 0 ? agent.history_pairs : 5
  let conversationHistory: { incoming: string; reply: string }[] | undefined
  if (historyPairs > 0) {
    const { data: historyRows } = await supabase
      .from('ai_agent_messages')
      .select('direction, text, status, created_at')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: false })
      .limit(Math.min(historyPairs * 4, 80))
    const pairs = pairConversationHistory((historyRows || []).slice().reverse(), historyPairs)
    if (pairs.length > 0) conversationHistory = pairs
  }

  let draftReply: string
  let urgent: boolean
  let extractedFields: Record<string, string> | undefined
  try {
    const catalogBlock = buildCatalogBlock(await loadAgentCatalog(supabase, agent.user_id))
    const result = await generateAiReply({
      incomingText: params.text,
      fromUsername: 'посетитель сайта',
      source: 'dm',
      conversationHistory,
      businessContextLine: buildBusinessContextLine({
        name: agent.name,
        tone: agent.tone as AgentTone,
        description: agent.business_description,
        goal: agent.goal as AgentGoal,
        collectFields: Array.isArray(agent.collect_fields) ? agent.collect_fields : undefined,
        timezone: agent.timezone || undefined,
        currency: agent.currency || undefined,
        customInstructions: typeof agent.custom_instructions === 'string' ? agent.custom_instructions : undefined,
        channel: 'website',
      }) + catalogBlock,
      collectFieldsToExtract: buildCollectFieldsToExtract(Array.isArray(agent.collect_fields) ? agent.collect_fields : undefined),
      invoiceTool: buildInvoiceToolExecutor(supabase, { id: agent.id, status: agent.status }, conversation.id),
    })
    draftReply = result.replyText
    urgent = result.urgent
    extractedFields = result.extractedFields
  } catch (err: any) {
    console.error('ai-agent website widget: AI reply generation failed for', params.externalId, ':', err.message)
    return
  }

  if (extractedFields && Object.keys(extractedFields).length > 0) {
    await mergeCollectedData(conversation.id, extractedFields)
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

    if (inserted) {
      await createNotification(agent.user_id, 'Новый черновик ответа на проверке', draftReply.slice(0, 120), '/ai-agent/review')
    }

    const { data: profile } = await supabase.from('profiles').select('telegram_chat_id, notify_telegram').eq('id', agent.user_id).single()
    if (profile?.notify_telegram && profile.telegram_chat_id && inserted) {
      try {
        await sendTelegramNotification(profile.telegram_chat_id, 'У вас новый черновик ответа на проверке в AI-агенте: https://www.invoices.kz/ai-agent/review')
      } catch (telegramErr: any) {
        console.error('ai-agent website widget: training-mode nudge failed for user', agent.user_id, ':', telegramErr.message)
      }
    }
    return
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
    await debitAiAgentWallet(agent.user_id, AI_AGENT_CREDITS_PER_AI_REPLY, 'ИИ-ответ: Сайт')
  } catch (walletErr: any) {
    console.error('ai-agent website widget: wallet debit failed for user', agent.user_id, ':', walletErr.message)
  }
}
```

- [ ] **Step 3: Run the gate**

Run: `npx tsc --noEmit` → expect clean.
Run: `npx vitest run` → expect all pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/aiAgent/channelSend.ts src/lib/aiAgent/websiteWebhookHandler.ts
git status --short
git commit -m "feat(ai-agent): website tenant pipeline -- templates, scenarios, AI reply, operator pause"
```

---

### Task 5: Public widget API — send + poll

**Files:**
- Create: `src/app/api/ai-agent/widget/message/route.ts`
- Create: `src/app/api/ai-agent/widget/messages/route.ts`

**Interfaces:**
- Consumes: `loadWebsiteConnection`, `handleWebsiteIncoming` (`@/lib/aiAgent/websiteWebhookHandler`); `isValidWidgetKeyFormat`, `exceedsRateLimit`, `WIDGET_MESSAGE_RATE_WINDOW_MS` (`@/lib/aiAgent/widget`); `corsJson`, `corsPreflight` (`@/lib/aiAgent/corsJson`).
- Produces (consumed by Task 6): `POST /api/ai-agent/widget/message` body `{widgetKey, visitorId, text, isButtonClick?}` → `{ok: true}` or 400/404/429 `{error}`. `GET /api/ai-agent/widget/messages?widgetKey&visitorId&since?` → `{messages: {id, direction, text, buttons, createdAt}[]}`.

- [ ] **Step 1: Create `src/app/api/ai-agent/widget/message/route.ts`** — full file:

```ts
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { loadWebsiteConnection, handleWebsiteIncoming } from '@/lib/aiAgent/websiteWebhookHandler'
import { isValidWidgetKeyFormat, exceedsRateLimit, WIDGET_MESSAGE_RATE_WINDOW_MS } from '@/lib/aiAgent/widget'
import { corsJson, corsPreflight } from '@/lib/aiAgent/corsJson'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function OPTIONS() {
  return corsPreflight()
}

// Public, cross-origin, unauthenticated -- the widget's own JS calls this
// directly from whatever domain the seller embedded it on. No webhook
// redelivery concept exists here (unlike Telegram/WhatsApp/Instagram), so
// externalId is generated fresh per call rather than sourced from a
// platform -- there is nothing to deduplicate a genuine double-send against.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const widgetKey = typeof body?.widgetKey === 'string' ? body.widgetKey : ''
  const visitorId = typeof body?.visitorId === 'string' ? body.visitorId.trim() : ''
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  const isButtonClick = !!body?.isButtonClick
  if (!isValidWidgetKeyFormat(widgetKey) || !visitorId || !text || text.length > 2000) {
    return corsJson({ error: 'invalid_request' }, 400)
  }

  const conn = await loadWebsiteConnection(widgetKey)
  if (!conn) return corsJson({ error: 'not_found' }, 404)

  // Rate limit scoped to (agent, visitor) -- counts messages this visitor's
  // conversation has received in the last minute, regardless of whether it
  // already exists yet (a brand-new visitor's first message always passes).
  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .select('id')
    .eq('agent_id', conn.agentId)
    .eq('channel', 'website')
    .eq('external_thread_id', visitorId)
    .maybeSingle()
  if (conversation) {
    const { count } = await supabase
      .from('ai_agent_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversation.id)
      .eq('direction', 'inbound')
      .gte('created_at', new Date(Date.now() - WIDGET_MESSAGE_RATE_WINDOW_MS).toISOString())
    if (exceedsRateLimit(count ?? 0)) {
      return corsJson({ error: 'rate_limited' }, 429)
    }
  }

  await handleWebsiteIncoming(conn, { externalId: crypto.randomUUID(), visitorId, text, isButtonClick })
  return corsJson({ ok: true })
}
```

- [ ] **Step 2: Create `src/app/api/ai-agent/widget/messages/route.ts`** — full file:

```ts
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadWebsiteConnection } from '@/lib/aiAgent/websiteWebhookHandler'
import { isValidWidgetKeyFormat } from '@/lib/aiAgent/widget'
import { corsJson, corsPreflight } from '@/lib/aiAgent/corsJson'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function OPTIONS() {
  return corsPreflight()
}

// Public, cross-origin, unauthenticated -- polled by the widget every 5s.
// `since` omitted (first call after the widget mounts) returns the full
// existing history for this visitor; every later call passes the latest
// `createdAt` it has already rendered, so the response never repeats a
// message the widget already has (no separate client-side dedup needed).
export async function GET(req: NextRequest) {
  const widgetKey = req.nextUrl.searchParams.get('widgetKey') || ''
  const visitorId = (req.nextUrl.searchParams.get('visitorId') || '').trim()
  const since = req.nextUrl.searchParams.get('since')
  if (!isValidWidgetKeyFormat(widgetKey) || !visitorId) {
    return corsJson({ error: 'invalid_request' }, 400)
  }

  const conn = await loadWebsiteConnection(widgetKey)
  if (!conn) return corsJson({ error: 'not_found' }, 404)

  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .select('id')
    .eq('agent_id', conn.agentId)
    .eq('channel', 'website')
    .eq('external_thread_id', visitorId)
    .maybeSingle()
  if (!conversation) return corsJson({ messages: [] })

  let query = supabase
    .from('ai_agent_messages')
    .select('id, direction, text, buttons, created_at')
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: true })
  if (since) query = query.gt('created_at', since)

  const { data: rows, error } = await query
  if (error) return corsJson({ error: error.message }, 500)

  const messages = (rows || []).map(r => ({
    id: r.id,
    direction: r.direction,
    text: r.text,
    buttons: r.buttons as { label: string; payload: string }[] | null,
    createdAt: r.created_at,
  }))
  return corsJson({ messages })
}
```

- [ ] **Step 3: Run the gate**

Run: `npx tsc --noEmit` → expect clean.
Run: `npx vitest run` → expect all pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ai-agent/widget
git status --short
git commit -m "feat(ai-agent): public widget API -- send message, poll for replies (CORS, rate-limited)"
```

---

### Task 6: Embeddable widget script

**Files:**
- Create: `public/widget.js`

**Interfaces:**
- Consumes: Task 5's two API routes.

- [ ] **Step 1: Create `public/widget.js`** — full file (plain JS, no build step, self-contained, Shadow DOM for style isolation):

```js
(function () {
  'use strict';

  var scriptTag = document.currentScript;
  var widgetKey = scriptTag && scriptTag.getAttribute('data-key');
  if (!widgetKey) {
    console.error('invoices.kz widget: data-key attribute missing on the script tag');
    return;
  }

  var API_BASE = 'https://www.invoices.kz/api/ai-agent/widget';
  var STORAGE_KEY = 'invoiceskz_widget_visitor_id';
  var POLL_INTERVAL_MS = 5000;

  function getVisitorId() {
    var id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  }

  var visitorId = getVisitorId();
  var since = null;
  var pollTimer = null;
  var isOpen = false;

  var host = document.createElement('div');
  host.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483000;';
  document.body.appendChild(host);
  var root = host.attachShadow({ mode: 'open' });

  var style = document.createElement('style');
  style.textContent = [
    '.bubble{width:56px;height:56px;border-radius:50%;background:#4f46e5;color:#fff;border:none;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,0.25);font-size:26px;display:flex;align-items:center;justify-content:center;}',
    '.panel{display:none;flex-direction:column;width:320px;height:440px;background:#fff;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,0.25);position:absolute;bottom:70px;right:0;overflow:hidden;font-family:system-ui,sans-serif;}',
    '.panel.open{display:flex;}',
    '.header{background:#4f46e5;color:#fff;padding:12px 14px;font-size:14px;font-weight:600;}',
    '.messages{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px;}',
    '.msg{max-width:80%;padding:8px 10px;border-radius:10px;font-size:13px;line-height:1.4;white-space:pre-wrap;}',
    '.msg.in{align-self:flex-end;background:#4f46e5;color:#fff;}',
    '.msg.out{align-self:flex-start;background:#f1f1f4;color:#111;}',
    '.buttons{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;}',
    '.btn{border:1px solid #4f46e5;color:#4f46e5;background:#fff;border-radius:8px;padding:5px 9px;font-size:12px;cursor:pointer;}',
    '.inputRow{display:flex;border-top:1px solid #eee;padding:8px;gap:6px;}',
    '.inputRow input{flex:1;border:1px solid #ddd;border-radius:8px;padding:8px 10px;font-size:13px;outline:none;}',
    '.inputRow button{background:#4f46e5;color:#fff;border:none;border-radius:8px;padding:8px 12px;font-size:13px;cursor:pointer;}',
  ].join('\n');
  root.appendChild(style);

  var bubble = document.createElement('button');
  bubble.className = 'bubble';
  bubble.textContent = '💬';
  root.appendChild(bubble);

  var panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML =
    '<div class="header">Чат с нами</div>' +
    '<div class="messages"></div>' +
    '<div class="inputRow"><input type="text" placeholder="Напишите сообщение…" /><button>➤</button></div>';
  root.appendChild(panel);

  var messagesEl = panel.querySelector('.messages');
  var inputEl = panel.querySelector('input');
  var sendBtn = panel.querySelector('.inputRow button');

  function renderMessage(m) {
    var row = document.createElement('div');
    row.className = 'msg ' + (m.direction === 'inbound' ? 'in' : 'out');
    row.textContent = m.text;
    messagesEl.appendChild(row);

    if (m.buttons && m.buttons.length > 0) {
      var wrap = document.createElement('div');
      wrap.className = 'buttons';
      m.buttons.forEach(function (b) {
        var btn = document.createElement('button');
        btn.className = 'btn';
        btn.textContent = b.label;
        btn.onclick = function () { send(b.payload, true); };
        wrap.appendChild(btn);
      });
      messagesEl.appendChild(wrap);
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function poll() {
    var url = API_BASE + '/messages?widgetKey=' + encodeURIComponent(widgetKey) + '&visitorId=' + encodeURIComponent(visitorId) + (since ? '&since=' + encodeURIComponent(since) : '');
    fetch(url).then(function (r) { return r.json(); }).then(function (data) {
      var messages = data.messages || [];
      messages.forEach(function (m) {
        if (m.direction === 'outbound') renderMessage(m);
        since = m.createdAt;
      });
    }).catch(function () { /* transient network hiccup -- next tick retries */ });
  }

  function startPolling() {
    if (pollTimer) return;
    poll();
    pollTimer = setInterval(poll, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  function send(text, isButtonClick) {
    if (!text) return;
    if (!isButtonClick) {
      renderMessage({ direction: 'inbound', text: text, buttons: null });
    }
    fetch(API_BASE + '/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ widgetKey: widgetKey, visitorId: visitorId, text: text, isButtonClick: !!isButtonClick }),
    }).then(function () { poll(); }).catch(function () { /* the next scheduled poll still runs */ });
  }

  sendBtn.onclick = function () {
    var text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    send(text, false);
  };
  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') sendBtn.onclick();
  });

  bubble.onclick = function () {
    isOpen = !isOpen;
    panel.classList.toggle('open', isOpen);
    if (isOpen) startPolling(); else stopPolling();
  };
})();
```

- [ ] **Step 2: Commit**

```bash
git add public/widget.js
git status --short
git commit -m "feat(ai-agent): embeddable website chat widget script"
```

---

### Task 7: Settings UI — connect the widget, show it everywhere else

**Files:**
- Create: `src/app/api/ai-agent/website/connect/route.ts`
- Modify: `src/app/api/ai-agent/agents/route.ts`
- Modify: `src/app/ai-agent/settings/page.tsx`
- Modify: `src/app/ai-agent/dialogs/page.tsx`
- Modify: `src/app/ai-agent/leads/page.tsx`

**Interfaces:**
- Consumes: `generateWidgetKey` (`@/lib/aiAgent/widget`); `encryptAtRest` (`@/lib/kaspiPay/crypto`); `getKey` (`@/lib/aiAgent/connection`).
- Produces: `POST /api/ai-agent/website/connect` body `{agentId}` → `{connected: true, widgetKey}`. `DELETE /api/ai-agent/website/connect` body `{agentId}` → `{disconnected: true}`.

- [ ] **Step 1: Create `src/app/api/ai-agent/website/connect/route.ts`** — full file:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { encryptAtRest } from '@/lib/kaspiPay/crypto'
import { getKey } from '@/lib/aiAgent/connection'
import { generateWidgetKey } from '@/lib/aiAgent/widget'

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

// Unlike Telegram/Instagram/WhatsApp there is no external platform to talk
// to here -- "connecting" is just generating a public widget key and
// storing the row. Idempotent: an agent that already has a website
// connection gets its EXISTING key back rather than a second row, so a
// stray extra click never silently orphans an already-embedded script tag.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const agentId = body?.agentId
  if (!agentId || typeof agentId !== 'string') return NextResponse.json({ error: 'agentId required' }, { status: 400 })

  const { data: agent } = await supabase.from('ai_agents').select('id').eq('id', agentId).eq('user_id', user.id).maybeSingle()
  if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: existing } = await supabase
    .from('ai_agent_channel_connections')
    .select('external_account_id')
    .eq('agent_id', agentId)
    .eq('channel', 'website')
    .maybeSingle()
  if (existing) return NextResponse.json({ connected: true, widgetKey: existing.external_account_id })

  const widgetKey = generateWidgetKey()
  // access_token_enc has no real meaning for this channel (no external API,
  // no real credential) -- a random value is stored purely to satisfy the
  // column's NOT NULL constraint and is never read back as a credential.
  const placeholderSecret = crypto.randomBytes(32).toString('hex')

  const { error } = await supabase.from('ai_agent_channel_connections').insert({
    agent_id: agentId,
    channel: 'website',
    external_account_id: widgetKey,
    access_token_enc: encryptAtRest(placeholderSecret, getKey()),
    status: 'active',
  })
  if (error) {
    console.error('ai-agent website connect: insert failed:', error.message)
    return NextResponse.json({ error: 'connect_failed' }, { status: 500 })
  }

  return NextResponse.json({ connected: true, widgetKey })
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const agentId = body?.agentId
  if (!agentId || typeof agentId !== 'string') return NextResponse.json({ error: 'agentId required' }, { status: 400 })

  const { data: agent } = await supabase.from('ai_agents').select('id').eq('id', agentId).eq('user_id', user.id).maybeSingle()
  if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  await supabase.from('ai_agent_channel_connections').delete().eq('agent_id', agentId).eq('channel', 'website')
  return NextResponse.json({ disconnected: true })
}
```

- [ ] **Step 2: Extend the agents-list route to return the widget key** — in `src/app/api/ai-agent/agents/route.ts`, change:

```ts
        .select('agent_id, channel, external_account_name, status')
        .in('agent_id', agentIds)
    : { data: [] }

  const connectionsByAgent: Record<string, { channel: string; external_account_name: string | null; status: string }[]> = {}
  for (const c of connections || []) {
    if (!connectionsByAgent[c.agent_id]) connectionsByAgent[c.agent_id] = []
    connectionsByAgent[c.agent_id].push({ channel: c.channel, external_account_name: c.external_account_name, status: c.status })
  }
```

to:

```ts
        .select('agent_id, channel, external_account_id, external_account_name, status')
        .in('agent_id', agentIds)
    : { data: [] }

  const connectionsByAgent: Record<string, { channel: string; external_account_id: string; external_account_name: string | null; status: string }[]> = {}
  for (const c of connections || []) {
    if (!connectionsByAgent[c.agent_id]) connectionsByAgent[c.agent_id] = []
    connectionsByAgent[c.agent_id].push({ channel: c.channel, external_account_id: c.external_account_id, external_account_name: c.external_account_name, status: c.status })
  }
```

(the other 3 channels' cards ignore the new field entirely -- only the website card in Step 3 below reads it.)

- [ ] **Step 3: Wire the settings page's existing placeholder card into a real one** — in `src/app/ai-agent/settings/page.tsx`:

Change the `connections` state type:

```ts
  const [connections, setConnections] = useState<{ channel: string; external_account_name: string | null; status: string }[]>([])
```

to:

```ts
  const [connections, setConnections] = useState<{ channel: string; external_account_id: string; external_account_name: string | null; status: string }[]>([])
```

Add state hooks near the existing `tgBusy`/`tgError` declarations:

```ts
  const [websiteBusy, setWebsiteBusy] = useState(false)
  const [websiteError, setWebsiteError] = useState<string | null>(null)
  const [websiteCopied, setWebsiteCopied] = useState(false)
```

Add a `websiteConnection` lookup alongside the existing three:

```ts
  const instagramConnection = connections.find(c => c.channel === 'instagram')
  const telegramConnection = connections.find(c => c.channel === 'telegram')
  const whatsappConnection = connections.find(c => c.channel === 'whatsapp')
  const websiteConnection = connections.find(c => c.channel === 'website')
```

Add the connect/disconnect functions near `connectTelegram`/`disconnectTelegram`:

```ts
  async function connectWebsite() {
    if (!agentId) return
    setWebsiteBusy(true)
    setWebsiteError(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/website/connect', {
        method: 'POST', headers, body: JSON.stringify({ agentId }),
      })
      if (res.ok) {
        const data = await res.json()
        setConnections(prev => [...prev.filter(c => c.channel !== 'website'), { channel: 'website', external_account_id: data.widgetKey, external_account_name: null, status: 'active' }])
      } else {
        setWebsiteError('Не удалось подключить чат-виджет. Попробуйте ещё раз.')
      }
    } catch {
      setWebsiteError('Не удалось подключить чат-виджет. Попробуйте ещё раз.')
    }
    setWebsiteBusy(false)
  }

  async function disconnectWebsite() {
    if (!agentId) return
    setWebsiteBusy(true)
    setWebsiteError(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/website/connect', {
        method: 'DELETE', headers, body: JSON.stringify({ agentId }),
      })
      if (res.ok) {
        setConnections(prev => prev.filter(c => c.channel !== 'website'))
      } else {
        setWebsiteError('Не удалось отключить чат-виджет. Попробуйте ещё раз.')
      }
    } catch {
      setWebsiteError('Не удалось отключить чат-виджет. Попробуйте ещё раз.')
    }
    setWebsiteBusy(false)
  }

  function copyWidgetSnippet() {
    if (!websiteConnection) return
    const snippet = `<script src="https://www.invoices.kz/widget.js" data-key="${websiteConnection.external_account_id}" async></script>`
    navigator.clipboard.writeText(snippet)
    setWebsiteCopied(true)
    setTimeout(() => setWebsiteCopied(false), 2000)
  }
```

Replace the placeholder card:

```tsx
                  <ChannelCard
                    icon={<SiteChatIcon />}
                    name="Чат для сайта"
                    chip={<StatusChip kind="soon" label="Скоро" />}
                    description="Виджет чата на вашем сайте — агент отвечает посетителям в реальном времени"
                  >
                    <button disabled className="w-full nav-glass rounded-lg px-4 py-2.5 text-sm font-medium opacity-50 cursor-not-allowed" style={{ color: 'var(--nav-text-primary)' }}>
                      Подключить
                    </button>
                  </ChannelCard>
```

with:

```tsx
                  <ChannelCard
                    icon={<SiteChatIcon />}
                    name="Чат для сайта"
                    chip={websiteConnection
                      ? <StatusChip kind="ok" label="Подключено" />
                      : <StatusChip kind="off" label="Не подключен" />}
                    description="Виджет чата на вашем сайте — агент отвечает посетителям в реальном времени"
                  >
                    {websiteConnection ? (
                      <>
                        <p className="text-[11px] mb-2" style={{ color: 'var(--nav-text-muted)' }}>
                          Вставьте перед `&lt;/body&gt;` на вашем сайте:
                        </p>
                        <code className="block text-[10px] mb-2 p-2 rounded-lg break-all" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>
                          {`<script src="https://www.invoices.kz/widget.js" data-key="${websiteConnection.external_account_id}" async></script>`}
                        </code>
                        <div className="flex gap-2">
                          <button onClick={copyWidgetSnippet}
                            className="flex-1 text-xs font-semibold nav-glass rounded-lg px-3 py-2" style={{ color: 'var(--nav-accent)' }}>
                            {websiteCopied ? 'Скопировано ✓' : 'Скопировать код'}
                          </button>
                          <button onClick={disconnectWebsite} disabled={websiteBusy}
                            className="nav-glass rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-50" style={{ color: 'var(--nav-text-primary)' }}>
                            {websiteBusy ? '…' : 'Отключить'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <button onClick={connectWebsite} disabled={websiteBusy}
                        className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                        style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                        {websiteBusy ? 'Подключаем…' : 'Подключить'}
                      </button>
                    )}
                    {websiteError && (
                      <div className="text-xs mt-2" style={{ color: 'var(--nav-critical)' }}>{websiteError}</div>
                    )}
                  </ChannelCard>
```

- [ ] **Step 4: Add a website channel icon to «Переписка»** — in `src/app/ai-agent/dialogs/page.tsx`, change:

```ts
const CHANNEL_META: Record<string, { label: string; icon: () => React.ReactElement }> = {
  instagram: { label: 'Instagram', icon: InstagramIcon },
  telegram: { label: 'Telegram', icon: TelegramIcon },
  whatsapp: { label: 'WhatsApp', icon: WhatsAppIcon },
}
```

to:

```ts
function WebsiteIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

const CHANNEL_META: Record<string, { label: string; icon: () => React.ReactElement }> = {
  instagram: { label: 'Instagram', icon: InstagramIcon },
  telegram: { label: 'Telegram', icon: TelegramIcon },
  whatsapp: { label: 'WhatsApp', icon: WhatsAppIcon },
  website: { label: 'Сайт', icon: WebsiteIcon },
}
```

- [ ] **Step 5: Same addition in «Заявки»** — in `src/app/ai-agent/leads/page.tsx`, apply the identical change (add the same `WebsiteIcon` function and the same `website: { label: 'Сайт', icon: WebsiteIcon }` entry to that file's own `CHANNEL_META`).

- [ ] **Step 6: Run the gate**

Run: `npx tsc --noEmit` → expect clean.
Run: `npx vitest run` → expect all pass.

- [ ] **Step 7: Commit**

Stage exactly these files (check `git status --short` first):

```bash
git add src/app/api/ai-agent/website/connect/route.ts src/app/api/ai-agent/agents/route.ts src/app/ai-agent/settings/page.tsx src/app/ai-agent/dialogs/page.tsx src/app/ai-agent/leads/page.tsx
git status --short
git commit -m "feat(ai-agent): website widget settings card + Сайт icon in Переписка/Заявки"
```

---

### Task 8: Ship

**Files:** none (verification only).

- [ ] **Step 1:** Full gate: `npx vitest run`, `npx tsc --noEmit`, `npm run build` — all clean.
- [ ] **Step 2:** `git pull --rebase --autostash` (a parallel session may have pushed), then `git push origin main`.
- [ ] **Step 3:** Confirm the Vercel deployment for the pushed commit(s) reaches READY (targeted `get_deployment` check, not a broad list).
- [ ] **Step 4:** Confirm `https://www.invoices.kz/widget.js` returns 200 with real JS content (static files under `public/` don't show in `npm run build`'s route table, so this is the only way to confirm it actually deployed).
- [ ] **Step 5: Founder live-test script** (hand to user):
  1. On `/ai-agent/settings` → Каналы, click «Подключить» on «Чат для сайта» — confirm the `<script>` snippet appears with a real key, and «Скопировать код» works.
  2. Create a plain local HTML file with that exact `<script>` tag before `</body>`, open it in a browser — confirm the chat bubble appears bottom-right.
  3. Click the bubble, send a message that matches an existing template or scenario trigger — confirm the reply (and, for a scenario, its buttons) appears within ~5 seconds.
  4. Click a scenario button — confirm it advances the scenario the same way it would on Telegram/WhatsApp/Instagram.
  5. Send a message with no template/scenario match — confirm a normal AI reply arrives (or lands in «Диалоги на проверке» if the agent is still in training mode).
  6. Reload the local HTML file, reopen the widget — confirm the earlier conversation history is still there (same browser, same `localStorage` visitor id).
  7. Open `/ai-agent/dialogs` — confirm the conversation appears with the «Сайт» icon, and a manual operator reply typed there shows up in the widget within one poll cycle.
  8. Disconnect the channel from settings — confirm the widget's next send gets a 404-shaped failure gracefully (no crash in the browser console).

## Self-Review (done at write time)

- **Spec coverage:** polling delivery + localStorage visitor identity (T5/T6); anti-spam rate limit (T3/T5); CORS on both public routes (T3/T5, genuinely new plumbing, called out explicitly); scenario buttons via a new nullable `buttons` column since there's no platform API to render them (T1/T4/T6); full pipeline reuse — templates/stop-phrase/flow-trigger/AI-reply/operator-pause/training-mode all present in `websiteWebhookHandler.ts` (T4); settings card + embed snippet + Переписка/Заявки icon (T7); out-of-scope items (domain restriction, theming, file upload, cross-device history, background push) have no tasks — correct.
- **Placeholder scan:** none found — every step has complete, runnable code.
- **Type consistency:** `WebsiteTenantConnection`/`WebsiteIncomingParams` (T4) match exactly how T5's routes construct and pass them. The `buttons` shape written by `makeWebsiteFlowSender` (T4: `{label, payload}[]`) matches exactly what T5's GET route passes through and T6's widget script reads (`m.buttons[].label`/`.payload`). `connections` state's new `external_account_id` field (T7) is produced by the modified `/api/ai-agent/agents` route and consumed only by the new website card — the other three cards' JSX is untouched and don't reference it.
- **Consistency with prior AI-агент work this session**: reuses `start_flow_triggered`'s atomic-claim idiom (added for WhatsApp/Instagram flows earlier this session) rather than reintroducing the count-based race it was created to fix.
- **Caught during this self-review, fixed inline**: the plan originally had `websiteWebhookHandler.ts` call `sendIntoConversation` for stop-phrase acks/template replies/stale-click text without first giving that shared function a `website` branch — every one of those calls would have silently hit its `else { return 'неизвестный канал website' }` fallback and never reached the widget. Task 4 now starts with that one-line fix to `channelSend.ts` before the handler file is even created.
