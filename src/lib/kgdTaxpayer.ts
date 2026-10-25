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
export const KGD_DEBT_URL = `${BASE}/tax-debt-info`
// Налоговые режимы (СНР). Параметр называется именно `uin` (проверено на живом
// API 25.10.2026): iin, bin и taxpayerCode дают 500 «Проверьте правильность
// ввода ИИН». Тот же KGD_PORTAL_TOKEN, лимитов в документации нет.
export const KGD_SNR_URL = `${BASE}/snr-search/search`
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
 * deregistration date is set is someone who WAS a payer, but both dates are
 * the LAST ones КГД holds: a company deregistered and later registered again
 * carries a deregistration date older than its registration date. So the
 * flag compares the two (ISO dates compare as strings) instead of treating
 * any deregistration date as final.
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
    isVatPayer: Boolean(registeredAt) && (!deregisteredAt || registeredAt! > deregisteredAt),
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
 * The service answers with a bare array: populated means listed, empty means
 * not. Anything that is not an array means we learned nothing, and that is
 * returned as null so the caller can keep "unknown" distinct from "clean": a
 * seller must never be shown a reassuring silence produced by a failed
 * request.
 *
 * Both branches are now verified against live calls (25.10.2026): the empty
 * array for clean taxpayers (Kaspi Bank and others) and the populated one for
 * real listed companies of every category, searched by БИН. See
 * parseUnreliableDetail for what a populated answer carries.
 */
export function parseUnreliable(payload: unknown): boolean | null {
  if (!Array.isArray(payload)) return null
  return payload.length > 0
}

/**
 * Why a taxpayer is on КГД's unreliable list. The list is not one thing: a
 * company that simply stopped filing reports (INACTIVE_LIST) is a different
 * warning from one a court declared bankrupt (BANKRUPT_LIST) or whose
 * registration was declared invalid, and the screen must say which.
 * `other` is a category we have not seen: shown generically, never hidden.
 */
export type UnreliableCategory =
  | 'inactive'
  | 'bankrupt'
  | 'registrationInvalid'
  | 'reregistrationInvalid'
  | 'other'

const UNRELIABLE_CATEGORY_MAP: Record<string, UnreliableCategory> = {
  INACTIVE_LIST: 'inactive',
  BANKRUPT_LIST: 'bankrupt',
  REGISTRATION_INVALID_LIST: 'registrationInvalid',
  REREGISTRATION_INVALID_LIST: 'reregistrationInvalid',
}

export interface UnreliableDetail {
  listed: boolean
  /** Deduplicated, in the order КГД returned them. Empty when not listed. */
  categories: UnreliableCategory[]
}

/**
 * The unreliable-taxpayer answer with its categories.
 *
 * Shape (verified live 25.10.2026, searching by taxPayerCode): a bare array,
 * one element per listing, each carrying `taxpayerDataList[]` whose
 * `unreliableTaxpayerDataCategory` is one of the four values above. Court act
 * numbers, director names and order dates are deliberately NOT read: the
 * category is the fact a seller needs, the rest is personal data or noise.
 *
 * Returns null for anything that is not an array of objects (nothing was
 * learned). A populated array whose elements carry no recognisable category
 * is still `listed: true` with an empty category list: being on the list is
 * the finding, the reason is extra.
 */
export function parseUnreliableDetail(payload: unknown): UnreliableDetail | null {
  if (!Array.isArray(payload)) return null
  if (payload.length === 0) return { listed: false, categories: [] }
  if (!payload.every(el => el && typeof el === 'object')) return null

  const categories: UnreliableCategory[] = []
  for (const el of payload as Record<string, unknown>[]) {
    const list = el.taxpayerDataList
    if (!Array.isArray(list)) continue
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      const raw = clean((item as Record<string, unknown>).unreliableTaxpayerDataCategory)
      if (!raw) continue
      const cat = UNRELIABLE_CATEGORY_MAP[raw] ?? 'other'
      if (!categories.includes(cat)) categories.push(cat)
    }
  }
  return { listed: true, categories }
}

/**
 * One tax regime КГД reports for a taxpayer (snr-search).
 *
 * `type` is an open string (SNR_GENERAL_ORDER, SNR_SIMPLIFIED_DECLARATION are
 * the ones seen; others exist) and the names come from КГД, so a regime we
 * have never met is still shown by its own name. Dates are only published
 * from 01.01.2026 (НК РК, ст. 716), so a null date on an older regime is the
 * norm and not an error.
 */
export interface TaxRegime {
  type: string
  nameRu: string | null
  nameKk: string | null
  nameEn: string | null
  beginDate: string | null
  endDate: string | null
}

const isoDate = (v: unknown): string | null => {
  const s = clean(v)
  const m = s ? s.match(/^\d{4}-\d{2}-\d{2}/) : null
  return m ? m[0] : null
}

/**
 * The regimes in a snr-search response, or null when nothing was learned.
 *
 * `status` must be SUCCESS and `stmList` a non-empty array. An ERROR answer
 * (`tax.payer.not.found` for an unknown БИН, HTTP 200) is NOT "this taxpayer
 * has no regime": it comes back as null, same as an empty list. The taxpayer
 * name in `tpName` is personal data for a sole proprietor and is never read.
 */
export function parseTaxRegime(payload: unknown): TaxRegime[] | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as Record<string, unknown>
  if (root.status !== 'SUCCESS') return null
  if (!Array.isArray(root.stmList)) return null

  const regimes: TaxRegime[] = []
  for (const item of root.stmList) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const type = clean(row.type)
    const nameRu = clean(row.typeNameRu)
    if (!type && !nameRu) continue
    regimes.push({
      type: type ?? 'UNKNOWN',
      nameRu,
      nameKk: clean(row.typeNameKk),
      nameEn: clean(row.typeNameEn),
      beginDate: isoDate(row.beginDate),
      endDate: isoDate(row.endDate),
    })
  }
  return regimes.length > 0 ? regimes : null
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

/**
 * Tax arrears, in tenge.
 *
 * This is the one service that needs a second credential: a
 * personalAccountToken, issued separately from the portal token. Despite the
 * name it is not limited to the holder's own account — verified on
 * 2026-09-11 against three unrelated taxpayers, so a seller really can check
 * a counterparty before shipping.
 *
 * `totalArrear` aggregates everything; `totalTaxArrear` excludes pension,
 * social and health contributions, which КГД accounts for separately. Both
 * are kept: a debt made only of social contributions says something rather
 * different about a company than unpaid tax.
 *
 * Returns null when nothing was learned, which the caller must not collapse
 * into zero — "we did not ask" and "owes nothing" are different statements
 * to put in front of someone deciding whether to ship goods.
 */
export interface KgdTaxDebt {
  totalArrear: number
  taxArrear: number
}

export function parseTaxDebt(payload: unknown): KgdTaxDebt | null {
  if (!payload || typeof payload !== 'object') return null
  const row = payload as Record<string, unknown>
  const num = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
    return null
  }
  const total = num(row.totalArrear)
  if (total === null) return null
  return { totalArrear: total, taxArrear: num(row.totalTaxArrear) ?? total }
}
