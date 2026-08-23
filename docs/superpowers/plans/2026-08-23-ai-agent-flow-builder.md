# AI-агент — визуальный конструктор сценариев (Telegram v1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A non-AI, free, button-driven scenario builder for the AI-агент's Telegram channel — a step-by-step editor in the settings UI produces a flow (message + buttons per step); customers enter it via `/start` (if it's the agent's main flow) or a keyword trigger, and navigate it by tapping inline-keyboard buttons.

**Architecture:** One new table (`ai_agent_flows`, whole-document `jsonb` per flow) plus two new nullable columns on `ai_agent_conversations` tracking per-customer flow position. A channel-agnostic pure module (`flow.ts`) holds types and step-graph logic; `telegram.ts` gains Telegram-specific sending/parsing for buttons and callback queries; `telegramWebhookHandler.ts` gains the flow-aware dispatch (start/trigger-match/callback), inserted into the existing template→AI priority chain without disturbing it. A new settings tab, backed by a new CRUD API route, is the editor.

**Tech Stack:** Next.js API routes (Node runtime), Supabase (Postgres jsonb), Telegram Bot API inline keyboards, React/TypeScript client component, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-23-ai-agent-flow-builder-design.md`

## Global Constraints

- Scope: **Telegram only**. WhatsApp/Instagram are explicitly out of scope for this plan.
- Flows are **free** — no AI call, no wallet debit, matching a template match's cost model.
- **Database migration is already applied** (done directly by the controller via Supabase MCP, matching this project's established pattern of controller-executed schema changes — not a task below). Applied SQL, for reference:
  ```sql
  create table ai_agent_flows (
    id uuid primary key default gen_random_uuid(),
    agent_id uuid not null references ai_agents(id) on delete cascade,
    name text not null default 'Новый сценарий',
    trigger_words text[] not null default '{}',
    is_start boolean not null default false,
    definition jsonb not null default '{"steps":[]}',
    created_at timestamptz not null default now()
  );
  create unique index ai_agent_flows_one_start_per_agent
    on ai_agent_flows (agent_id) where is_start;
  alter table ai_agent_conversations
    add column active_flow_id uuid references ai_agent_flows(id) on delete set null,
    add column active_step_id text;
  ```
- `definition` shape: `{ steps: [{ id: string, text: string, buttons: [{ label: string, nextStepId: string | null }] }] }`. First array element = entry step. `buttons: []` = terminal step. A button's `nextStepId: null` = "Конец сценария" (ends immediately, no further message).
- Priority order for an incoming Telegram update (unchanged tiers marked *unchanged*): (1) customer mid-flow + `callback_query` → flow engine; (2) customer mid-flow + free text → exit flow silently, fall through to (3); (3) *unchanged* template match; (4) flow entry-trigger match (new, only checked if no template matched); (5) *unchanged* AI reply.
- `callback_data` encodes only the button's index within the CURRENT step (`"btn:0"`, `"btn:1"`, …) — never flow/step ids — to stay well under Telegram's 64-byte limit, since the server already knows the customer's position from `ai_agent_conversations`.
- Every new/modified file must pass `npx tsc --noEmit` before its task is done.
- Testing convention (same as the prior media-support plan): DB/network-calling functions stay untested; pure logic gets a colocated Vitest test.

---

### Task 1: `flow.ts` — types and pure step-graph logic

**Files:**
- Create: `src/lib/aiAgent/flow.ts`
- Test: `src/lib/aiAgent/flow.test.ts`

**Interfaces:**
- Produces: `FlowButton`, `FlowStep`, `FlowDefinition` types; `isTerminalStep(step): boolean`; `findStepById(definition, stepId): FlowStep | undefined`; `firstStep(definition): FlowStep | undefined`; `parseFlowDefinition(raw: unknown): FlowDefinition | null`; `findFlowTriggerMatch(text, flows: {id, trigger_words}[]): string | null`

- [ ] **Step 1: Write the failing test**

Create `src/lib/aiAgent/flow.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isTerminalStep, findStepById, firstStep, parseFlowDefinition, findFlowTriggerMatch, type FlowDefinition } from './flow'

const sample: FlowDefinition = {
  steps: [
    { id: 's1', text: 'Здравствуйте! Что вас интересует?', buttons: [{ label: 'Цены', nextStepId: 's2' }, { label: 'Готово', nextStepId: null }] },
    { id: 's2', text: 'Актуальные цены на сайте.', buttons: [] },
  ],
}

describe('isTerminalStep', () => {
  it('is true for a step with no buttons', () => {
    expect(isTerminalStep(sample.steps[1])).toBe(true)
  })
  it('is false for a step with buttons', () => {
    expect(isTerminalStep(sample.steps[0])).toBe(false)
  })
})

describe('findStepById / firstStep', () => {
  it('finds a step by id', () => {
    expect(findStepById(sample, 's2')).toEqual(sample.steps[1])
  })
  it('returns undefined for an unknown id', () => {
    expect(findStepById(sample, 'nope')).toBeUndefined()
  })
  it('returns the first array element as the entry step', () => {
    expect(firstStep(sample)).toEqual(sample.steps[0])
  })
  it('returns undefined for an empty flow', () => {
    expect(firstStep({ steps: [] })).toBeUndefined()
  })
})

describe('parseFlowDefinition', () => {
  it('accepts a well-formed definition', () => {
    expect(parseFlowDefinition(sample)).toEqual(sample)
  })

  it('rejects non-object / non-array-steps input', () => {
    expect(parseFlowDefinition(null)).toBeNull()
    expect(parseFlowDefinition('garbage')).toBeNull()
    expect(parseFlowDefinition({})).toBeNull()
    expect(parseFlowDefinition({ steps: 'nope' })).toBeNull()
    expect(parseFlowDefinition({ steps: [] })).toBeNull()
  })

  it('rejects a step missing id or text, or with non-array buttons', () => {
    expect(parseFlowDefinition({ steps: [{ text: 'x', buttons: [] }] })).toBeNull()
    expect(parseFlowDefinition({ steps: [{ id: 's1', buttons: [] }] })).toBeNull()
    expect(parseFlowDefinition({ steps: [{ id: 's1', text: 'x', buttons: 'no' }] })).toBeNull()
  })

  it('rejects duplicate step ids', () => {
    expect(parseFlowDefinition({ steps: [{ id: 's1', text: 'a', buttons: [] }, { id: 's1', text: 'b', buttons: [] }] })).toBeNull()
  })

  it('rejects a button missing a label, or with a non-string non-null nextStepId', () => {
    expect(parseFlowDefinition({ steps: [{ id: 's1', text: 'a', buttons: [{ nextStepId: null }] }] })).toBeNull()
    expect(parseFlowDefinition({ steps: [{ id: 's1', text: 'a', buttons: [{ label: 'x', nextStepId: 42 }] }] })).toBeNull()
  })

  it('accepts a button with nextStepId: null', () => {
    const def = { steps: [{ id: 's1', text: 'a', buttons: [{ label: 'Готово', nextStepId: null }] }] }
    expect(parseFlowDefinition(def)).toEqual(def)
  })

  it('rejects a dangling nextStepId reference', () => {
    expect(parseFlowDefinition({ steps: [{ id: 's1', text: 'a', buttons: [{ label: 'x', nextStepId: 'ghost' }] }] })).toBeNull()
  })
})

