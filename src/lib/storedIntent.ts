// Shared freshness rule for the "where did the user want to go" entries kept
// in localStorage across a /login detour (postLoginRedirect.ts,
// pendingUpgrade.ts).
//
// Why they expire (founder, 15.10.2026): an admin who was ALREADY signed in
// clicked «Попробовать бесплатно» on a free tool, went through /login, and was
// sent to /upgrade by an intent saved days earlier (the waybills «Подключить
// Kaspi Bot» link /login?next=/upgrade, or a pricing-card click on the landing)
// -- a dead end, because /upgrade then just said «Про — Текущий». An intent is
// only meaningful for the sign-in it was made for, so it now carries the time
// it was saved and is ignored (and removed) once it is older than this.
// Entries written before timestamps existed have no time at all: they are
// treated as stale, never as fresh.
export const STORED_INTENT_TTL_MS = 30 * 60 * 1000

// A timestamp from the future beyond ordinary clock jitter is not a real
// "just now" -- treat it as garbage rather than as fresh forever.
const FUTURE_SKEW_MS = 5 * 60 * 1000

export function isFreshIntent(at: unknown, now: number = Date.now()): boolean {
  if (typeof at !== 'number' || !Number.isFinite(at)) return false
  const age = now - at
  return age <= STORED_INTENT_TTL_MS && age >= -FUTURE_SKEW_MS
}

// JSON.parse that never throws; anything unparseable is simply "no object".
export function parseIntentJson(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}
