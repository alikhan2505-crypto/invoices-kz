// Pure logic for AI-agent salon booking drafts -- validation, date/time
// resolution, tool-input normalization. DB and network live in
// bookingSend.ts; this file stays pure for direct unit testing
// (invoiceDrafts.ts precedent).

export type BookingValidation =
  | { ok: true; serviceName: string; masterName?: string; startsAt: string }
  | { ok: false; error: string }

// Kazakhstan is a single fixed UTC+5 offset country-wide since March 2024
// (see src/app/api/ai-agent/analytics/route.ts's own comment) -- a constant
// shift is exact, no timezone library needed.
const KZ_OFFSET = '+05:00'

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim()
}

// Soft match against the salon's own service/master lists -- same
// tolerance as checkCatalogPricing (invoiceDrafts.ts): a name outside the
// list still passes through as-is (the model may have paraphrased, or the
// salon hasn't listed every master), this only substitutes the canonical
// spelling when one is found so the draft card and the eventual booking
// read consistently.
export function resolveAgainstList(name: string, list: string[]): string {
  const target = normalizeName(name)
  const match = list.find((item) => normalizeName(item) === target)
  return match ?? name
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

// Shared date+time -> UTC instant conversion, split out of
// validateBookingInput so the planner's manual-booking route (Stage 4,
// src/app/api/planner/bookings/route.ts) can reuse the exact same fixed
// +05:00 parsing without duplicating it. Deliberately does NOT reject a
// past instant the way validateBookingInput does -- that rule exists
// because the AI tool proposes a slot for a customer who isn't present
// and could be hallucinating; an owner typing a manual entry themselves
// (a walk-in, or logging a same-day visit after the fact) has no such
// failure mode to guard against.
export function resolveKzDateTime(date: string, time: string): string | null {
  if (!DATE_RE.test(date) || !TIME_RE.test(time)) return null
  const d = new Date(`${date}T${time}:00${KZ_OFFSET}`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export type BookingToolInput = {
  service_name?: unknown
  master_name?: unknown
  requested_date?: unknown
  requested_time?: unknown
  customer_name?: unknown
  customer_phone?: unknown
  notes?: unknown
}

export function validateBookingInput(raw: BookingToolInput): BookingValidation {
  const serviceName = typeof raw.service_name === 'string' ? raw.service_name.trim().slice(0, 200) : ''
  if (!serviceName) return { ok: false, error: 'Не указана услуга' }

  const date = typeof raw.requested_date === 'string' ? raw.requested_date.trim() : ''
  const time = typeof raw.requested_time === 'string' ? raw.requested_time.trim() : ''
  if (!DATE_RE.test(date)) return { ok: false, error: 'Некорректная дата (нужен формат YYYY-MM-DD)' }
  if (!TIME_RE.test(time)) return { ok: false, error: 'Некорректное время (нужен формат HH:MM)' }

  const startsAt = new Date(`${date}T${time}:00${KZ_OFFSET}`)
  if (Number.isNaN(startsAt.getTime())) return { ok: false, error: 'Некорректные дата или время' }
  // Live incident 18.09.2026: a customer asked at 21:58 for "пятница в
  // 15:00" (today, 7 hours earlier) and the model -- not yet told the
  // current TIME, only the date (see salonContext.ts's own fix) --
  // confirmed it as a normal future slot. A generous 24h grace window
  // here would have let that exact draft through regardless of the
  // prompt fix; this is the real backstop, same philosophy as
  // checkCatalogPricing in this same file's invoice sibling -- never
  // trust the model alone for something with a real-world consequence.
  // 15 minutes is slack for reply latency/clock skew, not for "earlier
  // today".
  if (startsAt.getTime() < Date.now() - 15 * 60 * 1000) {
    return { ok: false, error: 'Указанное время уже прошло' }
  }

  const masterName = typeof raw.master_name === 'string' && raw.master_name.trim()
    ? raw.master_name.trim().slice(0, 100)
    : undefined

  return { ok: true, serviceName, masterName, startsAt: startsAt.toISOString() }
}

export function normalizeBookingToolInput(
  raw: BookingToolInput,
  collected: { name?: string | null; phone?: string | null },
): { customerName: string; customerPhone: string; notes: string } {
  const customerName = (typeof raw.customer_name === 'string' && raw.customer_name.trim()) || collected.name?.trim() || ''
  const customerPhone = (typeof raw.customer_phone === 'string' && raw.customer_phone.trim()) || collected.phone?.trim() || ''
  const notes = typeof raw.notes === 'string' ? raw.notes.trim().slice(0, 500) : ''
  return { customerName, customerPhone, notes }
}

// Same hard-won lesson as promisesInvoice (invoiceDrafts.ts, a real
// incident live 2026-09-07): a model can write "Записал(а) вас на
// пятницу в 15:00" without ever calling create_booking_draft -- a
// promise with no draft behind it is worse than a refusal, since
// everyone believes the booking exists when the owner has never even
// seen it. Forces one retry with tool_choice:'tool' when this matches
// and no tool was actually called that turn.
// зап(ис|иш): "записать/запись/записан" mutates its final root consonant
// с→ш in the 1st-person-singular/plural future ("запишу", "запишем") --
// а plain "запис..." prefix silently misses that very common phrasing.
const BOOKING_NOUN = /зап(?:ис|иш)[а-яё]*|брон[ьяи][а-яё]*|appointment|booking/i
// No \b after a Cyrillic run -- confirmed empirically that JS regex \b is
// defined purely in terms of \w (ASCII-only without the u flag), so it
// silently never matches at a Cyrillic/non-word boundary at all (the same
// blind spot invoiceDrafts.ts's own COMMIT_VERB has for отправит\b et al,
// found here 18.09.2026 -- not fixed there yet, flagged separately, out of
// scope for this file). Plain substring alternation, same as every other
// Cyrillic pattern in this file.
const COMMIT_VERB = /записал[аи]?|записываю|запишу|запишем|забронировал[аи]?|забронирую|забронируем|бронирую|подтвержда[юе]|i'?ve\s+booked|booked\s+you|you'?re\s+booked|i'?ll\s+book|we'?ll\s+book/i
const CONDITIONAL = /чтобы|если|нужно уточнить|подскажи|скажи|уточни|которы|\?|please\s+tell|could\s+you/i

export function promisesBooking(replyText: string): boolean {
  return replyText
    .split(/(?<=[.!?…])\s+|\n+/)
    .some((s) => BOOKING_NOUN.test(s) && COMMIT_VERB.test(s) && !CONDITIONAL.test(s))
}
