# Сценарии на WhatsApp/Instagram Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The existing Telegram-only visual flow builder ("Сценарии") works identically on WhatsApp and Instagram, with each channel automatically rendering buttons in its own native interactive format.

**Architecture:** One `FlowDefinition` (unchanged schema) drives all three channels. The pure step-resolution logic already inline in Telegram's callback handler is extracted into `flow.ts` and reused; a new `flowEngine.ts` gives WhatsApp/Instagram their own shared start/click/invoice-step orchestration (mirroring, not touching, Telegram's already-shipped equivalents). Each channel contributes only a step-rendering function (own button format) and a click-payload extractor (own webhook shape) — both converge on the same `btn:{stepId}:{index}` string Telegram already uses.

**Tech Stack:** Next.js API routes (WhatsApp/Instagram Graph API webhooks), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-27-ai-agent-flows-multichannel-design.md`

## Global Constraints

- One flow definition works on all connected channels — no per-channel authoring, no schema change to `FlowDefinition`/`FlowStep`.
- Button-count adaptation: WhatsApp ≤3 → Interactive Reply Buttons, 4-10 → Interactive List Message (single section); Instagram ≤13 → native quick replies. **`FlowBuilder.tsx` already hard-caps a step at 8 buttons** (`step.buttons.length < 8`), so in practice every real flow stays within both channels' native ranges — the >10/>13 truncation-with-warning paths exist as defensive code, not something a seller can currently trigger.
- Click payload format is `btn:{stepId}:{index}` on all three channels (Telegram's existing `callback_data` format, reused verbatim as the WhatsApp button/list reply id and the Instagram quick-reply payload) — this is what lets one shared stale-click-detection function serve all three.
- Start-flow trigger (`is_start`) on WhatsApp/Instagram fires on the customer's very first-ever message in that conversation (no `/start`-equivalent command exists there) — this REPLACES the normal template/AI reply for that one turn, exactly mirroring how Telegram's `/start` already replaces the static greeting.
- Instagram flows apply to DM only, never to comment replies (same scope restriction already established for the invoice-tool feature) — a comment reply has no interactive-button mechanism on Instagram.
- Telegram's existing behavior must not change. Any shared logic extracted from `telegramWebhookHandler.ts` must produce byte-identical outcomes to what it replaces.

---

### Task 1: Extract the pure click-resolution function, wire it into Telegram's existing caller

**Files:**
- Modify: `src/lib/aiAgent/flow.ts`
- Modify: `src/lib/aiAgent/flow.test.ts`
- Modify: `src/lib/aiAgent/telegramWebhookHandler.ts`

**Interfaces:**
- Produces (consumed by Task 2): `resolveFlowButtonClick(definition: FlowDefinition, activeStepId: string, buttonIndex: number): FlowButtonClickResolution`, where `FlowButtonClickResolution = { outcome: 'stale' } | { outcome: 'ended' } | { outcome: 'advanced'; nextStep: FlowStep }`.

- [ ] **Step 1: Write the failing tests** — append to `src/lib/aiAgent/flow.test.ts`:

```ts
import { resolveFlowButtonClick } from './flow'
```

(add this name to the existing `import { ... } from './flow'` line at the top of the file, alongside the others already imported there)

```ts
describe('resolveFlowButtonClick', () => {
  const def: FlowDefinition = {
    steps: [
      { id: 's1', text: 'Что вас интересует?', buttons: [{ label: 'Цены', nextStepId: 's2' }, { label: 'Готово', nextStepId: null }] },
      { id: 's2', text: 'Актуальные цены на сайте.', buttons: [] },
    ],
  }

  it('advances to the next step when the button has a real nextStepId', () => {
    expect(resolveFlowButtonClick(def, 's1', 0)).toEqual({ outcome: 'advanced', nextStep: def.steps[1] })
  })

  it('ends the flow when the button has nextStepId: null', () => {
    expect(resolveFlowButtonClick(def, 's1', 1)).toEqual({ outcome: 'ended' })
  })

  it('is stale when the active step id does not exist in the definition', () => {
    expect(resolveFlowButtonClick(def, 'ghost-step', 0)).toEqual({ outcome: 'stale' })
  })

  it('is stale when the button index does not exist on the current step', () => {
    expect(resolveFlowButtonClick(def, 's1', 5)).toEqual({ outcome: 'stale' })
  })

  it('is stale when nextStepId points at a step that no longer exists (defensive, save-time validation should prevent this)', () => {
    const corrupted: FlowDefinition = { steps: [{ id: 's1', text: 'x', buttons: [{ label: 'A', nextStepId: 'ghost' }] }] }
    expect(resolveFlowButtonClick(corrupted, 's1', 0)).toEqual({ outcome: 'stale' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/aiAgent/flow.test.ts`
Expected: FAIL — `resolveFlowButtonClick` is not exported from `./flow`.

- [ ] **Step 3: Implement `resolveFlowButtonClick`** — append to `src/lib/aiAgent/flow.ts` (after `findFlowTriggerMatch`, at the end of the file):

```ts
export type FlowButtonClickResolution =
  | { outcome: 'stale' }
  | { outcome: 'ended' }
  | { outcome: 'advanced'; nextStep: FlowStep }

// Pure decision core of "a customer tapped a flow button, what happens
// next" -- shared by every channel's own click handler. 'stale' covers both
// a step id that no longer matches the conversation's real active step
// (customer tapped an OLD, still-visible interactive message) and a
// dangling nextStepId reference (shouldn't happen -- parseFlowDefinition
// validates this at save time -- but resolved defensively the same way).
export function resolveFlowButtonClick(definition: FlowDefinition, activeStepId: string, buttonIndex: number): FlowButtonClickResolution {
  const currentStep = findStepById(definition, activeStepId)
  const button = currentStep?.buttons[buttonIndex]
  if (!currentStep || !button) return { outcome: 'stale' }
  if (button.nextStepId === null) return { outcome: 'ended' }
  const nextStep = findStepById(definition, button.nextStepId)
  if (!nextStep) return { outcome: 'stale' }
  return { outcome: 'advanced', nextStep }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/aiAgent/flow.test.ts`
Expected: PASS (5 new tests, all existing ones still passing).

- [ ] **Step 5: Wire the new function into Telegram's existing caller** — in `src/lib/aiAgent/telegramWebhookHandler.ts`, replace the inline resolution block inside `handleTelegramFlowCallback`. Change:

```ts
  const STALE_TOAST = 'Этот сценарий уже неактуален'
  let toastText: string | undefined
  let clearState = false
  let nextStepToSend: FlowStep | undefined

  if (!conversation?.active_flow_id || !conversation.active_step_id || clickedStepId !== conversation.active_step_id) {
    toastText = STALE_TOAST
  } else {
    const { data: flow } = await supabase.from('ai_agent_flows').select('id, definition').eq('id', conversation.active_flow_id).maybeSingle()
    const definition = flow ? parseFlowDefinition(flow.definition) : null
    const currentStep = definition ? findStepById(definition, conversation.active_step_id) : undefined
    const button = currentStep?.buttons[buttonIndex]

    if (!definition || !currentStep || !button) {
      toastText = STALE_TOAST
      clearState = true
    } else if (button.nextStepId === null) {
      // "Конец сценария" -- ends immediately, no further message (the
      // button's own label was the final word).
      clearState = true
    } else {
      const nextStep = findStepById(definition, button.nextStepId)
      if (!nextStep) {
        // Dangling reference -- shouldn't happen (the save route validates
        // this), defensive: end the flow rather than send nothing.
        toastText = STALE_TOAST
        clearState = true
      } else {
        nextStepToSend = nextStep
      }
    }
  }
```

to:

```ts
  const STALE_TOAST = 'Этот сценарий уже неактуален'
  let toastText: string | undefined
  let clearState = false
  let nextStepToSend: FlowStep | undefined

  if (!conversation?.active_flow_id || !conversation.active_step_id || clickedStepId !== conversation.active_step_id) {
    toastText = STALE_TOAST
  } else {
    const { data: flow } = await supabase.from('ai_agent_flows').select('id, definition').eq('id', conversation.active_flow_id).maybeSingle()
    const definition = flow ? parseFlowDefinition(flow.definition) : null
    const resolution = definition ? resolveFlowButtonClick(definition, conversation.active_step_id, buttonIndex) : { outcome: 'stale' as const }

    if (resolution.outcome === 'stale') {
      toastText = STALE_TOAST
      clearState = true
    } else if (resolution.outcome === 'ended') {
      // "Конец сценария" -- ends immediately, no further message (the
      // button's own label was the final word).
      clearState = true
    } else {
      nextStepToSend = resolution.nextStep
    }
  }
```

- [ ] **Step 6: Update the import** — in the same file, change:

```ts
import { parseFlowDefinition, isTerminalStep, findStepById, firstStep, findFlowTriggerMatch, type FlowStep } from './flow'
```

to:

```ts
import { parseFlowDefinition, isTerminalStep, firstStep, findFlowTriggerMatch, resolveFlowButtonClick, type FlowStep } from './flow'
```

(`findStepById` is dropped — its only two call sites in this file were inside the block just replaced; `firstStep` is still used elsewhere in the file, keep it.)

- [ ] **Step 7: Run the gate**

Run: `npx tsc --noEmit` → expect clean.
Run: `npx vitest run` → expect all pass (no behavior change to Telegram — same outcomes, same tests).

- [ ] **Step 8: Commit**

```bash
git add src/lib/aiAgent/flow.ts src/lib/aiAgent/flow.test.ts src/lib/aiAgent/telegramWebhookHandler.ts
git status --short
git commit -m "refactor(ai-agent): extract pure flow button-click resolution, reuse in Telegram handler"
```

---

### Task 2: `flowEngine.ts` — shared start/click/invoice-step orchestration for WhatsApp and Instagram

**Files:**
- Create: `src/lib/aiAgent/flowEngine.ts`

**Interfaces:**
- Consumes: `resolveFlowButtonClick`, `parseFlowDefinition`, `firstStep`, `isTerminalStep`, `type FlowStep` (`./flow`); `sendIntoConversation` (`./channelSend`); `createDraft` (`./invoiceSend`); `validateDraftInput`, `canAutoSend` (`./invoiceDrafts`).
- Produces (consumed by Tasks 5/6): `type FlowStepSender = (step: FlowStep) => Promise<boolean>`, `type FlowConversationRef = { id: string; agent_id: string; channel: string; external_thread_id: string }`, `startFlow(supabase, conversation: FlowConversationRef, flow: {id: string; definition: unknown}, sendStep: FlowStepSender): Promise<void>`, `handleFlowButtonClick(supabase, conversation: FlowConversationRef, clickedPayload: string, sendStep: FlowStepSender): Promise<{outcome: 'stale' | 'ended' | 'advanced'}>`, `FLOW_STALE_TEXT: string`.

This module is deliberately NOT used by `telegramWebhookHandler.ts` — Telegram's own `startTelegramFlow`/`handleTelegramFlowCallback`/`maybeExecuteInvoiceStep` already work and are left untouched (beyond Task 1's small extraction) to avoid any risk to that already-shipped, invoice-adjacent code path. WhatsApp and Instagram get their OWN independent callers of this shared engine instead.

- [ ] **Step 1: Create `src/lib/aiAgent/flowEngine.ts`** — full file:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseFlowDefinition, firstStep, isTerminalStep, resolveFlowButtonClick, type FlowStep } from './flow'
import { sendIntoConversation } from './channelSend'
import { createDraft } from './invoiceSend'
import { validateDraftInput, canAutoSend } from './invoiceDrafts'

// Shared start/click/invoice-step orchestration for channels that render
// flow steps as their own native interactive message type (WhatsApp
// Reply Buttons/List Messages, Instagram quick replies) instead of
// Telegram's inline keyboard. Telegram keeps its own already-shipped
// equivalents (telegramWebhookHandler.ts) untouched -- this module exists
// so WhatsApp/Instagram don't each reimplement the same state machine.

export type FlowStepSender = (step: FlowStep) => Promise<boolean>

export interface FlowConversationRef {
  id: string
  agent_id: string
  channel: string
  external_thread_id: string
}

export const FLOW_STALE_TEXT = 'Этот сценарий уже неактуален'

// Phase 3 «счёт из чата», channel-generic twin of
// telegramWebhookHandler.ts's maybeExecuteInvoiceStep: after an 'invoice'
// step's own text is delivered, creates an invoice draft from the step's
// fixed item + the conversation's collected name/phone. Missing name/phone
// -> a fixed ask via the plain-text sendIntoConversation (an invoice step
// is terminal-shaped, buttons: [], so the customer's reply flows through
// the normal pipeline afterward, where the AI tool can finish the job).
export async function maybeExecuteInvoiceStep(
  supabase: SupabaseClient,
  conversation: FlowConversationRef,
  step: FlowStep,
): Promise<void> {
  if (step.kind !== 'invoice' || !step.invoiceItem) return
  try {
    const { data: conv } = await supabase.from('ai_agent_conversations')
      .select('collected_name, collected_phone').eq('id', conversation.id).single()
    const customerName = conv?.collected_name?.trim() || ''
    const customerPhone = conv?.collected_phone?.trim() || ''
    if (!customerName || !customerPhone) {
      await sendIntoConversation(supabase, conversation, 'Чтобы выставить счёт, напишите, пожалуйста, ваше имя и номер телефона одним сообщением.')
      return
    }
    const validated = validateDraftInput([{ name: step.invoiceItem.name, qty: 1, unitPrice: step.invoiceItem.unitPrice }])
    if (!validated.ok) {
      console.error('ai-agent flow engine: invoice step has invalid item:', validated.error)
      return
    }
    const { data: agentRow } = await supabase.from('ai_agents').select('status').eq('id', conversation.agent_id).single()
    const { count } = await supabase.from('ai_agent_invoice_drafts')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', conversation.agent_id)
      .eq('status', 'approved_sent')
    const auto = canAutoSend(agentRow?.status || 'training', count || 0)
    const created = await createDraft(supabase, {
      agentId: conversation.agent_id,
      conversationId: conversation.id,
      customerName,
      customerPhone,
      items: validated.items,
      total: validated.total,
      source: 'flow_step',
      autoSend: auto,
    })
    if (!created.sent) {
      await sendIntoConversation(supabase, conversation, 'Счёт готовится — как только владелец подтвердит, ссылка на оплату придёт сюда.')
    }
  } catch (err: any) {
    console.error('ai-agent flow engine: invoice step failed:', err?.message || err)
  }
}

// Starts a flow: sends its entry step via the caller's own channel-specific
// sendStep, marks the conversation as inside this flow/step, runs the
// invoice-step side effect if applicable, and immediately clears the flow
// state again if the entry step is terminal (a one-step flow with no
// buttons shouldn't leave the conversation waiting for a click that will
// never come).
export async function startFlow(
  supabase: SupabaseClient,
  conversation: FlowConversationRef,
  flow: { id: string; definition: unknown },
  sendStep: FlowStepSender,
): Promise<void> {
  const definition = parseFlowDefinition(flow.definition)
  const entryStep = definition ? firstStep(definition) : undefined
  if (!definition || !entryStep) return // corrupted saved flow -- shouldn't happen, defensive no-op

  await supabase.from('ai_agent_conversations').update({ active_flow_id: flow.id, active_step_id: entryStep.id }).eq('id', conversation.id)

  const delivered = await sendStep(entryStep)
  if (delivered) await maybeExecuteInvoiceStep(supabase, conversation, entryStep)

  if (isTerminalStep(entryStep)) {
    await supabase.from('ai_agent_conversations').update({ active_flow_id: null, active_step_id: null }).eq('id', conversation.id)
  }
}

// Resolves + advances a click on a flow's interactive message, for a
// channel with no separate "acknowledge the tap" step (unlike Telegram's
// callback_query/answerCallbackQuery) -- a stale click just gets
// FLOW_STALE_TEXT as a normal reply from the caller, an ended flow gets
// nothing further, an advance sends the next step the same way startFlow does.
export async function handleFlowButtonClick(
  supabase: SupabaseClient,
  conversation: FlowConversationRef,
  clickedPayload: string,
  sendStep: FlowStepSender,
): Promise<{ outcome: 'stale' | 'ended' | 'advanced' }> {
  const { data: current } = await supabase
    .from('ai_agent_conversations')
    .select('active_flow_id, active_step_id')
    .eq('id', conversation.id)
    .maybeSingle()

  // Same "btn:<stepId>:<index>" format Telegram already uses for
  // callback_data -- the step id lets a click on an OLD, still-visible
  // interactive message be detected as stale instead of resolved against
  // whatever button currently sits at that array index on the CURRENT step.
  const match = clickedPayload.match(/^btn:([^:]+):(\d+)$/)
  const clickedStepId = match ? match[1] : undefined
  const buttonIndex = match ? Number(match[2]) : NaN

  if (!current?.active_flow_id || !current.active_step_id || clickedStepId !== current.active_step_id) {
    return { outcome: 'stale' }
  }

  const { data: flow } = await supabase.from('ai_agent_flows').select('id, definition').eq('id', current.active_flow_id).maybeSingle()
  const definition = flow ? parseFlowDefinition(flow.definition) : null
  const resolution = definition ? resolveFlowButtonClick(definition, current.active_step_id, buttonIndex) : { outcome: 'stale' as const }

  if (resolution.outcome !== 'advanced') {
    await supabase.from('ai_agent_conversations').update({ active_flow_id: null, active_step_id: null }).eq('id', conversation.id)
    return { outcome: resolution.outcome }
  }

  await supabase.from('ai_agent_conversations').update({ active_step_id: resolution.nextStep.id }).eq('id', conversation.id)
  const delivered = await sendStep(resolution.nextStep)
  if (delivered) await maybeExecuteInvoiceStep(supabase, conversation, resolution.nextStep)
  if (isTerminalStep(resolution.nextStep)) {
    await supabase.from('ai_agent_conversations').update({ active_flow_id: null, active_step_id: null }).eq('id', conversation.id)
  }
  return { outcome: 'advanced' }
}
```

- [ ] **Step 2: Run the gate**

Run: `npx tsc --noEmit` → expect clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/aiAgent/flowEngine.ts
git status --short
git commit -m "feat(ai-agent): shared flow start/click/invoice-step engine for WhatsApp+Instagram"
```

---

### Task 3: WhatsApp flow step sender

**Files:**
- Modify: `src/lib/whatsapp.ts`
- Test: `src/lib/whatsapp.test.ts` (new)

**Interfaces:**
- Consumes: `type FlowStep` (`./aiAgent/flow`).
- Produces (consumed by Task 5): `sendWhatsAppFlowStep(phoneNumberId: string, to: string, step: FlowStep, accessToken: string): Promise<void>`.

- [ ] **Step 1: Write the failing tests** — full file `src/lib/whatsapp.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildWhatsAppFlowMessage } from './whatsapp'
import type { FlowStep } from './aiAgent/flow'

describe('buildWhatsAppFlowMessage', () => {
  it('returns a plain text message for a terminal (no-button) step', () => {
    const step: FlowStep = { id: 's1', text: 'Спасибо!', buttons: [] }
    expect(buildWhatsAppFlowMessage(step)).toEqual({ type: 'text', text: { body: 'Спасибо!' } })
  })

  it('returns Interactive Reply Buttons for 1-3 buttons', () => {
    const step: FlowStep = { id: 's1', text: 'Выберите', buttons: [{ label: 'Да', nextStepId: null }, { label: 'Нет', nextStepId: null }] }
    expect(buildWhatsAppFlowMessage(step)).toEqual({
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: 'Выберите' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'btn:s1:0', title: 'Да' } },
            { type: 'reply', reply: { id: 'btn:s1:1', title: 'Нет' } },
          ],
        },
      },
    })
  })

  it('returns an Interactive List Message for 4-10 buttons', () => {
    const step: FlowStep = {
      id: 's1', text: 'Выберите товар',
      buttons: [1, 2, 3, 4, 5].map(n => ({ label: `Товар ${n}`, nextStepId: null })),
    }
    const result: any = buildWhatsAppFlowMessage(step)
    expect(result.type).toBe('interactive')
    expect(result.interactive.type).toBe('list')
    expect(result.interactive.action.sections[0].rows).toHaveLength(5)
    expect(result.interactive.action.sections[0].rows[0]).toEqual({ id: 'btn:s1:0', title: 'Товар 1' })
  })

  it('truncates a button label to 20 chars for Reply Buttons', () => {
    const step: FlowStep = { id: 's1', text: 'x', buttons: [{ label: 'Очень длинное название кнопки, которое точно не влезет', nextStepId: null }] }
    const result: any = buildWhatsAppFlowMessage(step)
    expect(result.interactive.action.buttons[0].reply.title.length).toBeLessThanOrEqual(20)
  })

  it('caps a list message at 10 rows even with more buttons', () => {
    const step: FlowStep = {
      id: 's1', text: 'x',
      buttons: Array.from({ length: 12 }, (_, i) => ({ label: `Товар ${i}`, nextStepId: null })),
    }
    const result: any = buildWhatsAppFlowMessage(step)
    expect(result.interactive.action.sections[0].rows).toHaveLength(10)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/whatsapp.test.ts`
Expected: FAIL — `buildWhatsAppFlowMessage` is not exported from `./whatsapp`.

- [ ] **Step 3: Implement** — add to `src/lib/whatsapp.ts` (at the end of the file, after `sendWhatsAppMessage`), and add the import at the top:

```ts
import type { FlowStep } from './aiAgent/flow'
```

```ts
const WHATSAPP_BUTTON_TITLE_MAX = 20
const WHATSAPP_LIST_ROW_TITLE_MAX = 24
const WHATSAPP_LIST_BUTTON_LABEL = 'Выбрать'
const WHATSAPP_LIST_MAX_ROWS = 10

// Pure -- decides WhatsApp's native interactive shape for a flow step's
// button count. FlowBuilder.tsx already caps a step at 8 buttons, so the
// >10 truncation branch below is defensive (unreachable via the UI today),
// not a real UX for that case.
export function buildWhatsAppFlowMessage(step: FlowStep): Record<string, unknown> {
  if (step.buttons.length === 0) {
    return { type: 'text', text: { body: step.text } }
  }
  if (step.buttons.length <= 3) {
    return {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: step.text },
        action: {
          buttons: step.buttons.map((b, i) => ({
            type: 'reply',
            reply: { id: `btn:${step.id}:${i}`, title: b.label.slice(0, WHATSAPP_BUTTON_TITLE_MAX) },
          })),
        },
      },
    }
  }
  const rows = step.buttons.slice(0, WHATSAPP_LIST_MAX_ROWS).map((b, i) => ({
    id: `btn:${step.id}:${i}`,
    title: b.label.slice(0, WHATSAPP_LIST_ROW_TITLE_MAX),
  }))
  return {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: step.text },
      action: { button: WHATSAPP_LIST_BUTTON_LABEL, sections: [{ rows }] },
    },
  }
}

// Sends one flow step -- text, Reply Buttons, or a List Message depending
// on button count (buildWhatsAppFlowMessage). All three are session
// messages, allowed within the same 24h customer-service window as
// sendWhatsAppMessage's plain text, no template approval needed.
export async function sendWhatsAppFlowStep(phoneNumberId: string, to: string, step: FlowStep, accessToken: string): Promise<void> {
  await callGraphApi(`${GRAPH_API}/${phoneNumberId}/messages`, accessToken, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    ...buildWhatsAppFlowMessage(step),
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/whatsapp.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the gate**

Run: `npx tsc --noEmit` → expect clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/whatsapp.ts src/lib/whatsapp.test.ts
git status --short
git commit -m "feat(ai-agent): WhatsApp flow step sender -- Reply Buttons / List Message"
```

---

### Task 4: Instagram flow step sender

**Files:**
- Modify: `src/lib/instagram.ts`
- Test: `src/lib/instagram.test.ts` (new, unless one already exists — check first with `ls src/lib/instagram.test.ts`; if it exists, append to it instead of overwriting)

**Interfaces:**
- Consumes: `type FlowStep` (`./aiAgent/flow`).
- Produces (consumed by Task 6): `sendInstagramFlowStep(recipientId: string, step: FlowStep, credentials: {igUserId: string; accessToken: string}): Promise<void>`.

- [ ] **Step 1: Check whether `src/lib/instagram.test.ts` already exists.**

Run: `ls src/lib/instagram.test.ts 2>/dev/null || echo "no existing test file"`

If it exists, read it first and add the new `describe` block below alongside its existing content (keep its existing imports, add `buildInstagramFlowMessage` to them). If it doesn't exist, create it fresh with just this content:

```ts
import { describe, it, expect } from 'vitest'
import { buildInstagramFlowMessage } from './instagram'
import type { FlowStep } from './aiAgent/flow'

describe('buildInstagramFlowMessage', () => {
  it('returns a plain text message for a terminal (no-button) step', () => {
    const step: FlowStep = { id: 's1', text: 'Спасибо!', buttons: [] }
    expect(buildInstagramFlowMessage(step)).toEqual({ text: 'Спасибо!' })
  })

  it('returns quick_replies for a step with buttons', () => {
    const step: FlowStep = { id: 's1', text: 'Выберите', buttons: [{ label: 'Да', nextStepId: null }, { label: 'Нет', nextStepId: null }] }
    expect(buildInstagramFlowMessage(step)).toEqual({
      text: 'Выберите',
      quick_replies: [
        { content_type: 'text', title: 'Да', payload: 'btn:s1:0' },
        { content_type: 'text', title: 'Нет', payload: 'btn:s1:1' },
      ],
    })
  })

  it('truncates a button label to 20 chars', () => {
    const step: FlowStep = { id: 's1', text: 'x', buttons: [{ label: 'Очень длинное название кнопки, которое точно не влезет', nextStepId: null }] }
    const result = buildInstagramFlowMessage(step)
    expect(result.quick_replies![0].title.length).toBeLessThanOrEqual(20)
  })

  it('caps quick replies at 13 even with more buttons', () => {
    const step: FlowStep = {
      id: 's1', text: 'x',
      buttons: Array.from({ length: 15 }, (_, i) => ({ label: `Вариант ${i}`, nextStepId: null })),
    }
    const result = buildInstagramFlowMessage(step)
    expect(result.quick_replies).toHaveLength(13)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/instagram.test.ts`
Expected: FAIL — `buildInstagramFlowMessage` is not exported from `./instagram`.

- [ ] **Step 3: Implement** — add to `src/lib/instagram.ts` (at the end of the file, after `sendDirectMessage`), and add the import at the top:

```ts
import type { FlowStep } from './aiAgent/flow'
```

```ts
const INSTAGRAM_QUICK_REPLY_TITLE_MAX = 20
const INSTAGRAM_QUICK_REPLY_MAX = 13

interface InstagramFlowMessage {
  text: string
  quick_replies?: { content_type: 'text'; title: string; payload: string }[]
}

// Pure -- decides Instagram's native quick-reply shape for a flow step.
// FlowBuilder.tsx already caps a step at 8 buttons, so the >13 truncation
// branch below is defensive (unreachable via the UI today).
export function buildInstagramFlowMessage(step: FlowStep): InstagramFlowMessage {
  if (step.buttons.length === 0) return { text: step.text }
  const quick_replies = step.buttons.slice(0, INSTAGRAM_QUICK_REPLY_MAX).map((b, i) => ({
    content_type: 'text' as const,
    title: b.label.slice(0, INSTAGRAM_QUICK_REPLY_TITLE_MAX),
    payload: `btn:${step.id}:${i}`,
  }))
  return { text: step.text, quick_replies }
}

// Sends one flow step as a DM -- text or quick replies depending on button
// count (buildInstagramFlowMessage). Same send shape as sendDirectMessage,
// just with a richer `message` object.
export async function sendInstagramFlowStep(recipientId: string, step: FlowStep, credentials: { igUserId: string; accessToken: string }): Promise<void> {
  const res = await fetch(`${GRAPH_API}/${credentials.igUserId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: buildInstagramFlowMessage(step),
      access_token: credentials.accessToken,
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new InstagramApiError(data.error?.message || 'Failed to send flow step', res.status)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/instagram.test.ts`
Expected: PASS (4 new tests, plus any pre-existing ones in the same file still passing).

- [ ] **Step 5: Run the gate**

Run: `npx tsc --noEmit` → expect clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/instagram.ts src/lib/instagram.test.ts
git status --short
git commit -m "feat(ai-agent): Instagram flow step sender -- quick replies"
```

---

### Task 5: Wire flows into the WhatsApp tenant handler + webhook route

**Files:**
- Modify: `src/lib/aiAgent/whatsappWebhookHandler.ts`
- Modify: `src/app/api/whatsapp/webhook/route.ts`

**Interfaces:**
- Consumes: `startFlow`, `handleFlowButtonClick`, `FLOW_STALE_TEXT`, `type FlowStepSender` (`./flowEngine`); `parseFlowDefinition`, `findFlowTriggerMatch` (`./flow`); `sendWhatsAppFlowStep` (`@/lib/whatsapp`, Task 3).
- Produces: `handleWhatsAppFlowButtonClick(conn: WhatsAppTenantConnection, params: {externalId: string; from: string; clickedPayload: string}): Promise<void>` (new export from `whatsappWebhookHandler.ts`, called by the route for an interactive-reply message).

- [ ] **Step 1: Add the flow-trigger tier and first-message start-trigger to `handleWhatsAppIncoming`** — in `src/lib/aiAgent/whatsappWebhookHandler.ts`, add imports:

```ts
import { parseFlowDefinition, firstStep, findFlowTriggerMatch, isTerminalStep, type FlowStep } from './flow'
import { startFlow, handleFlowButtonClick, FLOW_STALE_TEXT, type FlowStepSender } from './flowEngine'
import { sendWhatsAppFlowStep } from '@/lib/whatsapp'
```

Then add a small helper right after the existing `markWhatsAppTokenExpiredIfUnauthorized` function:

```ts
// Shared by every flow entry point below (start / trigger-match / button
// click) -- wraps this connection's own sendWhatsAppFlowStep with the same
// error-handling shape handleWhatsAppIncoming's other send call sites use.
function makeWhatsAppFlowSender(conn: WhatsAppTenantConnection, to: string): FlowStepSender {
  return async (step: FlowStep) => {
    try {
      await sendWhatsAppFlowStep(conn.phoneNumberId, to, step, conn.accessToken)
      return true
    } catch (err: any) {
      console.error('ai-agent whatsapp webhook: flow step send failed:', err.message)
      await markWhatsAppTokenExpiredIfUnauthorized(conn.connectionId, err)
      return false
    }
  }
}
```

Then, inside `handleWhatsAppIncoming`, right after the conversation upsert (`if (!conversation) return`) and BEFORE the inbound-message insert, add the first-message check:

```ts
  if (!conversation) return

  // WhatsApp has no /start-equivalent command -- a start-flow fires on the
  // customer's very first-ever message instead, mirroring how Telegram's
  // /start already replaces the static greeting. Checked BEFORE inserting
  // this turn's own inbound row, so "first message" means "zero prior rows".
  const { count: priorMessageCount } = await supabase
    .from('ai_agent_messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversation.id)
  const isFirstMessage = (priorMessageCount ?? 0) === 0
```

Then, right after the existing inbound-message insert succeeds (after the `if (insertError) {...}` block, before the operator-takeover gate `if (conversation.paused_for_human) return`), add:

```ts
  if (isFirstMessage) {
    const { data: startFlowRow } = await supabase
      .from('ai_agent_flows')
      .select('id, definition')
      .eq('agent_id', conn.agentId)
      .eq('is_start', true)
      .maybeSingle()
    if (startFlowRow) {
      await startFlow(
        supabase,
        { id: conversation.id, agent_id: conn.agentId, channel: 'whatsapp', external_thread_id: params.from },
        startFlowRow,
        makeWhatsAppFlowSender(conn, params.from),
      )
      return
    }
  }
```

Finally, add the flow-trigger tier right after the existing template-match block returns (i.e. right before the "Prior exchanges with this number" comment / `historyPairs` block), mirroring exactly where Telegram's own flow-trigger tier sits relative to template matching:

```ts
  // No template -- check whether a flow's trigger words match before
  // falling to paid AI. Flows are free, like templates -- same tier
  // ordering as the Telegram tenant path.
  if (!params.media) {
    const { data: flows } = await supabase
      .from('ai_agent_flows')
      .select('id, trigger_words, definition')
      .eq('agent_id', conn.agentId)
      .order('created_at', { ascending: true })
    const matchedFlowId = findFlowTriggerMatch(params.incomingText, flows || [])
    const matchedFlow = matchedFlowId ? (flows || []).find(f => f.id === matchedFlowId) : undefined
    if (matchedFlow) {
      await startFlow(
        supabase,
        { id: conversation.id, agent_id: conn.agentId, channel: 'whatsapp', external_thread_id: params.from },
        matchedFlow,
        makeWhatsAppFlowSender(conn, params.from),
      )
      return
    }
  }
```

- [ ] **Step 2: Add `handleWhatsAppFlowButtonClick`** — append to the end of `src/lib/aiAgent/whatsappWebhookHandler.ts`:

```ts
interface WhatsAppFlowClickParams {
  externalId: string
  from: string
  clickedPayload: string
}

// Handles an interactive reply/list-reply message -- the WhatsApp twin of
// telegramWebhookHandler.ts's handleTelegramFlowCallback, minus the
// spinner-clear step Telegram has and WhatsApp doesn't. A stale click gets
// FLOW_STALE_TEXT as a normal reply (there's no toast mechanism here).
export async function handleWhatsAppFlowButtonClick(conn: WhatsAppTenantConnection, params: WhatsAppFlowClickParams): Promise<void> {
  const { data: existingMsg } = await supabase
    .from('ai_agent_messages')
    .select('id')
    .eq('external_id', params.externalId)
    .maybeSingle()
  if (existingMsg) return

  const { data: agent } = await supabase.from('ai_agents').select('is_enabled').eq('id', conn.agentId).single()
  if (!agent || agent.is_enabled === false) return

  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .select('id, paused_for_human')
    .eq('agent_id', conn.agentId)
    .eq('channel', 'whatsapp')
    .eq('external_thread_id', params.from)
    .maybeSingle()
  if (!conversation) return

  // Logged as an inbound message like any other turn, same dedup/history
  // shape -- a button tap is still a real turn in the conversation.
  const { error: insertError } = await supabase.from('ai_agent_messages').insert({
    conversation_id: conversation.id,
    direction: 'inbound',
    text: `[кнопка] ${params.clickedPayload}`,
    external_id: params.externalId,
  })
  if (insertError && insertError.code !== '23505') {
    console.error('ai-agent whatsapp webhook: failed to log flow button click for', params.externalId, ':', insertError.message)
  }

  if (conversation.paused_for_human) return

  const conversationRef = { id: conversation.id, agent_id: conn.agentId, channel: 'whatsapp', external_thread_id: params.from }
  const result = await handleFlowButtonClick(supabase, conversationRef, params.clickedPayload, makeWhatsAppFlowSender(conn, params.from))
  if (result.outcome === 'stale') {
    await sendWhatsAppMessage(conn.phoneNumberId, params.from, FLOW_STALE_TEXT, { accessToken: conn.accessToken }).catch((err: any) => {
      console.error('ai-agent whatsapp webhook: stale-click reply failed:', err.message)
    })
  }
}
```

- [ ] **Step 3: Detect an interactive reply in the webhook route** — in `src/app/api/whatsapp/webhook/route.ts`, add `handleWhatsAppFlowButtonClick` to the existing import:

```ts
import { loadWhatsAppConnection, handleWhatsAppIncoming, handleWhatsAppFlowButtonClick } from '@/lib/aiAgent/whatsappWebhookHandler'
```

Add an `interactive` field to the `WhatsAppValue` message type:

```ts
  messages?: {
    from?: string
    id?: string
    timestamp?: string
    type?: string
    text?: { body?: string }
    image?: { id?: string; mime_type?: string; caption?: string }
    audio?: { id?: string; mime_type?: string }
    interactive?: {
      type?: string
      button_reply?: { id?: string; title?: string }
      list_reply?: { id?: string; title?: string }
    }
  }[]
```

Add a new branch inside the `for (const msg of value.messages)` loop's `try` block, BEFORE the existing `if (msg.type === 'text' ...)` branch (an interactive reply must be checked before any text-shaped handling — it never carries `msg.text` anyway, so ordering relative to the text branch doesn't strictly matter, but placing it first keeps the branch order matching "most structurally distinct message types first", same spirit as the existing image/audio ordering):

```ts
          if (msg.type === 'interactive') {
            const clickedPayload = msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id
            if (clickedPayload) {
              await handleWhatsAppFlowButtonClick(conn, { externalId: msg.id, from: msg.from, clickedPayload })
            }
            continue
          }

```

- [ ] **Step 4: Run the gate**

Run: `npx tsc --noEmit` → expect clean.
Run: `npx vitest run` → expect all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/aiAgent/whatsappWebhookHandler.ts src/app/api/whatsapp/webhook/route.ts
git status --short
git commit -m "feat(ai-agent): wire flows into WhatsApp -- start on first message, trigger match, button clicks"
```

---

### Task 6: Wire flows into the Instagram tenant handler + webhook route

**Files:**
- Modify: `src/lib/aiAgent/webhookHandler.ts`
- Modify: `src/app/api/instagram/webhook/route.ts`

**Interfaces:**
- Consumes: `startFlow`, `handleFlowButtonClick`, `FLOW_STALE_TEXT`, `type FlowStepSender` (`./flowEngine`); `findFlowTriggerMatch` (`./flow`); `sendInstagramFlowStep` (`@/lib/instagram`, Task 4).
- Produces: `handleInstagramFlowButtonClick(conn: TenantConnection, params: {externalId: string; replyTarget: string; clickedPayload: string}): Promise<void>` (new export from `webhookHandler.ts`).

- [ ] **Step 1: Add the flow-trigger tier and first-message start-trigger to `handleTenantIncoming`, DM only** — in `src/lib/aiAgent/webhookHandler.ts`, add imports:

```ts
import { firstStep, findFlowTriggerMatch, type FlowStep } from './flow'
import { startFlow, handleFlowButtonClick, FLOW_STALE_TEXT, type FlowStepSender } from './flowEngine'
import { sendInstagramFlowStep } from '@/lib/instagram'
```

Add the sender-builder helper right after `markTokenExpiredIfUnauthorized`:

```ts
// Shared by every flow entry point below -- wraps this connection's own
// sendInstagramFlowStep with the same error-handling shape this file's
// other send call sites use.
function makeInstagramFlowSender(conn: TenantConnection, recipientId: string): FlowStepSender {
  return async (step: FlowStep) => {
    try {
      await sendInstagramFlowStep(recipientId, step, { igUserId: conn.externalAccountId, accessToken: conn.accessToken })
      return true
    } catch (err: any) {
      console.error('ai-agent webhook: flow step send failed:', err.message)
      await markTokenExpiredIfUnauthorized(conn.connectionId, err)
      return false
    }
  }
}
```

Inside `handleTenantIncoming`, right after `if (!conversation) return` and BEFORE the inbound-message insert, add the first-message check (DM only -- a comment can't carry flow state, same restriction as the invoice tool):

```ts
  if (!conversation) return

  // Instagram has no /start-equivalent command -- a DM start-flow fires on
  // the customer's very first-ever message instead. Comments never trigger
  // this (no interactive-button mechanism exists for a comment reply).
  let isFirstMessage = false
  if (params.source === 'dm') {
    const { count } = await supabase
      .from('ai_agent_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversation.id)
    isFirstMessage = (count ?? 0) === 0
  }
```

Right after the existing inbound-message insert succeeds (after its `if (insertError) {...}` block, before the operator-takeover gate), add:

```ts
  if (isFirstMessage) {
    const { data: startFlowRow } = await supabase
      .from('ai_agent_flows')
      .select('id, definition')
      .eq('agent_id', conn.agentId)
      .eq('is_start', true)
      .maybeSingle()
    if (startFlowRow) {
      await startFlow(
        supabase,
        { id: conversation.id, agent_id: conn.agentId, channel: 'instagram', external_thread_id: params.replyTarget },
        startFlowRow,
        makeInstagramFlowSender(conn, params.replyTarget),
      )
      return
    }
  }
```

Add the flow-trigger tier right after the existing template-match block returns, DM only, mirroring the exact position of Telegram/WhatsApp's own tier:

```ts
  // No template -- check whether a flow's trigger words match before
  // falling to paid AI. DM only -- a comment has no interactive-button
  // mechanism to run a flow through. Flows are free, like templates.
  if (!params.media && params.source === 'dm') {
    const { data: flows } = await supabase
      .from('ai_agent_flows')
      .select('id, trigger_words, definition')
      .eq('agent_id', conn.agentId)
      .order('created_at', { ascending: true })
    const matchedFlowId = findFlowTriggerMatch(params.incomingText, flows || [])
    const matchedFlow = matchedFlowId ? (flows || []).find(f => f.id === matchedFlowId) : undefined
    if (matchedFlow) {
      await startFlow(
        supabase,
        { id: conversation.id, agent_id: conn.agentId, channel: 'instagram', external_thread_id: params.replyTarget },
        matchedFlow,
        makeInstagramFlowSender(conn, params.replyTarget),
      )
      return
    }
  }
```

- [ ] **Step 2: Add `handleInstagramFlowButtonClick`** — append to the end of `src/lib/aiAgent/webhookHandler.ts`:

```ts
interface InstagramFlowClickParams {
  externalId: string
  replyTarget: string
  clickedPayload: string
}

// Handles a quick-reply tap -- the Instagram twin of
// telegramWebhookHandler.ts's handleTelegramFlowCallback, minus the
// spinner-clear step Telegram has and Instagram doesn't. DM only, same
// restriction as everywhere else flows touch this channel.
export async function handleInstagramFlowButtonClick(conn: TenantConnection, params: InstagramFlowClickParams): Promise<void> {
  const { data: existingMsg } = await supabase
    .from('ai_agent_messages')
    .select('id')
    .eq('external_id', params.externalId)
    .maybeSingle()
  if (existingMsg) return

  const { data: agent } = await supabase.from('ai_agents').select('is_enabled').eq('id', conn.agentId).single()
  if (!agent || agent.is_enabled === false) return

  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .select('id, paused_for_human')
    .eq('agent_id', conn.agentId)
    .eq('channel', 'instagram')
    .eq('external_thread_id', params.replyTarget)
    .maybeSingle()
  if (!conversation) return

  const { error: insertError } = await supabase.from('ai_agent_messages').insert({
    conversation_id: conversation.id,
    direction: 'inbound',
    text: `[кнопка] ${params.clickedPayload}`,
    external_id: params.externalId,
  })
  if (insertError && insertError.code !== '23505') {
    console.error('ai-agent webhook: failed to log flow button click for', params.externalId, ':', insertError.message)
  }

  if (conversation.paused_for_human) return

  const conversationRef = { id: conversation.id, agent_id: conn.agentId, channel: 'instagram', external_thread_id: params.replyTarget }
  const result = await handleFlowButtonClick(supabase, conversationRef, params.clickedPayload, makeInstagramFlowSender(conn, params.replyTarget))
  if (result.outcome === 'stale') {
    await sendDirectMessage(params.replyTarget, FLOW_STALE_TEXT, { igUserId: conn.externalAccountId, accessToken: conn.accessToken }).catch((err: any) => {
      console.error('ai-agent webhook: stale-click reply failed:', err.message)
    })
  }
}
```

- [ ] **Step 3: Detect a quick-reply tap in the webhook route** — in `src/app/api/instagram/webhook/route.ts`, add `handleInstagramFlowButtonClick` to the existing import from `@/lib/aiAgent/webhookHandler`.

Inside the `for (const messaging of entry.messaging || [])` loop, right after `if (!msg?.mid || msg.is_echo) continue` and BEFORE the `if (isLegacyAccount) {...}` branch, add:

```ts
      const quickReplyPayload = msg.quick_reply?.payload
      if (quickReplyPayload && !isLegacyAccount) {
        await handleInstagramFlowButtonClick(tenantConnection!, { externalId: msg.mid, replyTarget: fromUsername, clickedPayload: quickReplyPayload })
        continue
      }

```

(placed after `fromUsername`/`replyTarget` are computed a few lines above it in the existing code, so those two are already in scope; `replyTarget` — `messaging.sender?.id` — is what a quick-reply tap needs as the recipient id for any reply, same value every other DM branch in this loop already uses)

- [ ] **Step 4: Run the gate**

Run: `npx tsc --noEmit` → expect clean.
Run: `npx vitest run` → expect all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/aiAgent/webhookHandler.ts src/app/api/instagram/webhook/route.ts
git status --short
git commit -m "feat(ai-agent): wire flows into Instagram DMs -- start on first message, trigger match, quick replies"
```

---

### Task 7: FlowBuilder hint text

**Files:**
- Modify: `src/components/aiAgent/FlowBuilder.tsx`

- [ ] **Step 1: Add a short caption below the "+ Добавить кнопку" link** — change:

```tsx
              {step.buttons.length < 8 && (
                <button onClick={() => addButton(step.id)}
                  className="text-xs mt-2" style={{ color: 'var(--nav-accent)' }}>+ Добавить кнопку</button>
              )}
              </>
              )}
            </div>
          ))}
        </div>
```

to:

```tsx
              {step.buttons.length < 8 && (
                <button onClick={() => addButton(step.id)}
                  className="text-xs mt-2" style={{ color: 'var(--nav-accent)' }}>+ Добавить кнопку</button>
              )}
              {step.buttons.length > 0 && (
                <div className="text-[11px] mt-2" style={{ color: 'var(--nav-text-muted)' }}>
                  Один и тот же сценарий работает на всех каналах — на WhatsApp/Instagram кнопки автоматически подстраиваются под их формат
                </div>
              )}
              </>
              )}
            </div>
          ))}
        </div>
```

- [ ] **Step 2: Run the gate**

Run: `npx tsc --noEmit` → expect clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/aiAgent/FlowBuilder.tsx
git status --short
git commit -m "feat(ai-agent): FlowBuilder -- hint that flows now adapt across all 3 channels"
```

---

### Task 8: Ship

**Files:** none (verification only).

- [ ] **Step 1:** Full gate: `npx vitest run`, `npx tsc --noEmit`, `npm run build` — all clean.
- [ ] **Step 2:** `git pull --rebase --autostash` (a parallel session may have pushed), then `git push origin main`.
- [ ] **Step 3:** Confirm the Vercel deployment for the pushed commit(s) reaches READY (targeted `get_deployment` check, not a broad list).
- [ ] **Step 4: Founder live-test script** (hand to user, needs a real connected WhatsApp number and a real connected Instagram DM):
  1. Open «Сценарии», create (or reuse) a flow with 2 buttons and one with 5 buttons, mark one flow `is_start`.
  2. On a WhatsApp number that has NEVER messaged this agent before: send any first message — confirm the `is_start` flow's first step arrives as WhatsApp Reply Buttons (2 buttons) or a List Message (5 buttons), not plain text.
  3. Tap a button — confirm the flow advances to the correct next step.
  4. Wait, then tap the SAME old button again (simulating a stale click) — confirm it gets `FLOW_STALE_TEXT` instead of silently doing nothing or erroring.
  5. Repeat steps 2-4 on a fresh Instagram DM thread (quick replies instead of Reply Buttons/List).
  6. Trigger a NON-start flow by trigger word on both WhatsApp and Instagram (an already-existing conversation) — confirm it still starts correctly (this exercises the trigger-match tier, not just the first-message tier).
  7. If any flow has an `invoice` step, confirm the счёт draft still gets created correctly on both new channels.
  8. Confirm Telegram flows still behave exactly as before (no regression) — run through an existing Telegram flow end to end.

## Self-Review (done at write time)

- **Spec coverage:** one definition auto-adapting per channel (T3/T4's button-count branching); shared `btn:{stepId}:{index}` payload + shared stale-click detection (T1's `resolveFlowButtonClick`, reused by T2's `handleFlowButtonClick`); first-message start-trigger for WhatsApp/Instagram (T5/T6); DM-only restriction for Instagram flows (T6); invoice steps working channel-generically (T2's `maybeExecuteInvoiceStep` via `sendIntoConversation`); FlowBuilder hint (T7); Telegram behavior preserved unchanged (T1 is a pure extraction + mechanical call-site swap, no control-flow change). Out-of-scope items (per-channel branches, new FlowBuilder screens, new message types beyond buttons) have no tasks — correct.
- **Placeholder scan:** none found — every step has complete, runnable code.
- **Type consistency:** `FlowStepSender`/`FlowConversationRef` (T2) used identically by T5/T6's sender-builder helpers and handler functions. `resolveFlowButtonClick`'s `FlowButtonClickResolution` union (T1) matches exactly how T2's `handleFlowButtonClick` and T1's own Telegram call site both destructure `resolution.outcome`/`resolution.nextStep`. `buildWhatsAppFlowMessage`/`buildInstagramFlowMessage` (T3/T4) both produce the `btn:{stepId}:{index}` id/payload format T2/T5/T6 all parse identically.
- **Risk containment:** Telegram's own `startTelegramFlow`/`handleTelegramFlowCallback`/`maybeExecuteInvoiceStep` are untouched beyond T1's one mechanical swap — WhatsApp and Instagram get an independent, parallel implementation via `flowEngine.ts` rather than migrating Telegram onto shared code, deliberately minimizing risk to the already-shipped, invoice-adjacent Telegram flow feature.
