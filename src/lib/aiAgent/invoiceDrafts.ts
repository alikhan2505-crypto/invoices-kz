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

// Autonomy rule (founder-chosen hybrid, training-style): the agent may
// send invoices without owner approval only once it is out of training
// AND the owner has personally approved INVOICE_AUTONOMY_THRESHOLD
// drafts. auto_sent drafts never count toward the threshold -- only
// human approvals do.
export function canAutoSend(agentStatus: string, approvedCount: number): boolean {
  return agentStatus === 'active' && approvedCount >= INVOICE_AUTONOMY_THRESHOLD
}

export type InvoiceToolInput = { items?: unknown; customer_name?: unknown; customer_phone?: unknown }

// Explicit tool values win; the conversation's already-collected
// name/phone are the fallback so the model doesn't have to re-ask for
// data the dialog already captured.
export function normalizeToolInput(
  raw: InvoiceToolInput,
  collected: { name?: string | null; phone?: string | null },
): { items: unknown; customerName: string; customerPhone: string } {
  const customerName = (typeof raw.customer_name === 'string' && raw.customer_name.trim()) || collected.name?.trim() || ''
  const customerPhone = (typeof raw.customer_phone === 'string' && raw.customer_phone.trim()) || collected.phone?.trim() || ''
  return { items: raw.items, customerName, customerPhone }
}
