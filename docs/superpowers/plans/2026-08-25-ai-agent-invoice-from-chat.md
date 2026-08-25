# AI-агент: счёт из чата — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The AI agent recognizes buying intent in a customer dialog and issues a real invoices.kz счёт (with the existing automatic Kaspi payment on `/view/[token]`) — first as owner-approved drafts, autonomously after 5 approvals.

**Architecture:** One shared core (`ai_agent_invoice_drafts` table + `sendInvoiceForDraft` service) fed by two triggers: a native Anthropic tool (`create_invoice_draft`) inside `generateAiReply`, and a new `invoice` flow-builder step. Owner approves drafts in the existing `/ai-agent/review` queue. Kaspi Shop catalog prices are injected into the agent's prompt so replies and drafts use real numbers. Zero new payment code — the invoice `/view/[token]` page already auto-mints Kaspi links and confirms payment.

**Tech Stack:** Next.js App Router, Supabase service-role, Anthropic tool-use (first in codebase), vitest.

**Spec:** `docs/superpowers/specs/2026-08-25-ai-agent-invoice-from-chat-design.md`

## Global Constraints

- `INVOICE_AUTONOMY_THRESHOLD = 5`; auto-send iff `agent.status === 'active'` AND approved (`approved_sent`) draft count ≥ 5. `auto_sent` never increments the counter. In training — always `pending_approval`.
- `total` is computed server-side (Σ qty × unitPrice), never trusted from the model. Validation caps: ≤ 20 items, qty ≥ 1 integer, unitPrice > 0, total ≤ 10 000 000.
- Invoice creation mirrors `src/app/api/cron/recurring/route.ts:36-54` exactly: `supabase.rpc('claim_invoice_number', { p_user_id })` → `invoices.insert({ user_id, number, amount, status: 'sent', client_name, client_phone, services, note })` → link `https://www.invoices.kz/view/${row.public_token}`. `services` items use the app's shape `{ name, qty, price, unit: 'шт', code: '', type: 'service' }`.
- Tool round: max ONE (model → tool_use → tool_result → final text). Tool enabled ONLY on tenant paths — the legacy single-tenant Instagram bot's call sites are untouched.
- Catalog block: only when the owner has a Kaspi Shop connection with `is_active=true` (standing rule); ≤ 50 products; appended by CALLERS to `businessContextLine` (no prompt change for non-catalog callers).
- Legacy `instagram_*`/single-tenant bot untouched. Flow steps remain Telegram-only.
- Billing unchanged: 1 credit per AI reply, tool round included.
- Migration SQL (Task 1, name `ai_agent_invoice_drafts`) — exactly the spec's `## New table` block.
- Execution mode (founder-chosen, this session's precedent): inline by controller + ONE final whole-branch review subagent before push.

---

### Task 1: Migration

**Files:** none in repo.

- [ ] **Step 1:** Supabase MCP `apply_migration` (project `terjitbqgrjlqezyydql`, name `ai_agent_invoice_drafts`) with the spec's SQL verbatim (table + index + `enable row level security`, no policies).
- [ ] **Step 2:** Verify via `execute_sql`: `select count(*) from information_schema.columns where table_name='ai_agent_invoice_drafts'` → 13; `select relrowsecurity from pg_class where relname='ai_agent_invoice_drafts'` → true.

---

### Task 2: Pure draft logic (`invoiceDrafts.ts`) — TDD

**Files:**
- Create: `src/lib/aiAgent/invoiceDrafts.ts`
- Test: `src/lib/aiAgent/invoiceDrafts.test.ts`

**Interfaces (produced, used by Tasks 4-8):**

```ts
export type DraftItem = { name: string; qty: number; unitPrice: number }
export type DraftValidation = { ok: true; items: DraftItem[]; total: number } | { ok: false; error: string }
export const INVOICE_AUTONOMY_THRESHOLD = 5
export const DRAFT_MAX_ITEMS = 20
export const DRAFT_MAX_TOTAL = 10_000_000
export function validateDraftInput(itemsRaw: unknown): DraftValidation
export function canAutoSend(agentStatus: string, approvedCount: number): boolean
// Tool input shape (snake_case, as the model sends it) -> normalized:
export type InvoiceToolInput = { items?: unknown; customer_name?: unknown; customer_phone?: unknown }
export function normalizeToolInput(raw: InvoiceToolInput, collected: { name?: string | null; phone?: string | null }):
  { items: unknown; customerName: string; customerPhone: string }
```

- [ ] **Step 1: Failing tests** — `invoiceDrafts.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateDraftInput, canAutoSend, normalizeToolInput, INVOICE_AUTONOMY_THRESHOLD } from './invoiceDrafts'

describe('validateDraftInput', () => {
  it('accepts valid items, trims names, computes total server-side', () => {
    const r = validateDraftInput([{ name: ' Термокружка ', qty: 2, unit_price: 1200 }])
    expect(r).toEqual({ ok: true, items: [{ name: 'Термокружка', qty: 2, unitPrice: 1200 }], total: 2400 })
  })
  it('accepts camelCase unitPrice too (flow-step path uses it)', () => {
    const r = validateDraftInput([{ name: 'X', qty: 1, unitPrice: 500 }])
    expect(r.ok && r.total === 500).toBe(true)
  })
  it('rejects: empty list, blank name, qty<1, non-integer qty, price<=0, >20 items, total over cap', () => {
    expect(validateDraftInput([]).ok).toBe(false)
    expect(validateDraftInput([{ name: ' ', qty: 1, unit_price: 1 }]).ok).toBe(false)
    expect(validateDraftInput([{ name: 'X', qty: 0, unit_price: 1 }]).ok).toBe(false)
    expect(validateDraftInput([{ name: 'X', qty: 1.5, unit_price: 1 }]).ok).toBe(false)
    expect(validateDraftInput([{ name: 'X', qty: 1, unit_price: 0 }]).ok).toBe(false)
    expect(validateDraftInput(Array.from({ length: 21 }, () => ({ name: 'X', qty: 1, unit_price: 1 }))).ok).toBe(false)
    expect(validateDraftInput([{ name: 'X', qty: 1, unit_price: 10_000_001 }]).ok).toBe(false)
    expect(validateDraftInput('not-an-array' as any).ok).toBe(false)
  })
})

describe('canAutoSend', () => {
  it('requires active agent AND >= threshold approvals', () => {
    expect(canAutoSend('active', INVOICE_AUTONOMY_THRESHOLD)).toBe(true)
    expect(canAutoSend('active', INVOICE_AUTONOMY_THRESHOLD - 1)).toBe(false)
    expect(canAutoSend('training', 100)).toBe(false)
  })
})

describe('normalizeToolInput', () => {
  it('prefers explicit tool values, falls back to collected conversation data', () => {
    const r = normalizeToolInput({ items: [], customer_name: 'Айдос' }, { name: 'Игнор', phone: '7777' })
    expect(r.customerName).toBe('Айдос')
    expect(r.customerPhone).toBe('7777')
  })
  it('returns empty strings when nothing known (caller decides to ask)', () => {
    const r = normalizeToolInput({}, {})
    expect(r.customerName).toBe('')
    expect(r.customerPhone).toBe('')
  })
})
```

- [ ] **Step 2:** `npx vitest run src/lib/aiAgent/invoiceDrafts.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** `invoiceDrafts.ts`:

```ts
// Pure logic for AI-agent invoice drafts (Phase 3 «счёт из чата») --
// validation, autonomy rule, tool-input normalization. DB and network
// live in invoiceSend.ts / the webhook handlers; this file stays pure
// for direct unit testing (flow.ts precedent).

export type DraftItem = { name: string; qty: number; unitPrice: number }
export type DraftValidation = { ok: true; items: DraftItem[]; total: number } | { ok: false; error: string }

export const INVOICE_AUTONOMY_THRESHOLD = 5
export const DRAFT_MAX_ITEMS = 20
export const DRAFT_MAX_TOTAL = 10_000_000

// The model sends snake_case (unit_price); the flow-step path builds
// camelCase (unitPrice). Accept both, emit camelCase. total is ALWAYS
// recomputed here -- never trusted from the model.
export function validateDraftInput(itemsRaw: unknown): DraftValidation {
  if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) return { ok: false, error: 'Нужна хотя бы одна позиция' }
  if (itemsRaw.length > DRAFT_MAX_ITEMS) return { ok: false, error: `Слишком много позиций (макс. ${DRAFT_MAX_ITEMS})` }
  const items: DraftItem[] = []
  for (const it of itemsRaw) {
    if (!it || typeof it !== 'object') return { ok: false, error: 'Некорректная позиция' }
    const name = typeof (it as any).name === 'string' ? (it as any).name.trim() : ''
    const qty = Number((it as any).qty)
    const unitPrice = Number((it as any).unit_price ?? (it as any).unitPrice)
    if (!name) return { ok: false, error: 'У позиции нет названия' }
    if (!Number.isInteger(qty) || qty < 1) return { ok: false, error: `Некорректное количество у «${name}»` }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) return { ok: false, error: `Некорректная цена у «${name}»` }
    items.push({ name, qty, unitPrice })
  }
  const total = items.reduce((s, i) => s + i.qty * i.unitPrice, 0)
  if (total > DRAFT_MAX_TOTAL) return { ok: false, error: 'Сумма счёта превышает допустимый максимум' }
  return { ok: true, items, total }
}