describe('findFlowTriggerMatch', () => {
  const flows = [
    { id: 'f1', trigger_words: ['меню', 'menu'] },
    { id: 'f2', trigger_words: ['запись'] },
  ]
  it('matches case-insensitively against a substring', () => {
    expect(findFlowTriggerMatch('покажите МЕНЮ пожалуйста', flows)).toBe('f1')
  })
  it('returns the first matching flow in array order', () => {
    expect(findFlowTriggerMatch('menu запись', flows)).toBe('f1')
  })
  it('returns null when nothing matches', () => {
    expect(findFlowTriggerMatch('привет', flows)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/aiAgent/flow.test.ts`
Expected: FAIL — `Cannot find module './flow'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/aiAgent/flow.ts`:

```ts
// Types and pure logic for the Telegram flow builder (non-AI scenario
// constructor) -- docs/superpowers/specs/2026-08-23-ai-agent-flow-builder-design.md.
// DB access and Telegram network calls live in telegramWebhookHandler.ts /
// telegram.ts; this file is deliberately network- and DB-free so it can be
// unit tested directly.

export interface FlowButton {
  label: string
  // null = "Конец сценария": clicking this button ends the flow
  // immediately, no further message is sent.
  nextStepId: string | null
}

export interface FlowStep {
  id: string
  text: string
  // Empty array = terminal step: after this step's text is sent (because
  // some other button's nextStepId pointed here), the flow ends -- no
  // further click is expected.
  buttons: FlowButton[]
}

export interface FlowDefinition {
  steps: FlowStep[]
}

export function isTerminalStep(step: FlowStep): boolean {
  return step.buttons.length === 0
}

export function findStepById(definition: FlowDefinition, stepId: string): FlowStep | undefined {
  return definition.steps.find(s => s.id === stepId)
}

// The first step in the array is always the flow's entry point.
export function firstStep(definition: FlowDefinition): FlowStep | undefined {
  return definition.steps[0]
}

// Defensive parse of a jsonb column / API request body into a FlowDefinition
// -- never throws, returns null for anything that isn't a genuinely usable
// shape. Mirrors the tolerant-parse spirit of parseExtractedFieldsBlock in
// instagramAiReply.ts: a malformed document degrades to "unusable", never
// crashes the caller.
export function parseFlowDefinition(raw: unknown): FlowDefinition | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const stepsRaw = (raw as { steps?: unknown }).steps
  if (!Array.isArray(stepsRaw) || stepsRaw.length === 0) return null

  const steps: FlowStep[] = []
  const seenIds = new Set<string>()
  for (const s of stepsRaw) {
    if (!s || typeof s !== 'object') return null
    const id = (s as any).id
    const text = (s as any).text
    const buttonsRaw = (s as any).buttons
    if (typeof id !== 'string' || !id.trim()) return null
    if (seenIds.has(id)) return null
    if (typeof text !== 'string' || !text.trim()) return null
    if (!Array.isArray(buttonsRaw)) return null

    const buttons: FlowButton[] = []
    for (const b of buttonsRaw) {
      if (!b || typeof b !== 'object') return null
      const label = (b as any).label
      const nextStepId = (b as any).nextStepId
      if (typeof label !== 'string' || !label.trim()) return null
      if (nextStepId !== null && typeof nextStepId !== 'string') return null
      buttons.push({ label: label.trim(), nextStepId })
    }
    seenIds.add(id)
    steps.push({ id, text: text.trim(), buttons })
  }

  // Every non-null nextStepId must point at a step that actually exists in
  // THIS definition -- a dangling reference would strand a customer
  // mid-flow at message-handling time instead of failing at save time.
  for (const step of steps) {
    for (const button of step.buttons) {
      if (button.nextStepId !== null && !seenIds.has(button.nextStepId)) return null
    }
  }

  return { steps }
}

// Same case-insensitive substring rule as findTemplateMatch
// (webhookHandler.ts) applied to flows instead of templates -- kept as its
// own small function rather than forcing templates and flows to share one
// generic interface, since their result shapes differ (a matched template
// returns reply text; a matched flow returns just its id).
export function findFlowTriggerMatch(text: string, flows: { id: string; trigger_words: string[] }[]): string | null {
  const lower = text.toLowerCase()
  for (const flow of flows) {
    if (flow.trigger_words.some(w => lower.includes(w.toLowerCase()))) {
      return flow.id
    }
  }
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/aiAgent/flow.test.ts`
Expected: PASS (18 tests)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/aiAgent/flow.ts src/lib/aiAgent/flow.test.ts
git commit -m "feat(ai-agent): add flow types and pure step-graph logic for the flow builder"
```

---

### Task 2: Telegram — `/start` gains `fromHandle`, new `callback_query` update kind, button sending, `answerCallbackQuery`

**Files:**
- Modify: `src/lib/aiAgent/telegram.ts`
- Modify: `src/lib/aiAgent/telegram.test.ts`

**Interfaces:**
- Consumes: `FlowStep` type from `./flow` (Task 1)
- Produces: `ParsedTelegramUpdate`'s `'start'` variant gains `fromHandle: string`; new `'callback_query'` variant `{ kind: 'callback_query'; chatId: string; fromHandle: string; data: string; callbackQueryId: string }`; `sendTelegramFlowStep(botToken, chatId, step: FlowStep): Promise<void>`; `answerTelegramCallbackQuery(botToken, callbackQueryId, text?): Promise<void>`

- [ ] **Step 1: Write the failing test** — update the three existing `/start` assertions, add new `callback_query` cases

In `src/lib/aiAgent/telegram.test.ts`, replace this existing test:

```ts
  it('treats /start (bare, with deep-link payload, or @-suffixed) as start', () => {
    expect(parseTelegramUpdate(textUpdate({}, { text: '/start' }))).toEqual({ kind: 'start', chatId: '111' })
    expect(parseTelegramUpdate(textUpdate({}, { text: '/start ref123' }))).toEqual({ kind: 'start', chatId: '111' })
    expect(parseTelegramUpdate(textUpdate({}, { text: '/start@MyBot' }))).toEqual({ kind: 'start', chatId: '111' })
  })
```

with:

```ts
  it('treats /start (bare, with deep-link payload, or @-suffixed) as start, carrying fromHandle', () => {
    expect(parseTelegramUpdate(textUpdate({}, { text: '/start' }))).toEqual({ kind: 'start', chatId: '111', fromHandle: 'aigerim_a' })
    expect(parseTelegramUpdate(textUpdate({}, { text: '/start ref123' }))).toEqual({ kind: 'start', chatId: '111', fromHandle: 'aigerim_a' })
    expect(parseTelegramUpdate(textUpdate({}, { text: '/start@MyBot' }))).toEqual({ kind: 'start', chatId: '111', fromHandle: 'aigerim_a' })
  })
```

Add a new `describe` block (anywhere at the top level of the file, alongside the existing `describe('parseTelegramUpdate', ...)`):

```ts
describe('parseTelegramUpdate: callback_query', () => {
  it('parses a valid callback_query', () => {
    const parsed = parseTelegramUpdate({
      update_id: 50,
      callback_query: { id: 'cbq123', data: 'btn:1', from: { id: 111, is_bot: false, username: 'aigerim_a' } },
    })
    expect(parsed).toEqual({ kind: 'callback_query', chatId: '111', fromHandle: 'aigerim_a', data: 'btn:1', callbackQueryId: 'cbq123' })
  })

  it('falls back to first_name then unknown when username is missing', () => {
    const withFirstName = parseTelegramUpdate({
      update_id: 50,
      callback_query: { id: 'cbq1', data: 'btn:0', from: { id: 111, first_name: 'Айгерим' } },
    })
    expect(withFirstName.kind === 'callback_query' && withFirstName.fromHandle).toBe('Айгерим')
    const noName = parseTelegramUpdate({
      update_id: 50,
      callback_query: { id: 'cbq1', data: 'btn:0', from: { id: 111 } },
    })
    expect(noName.kind === 'callback_query' && noName.fromHandle).toBe('unknown')
  })

  it('ignores a malformed callback_query missing id, data, or from.id', () => {
    expect(parseTelegramUpdate({ update_id: 50, callback_query: {} })).toEqual({ kind: 'ignore' })
    expect(parseTelegramUpdate({ update_id: 50, callback_query: { id: 'cbq1', from: { id: 111 } } })).toEqual({ kind: 'ignore' })
    expect(parseTelegramUpdate({ update_id: 50, callback_query: { id: 'cbq1', data: 'btn:0' } })).toEqual({ kind: 'ignore' })
  })

  it('callback_query takes priority over any message field on the same update', () => {
    const parsed = parseTelegramUpdate({
      update_id: 50,
      callback_query: { id: 'cbq1', data: 'btn:0', from: { id: 111 } },
      message: { text: 'irrelevant', chat: { id: 999 }, from: { is_bot: false } },
    })
    expect(parsed.kind).toBe('callback_query')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/aiAgent/telegram.test.ts`
Expected: FAIL — the `/start` cases return no `fromHandle` field; the `callback_query` cases return `{kind:'ignore'}` instead of the new shape

- [ ] **Step 3: Write the implementation**

In `src/lib/aiAgent/telegram.ts`, add the import at the top of the file:

```ts
import type { FlowStep } from './flow'
```

Extend `ParsedTelegramUpdate`:

```ts
export type ParsedTelegramUpdate =
  | { kind: 'ignore' }
  | { kind: 'start'; chatId: string; fromHandle: string }
  | { kind: 'text'; chatId: string; text: string; fromHandle: string; updateId: number }
  | { kind: 'photo'; chatId: string; fromHandle: string; updateId: number; fileId: string; caption: string }
  | { kind: 'voice'; chatId: string; fromHandle: string; updateId: number; fileId: string }
  | { kind: 'unsupported'; chatId: string }
  | { kind: 'callback_query'; chatId: string; fromHandle: string; data: string; callbackQueryId: string }
```

Replace `parseTelegramUpdate`'s signature and its top (the part that reads `u.message`) and its `/start` return line. Find:

```ts
export function parseTelegramUpdate(update: unknown): ParsedTelegramUpdate {
  const u = update as {
    update_id?: unknown
    message?: {
      text?: unknown
      caption?: unknown
      from?: { is_bot?: boolean; username?: string; first_name?: string }
      chat?: { id?: unknown }
      photo?: { file_id?: unknown }[]
      voice?: { file_id?: unknown }
    } | null
  } | null
  const msg = u?.message
```

Replace with:

```ts
export function parseTelegramUpdate(update: unknown): ParsedTelegramUpdate {
  const u = update as {
    update_id?: unknown
    message?: {
      text?: unknown
      caption?: unknown
      from?: { is_bot?: boolean; username?: string; first_name?: string }
      chat?: { id?: unknown }
      photo?: { file_id?: unknown }[]
      voice?: { file_id?: unknown }
    } | null
    callback_query?: {
      id?: unknown
      data?: unknown
      from?: { id?: unknown; username?: string; first_name?: string }
    } | null
  } | null

  const cq = u?.callback_query
  if (cq) {
    const callbackQueryId = typeof cq.id === 'string' ? cq.id : undefined
    const data = typeof cq.data === 'string' ? cq.data : undefined
    const fromIdRaw = cq.from?.id
    if (!callbackQueryId || !data || (typeof fromIdRaw !== 'number' && typeof fromIdRaw !== 'string')) return { kind: 'ignore' }
    const fromHandle = cq.from?.username || cq.from?.first_name || 'unknown'
    return { kind: 'callback_query', chatId: String(fromIdRaw), fromHandle, data, callbackQueryId }
  }

  const msg = u?.message
```

Find the `/start` return line:

```ts
  if (text === '/start' || text.startsWith('/start ') || text.startsWith('/start@')) {
    return { kind: 'start', chatId }
  }
```

Replace with:

```ts
  if (text === '/start' || text.startsWith('/start ') || text.startsWith('/start@')) {
    return { kind: 'start', chatId, fromHandle }
  }
```

Add two new functions at the end of the file (after `downloadTelegramMedia`):

```ts
// Sends a flow step's message with its buttons as a Telegram inline
// keyboard -- one row per button (simplest layout for v1). callback_data is
// just the button's index within THIS step ("btn:0", "btn:1", ...) -- the
// server already knows which flow/step the customer is on from
// ai_agent_conversations.active_flow_id/active_step_id, so nothing else
// needs to round-trip through Telegram's 64-byte callback_data limit.
export async function sendTelegramFlowStep(botToken: string, chatId: string, step: FlowStep): Promise<void> {
  const inline_keyboard = step.buttons.map((b, i) => [{ text: b.label, callback_data: `btn:${i}` }])
  await callTelegram(botToken, 'sendMessage', {
    chat_id: chatId,
    text: step.text,
    ...(inline_keyboard.length > 0 ? { reply_markup: { inline_keyboard } } : {}),
  })
}

// Must be called for every callback_query update, even a stale/invalid one
// -- otherwise the customer's tapped button shows a loading spinner until
// Telegram's own client-side timeout. `text`, if given, shows as a small
// toast over the chat (not a new message) -- used for "this scenario is no
// longer active" on a stale click.
export async function answerTelegramCallbackQuery(botToken: string, callbackQueryId: string, text?: string): Promise<void> {
  await callTelegram(botToken, 'answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/aiAgent/telegram.test.ts`
Expected: PASS (all cases, including every pre-existing one untouched by this change)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors. Note: `src/app/api/ai-agent/telegram/webhook/route.ts` is NOT updated in this task — its `if (parsed.kind === 'start')` branch still compiles fine without reading `fromHandle` (an unused object field is not a type error), and it doesn't yet handle `'callback_query'` at all (falls through to the existing `// kind 'ignore' ...` no-op comment, since an unhandled `else if` chain member is not a type error either). This is fixed in Task 5.

- [ ] **Step 6: Commit**

```bash
git add src/lib/aiAgent/telegram.ts src/lib/aiAgent/telegram.test.ts
git commit -m "feat(ai-agent): parse Telegram callback_query updates, send flow steps with inline keyboards"
```

---

### Task 3: `/api/ai-agent/flows` — CRUD route

**Files:**
- Create: `src/app/api/ai-agent/flows/route.ts`

**Interfaces:**
- Consumes: `parseFlowDefinition`, `FlowDefinition` type (Task 1)
- Produces: `GET`, `POST`, `DELETE` handlers at `/api/ai-agent/flows`

- [ ] **Step 1: Write the implementation** (no test — this route has no colocated test, mirrors the existing `templates/route.ts`'s own untested convention for the same reason: it's a thin, directly-verifiable CRUD layer over Supabase, exercised live rather than unit tested, matching this codebase's established pattern for every other `ai-agent/*` CRUD route)

Create `src/app/api/ai-agent/flows/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseFlowDefinition, type FlowDefinition } from '@/lib/aiAgent/flow'

// CRUD for ai_agent_flows -- the Сценарии tab's save/load surface. Mirrors
// src/app/api/ai-agent/templates/route.ts's shape (admin-only, agent
// ownership check, GET list / POST create-or-update / DELETE), except flows
// have no PATCH: the editor always sends the whole definition at once, so
// POST alone covers both create and update.

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

async function ownsAgent(userId: string, agentId: string): Promise<boolean> {
  const { data } = await supabase.from('ai_agents').select('id').eq('id', agentId).eq('user_id', userId).maybeSingle()
  return !!data
}

async function loadOwnedFlow(userId: string, flowId: string): Promise<{ id: string; agent_id: string } | null> {
  const { data: flow } = await supabase.from('ai_agent_flows').select('id, agent_id').eq('id', flowId).maybeSingle()
  if (!flow) return null
  if (!(await ownsAgent(userId, flow.agent_id))) return null
  return flow
}

const MAX_TRIGGERS = 20
const MAX_TRIGGER_LEN = 80
const MAX_NAME_LEN = 60
const MAX_STEPS = 30
const MAX_BUTTONS_PER_STEP = 8
const MAX_STEP_TEXT_LEN = 2000
const MAX_BUTTON_LABEL_LEN = 60

function normalizeTriggers(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const words: string[] = []
  for (const w of raw) {
    if (typeof w !== 'string') continue
    const trimmed = w.trim().slice(0, MAX_TRIGGER_LEN)
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    words.push(trimmed)
  }
  return words.slice(0, MAX_TRIGGERS)
}

// Re-validates shape AND enforces this route's own size caps --
// parseFlowDefinition (flow.ts) only checks structural validity (ids exist,
// references resolve); it has no opinion on limits, which belong to the API
// boundary, not the shared engine.
function normalizeDefinition(raw: unknown): FlowDefinition | null {
  const parsed = parseFlowDefinition(raw)
  if (!parsed) return null
  if (parsed.steps.length > MAX_STEPS) return null
  for (const step of parsed.steps) {
    if (step.text.length > MAX_STEP_TEXT_LEN) return null
    if (step.buttons.length > MAX_BUTTONS_PER_STEP) return null
    for (const button of step.buttons) {
      if (button.label.length > MAX_BUTTON_LABEL_LEN) return null
    }
  }
  return parsed
}

function toClientShape(row: any) {
  return {
    id: row.id,
    name: row.name,
    triggerWords: Array.isArray(row.trigger_words) ? row.trigger_words : [],
    isStart: !!row.is_start,
    definition: row.definition,
    createdAt: row.created_at,
  }
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const agentId = req.nextUrl.searchParams.get('agentId')
  if (!agentId) return NextResponse.json({ error: 'agentId required' }, { status: 400 })
  if (!(await ownsAgent(user.id, agentId))) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: rows, error } = await supabase
    .from('ai_agent_flows')
    .select('id, name, trigger_words, is_start, definition, created_at')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ flows: (rows || []).map(toClientShape) })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, MAX_NAME_LEN) : ''
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const triggerWords = normalizeTriggers(body?.triggerWords)
  if (triggerWords.length === 0) return NextResponse.json({ error: 'triggerWords required' }, { status: 400 })
  const definition = normalizeDefinition(body?.definition)
  if (!definition) return NextResponse.json({ error: 'invalid definition' }, { status: 400 })
  const isStart = !!body?.isStart

  const id = typeof body?.id === 'string' ? body.id : undefined
  let agentId: string
  if (id) {
    const existing = await loadOwnedFlow(user.id, id)
    if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    agentId = existing.agent_id
  } else {
    agentId = body?.agentId
    if (!agentId || typeof agentId !== 'string') return NextResponse.json({ error: 'agentId required' }, { status: 400 })
    if (!(await ownsAgent(user.id, agentId))) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // Enforce "at most one is_start flow per agent" server-side -- the client
  // toggling one on doesn't guarantee it also turned the old one off (a
  // stale tab, a race between two saves). Unset any OTHER flow's is_start
  // for this agent BEFORE the upsert, inside the same request, so the DB's
  // partial unique index never sees two true rows even transiently.
  if (isStart) {
    await supabase.from('ai_agent_flows').update({ is_start: false }).eq('agent_id', agentId).eq('is_start', true)
  }

  const { data: row, error } = await supabase
    .from('ai_agent_flows')
    .upsert(
      { ...(id ? { id } : {}), agent_id: agentId, name, trigger_words: triggerWords, definition, is_start: isStart },
      { onConflict: 'id' }
    )
    .select('id, name, trigger_words, is_start, definition, created_at')
    .single()
  if (error || !row) return NextResponse.json({ error: error?.message || 'save_failed' }, { status: 500 })

  return NextResponse.json({ flow: toClientShape(row) })
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const id = body?.id
  if (!id || typeof id !== 'string') return NextResponse.json({ error: 'id required' }, { status: 400 })
  const flow = await loadOwnedFlow(user.id, id)
  if (!flow) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { error } = await supabase.from('ai_agent_flows').delete().eq('id', flow.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ deleted: true })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ai-agent/flows/route.ts
git commit -m "feat(ai-agent): add CRUD route for flows"
```

---

### Task 4: `telegramWebhookHandler.ts` — flow-aware dispatch

**Files:**
- Modify: `src/lib/aiAgent/telegramWebhookHandler.ts`

**Interfaces:**
- Consumes: `parseFlowDefinition`, `isTerminalStep`, `findStepById`, `firstStep`, `findFlowTriggerMatch` (Task 1); `sendTelegramFlowStep`, `answerTelegramCallbackQuery` (Task 2)
- Produces: `handleTelegramStart(conn, { chatId, fromHandle }): Promise<void>`; `handleTelegramFlowCallback(conn, { chatId, data, callbackQueryId }): Promise<void>`; `handleTelegramIncoming` gains flow-exit-on-text and flow-trigger-match behavior, otherwise unchanged

- [ ] **Step 1: Write the implementation** (no test — this file has no colocated test, matching its own established convention: it's DB/network-coupled throughout, like its WhatsApp/Instagram siblings)

In `src/lib/aiAgent/telegramWebhookHandler.ts`, extend the imports — change:

```ts
import { sendTelegramBotMessage, pairConversationHistory, TelegramApiError } from './telegram'
import { UNSUPPORTED_MEDIA_REPLY_TEXT } from '@/lib/aiAgent/mediaLimits'
```

to:

```ts
import { sendTelegramBotMessage, sendTelegramFlowStep, answerTelegramCallbackQuery, pairConversationHistory, TelegramApiError } from './telegram'
import { UNSUPPORTED_MEDIA_REPLY_TEXT } from '@/lib/aiAgent/mediaLimits'
import { parseFlowDefinition, isTerminalStep, findStepById, firstStep } from './flow'
import { findFlowTriggerMatch } from './flow'
```

(the two `from './flow'` imports may be combined into one `import { ... } from './flow'` line — your judgment on formatting, just import all five names.)

Change the conversation upsert's `.select('id')` to also fetch `active_flow_id`, and add the flow-exit-on-text logic right after it. Find:

```ts
  // Find or create the conversation thread for this chat. One Telegram
  // private chat == one thread, keyed by chat.id.
  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .upsert({
      agent_id: conn.agentId,
      channel: 'telegram',
      external_thread_id: params.chatId,
      customer_handle: params.fromHandle,
    }, { onConflict: 'agent_id,channel,external_thread_id', ignoreDuplicates: false })
    .select('id')
    .single()
  if (!conversation) return
```

Replace with:

```ts
  // Find or create the conversation thread for this chat. One Telegram
  // private chat == one thread, keyed by chat.id.
  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .upsert({
      agent_id: conn.agentId,
      channel: 'telegram',
      external_thread_id: params.chatId,
      customer_handle: params.fromHandle,
    }, { onConflict: 'agent_id,channel,external_thread_id', ignoreDuplicates: false })
    .select('id, active_flow_id')
    .single()
  if (!conversation) return

  // The customer was mid-flow but sent free text instead of tapping a
  // button -- exit the flow silently rather than nudge them back to it:
  // someone who prefers typing should get a real answer (template/AI
  // below), not be stuck in a menu.
  if (conversation.active_flow_id) {
    await supabase.from('ai_agent_conversations').update({ active_flow_id: null, active_step_id: null }).eq('id', conversation.id)
  }
```

Insert a new flow-trigger-match tier right after the existing template-match block's closing (the `if (match) { ... } return }` block) and before the `// Prior exchanges with this chat...` comment. Find:

```ts
  if (match) {
    try {
      await sendTelegramBotMessage(conn.botToken, params.chatId, match.reply_text)
      await supabase.from('ai_agent_messages').insert({
        conversation_id: conversation.id,
        direction: 'outbound',
        text: match.reply_text,
        is_ai_generated: false,
        status: 'sent',
      })
    } catch (err: any) {
      console.error('ai-agent telegram webhook: template reply send failed for', params.externalId, ':', err.message)
      await markTelegramTokenExpiredIfUnauthorized(conn.connectionId, err)
    }
    return
  }

  // Prior exchanges with this chat, so the model doesn't re-greet someone
```

Replace with:

```ts
  if (match) {
    try {
      await sendTelegramBotMessage(conn.botToken, params.chatId, match.reply_text)
      await supabase.from('ai_agent_messages').insert({
        conversation_id: conversation.id,
        direction: 'outbound',
        text: match.reply_text,
        is_ai_generated: false,
        status: 'sent',
      })
    } catch (err: any) {
      console.error('ai-agent telegram webhook: template reply send failed for', params.externalId, ':', err.message)
      await markTelegramTokenExpiredIfUnauthorized(conn.connectionId, err)
    }
    return
  }

  // No template -- check whether a flow's trigger words match before
  // falling to paid AI. Flows are free, like templates -- this tier sits
  // between template matching and the AI fallback below.
  if (!params.media) {
    const { data: flows } = await supabase
      .from('ai_agent_flows')
      .select('id, trigger_words, definition')
      .eq('agent_id', conn.agentId)
      .order('created_at', { ascending: true })
    const matchedFlowId = findFlowTriggerMatch(params.incomingText, flows || [])
    const matchedFlow = matchedFlowId ? (flows || []).find(f => f.id === matchedFlowId) : undefined
    if (matchedFlow) {
      await startTelegramFlow(conn, conversation.id, params.chatId, matchedFlow)
      return
    }
  }

  // Prior exchanges with this chat, so the model doesn't re-greet someone
```

Add three new functions at the end of the file (after the existing `handleTelegramIncoming` closing `}`):

```ts
// Starts a flow for an ALREADY-loaded conversation -- used by
// handleTelegramIncoming's flow-trigger tier above. handleTelegramStart
// (below) is the /start-specific twin that creates/loads the conversation
// itself.
async function startTelegramFlow(
  conn: TelegramTenantConnection,
  conversationId: string,
  chatId: string,
  flow: { id: string; definition: unknown }
): Promise<void> {
  const definition = parseFlowDefinition(flow.definition)
  const entryStep = definition ? firstStep(definition) : undefined
  if (!definition || !entryStep) return // corrupted saved flow -- shouldn't happen, defensive no-op

  await supabase.from('ai_agent_conversations').update({ active_flow_id: flow.id, active_step_id: entryStep.id }).eq('id', conversationId)

  try {
    await sendTelegramFlowStep(conn.botToken, chatId, entryStep)
  } catch (err: any) {
    console.error('ai-agent telegram webhook: flow trigger send failed:', err.message)
    await markTelegramTokenExpiredIfUnauthorized(conn.connectionId, err)
  }

  // A one-step flow with no buttons is immediately terminal -- don't leave
  // the conversation waiting for a click that will never come.
  if (isTerminalStep(entryStep)) {
    await supabase.from('ai_agent_conversations').update({ active_flow_id: null, active_step_id: null }).eq('id', conversationId)
  }
}

// Called by the webhook route for a /start update, BEFORE any of the usual
// dedup/conversation/billing machinery in handleTelegramIncoming -- mirrors
// the route's existing treatment of /start as a handshake, not a billable
// turn. If the agent has a flow marked is_start, that flow's first step
// replaces the old static greeting; otherwise the greeting is unchanged.
export async function handleTelegramStart(conn: TelegramTenantConnection, params: { chatId: string; fromHandle: string }): Promise<void> {
  const { data: startFlow } = await supabase
    .from('ai_agent_flows')
    .select('id, definition')
    .eq('agent_id', conn.agentId)
    .eq('is_start', true)
    .maybeSingle()

  if (!startFlow) {
    await sendTelegramBotMessage(conn.botToken, params.chatId, 'Здравствуйте! Напишите ваш вопрос — я на связи.')
    return
  }

  const definition = parseFlowDefinition(startFlow.definition)
  const entryStep = definition ? firstStep(definition) : undefined
  if (!definition || !entryStep) {
    // A saved-but-corrupted flow (shouldn't happen -- the save route
    // validates before writing) -- fall back to the static greeting rather
    // than send nothing.
    await sendTelegramBotMessage(conn.botToken, params.chatId, 'Здравствуйте! Напишите ваш вопрос — я на связи.')
    return
  }

  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .upsert({
      agent_id: conn.agentId,
      channel: 'telegram',
      external_thread_id: params.chatId,
      customer_handle: params.fromHandle,
      active_flow_id: startFlow.id,
      active_step_id: entryStep.id,
    }, { onConflict: 'agent_id,channel,external_thread_id', ignoreDuplicates: false })
    .select('id')
    .single()
  if (!conversation) return

  try {
    await sendTelegramFlowStep(conn.botToken, params.chatId, entryStep)
  } catch (err: any) {
    console.error('ai-agent telegram webhook: flow start send failed:', err.message)
    await markTelegramTokenExpiredIfUnauthorized(conn.connectionId, err)
  }

  if (isTerminalStep(entryStep)) {
    await supabase.from('ai_agent_conversations').update({ active_flow_id: null, active_step_id: null }).eq('id', conversation.id)
  }
}

// Handles a callback_query update (an inline-keyboard button tap) for a
// customer currently inside a flow. Always answers the callback query
// first, regardless of outcome, so Telegram clears the button's loading
// spinner on the customer's client even for a stale/invalid click.
export async function handleTelegramFlowCallback(
  conn: TelegramTenantConnection,
  params: { chatId: string; data: string; callbackQueryId: string }
): Promise<void> {
  const answered = answerTelegramCallbackQuery(conn.botToken, params.callbackQueryId).catch((err: any) => {
    console.error('ai-agent telegram webhook: answerCallbackQuery failed:', err.message)
  })

  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .select('id, active_flow_id, active_step_id')
    .eq('agent_id', conn.agentId)
    .eq('channel', 'telegram')
    .eq('external_thread_id', params.chatId)
    .maybeSingle()
  await answered

  if (!conversation?.active_flow_id || !conversation.active_step_id) return // no active flow -- stale click, nothing to do

  const { data: flow } = await supabase.from('ai_agent_flows').select('id, definition').eq('id', conversation.active_flow_id).maybeSingle()
  const definition = flow ? parseFlowDefinition(flow.definition) : null
  const currentStep = definition ? findStepById(definition, conversation.active_step_id) : undefined

  const match = params.data.match(/^btn:(\d+)$/)
  const buttonIndex = match ? Number(match[1]) : NaN
  const button = currentStep?.buttons[buttonIndex]

  if (!definition || !currentStep || !button) {
    // Stale click (flow/step changed since this message was sent) or a
    // corrupted saved flow -- clear any dangling state and stop. The toast
    // from answerCallbackQuery above is feedback enough, no chat message.
    await supabase.from('ai_agent_conversations').update({ active_flow_id: null, active_step_id: null }).eq('id', conversation.id)
    return
  }

  if (button.nextStepId === null) {
    // "Конец сценария" -- ends immediately, no further message (the
    // button's own label was the final word).
    await supabase.from('ai_agent_conversations').update({ active_flow_id: null, active_step_id: null }).eq('id', conversation.id)
    return
  }

  const nextStep = findStepById(definition, button.nextStepId)
  if (!nextStep) {
    // Dangling reference -- shouldn't happen (the save route validates
    // this), defensive: end the flow rather than send nothing.
    await supabase.from('ai_agent_conversations').update({ active_flow_id: null, active_step_id: null }).eq('id', conversation.id)
    return
  }

  await supabase.from('ai_agent_conversations').update({ active_step_id: nextStep.id }).eq('id', conversation.id)
  try {
    await sendTelegramFlowStep(conn.botToken, params.chatId, nextStep)
  } catch (err: any) {
    console.error('ai-agent telegram webhook: flow step send failed:', err.message)
    await markTelegramTokenExpiredIfUnauthorized(conn.connectionId, err)
  }

  if (isTerminalStep(nextStep)) {
    await supabase.from('ai_agent_conversations').update({ active_flow_id: null, active_step_id: null }).eq('id', conversation.id)
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/aiAgent/telegramWebhookHandler.ts
git commit -m "feat(ai-agent): flow-aware dispatch in the Telegram handler (start, trigger match, callback)"
```

---

### Task 5: Telegram webhook route — wire `/start` and `callback_query`

**Files:**
- Modify: `src/app/api/ai-agent/telegram/webhook/route.ts`

**Interfaces:**
- Consumes: `handleTelegramStart`, `handleTelegramFlowCallback` (Task 4); `'start'`'s `fromHandle` field and `'callback_query'` kind (Task 2)

- [ ] **Step 1: Write the implementation** (no test — matches this route's existing untested convention)

In `src/app/api/ai-agent/telegram/webhook/route.ts`, update the second import — change:

```ts
import { loadTelegramConnectionBySecret, handleTelegramIncoming } from '@/lib/aiAgent/telegramWebhookHandler'
```

to:

```ts
import { loadTelegramConnectionBySecret, handleTelegramIncoming, handleTelegramStart, handleTelegramFlowCallback } from '@/lib/aiAgent/telegramWebhookHandler'
```

Replace the `'start'` branch and add a new `'callback_query'` branch. Find:

```ts
    if (parsed.kind === 'start') {
      // /start is a chat-opening handshake, not a question -- a short
      // static greeting, no AI call, no logging, no debit. The agent's real
      // business greeting comes from the AI on the first actual message.
      await sendTelegramBotMessage(conn.botToken, parsed.chatId, 'Здравствуйте! Напишите ваш вопрос — я на связи.')
    } else if (parsed.kind === 'text') {
```

Replace with:

```ts
    if (parsed.kind === 'start') {
      // /start is a chat-opening handshake -- if the agent has a flow
      // marked as its main scenario, its first step replaces the old
      // static greeting; otherwise handleTelegramStart sends that same
      // greeting itself, unchanged.
      await handleTelegramStart(conn, { chatId: parsed.chatId, fromHandle: parsed.fromHandle })
    } else if (parsed.kind === 'callback_query') {
      await handleTelegramFlowCallback(conn, { chatId: parsed.chatId, data: parsed.data, callbackQueryId: parsed.callbackQueryId })
    } else if (parsed.kind === 'text') {
```

(The `sendTelegramBotMessage` import stays — it's still used by the photo/voice/unsupported branches below for `UNSUPPORTED_MEDIA_REPLY_TEXT`. Do not remove it.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ai-agent/telegram/webhook/route.ts
git commit -m "feat(ai-agent): wire /start and callback_query to the flow engine in the Telegram webhook route"
```

---

### Task 6: Extract `TriggerChipsEditor` into its own component

**Files:**
- Create: `src/components/aiAgent/TriggerChipsEditor.tsx`
- Modify: `src/app/ai-agent/settings/page.tsx`

**Interfaces:**
- Produces: `export default function TriggerChipsEditor({ words, onChange }: { words: string[]; onChange: (words: string[]) => void })`

**Why:** the Сценарии tab (Task 7) needs the exact same trigger-word chip editor the Шаблоны tab already uses. It currently lives as an unexported local function inside `settings/page.tsx` (already a large file) — extracting it once avoids duplicating the same widget in two places.

- [ ] **Step 1: Write the implementation** (no test — this is a presentational component with no colocated test precedent in this codebase, e.g. `TestChatPanel.tsx`)

Create `src/components/aiAgent/TriggerChipsEditor.tsx` with the EXACT body currently in `settings/page.tsx` (find it there first — a `function TriggerChipsEditor({ words, onChange }: ...)` defined just above `export default function AiAgentSettings()` — copy it verbatim, do not alter its logic):

```tsx
'use client'
import { useState } from 'react'

const INPUT_CLS = 'w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]'

export default function TriggerChipsEditor({ words, onChange }: { words: string[]; onChange: (words: string[]) => void }) {
  const [draft, setDraft] = useState('')
  function add() {
    const trimmed = draft.trim()
    if (!trimmed) return
    if (!words.some(w => w.toLowerCase() === trimmed.toLowerCase())) onChange([...words, trimmed])
    setDraft('')
  }
  return (
    <div>
      {words.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {words.map(w => (
            <button key={w} type="button" onClick={() => onChange(words.filter(x => x !== w))}
              className="text-xs pl-2.5 pr-2 py-1 rounded-full flex items-center gap-1.5"
              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
              {w}
              <span aria-hidden>✕</span>
            </button>
          ))}
        </div>
      )}
      <input value={draft} maxLength={80}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
        placeholder="Триггер — Enter, чтобы добавить (например: цена)"
        className={INPUT_CLS}
        style={{ color: 'var(--nav-text-primary)' }} />
    </div>
  )
}
```

In `src/app/ai-agent/settings/page.tsx`:
1. Delete the local `function TriggerChipsEditor({ words, onChange }: ...) { ... }` definition (the whole block, from `function TriggerChipsEditor` through its closing `}`, right before `export default function AiAgentSettings()`).
2. Add an import near the top of the file, alongside the existing `import TestChatPanel from '@/components/aiAgent/TestChatPanel'`:

```ts
import TriggerChipsEditor from '@/components/aiAgent/TriggerChipsEditor'
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors — every existing usage of `<TriggerChipsEditor words=... onChange=... />` inside the Шаблоны tab keeps working unchanged, now resolving to the imported component instead of the local one.

- [ ] **Step 3: Commit**

```bash
git add src/components/aiAgent/TriggerChipsEditor.tsx src/app/ai-agent/settings/page.tsx
git commit -m "refactor(ai-agent): extract TriggerChipsEditor into its own component"
```

---

### Task 7: `FlowBuilder` component + «Сценарии» tab

**Files:**
- Create: `src/components/aiAgent/FlowBuilder.tsx`
- Modify: `src/app/ai-agent/settings/page.tsx`

**Interfaces:**
- Consumes: `TriggerChipsEditor` (Task 6); `/api/ai-agent/flows` (Task 3)
- Produces: `export default function FlowBuilder({ agentId, authHeader }: { agentId: string; authHeader: () => Promise<Record<string, string>> })`; a new `'flows'` tab in the settings page

- [ ] **Step 1: Write the implementation** (no test — client component with local UI state only, no pure logic worth isolating beyond what Task 1 already covers)

Create `src/components/aiAgent/FlowBuilder.tsx`:

```tsx
'use client'
import { useState, useEffect } from 'react'
import TriggerChipsEditor from './TriggerChipsEditor'

const INPUT_CLS = 'w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]'

interface FlowButtonDraft {
  label: string
  nextStepId: string | null
}

interface FlowStepDraft {
  id: string
  text: string
  buttons: FlowButtonDraft[]
}

interface FlowListItem {
  id: string
  name: string
  triggerWords: string[]
  isStart: boolean
  definition: { steps: FlowStepDraft[] }
}

function newStepId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `step_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function emptyStep(): FlowStepDraft {
  return { id: newStepId(), text: '', buttons: [] }
}

export default function FlowBuilder({ agentId, authHeader }: { agentId: string; authHeader: () => Promise<Record<string, string>> }) {
  const [flows, setFlows] = useState<FlowListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftTriggerWords, setDraftTriggerWords] = useState<string[]>([])
  const [draftIsStart, setDraftIsStart] = useState(false)
  const [draftSteps, setDraftSteps] = useState<FlowStepDraft[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const headers = await authHeader()
    const res = await fetch(`/api/ai-agent/flows?agentId=${encodeURIComponent(agentId)}`, { headers })
    if (res.ok) {
      const data = await res.json()
      setFlows(Array.isArray(data.flows) ? data.flows : [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [agentId])

  function startNew() {
    setEditingId('new')
    setDraftName('')
    setDraftTriggerWords([])
    setDraftIsStart(false)
    setDraftSteps([emptyStep()])
    setError(null)
  }

  function startEdit(flow: FlowListItem) {
    setEditingId(flow.id)
    setDraftName(flow.name)
    setDraftTriggerWords(flow.triggerWords)
    setDraftIsStart(flow.isStart)
    setDraftSteps(flow.definition.steps.length > 0 ? flow.definition.steps : [emptyStep()])
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setError(null)
  }

  function addStep() {
    setDraftSteps(prev => [...prev, emptyStep()])
  }

  function removeStep(stepId: string) {
    setDraftSteps(prev => prev
      .filter(s => s.id !== stepId)
      // Any button on a REMAINING step that pointed at the removed step
      // falls back to "Конец сценария" -- never leave a dangling reference.
      .map(s => ({ ...s, buttons: s.buttons.map(b => b.nextStepId === stepId ? { ...b, nextStepId: null } : b) })))
  }

  function updateStepText(stepId: string, text: string) {
    setDraftSteps(prev => prev.map(s => s.id === stepId ? { ...s, text } : s))
  }

  function addButton(stepId: string) {
    setDraftSteps(prev => prev.map(s => s.id === stepId ? { ...s, buttons: [...s.buttons, { label: '', nextStepId: null }] } : s))
  }

  function updateButton(stepId: string, index: number, patch: Partial<FlowButtonDraft>) {
    setDraftSteps(prev => prev.map(s => s.id === stepId
      ? { ...s, buttons: s.buttons.map((b, i) => i === index ? { ...b, ...patch } : b) }
      : s))
  }

  function removeButton(stepId: string, index: number) {
    setDraftSteps(prev => prev.map(s => s.id === stepId ? { ...s, buttons: s.buttons.filter((_, i) => i !== index) } : s))
  }

  async function save() {
    setSaving(true)
    setError(null)
    const headers = await authHeader()
    const res = await fetch('/api/ai-agent/flows', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...(editingId && editingId !== 'new' ? { id: editingId } : { agentId }),
        name: draftName,
        triggerWords: draftTriggerWords,
        isStart: draftIsStart,
        definition: { steps: draftSteps },
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.error === 'invalid definition' ? 'Проверьте шаги — у каждого должен быть текст, у каждой кнопки — название' : 'Не удалось сохранить сценарий')
      return
    }
    setEditingId(null)
    load()
  }

  async function removeFlow(id: string) {
    if (!confirm('Удалить сценарий?')) return
    const headers = await authHeader()
    await fetch('/api/ai-agent/flows', { method: 'DELETE', headers, body: JSON.stringify({ id }) })
    load()
  }

  if (loading) return <div className="text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загрузка…</div>

  if (editingId) {
    return (
      <div>
        <button onClick={cancelEdit} className="text-xs mb-3" style={{ color: 'var(--nav-accent)' }}>← Назад к списку</button>

        <div className="nav-glass nav-card-accent rounded-2xl p-4 mb-3">
          <span className="text-xs mb-1.5 block" style={{ color: 'var(--nav-text-secondary)' }}>Название сценария</span>
          <input value={draftName} onChange={e => setDraftName(e.target.value)} maxLength={60}
            placeholder="Например: Главное меню"
            className={INPUT_CLS} style={{ color: 'var(--nav-text-primary)' }} />

          <span className="text-xs mt-3 mb-1.5 block" style={{ color: 'var(--nav-text-secondary)' }}>Триггерные слова (запускают сценарий, если клиент напишет одно из них)</span>
          <TriggerChipsEditor words={draftTriggerWords} onChange={setDraftTriggerWords} />

          <label className="flex items-center gap-2 mt-3 text-xs" style={{ color: 'var(--nav-text-secondary)' }}>
            <input type="checkbox" checked={draftIsStart} onChange={e => setDraftIsStart(e.target.checked)} />
            Запускать по команде /start (главный сценарий — только один на агента)
          </label>
        </div>

        <div className="space-y-3">
          {draftSteps.map((step, stepIndex) => (
            <div key={step.id} className="nav-glass nav-card-accent rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold" style={{ color: 'var(--nav-text-secondary)' }}>Шаг {stepIndex + 1}</span>
                {draftSteps.length > 1 && (
                  <button onClick={() => removeStep(step.id)} className="text-xs" style={{ color: 'var(--nav-critical)' }}>Удалить шаг</button>
                )}
              </div>
              <textarea value={step.text} onChange={e => updateStepText(step.id, e.target.value)}
                maxLength={2000} placeholder="Текст сообщения на этом шаге"
                className={`${INPUT_CLS} min-h-[70px]`} style={{ color: 'var(--nav-text-primary)' }} />

              <div className="mt-3 space-y-2">
                {step.buttons.map((button, buttonIndex) => (
                  <div key={buttonIndex} className="flex gap-2 items-center">
                    <input value={button.label} onChange={e => updateButton(step.id, buttonIndex, { label: e.target.value })}
                      maxLength={60} placeholder="Текст кнопки"
                      className={`${INPUT_CLS} flex-1`} style={{ color: 'var(--nav-text-primary)' }} />
                    <select value={button.nextStepId ?? ''} onChange={e => updateButton(step.id, buttonIndex, { nextStepId: e.target.value || null })}
                      className={INPUT_CLS} style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-surface-chrome)', width: '180px' }}>
                      <option value="">Конец сценария</option>
                      {draftSteps.filter(s => s.id !== step.id).map(s => (
                        <option key={s.id} value={s.id}>Шаг {draftSteps.indexOf(s) + 1}{s.text ? `: ${s.text.slice(0, 20)}` : ''}</option>
                      ))}
                    </select>
                    <button onClick={() => removeButton(step.id, buttonIndex)} aria-label="Удалить кнопку"
                      className="text-sm px-2" style={{ color: 'var(--nav-text-muted)' }}>✕</button>
                  </div>
                ))}
              </div>
              {step.buttons.length < 8 && (
                <button onClick={() => addButton(step.id)}
                  className="text-xs mt-2" style={{ color: 'var(--nav-accent)' }}>+ Добавить кнопку</button>
              )}
            </div>
          ))}
        </div>

        {draftSteps.length < 30 && (
          <button onClick={addStep}
            className="w-full nav-glass rounded-2xl px-4 py-3 text-sm font-medium mt-3 transition-transform hover:-translate-y-0.5"
            style={{ color: 'var(--nav-accent)' }}>
            + Добавить шаг
          </button>
        )}

        {error && <div className="text-xs mt-2" style={{ color: 'var(--nav-critical)' }}>{error}</div>}

        <div className="flex gap-2 mt-4">
          <button onClick={save} disabled={saving || !draftName.trim() || draftTriggerWords.length === 0 || draftSteps.some(s => !s.text.trim())}
            className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
            {saving ? 'Сохраняем…' : 'Сохранить сценарий'}
          </button>
          <button onClick={cancelEdit} disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>
            Отмена
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs mb-3" style={{ color: 'var(--nav-text-muted)' }}>
        Сценарии отвечают мгновенно и бесплатно, как шаблоны — но ведут клиента по заранее прописанным шагам с кнопками, без ИИ.
      </p>

      {flows.length === 0 && (
        <div className="nav-glass nav-card-accent rounded-2xl p-5 text-sm text-center mb-3" style={{ color: 'var(--nav-text-muted)' }}>
          Сценариев пока нет.
        </div>
      )}

      <div className="space-y-3">
        {flows.map(flow => (
          <div key={flow.id} className="nav-glass nav-card-accent rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{flow.name}</span>
                  {flow.isStart && (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>Главный</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {flow.triggerWords.map(w => (
                    <span key={w} className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'var(--nav-bg)', color: 'var(--nav-accent)' }}>{w}</span>
                  ))}
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => startEdit(flow)} className="text-xs px-2 py-1" style={{ color: 'var(--nav-accent)' }}>Изменить</button>
                <button onClick={() => removeFlow(flow.id)} className="text-xs px-2 py-1" style={{ color: 'var(--nav-critical)' }}>Удалить</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button onClick={startNew}
        className="w-full nav-glass rounded-2xl px-4 py-3 text-sm font-medium mt-3 transition-transform hover:-translate-y-0.5"
        style={{ color: 'var(--nav-accent)' }}>
        + Новый сценарий
      </button>
    </div>
  )
}
```

In `src/app/ai-agent/settings/page.tsx`:

1. Add an import near the top of the file (alongside the `TriggerChipsEditor` import from Task 6):

```ts
import FlowBuilder from '@/components/aiAgent/FlowBuilder'
```

2. Add a `'flows'` entry to `TABS`, right after `'templates'`. Find:

```ts
const TABS = [
  { key: 'settings', label: 'Настройки' },
  { key: 'prompting', label: 'Промптинг' },
  { key: 'control', label: 'Контроль' },
  { key: 'templates', label: 'Шаблоны' },
  { key: 'channels', label: 'Каналы' },
] as const
```

Replace with:

```ts
const TABS = [
  { key: 'settings', label: 'Настройки' },
  { key: 'prompting', label: 'Промптинг' },
  { key: 'control', label: 'Контроль' },
  { key: 'templates', label: 'Шаблоны' },
  { key: 'flows', label: 'Сценарии' },
  { key: 'channels', label: 'Каналы' },
] as const
```

3. Add the tab's render block right after the Шаблоны tab's closing (after the `{tab === 'templates' && ( ... )}` block, before `{tab === 'channels' && (`):

```tsx
            {tab === 'flows' && (
              !agentId ? needsAgentHint('Сценарии появятся после создания агента.') : (
                <FlowBuilder agentId={agentId} authHeader={authHeader} />
              )
            )}

```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add src/components/aiAgent/FlowBuilder.tsx src/app/ai-agent/settings/page.tsx
git commit -m "feat(ai-agent): add Сценарии tab with the flow step builder"
```

---

### Task 8: Final whole-feature verification

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all tests pass, including the new `flow.test.ts` and the modified `telegram.test.ts`

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: builds cleanly

- [ ] **Step 4: Read-through review**

Re-read all 8 modified/created files together and confirm:
- The existing template→AI priority chain is untouched in shape — only a new flow-trigger tier was inserted between them.
- A flow step's send is always billing-free — no path from `startTelegramFlow`/`handleTelegramStart`/`handleTelegramFlowCallback` calls `debitAiAgentWallet` or `generateAiReply`.
- Every `active_flow_id`/`active_step_id` write either sets both together or clears both together — never one without the other (a half-cleared state would strand a future callback lookup).
- The `/api/ai-agent/flows` route's `isStart` swap and the flow-save's own upsert can't leave two `is_start: true` rows for the same agent even under a race (server-side unset happens inside the same request, before the upsert, and the DB's partial unique index is the final backstop).

- [ ] **Step 5: Commit** (only if Step 4 found anything to fix; otherwise this task has no changes of its own to commit)
