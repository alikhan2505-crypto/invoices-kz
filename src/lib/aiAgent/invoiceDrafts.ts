// Pure logic for AI-agent invoice drafts (Phase 3 «счёт из чата») --
// validation, autonomy rule, tool-input normalization. DB and network
// live in invoiceSend.ts / the webhook handlers; this file stays pure
// for direct unit testing (flow.ts precedent).

export type DraftItem = { name: string; qty: number; unitPrice: number }
export type DraftValidation = { ok: true; items: DraftItem[]; total: number } | { ok: false; error: string }

export const INVOICE_AUTONOMY_THRESHOLD = 5
export const DRAFT_MAX_ITEMS = 20
export const DRAFT_MAX_TOTAL = 10_000_000

// Above this the agent never auto-sends, however much autonomy it has
// earned -- the draft waits for the owner instead. Security audit
// 2026-09-04: canAutoSend was a one-time, irreversible threshold, so after
// five approvals there was no per-invoice review and no ceiling, ever.
// Failure mode of setting this too low is only "the owner taps approve",
// so it is deliberately on the cautious side.
export const AUTO_SEND_MAX_TOTAL = 200_000

// A customer can talk the model into a price (the tool description used to
// invite exactly that). Prices are therefore checked against the owner's
// own catalog server-side: a discount is normal, giving away a 4 500 ₸
// item for 1 ₸ is not. Only blatantly-below-catalog prices are refused --
// anything at or above half the catalog price passes, as do items that
// aren't in the catalog at all (services, custom orders), which the model
// legitimately cannot price from it.
export const MAX_DISCOUNT_FRACTION = 0.5

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim()
}

// Pure. `catalog` is the same {name, price} list the prompt's «Каталог и
// цены» block is built from, so the model was shown exactly these prices.
export function checkCatalogPricing(
  items: DraftItem[],
  catalog: { name: string; price: number }[],
): { ok: true } | { ok: false; error: string } {
  if (catalog.length === 0) return { ok: true }
  const byName = new Map<string, number>()
  for (const p of catalog) {
    const key = normalizeName(p.name)
    // Same product listed twice (size/colour variants share a name) -- the
    // cheapest wins, so a legitimate variant price is never refused.
    if (!byName.has(key) || p.price < (byName.get(key) as number)) byName.set(key, p.price)
  }
  for (const item of items) {
    const catalogPrice = byName.get(normalizeName(item.name))
    if (catalogPrice === undefined) continue
    if (item.unitPrice < catalogPrice * MAX_DISCOUNT_FRACTION) {
      return { ok: false, error: `Цена «${item.name}» слишком низкая по сравнению с каталогом` }
    }
  }
  return { ok: true }
}

// The model sends snake_case (unit_price); the flow-step path builds
// camelCase (unitPrice). Accept both, emit camelCase. total is ALWAYS
// recomputed here -- never trusted from the model.
export function validateDraftInput(itemsRaw: unknown): DraftValidation {
  if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) return { ok: false, error: 'Нужна хотя бы одна позиция' }
  if (itemsRaw.length > DRAFT_MAX_ITEMS) return { ok: false, error: `Слишком много позиций (макс. ${DRAFT_MAX_ITEMS})` }
  const items: DraftItem[] = []
  for (const it of itemsRaw) {
    if (!it || typeof it !== 'object') return { ok: false, error: 'Некорректная позиция' }
    // 200-char cap: a pathological model output must not flow an
    // arbitrarily long name into the draft card and the real invoice.
    const name = typeof (it as any).name === 'string' ? (it as any).name.trim().slice(0, 200) : ''
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
// `total` is optional so existing flow-step callers keep working; when it is
// supplied, an invoice over AUTO_SEND_MAX_TOTAL is held for the owner no
// matter how much autonomy the agent has earned.
export function canAutoSend(agentStatus: string, approvedCount: number, total?: number): boolean {
  if (agentStatus !== 'active' || approvedCount < INVOICE_AUTONOMY_THRESHOLD) return false
  if (typeof total === 'number' && total > AUTO_SEND_MAX_TOTAL) return false
  return true
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
