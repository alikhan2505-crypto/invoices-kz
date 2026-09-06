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
//
// EVERYTHING HERE IS SCOPED TO ONE ACCOUNT. A draft holds a counterparty's
// name, BIN, contacts and prices, and browsers are shared -- a KZ bookkeeper
// running several companies' invoicing from one machine is an ordinary user of
// this product, not an edge case. An unscoped key would restore company A's
// client into company B's invoice form. Same convention the profile cache in
// create/page.tsx already uses (`cacheGet('profile_' + user.id)`).

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

export const INVOICE_DRAFT_PREFIX = 'invoice_draft_'

// The unscoped key this feature shipped with for its first hour. Any draft left
// under it belongs to nobody in particular, so it is deleted on sight rather
// than migrated -- migrating would mean guessing whose it was, which is the
// exact mistake being fixed.
export const LEGACY_INVOICE_DRAFT_KEY = 'invoice_draft'

// A draft is a convenience, not a document. Past a day it is much more likely
// to be forgotten clutter that ambushes the next invoice than something the
// user still wants -- and it holds someone's counterparty data, which should
// not sit in a shared browser indefinitely. So it expires.
export const INVOICE_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000

export function invoiceDraftKey(userId: string): string {
  return INVOICE_DRAFT_PREFIX + userId
}

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
    draft.contractDate,
  ]
  if (typed.some(v => (v || '').trim() !== '')) return true
  return (draft.services || []).some(s => (s?.name || '').trim() !== '' || Number(s?.price) > 0)
}

export function serializeDraft(draft: InvoiceDraft, userId: string, now: number): string {
  return JSON.stringify({ savedAt: now, userId, draft })
}

// Pure counterpart of takeInvoiceDraft, so the freshness, ownership and shape
// rules are testable without a DOM. Anything unparseable, mis-shaped, stale or
// belonging to a different account reads as "no draft" -- a restore is never
// worth an exception on a page load, and never worth handing one user another
// user's data.
export function parseStoredDraft(raw: string | null, expectedUserId: string, now: number): InvoiceDraft | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const { savedAt, userId, draft } = parsed as { savedAt?: unknown; userId?: unknown; draft?: unknown }
    if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return null
    // Belt and braces on top of the per-account key: a draft with no owner
    // recorded, or one recorded as someone else's, is never restored even if it
    // somehow turns up under this account's key.
    if (typeof userId !== 'string' || !userId || userId !== expectedUserId) return null
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
export function saveInvoiceDraft(userId: string, draft: InvoiceDraft): boolean {
  if (typeof window === 'undefined' || !userId) return false
  if (!isDraftWorthKeeping(draft)) return false
  try {
    window.localStorage.setItem(invoiceDraftKey(userId), serializeDraft(draft, userId, Date.now()))
    return true
  } catch {
    // Private mode / quota. Losing the draft is the old behaviour, not a new
    // failure -- never let it break the redirect the user is mid-way through.
    return false
  }
}

// Drop the legacy unscoped draft, plus any other account's draft that has
// aged out. Another account's *live* draft is deliberately left alone -- that
// is the whole point of scoping the key, so a shared browser can hold one per
// person -- but nobody's counterparty data should outlive its 24 hours here.
function sweep(now: number): void {
  try {
    window.localStorage.removeItem(LEGACY_INVOICE_DRAFT_KEY)
    const stale: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (!key || !key.startsWith(INVOICE_DRAFT_PREFIX)) continue
      const raw = window.localStorage.getItem(key)
      let savedAt: unknown = null
      try { savedAt = raw ? JSON.parse(raw)?.savedAt : null } catch { savedAt = null }
      if (typeof savedAt !== 'number' || !Number.isFinite(savedAt) || Math.abs(now - savedAt) > INVOICE_DRAFT_MAX_AGE_MS) {
        stale.push(key)
      }
    }
    stale.forEach(k => window.localStorage.removeItem(k))
  } catch {}
}

// Read-and-remove: a draft is restored exactly once. Leaving it in place would
// mean it reappears on every later visit to /create, long after the user moved
// on to a different invoice.
export function takeInvoiceDraft(userId: string): InvoiceDraft | null {
  if (typeof window === 'undefined' || !userId) return null
  try {
    const key = invoiceDraftKey(userId)
    const raw = window.localStorage.getItem(key)
    window.localStorage.removeItem(key)
    sweep(Date.now())
    return parseStoredDraft(raw, userId, Date.now())
  } catch {
    return null
  }
}

export function clearInvoiceDraft(userId: string): void {
  if (typeof window === 'undefined' || !userId) return
  try {
    window.localStorage.removeItem(invoiceDraftKey(userId))
  } catch {}
}