export function canAutoSend(agentStatus: string, approvedCount: number): boolean {
  return agentStatus === 'active' && approvedCount >= INVOICE_AUTONOMY_THRESHOLD
}

export type InvoiceToolInput = { items?: unknown; customer_name?: unknown; customer_phone?: unknown }

export function normalizeToolInput(
  raw: InvoiceToolInput,
  collected: { name?: string | null; phone?: string | null },
): { items: unknown; customerName: string; customerPhone: string } {
  const customerName = (typeof raw.customer_name === 'string' && raw.customer_name.trim()) || collected.name?.trim() || ''
  const customerPhone = (typeof raw.customer_phone === 'string' && raw.customer_phone.trim()) || collected.phone?.trim() || ''
  return { items: raw.items, customerName, customerPhone }
}
```

- [ ] **Step 4:** tests PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5:** `git add src/lib/aiAgent/invoiceDrafts.ts src/lib/aiAgent/invoiceDrafts.test.ts && git commit -m "feat(ai-agent): pure draft validation + autonomy rule for счёт из чата"`

---

### Task 3: Catalog prices in prompt — TDD

**Files:**
- Modify: `src/lib/aiAgent/promptContext.ts` (append pure builder)
- Create: `src/lib/aiAgent/catalogContext.ts` (thin loader, untested per convention)
- Test: `src/lib/aiAgent/promptContext.test.ts` (append cases)

**Interfaces:**
- Produces: `buildCatalogBlock(products: { name: string; price: number }[]): string` (pure; '' for empty) and `loadAgentCatalog(supabase, ownerUserId): Promise<{ name: string; price: number }[]>` (service; `[]` on no active connection / error — never throws).

- [ ] **Step 1: Failing tests** appended to `promptContext.test.ts`:

```ts
describe('buildCatalogBlock', () => {
  it('returns empty string for no products', () => {
    expect(buildCatalogBlock([])).toBe('')
  })
  it('lists products with prices and the no-invent instruction', () => {
    const block = buildCatalogBlock([{ name: 'Термокружка', price: 1200 }])
    expect(block).toContain('Термокружка — 1 200 ₸')
    expect(block).toContain('каталог')
  })
  it('caps at 50 products', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ name: `Товар ${i}`, price: 100 }))
    const block = buildCatalogBlock(many)
    expect(block).toContain('Товар 49')
    expect(block).not.toContain('Товар 50 —')
  })
})
```

(add `buildCatalogBlock` to the file's import list)

- [ ] **Step 2:** run → FAIL. **Step 3: Implement** in `promptContext.ts`:

```ts
// «Каталог и цены» -- appended by tenant callers to businessContextLine
// when the agent owner has an ACTIVE Kaspi Shop connection, so answers
// about prices (and invoice-draft items) use real catalog numbers
// instead of free-text guesses. Pure: the Supabase load lives in
// catalogContext.ts.
export const CATALOG_MAX_PRODUCTS = 50

