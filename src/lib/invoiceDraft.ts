// A half-filled invoice, parked in localStorage while /create sends the user
// away to fill in something it refuses to proceed without.
//
// /create gates on two things it cannot invent: the company's own requisites
// (`/profile/requisites`) and at least one bank account (`/profile/banks`).
// Both gates redirect, and a redirect used to throw away everything already
// typed into the form. That is a fine trade when it's the rare exception; it
// stopped being one on 2026-09-06, when signup started landing people straight
// on the dashboard instead of walking them through the requisites wizard first
// -- so hitting an empty-requisites gate on the very first invoice is now the
// normal path, not the unlucky one.
//
// The gates themselves are unchanged: the founder's 2026-09-05 decision is that
// bank + BIK stay hard requirements. We keep the work, not the exception.

export type DraftService = {
  name: string
  qty: number
  price: number
  unit: string
  code: string
  type: string
}

export type InvoiceDraft = {
  clientName: string
  clientBin: string
  clientEmail: string
  clientAddress: string
  clientPhone: string
  contractNumber: string
  contractDate: string
  noContract: boolean
  dueDate: string
  clientKnp: string
  note: string
  services: DraftService[]
}

export const INVOICE_DRAFT_KEY = 'invoice_draft'

// A draft is a convenience, not a document. Past a day it is much more likely
// to be forgotten clutter that ambushes the next invoice than something the
// user still wants, so it expires rather than waiting indefinitely.
export const INVOICE_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000

// Only fields a person actually types count. dueDate, clientKnp and note are
// prefilled by the form itself, and `services` always holds one blank row, so
// judging "did the user enter anything" by emptiness of the whole object would
// call an untouched form a draft worth restoring.
export function isDraftWorthKeeping(draft: InvoiceDraft): boolean {
  const typed = [
    draft.clientName,
    draft.clientBin,
    draft.clientEmail,
    draft.clientAddress,
    draft.clientPhone,
    draft.contractNumber,
  ]
  if (typed.some(v => (v || '').trim() !== '')) return true
  return (draft.services || []).some(s => (s?.name || '').trim() !== '' || Number(s?.price) > 0)
}

export function serializeDraft(draft: InvoiceDraft, now: number): string {
  return JSON.stringify({ savedAt: now, draft })
}

// Pure counterpart of takeInvoiceDraft, so the freshness and shape rules are
// testable without a DOM. Anything unparseable, mis-shaped or stale reads as
// "no draft" -- a restore is never worth an exception on a page load.
export function parseStoredDraft(raw: string | null, now: number): InvoiceDraft | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const { savedAt, draft } = parsed as { savedAt?: unknown; draft?: unknown }
    if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return null
    // A savedAt in the future means a clock change, not a fresh draft; treat
    // the age as elapsed either way rather than trusting the stored stamp.
    if (Math.abs(now - savedAt) > INVOICE_DRAFT_MAX_AGE_MS) return null
    if (!draft || typeof draft !== 'object') return null
    const d = draft as Partial<InvoiceDraft>
    if (!Array.isArray(d.services)) return null
    return {
      clientName: String(d.clientName ?? ''),
      clientBin: String(d.clientBin ?? ''),
      clientEmail: String(d.clientEmail ?? ''),
      clientAddress: String(d.clientAddress ?? ''),
      clientPhone: String(d.clientPhone ?? ''),
      contractNumber: String(d.contractNumber ?? ''),
      contractDate: String(d.contractDate ?? ''),
      noContract: !!d.noContract,
      dueDate: String(d.dueDate ?? ''),
      clientKnp: String(d.clientKnp ?? ''),
      note: String(d.note ?? ''),
      services: d.services as DraftService[],
    }
  } catch {
    return null
  }
}

// Returns whether a draft was actually stored, so the caller can promise the
// user their work was kept only when it really was -- an untouched form has
// nothing to keep, and private mode / a full quota can refuse the write.
export function saveInvoiceDraft(draft: InvoiceDraft): boolean {
  if (typeof window === 'undefined') return false
  if (!isDraftWorthKeeping(draft)) return false
  try {
    window.localStorage.setItem(INVOICE_DRAFT_KEY, serializeDraft(draft, Date.now()))
    return true
  } catch {
    // Private mode / quota. Losing the draft is the old behaviour, not a new
    // failure -- never let it break the redirect the user is mid-way through.
    return false
  }
}

// Read-and-remove: a draft is restored exactly once. Leaving it in place would
// mean it reappears on every later visit to /create, long after the user moved
// on to a different invoice.
export function takeInvoiceDraft(): InvoiceDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(INVOICE_DRAFT_KEY)
    window.localStorage.removeItem(INVOICE_DRAFT_KEY)
    return parseStoredDraft(raw, Date.now())
  } catch {
    return null
  }
}

export function clearInvoiceDraft(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(INVOICE_DRAFT_KEY)
  } catch {}
}
