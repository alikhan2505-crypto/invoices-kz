// КГД's taxpayer services: the only official source that covers sole
// proprietors, plus whether someone is registered for VAT.
//
// Why both live here. The legal-entity register on data.egov.kz has no ИП in
// it at all — it is a register of legal entities — so every sole proprietor
// looked up by БИН came back "not found". КГД covers them. What it does NOT
// give is an address, a director or an activity code: for an ИП those are
// either personal data the state does not publish or simply absent. A result
// from here is deliberately thinner than one from the register, and the
// caller must not read the empty fields as a failure.
//
// Access is a per-account X-Portal-Token, requested through the portal and
// issued by hand. Same rule as the egov key: server only, never the browser.

const BASE = 'https://portal.kgd.gov.kz/services/isnaportalsync/public'

export const KGD_TAXPAYER_URL = `${BASE}/taxpayer-data`
export const KGD_VAT_URL = `${BASE}/search-payer-data`
export const KGD_LIQUIDATION_URL = `${BASE}/find-liquidated-taxpayer`
// Note the host path: the unreliable-taxpayer search lives under
// `isnaportal`, not `isnaportalsync` like everything else. Easy to miss and
// it answers 404 if you assume otherwise.
export const KGD_UNRELIABLE_URL =
  'https://portal.kgd.gov.kz/services/isnaportal/public/taxpayer-data/search'

export interface KgdTaxpayer {
  name: string
  registeredAt: string | null
  /** IP for a sole proprietor, UL for a legal entity — as КГД classifies it. */
  taxpayerType: string | null
}

export interface KgdVatStatus {
  isVatPayer: boolean
  registeredAt: string | null
  deregisteredAt: string | null
}

const clean = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s : null
}

/**
 * The taxpayer in a taxpayer-data response, or null.
 *
 * The service always answers 200 and wraps results in an array, so "nothing
 * found" is an empty array rather than an error — and a row whose
 * messageResult is not SUCCESS is a lookup that failed on their side, not a
 * company that does not exist. Both come back as null; the caller treats a
 * miss as "type it by hand" either way.
 */
export function parseTaxpayer(payload: unknown): KgdTaxpayer | null {
  const root = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
  const rows = root.taxpayerPortalSearchResponses
  if (!Array.isArray(rows) || rows.length === 0) return null

  const row = rows.find(r => r && typeof r === 'object' && clean((r as Record<string, unknown>).name)) as
    | Record<string, unknown>
    | undefined
  if (!row) return null
  if (clean(row.messageResult) && clean(row.messageResult) !== 'SUCCESS') return null

  const name = clean(row.name)
  if (!name) return null
  return {
    name,
    registeredAt: clean(row.beginDate),
    taxpayerType: clean(row.taxpayerType),
  }
}

/**
 * VAT registration, read from a search-payer-data response.
 *
 * An empty body is КГД's way of saying "not registered for VAT" — verified
 * against a live sole proprietor, which returns nothing at all, while a
 * registered payer returns a record with ndsRegistrationDate. A record whose
 * deregistration date is set is someone who WAS a payer and is not one now,
 * so the flag follows the deregistration, not the mere presence of a record.
 */
export function parseVatStatus(payload: unknown): KgdVatStatus | null {
  if (payload === null || payload === undefined || payload === '') {
    return { isVatPayer: false, registeredAt: null, deregisteredAt: null }
  }
  if (typeof payload !== 'object') return null
  const row = payload as Record<string, unknown>
  const registeredAt = clean(row.ndsRegistrationDate)
  const deregisteredAt = clean(row.ndsDeregistrationDate)
  if (!registeredAt && !deregisteredAt && !clean(row.iinBin)) return null
  return {
    isVatPayer: Boolean(registeredAt) && !deregisteredAt,
    registeredAt,
    deregisteredAt,
  }
}

/**
 * The taxpayer types worth asking about, in order.
 *
 * IP first: a legal entity has already been looked for in the register by
 * the time this runs, so anything reaching КГД is most likely a sole
 * proprietor. UL remains as the fallback for a company the register missed.
 */
export const KGD_TAXPAYER_TYPES = ['IP', 'UL'] as const

/**
 * Whether the search of unreliable taxpayers returned this counterparty.
 *
 * The service answers with a bare array — populated means listed, empty
 * means not. Anything that is not an array means we learned nothing, and
 * that is returned as null so the caller can keep "unknown" distinct from
 * "clean": a seller must never be shown a reassuring silence produced by a
 * failed request.
 *
 * STILL NOT VERIFIED AGAINST A POSITIVE CASE, unlike parseLiquidation below.
 * Every taxpayer available for testing has come back clean and no
 * known-unreliable БИН has been found — КГД's own list is reachable only
 * through a captcha-protected page, and the open-data set that looks like it
 * holds one is a stub pointing back at their site. The empty-array path is
 * confirmed against live calls; the populated path rests on the documented
 * schema alone. Worth re-checking the first time a warning actually fires.
 */
export function parseUnreliable(payload: unknown): boolean | null {
  if (!Array.isArray(payload)) return null
  return payload.length > 0
}

/**
 * Whether the counterparty is in liquidation.
 *
 * This service is more explicit than the one above: it wraps results in
 * `taxpayers.content` and says «Данные не найдены» outright, so an empty
 * answer is a statement rather than an absence.
 *
 * Both paths verified end to end on 2026-09-11. A real sole proprietor in
 * liquidation was pulled out of КГД's own paginated list and put through
 * the form, which showed «Находится на стадии ликвидации по данным КГД» —
 * so the warning reaches the screen and does not die in parsing. The БИН is
 * not repeated here: it identifies a living person and this repository is
 * public.
 */
export function parseLiquidation(payload: unknown): boolean | null {
  if (!payload || typeof payload !== 'object') return null
  const taxpayers = (payload as Record<string, unknown>).taxpayers
  if (!taxpayers || typeof taxpayers !== 'object') return null
  const content = (taxpayers as Record<string, unknown>).content
  if (!Array.isArray(content)) return null
  return content.length > 0
}