export function buildCatalogBlock(products: { name: string; price: number }[]): string {
  if (products.length === 0) return ''
  const lines = products.slice(0, CATALOG_MAX_PRODUCTS)
    .map(p => `${p.name} — ${p.price.toLocaleString('ru-KZ')} ₸`)
    .join('\n')
  return ` Актуальный каталог товаров и цен этого бизнеса (используй ТОЛЬКО эти цены, не выдумывай другие; если товара нет в каталоге — скажи, что уточнишь):\n${lines}`
}
```

`catalogContext.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { CATALOG_MAX_PRODUCTS } from './promptContext'

// Loads the agent owner's Kaspi Shop catalog sample for the prompt's
// «Каталог и цены» block. Standing rule: connection lookups need
// .eq('is_active', true). Best-effort -- any error or no connection
// resolves to [] (the block is simply omitted), never throws into the
// reply pipeline.
export async function loadAgentCatalog(
  supabase: SupabaseClient,
  ownerUserId: string,
): Promise<{ name: string; price: number }[]> {
  try {
    const { data: conn } = await supabase
      .from('kaspi_shop_connections')
      .select('id')
      .eq('user_id', ownerUserId)
      .eq('is_active', true)
      .maybeSingle()
    if (!conn) return []
    const { data: products } = await supabase
      .from('kaspi_shop_tracked_products')
      .select('product_name, current_price, is_enabled')
      .eq('connection_id', conn.id)
      .order('is_enabled', { ascending: false })
      .limit(CATALOG_MAX_PRODUCTS)
    return (products || [])
      .map(p => ({ name: String(p.product_name || '').trim(), price: Number(p.current_price) || 0 }))
      .filter(p => p.name && p.price > 0)
  } catch {
    return []
  }
}
```

**Before committing:** verify the real column names on `kaspi_shop_tracked_products` (`product_name`/`current_price`/`is_enabled` are the expected ones — check with `grep -n "product_name\|current_price" src/lib/kaspiShop/pendingProducts.ts src/app/kaspi-shop/page.tsx | head` and adjust to the actual schema).

- [ ] **Step 4:** tests PASS, tsc clean. **Step 5:** commit `feat(ai-agent): Kaspi Shop catalog prices as prompt context`.

---

### Task 4: Anthropic tool-use in `generateAiReply`

**Files:**
- Modify: `src/lib/instagramAiReply.ts`

**Interfaces:**
- Consumes: nothing new. Produces (used by Task 6): new optional param on `generateAiReply`:

```ts
invoiceTool?: {
  // Executes the draft creation. Returns what the model should be told.
  execute: (input: { items?: unknown; customer_name?: unknown; customer_phone?: unknown }) =>
    Promise<{ outcome: 'draft_pending' | 'sent'; total?: number; missing?: ('customer_name' | 'customer_phone')[]; error?: string }>
}
```

- [ ] **Step 1: Implement.** In `generateAiReply`: when `params.invoiceTool` is present, pass to `client.messages.create` a `tools` array and handle one tool round:

```ts
const invoiceToolDef = {
  name: 'create_invoice_draft',
  description: 'Создать счёт на оплату для клиента, когда он ЯВНО согласился купить и известны конкретные позиции. Цены бери из каталога в контексте или из слов клиента — не выдумывай.',
  input_schema: {
    type: 'object' as const,
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Название товара/услуги' },
            qty: { type: 'integer', minimum: 1 },
            unit_price: { type: 'number', description: 'Цена за единицу в тенге' },
          },
          required: ['name', 'qty', 'unit_price'],
        },
      },
      customer_name: { type: 'string', description: 'Имя клиента, если известно' },
      customer_phone: { type: 'string', description: 'Телефон клиента, если известен' },
    },
    required: ['items'],
  },
}
```

Request: `tools: params.invoiceTool ? [invoiceToolDef] : undefined`. After the first response: if `message.stop_reason === 'tool_use'`, find the `tool_use` block, run `params.invoiceTool.execute(block.input)`, then make ONE follow-up `client.messages.create` with the same model/max_tokens and `messages: [original user message, { role: 'assistant', content: message.content }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(executeResult) }] }]`, same `tools` (so the API accepts the history), and parse the SECOND response's text through the existing `parseUrgentReply`/`parseExtractedFieldsBlock` path. If the first response has no tool_use — existing path byte-for-byte. Executor throwing → catch, log, fall back to treating it as no-tool (the reply text from a retry WITHOUT tools: simplest safe fallback is to re-run the request without tools once).

- [ ] **Step 2:** `npx tsc --noEmit` clean; `npx vitest run` all green (no new unit tests: network function, per this file's own documented convention).
- [ ] **Step 3:** commit `feat(ai-agent): native tool-use plumbing for create_invoice_draft`.

---

### Task 5: Core service `sendInvoiceForDraft`

**Files:**
- Create: `src/lib/aiAgent/invoiceSend.ts`

**Interfaces:**
- Consumes: Task 2 types. Produces (used by Tasks 6-8): `sendInvoiceForDraft(supabase: SupabaseClient, draftId: string): Promise<{ ok: boolean; error?: string }>` and `createDraft(supabase, args: { agentId, conversationId, customerName, customerPhone, items: DraftItem[], total, source: 'ai_tool' | 'flow_step', autoSend: boolean }): Promise<{ draftId: string; sent: boolean }>`.

- [ ] **Step 1: Implement** `invoiceSend.ts` (service-role only; mirrors `cron/recurring`'s invoice creation):

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DraftItem } from './invoiceDrafts'

// Creates the draft row; when autoSend, immediately issues+sends the
// invoice. Split so the review route can approve a pending draft later
// through the same sendInvoiceForDraft.
export async function createDraft(supabase: SupabaseClient, args: {
  agentId: string; conversationId: string; customerName: string; customerPhone: string
  items: DraftItem[]; total: number; source: 'ai_tool' | 'flow_step'; autoSend: boolean
}): Promise<{ draftId: string; sent: boolean }> {
  const { data: draft, error } = await supabase.from('ai_agent_invoice_drafts').insert({
    agent_id: args.agentId,
    conversation_id: args.conversationId,
    customer_name: args.customerName,
    customer_phone: args.customerPhone,
    items: args.items,
    total: args.total,
    source: args.source,
    status: 'pending_approval',
  }).select('id').single()
  if (error || !draft) throw new Error(`draft insert failed: ${error?.message}`)
  if (!args.autoSend) return { draftId: draft.id, sent: false }
  const sent = await sendInvoiceForDraft(supabase, draft.id, { auto: true })
  return { draftId: draft.id, sent: sent.ok }
}

// Issues the REAL invoice for a draft and sends the /view link into the
// draft's conversation. Idempotent on retry: a draft that already has
// invoice_id skips creation and only re-sends. On any failure the draft
// goes to status='error' with error_message and NOTHING reaches the
// customer beyond what already succeeded.
export async function sendInvoiceForDraft(
  supabase: SupabaseClient,
  draftId: string,
  opts: { auto?: boolean } = {},
): Promise<{ ok: boolean; error?: string }> {
  const fail = async (msg: string) => {
    await supabase.from('ai_agent_invoice_drafts')
      .update({ status: 'error', error_message: msg, decided_at: new Date().toISOString() })
      .eq('id', draftId)
    return { ok: false, error: msg }
  }
  try {
    const { data: draft } = await supabase.from('ai_agent_invoice_drafts').select('*').eq('id', draftId).single()
    if (!draft) return { ok: false, error: 'draft not found' }

    const { data: agent } = await supabase.from('ai_agents').select('id, user_id, name').eq('id', draft.agent_id).single()
    if (!agent) return fail('агент не найден')
    const { data: conversation } = await supabase.from('ai_agent_conversations')
      .select('id, channel, external_thread_id, agent_id').eq('id', draft.conversation_id).single()
    if (!conversation) return fail('диалог не найден')

    let invoiceId: string = draft.invoice_id
    let publicToken: string | null = null
    let invoiceNumber: string | null = null

    if (invoiceId) {
      const { data: existing } = await supabase.from('invoices').select('id, number, public_token, amount').eq('id', invoiceId).single()
      if (!existing) return fail('счёт из черновика не найден')
      publicToken = existing.public_token; invoiceNumber = existing.number
    } else {
      const { data: number, error: numberError } = await supabase.rpc('claim_invoice_number', { p_user_id: agent.user_id })
      if (numberError) return fail(`нумерация: ${numberError.message}`)
      const services = (draft.items as DraftItem[]).map(i => ({
        name: i.name, qty: i.qty, price: i.unitPrice, unit: 'шт', code: '', type: 'service',
      }))
      const { data: invoice, error: invError } = await supabase.from('invoices').insert({
        user_id: agent.user_id,
        number,
        amount: draft.total,
        status: 'sent',
        client_name: draft.customer_name || 'Клиент из чата',
        client_phone: draft.customer_phone || null,
        services,
        note: 'Выставлен ИИ-агентом из диалога',
      }).select('id, number, public_token').single()
      if (invError || !invoice) return fail(`создание счёта: ${invError?.message}`)
      invoiceId = invoice.id; publicToken = invoice.public_token; invoiceNumber = invoice.number
      await supabase.from('ai_agent_invoice_drafts').update({ invoice_id: invoiceId }).eq('id', draftId)
    }

    const link = `https://www.invoices.kz/view/${publicToken}`
    const text = `Ваш счёт №${invoiceNumber} на ${Number(draft.total).toLocaleString('ru-KZ')} ₸ готов: ${link}`
    const sendError = await sendIntoConversation(supabase, conversation, text)
    if (sendError) return fail(`отправка в чат: ${sendError}`)

    await supabase.from('ai_agent_invoice_drafts').update({
      status: opts.auto ? 'auto_sent' : 'approved_sent',
      decided_at: new Date().toISOString(),
    }).eq('id', draftId)
    return { ok: true }
  } catch (err: any) {
    return fail(String(err?.message || err))
  }
}
```

`sendIntoConversation(supabase, conversation, text): Promise<string | null>` in the same file: load the agent's connection for `conversation.channel` from `ai_agent_channel_connections` (`.eq('agent_id', conversation.agent_id).eq('channel', conversation.channel).eq('status','active').maybeSingle()`), decrypt `access_token_enc` with the exact same decrypt helper `telegramWebhookHandler.ts` already uses (import the same function — check its import line, it's the `decryptAtRest`-family helper keyed by `AI_AGENT_ENCRYPTION_KEY`), then dispatch: telegram → `sendTelegramBotMessage(botToken, conversation.external_thread_id, text)`; whatsapp → `sendWhatsAppMessage(connection.external_account_id, conversation.external_thread_id, text, { accessToken })`; instagram → `sendDirectMessage(...)` with the credentials param exactly as `webhookHandler.ts`'s reply path calls it (copy that call's argument shape verbatim when implementing). Also insert an outbound `ai_agent_messages` row (`direction:'outbound'`, `status:'sent'`, `is_ai_generated: false`, the link text) so the dialog history shows the invoice message. Return null on success, error string on failure.

- [ ] **Step 2:** tsc clean, vitest green. **Step 3:** commit `feat(ai-agent): invoice-draft core -- create real invoice + send link into dialog`.

---

### Task 6: Wire the tool into the three tenant handlers

**Files:**
- Modify: `src/lib/aiAgent/telegramWebhookHandler.ts`, `src/lib/aiAgent/whatsappWebhookHandler.ts`, `src/lib/aiAgent/webhookHandler.ts`

- [ ] **Step 1:** In EACH handler, at its `generateAiReply` call site (telegram's is `telegramWebhookHandler.ts:216`; the other two are the parallel twins — find with `grep -n "generateAiReply(" src/lib/aiAgent/*.ts`):
  1. Before the call: `const catalog = await loadAgentCatalog(supabase, agent.user_id)` and append `buildCatalogBlock(catalog)` to the `businessContextLine` string.
  2. Add the `invoiceTool` param:

```ts
invoiceTool: {
  execute: async (raw) => {
    const norm = normalizeToolInput(raw, { name: conversation.collected_name, phone: conversation.collected_phone })
    const validated = validateDraftInput(norm.items)
    if (!validated.ok) return { outcome: 'draft_pending' as const, error: validated.error }
    const missing: ('customer_name' | 'customer_phone')[] = []
    if (!norm.customerName) missing.push('customer_name')
    if (!norm.customerPhone) missing.push('customer_phone')
    if (missing.length > 0) return { outcome: 'draft_pending' as const, missing }
    const { count } = await supabase.from('ai_agent_invoice_drafts')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', agent.id).eq('status', 'approved_sent')
    const auto = canAutoSend(agent.status, count || 0)
    const created = await createDraft(supabase, {
      agentId: agent.id, conversationId: conversation.id,
      customerName: norm.customerName, customerPhone: norm.customerPhone,
      items: validated.items, total: validated.total, source: 'ai_tool', autoSend: auto,
    })
    return created.sent ? { outcome: 'sent' as const, total: validated.total } : { outcome: 'draft_pending' as const, total: validated.total }
  },
},
```

  (each handler's local variable names for `agent`/`conversation`/`supabase` may differ — match the surrounding code). The `missing` tool_result makes the model ask the customer for the missing field; `draft_pending` makes it promise the invoice after confirmation; `sent` means the link message already went out — the model just wraps up.

**Training-mode nuance (explicit, do not skip):** in training, the AI reply itself goes to the review queue, not to the customer — a draft created during that same generation must NOT auto-send (`canAutoSend` already returns false for non-active agents), so both the reply and the draft wait for the owner. No extra code needed; verify the logic path once while wiring.

- [ ] **Step 2:** tsc clean, `npx vitest run` green, `npm run build` clean.
- [ ] **Step 3:** commit `feat(ai-agent): invoice tool + catalog context wired into all three tenant channels`.

---

### Task 7: Review queue — draft cards + /create prefill

**Files:**
- Create: `src/app/api/ai-agent/invoice-drafts/route.ts` (GET list + POST approve/reject/retry)
- Modify: `src/app/ai-agent/review/page.tsx` (drafts section + badge count)
- Modify: `src/app/create/page.tsx` (handle `?agentDraft={id}`)

- [ ] **Step 1: API route.** Auth pattern: copy the existing `src/app/api/ai-agent/review/route.ts`'s user-auth helper verbatim (Bearer token → user; drafts are scoped to the user's own agents via an `in('agent_id', userAgentIds)` filter — load agent ids first). GET → drafts with `status in ('pending_approval','error')` + joined conversation channel, newest first. POST `{ draftId, action: 'approve' | 'reject' }`: verify the draft's agent belongs to the caller; `approve` → `sendInvoiceForDraft(serviceSupabase, draftId)` (also serves retry for `error` drafts — same call, idempotency guard inside); `reject` → update `status='rejected', decided_at=now()`. Return the updated draft.
- [ ] **Step 2: Review page.** New section «Черновики счетов» above the reply cards, same 4-per-row card grid: customer name/phone, items list (`name × qty — price ₸`), computed total (bold), source chip (ИИ/Сценарий) + channel chip, buttons Отправить (accent) / Отклонить (muted) / «Открыть в /create ↗» (`/create?agentDraft={id}`), error cards show `error_message` + Повторить. Pending badge count = replies + drafts. Follow the page's existing card/chip/button classes exactly.
- [ ] **Step 3: /create prefill.** In `create/page.tsx`'s existing query-param prefill effect (where `?template=` is handled, ~L190): add `agentDraft` — fetch the draft via the new GET (filtered by id param support: extend GET with `?id=`), then `setClientName(draft.customer_name)`, `setClientPhone(draft.customer_phone)`, `setServices(draft.items.map(i => ({ name: i.name, qty: i.qty, price: i.unitPrice, unit: 'шт', code: '', type: 'service' })))`. Strip the param with `window.history.replaceState` (NEVER `router.replace` — documented trap).
- [ ] **Step 4:** tsc + build + vitest clean. **Step 5:** commit `feat(ai-agent): invoice-draft review cards, approve/reject API, /create prefill`.

---

### Task 8: Flow step «Выставить счёт»

**Files:**
- Modify: `src/lib/aiAgent/flow.ts` (+ its test), `src/components/aiAgent/FlowBuilder.tsx`, `src/lib/aiAgent/telegramWebhookHandler.ts`

- [ ] **Step 1: Types + parse (TDD).** `FlowStep` gains optional `kind?: 'message' | 'invoice'` (absent = 'message', full backward compat with stored flows) and optional `invoiceItem?: { name: string; unitPrice: number }`. `parseFlowDefinition`: a step with `kind:'invoice'` REQUIRES a valid `invoiceItem` (non-empty name, unitPrice > 0) and must have `buttons: []` (invoice steps are terminal-shaped; the flow continues via the customer's next message hitting the normal pipeline). Failing tests first in `flow.test.ts`:

```ts
it('accepts an invoice step with a valid invoiceItem and no buttons', () => {
  const def = parseFlowDefinition({ steps: [
    { id: 's1', text: 'Оформляю счёт', buttons: [], kind: 'invoice', invoiceItem: { name: 'Кружка', unitPrice: 1200 } },
  ] })
  expect(def?.steps[0].kind).toBe('invoice')
})
it('rejects an invoice step with missing/invalid invoiceItem or with buttons', () => {
  expect(parseFlowDefinition({ steps: [{ id: 's1', text: 'x', buttons: [], kind: 'invoice' }] })).toBeNull()
  expect(parseFlowDefinition({ steps: [{ id: 's1', text: 'x', kind: 'invoice', invoiceItem: { name: '', unitPrice: 5 }, buttons: [] }] })).toBeNull()
  expect(parseFlowDefinition({ steps: [{ id: 's1', text: 'x', kind: 'invoice', invoiceItem: { name: 'A', unitPrice: 5 }, buttons: [{ label: 'B', nextStepId: null }] }] })).toBeNull()
})
it('legacy steps without kind still parse as message steps', () => {
  const def = parseFlowDefinition({ steps: [{ id: 's1', text: 'Привет', buttons: [] }] })
  expect(def?.steps[0].kind ?? 'message').toBe('message')
})
```

- [ ] **Step 2:** Engine: in `telegramWebhookHandler.ts`, wherever a step is delivered (`sendTelegramFlowStep` call sites — trigger match and button advance), branch first: if `step.kind === 'invoice'`, send the step's `text`, then run the SAME executor logic as Task 6 (items = `[{ name: step.invoiceItem.name, qty: 1, unitPrice: step.invoiceItem.unitPrice }]` through `validateDraftInput`, customer from `conversation.collected_name/phone`, source `'flow_step'`); if name/phone missing, send the fixed message «Чтобы выставить счёт, напишите, пожалуйста, ваше имя и номер телефона» (documented v1 limitation: the customer's reply exits the flow into the AI path — the AI's own tool can finish the job); then clear the flow state (invoice step is terminal).
- [ ] **Step 3:** FlowBuilder UI: step editor gains a «Тип шага» select (Сообщение / Выставить счёт); choosing invoice shows two inputs (Название позиции, Цена ₸) and hides the buttons editor. Save serializes `kind`/`invoiceItem`.
- [ ] **Step 4:** vitest + tsc + build clean. **Step 5:** commit `feat(ai-agent): flow step «Выставить счёт»`.

---

### Task 9: Ship

- [ ] **Step 1:** Full gate: `npx vitest run`, `npx tsc --noEmit`, `npm run build` — all clean.
- [ ] **Step 2:** Final whole-branch review subagent (hybrid mode, session precedent): scope `git diff origin/main..HEAD` for THIS feature's commits; hunt cross-file seams (tool-round message history correctness, draft idempotency/double-send on concurrent approve, autonomy counter races, training-mode interplay, review-route auth scoping, flow-step state clearing). Fix findings, re-gate.
- [ ] **Step 3:** `git pull --rebase --autostash && git push origin main` (autostash protects the parallel session's uncommitted files). Confirm the Vercel deployment for the pushed commit reaches READY (targeted deployment check; remember the parallel session may push interleaved commits — a build error may not be ours, check the log before reverting anything).
- [ ] **Step 4:** Founder live-test script (hand to user): в Telegram тест-боту написать «Хочу купить [товар из каталога], я Имя, телефон 8777…» → в `/ai-agent/review` появится «Черновик счёта» → Отправить → в чат придёт ссылка на счёт → открыть, увидеть Kaspi-кнопку (если Pro+Кассир). Замечания собрать и внести follow-up батчем.

## Self-Review (done at write time)

- **Spec coverage:** table (T1), validation/autonomy (T2), catalog cheap-part (T3), tool-use (T4), core create+send incl. idempotency/error draft (T5), three channels + training nuance (T6), review cards/approve/reject/retry + /create prefill + badge (T7), flow step incl. missing-data copy + terminal semantics (T8), live-test plan (T9). Out-of-scope list honored — no накладная, no inline editing, no threshold UI.
- **Type consistency:** `DraftItem`/`validateDraftInput`/`canAutoSend`/`normalizeToolInput` (T2) used by name in T5/T6/T8; `createDraft`/`sendInvoiceForDraft` (T5) consumed in T6/T7/T8; tool outcome contract identical in T4 (types) and T6 (executor).
- **Known verify-at-execution points (flagged in-place):** `kaspi_shop_tracked_products` column names (T3), instagram `sendDirectMessage` argument shape (T5), each handler's local variable names (T6), review route's auth helper (T7) — all specified as "copy the existing call/pattern verbatim from the named file", never invented.
