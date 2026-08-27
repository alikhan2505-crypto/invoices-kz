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
  // Phase 3 «счёт из чата»: absent/'message' = ordinary text step (full
  // backward compat with every stored flow); 'invoice' = after this
  // step's text is sent, the engine creates an invoice draft from
  // invoiceItem + the conversation's collected name/phone. Invoice steps
  // are terminal-shaped (buttons must be empty) -- the customer's next
  // message goes through the normal pipeline.
  kind?: 'message' | 'invoice'
  invoiceItem?: { name: string; unitPrice: number }
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
    // kind/invoiceItem (Phase 3): tolerate absence (legacy message
    // steps), reject unknown kinds and structurally invalid invoice
    // steps at save time -- exactly like the dangling-nextStepId check
    // below, a bad invoice step must fail here, not strand a customer
    // at message-handling time.
    const kindRaw = (s as any).kind
    if (kindRaw !== undefined && kindRaw !== 'message' && kindRaw !== 'invoice') return null
    let invoiceItem: { name: string; unitPrice: number } | undefined
    if (kindRaw === 'invoice') {
      if (buttons.length > 0) return null
      const itemRaw = (s as any).invoiceItem
      const itemName = itemRaw && typeof itemRaw === 'object' && typeof itemRaw.name === 'string' ? itemRaw.name.trim() : ''
      const unitPrice = itemRaw && typeof itemRaw === 'object' ? Number(itemRaw.unitPrice) : NaN
      if (!itemName || !Number.isFinite(unitPrice) || unitPrice <= 0) return null
      invoiceItem = { name: itemName, unitPrice }
    }

    seenIds.add(id)
    steps.push({
      id,
      text: text.trim(),
      buttons,
      ...(kindRaw !== undefined ? { kind: kindRaw as 'message' | 'invoice' } : {}),
      ...(invoiceItem ? { invoiceItem } : {}),
    })
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
