// Telling someone their sign-in link will never arrive.
//
// Login is by emailed link and nothing else, so a mistyped address is a dead
// end: the letter hard-bounces, Resend suppresses the address, and every
// later attempt is dropped before it is even tried. The person keeps seeing
// "Проверьте почту!" and keeps waiting for a letter that cannot come.
//
// It is not hypothetical. On 2026-09-10 four registered accounts sat on the
// suppression list, every one of them with no requisites and no invoices --
// including the founder's own second address, mistyped by one word order.
// Three strangers out of forty-two signups were locked out this way and we
// had no idea.
//
// The check asks Resend directly (GET /suppressions/{email}: 200 suppressed,
// 404 clean) rather than keeping our own copy, so it cannot drift from the
// list that actually governs delivery.

/** Trimmed and lower-cased, the way an address is compared. */
export function normalizeEmail(input: string | null | undefined): string {
  return (input || '').trim().toLowerCase()
}

/**
 * Whether `input` is worth trying to send to at all.
 *
 * Deliberately loose: this exists to keep obvious junk out of the
 * suppression lookup, not to police what a valid address may look like.
 * Rejecting an unusual but real address would lock someone out of their own
 * account, which is the failure this file exists to prevent.
 */
export function looksLikeEmail(input: string | null | undefined): boolean {
  const email = normalizeEmail(input)
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export type DeliverabilityVerdict = 'deliverable' | 'undeliverable' | 'unknown'

/**
 * What Resend's suppression lookup means for the user in front of us.
 *
 * `unknown` on any failure, and the caller must treat it as permission to
 * proceed: a suppression check that is down must never become a second way
 * to be locked out. The worst case of guessing "deliverable" wrongly is the
 * behaviour we already have today.
 */
export function verdictFromStatus(status: number): DeliverabilityVerdict {
  if (status === 200) return 'undeliverable'
  if (status === 404) return 'deliverable'
  return 'unknown'
}
