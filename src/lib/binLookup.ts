// Looking a counterparty up by БИН, so it does not have to be typed.
//
// Every invoice makes the user retype a company's name and address that the
// state already publishes. The registry behind this is `gbd_ul` on
// data.egov.kz -- "Регистрационные данные юридических лиц, филиалов,
// представительств Казахстана", owned by the Ministry of Justice and
// refreshed daily.
//
// WHAT IT DOES NOT COVER: sole proprietors. `gbd_ul` is a register of legal
// entities, so an ИП is simply absent from it -- looking one up is a miss,
// not an error, and the caller must treat it that way. ИП data exists only
// behind КГД's own taxpayer-data service, which needs a token we do not have
// yet; when it arrives it becomes a second source behind the same interface.
//
// The portal's terms bind three things (Приложение 2, пп. 5.2, 6, 7-8, 11):
// the key never leaves the server, 40 requests per minute, the source must be
// credited wherever the data is shown, and access can be withdrawn without
// notice -- so a lookup is a convenience and manual entry always stays.

/** A counterparty as the state registers describe it. */
export interface BinLookupResult {
  bin: string
  name: string
  address: string | null
  director: string | null
  activity: string | null
  /** «Зарегистрирован», «Ликвидирован», ... — shown as-is, never interpreted. */
  status: string | null
  registeredAt: string | null
  /**
   * Which register answered. 'kgd' rows carry a name and a date and nothing
   * else — no address, no director — because that is all КГД publishes for a
   * sole proprietor. Empty fields on a 'kgd' row are the truth, not a gap.
   */
  source: 'egov' | 'kgd'
  /** null = not checked. false = checked and not registered for VAT. */
  isVatPayer: boolean | null
  vatRegisteredAt: string | null
  /** КГД risk signals. null = not checked, false = checked and clean. */
  isUnreliable: boolean | null
  isLiquidating: boolean | null
  /** Tax arrears in tenge. null = not checked; 0 = checked, owes nothing. */
  totalArrear: number | null
  taxArrear: number | null
}

/** One row of the gbd_ul dataset, as the API returns it. */
export interface EgovUlRecord {
  bin?: string | null
  nameru?: string | null
  namekz?: string | null
  addressru?: string | null
  addresskz?: string | null
  director?: string | null
  okedru?: string | null
  okedkz?: string | null
  statusru?: string | null
  statuskz?: string | null
  datereg?: string | null
}

/** Digits only. People paste БИН with spaces and dashes out of a document. */
export function normalizeBin(input: string | null | undefined): string {
  return (input || '').replace(/\D/g, '')
}

/**
 * Whether `input` can be a КЗ БИН/ИИН at all: exactly 12 digits.
 *
 * Checked before spending a request, both to stay inside the 40-per-minute
 * budget and because a half-typed БИН would otherwise return "не найдено" and
 * read as "such a company does not exist".
 */
export function isValidBin(input: string | null | undefined): boolean {
  return /^\d{12}$/.test(normalizeBin(input))
}

const clean = (value: string | null | undefined): string | null => {
  const trimmed = (value || '').trim()
  return trimmed ? trimmed : null
}

/**
 * The registration date as a plain calendar date.
 *
 * The register returns it with a timezone offset and no time at all --
 * `1997-12-04+06:00` -- which is not a date any formatter will accept and
 * would reach the screen looking broken. There is no time-of-day to lose:
 * only the date part is real data.
 */
export function cleanRegistrationDate(value: string | null | undefined): string | null {
  const raw = clean(value)
  if (!raw) return null
  const match = raw.match(/^\d{4}-\d{2}-\d{2}/)
  return match ? match[0] : raw
}

/**
 * The one record to use out of what the dataset returned, or null.
 *
 * Two things force a choice here. The dataset ships duplicates -- one БИН
 * comes back as several identical rows -- and a query can match more than the
 * БИН asked for, so rows for other companies are filtered out rather than
 * trusted by position. Among what remains, a registered entry wins over a
 * liquidated one and the most recent registration date breaks the rest: an
 * old row would otherwise put a defunct name on a live invoice.
 */
export function pickBestRecord(bin: string, records: EgovUlRecord[]): EgovUlRecord | null {
  const wanted = normalizeBin(bin)
  const matching = (records || []).filter(r => normalizeBin(r.bin) === wanted)
  if (matching.length === 0) return null

  const score = (r: EgovUlRecord) => (/зарегистр/i.test(r.statusru || '') ? 1 : 0)
  return matching.reduce((best, r) => {
    if (score(r) !== score(best)) return score(r) > score(best) ? r : best
    return (r.datereg || '') > (best.datereg || '') ? r : best
  })
}

/** The registry row as the app uses it, or null when there is no usable row. */
export function toLookupResult(bin: string, records: EgovUlRecord[]): BinLookupResult | null {
  const record = pickBestRecord(bin, records)
  if (!record) return null
  const name = clean(record.nameru) || clean(record.namekz)
  // A row with no name is not worth handing back: it would blank a field the
  // user may already have filled in correctly by hand.
  if (!name) return null
  return {
    bin: normalizeBin(record.bin),
    name,
    address: clean(record.addressru) || clean(record.addresskz),
    director: clean(record.director),
    activity: clean(record.okedru) || clean(record.okedkz),
    status: clean(record.statusru),
    registeredAt: cleanRegistrationDate(record.datereg),
    source: 'egov',
    isVatPayer: null,
    vatRegisteredAt: null,
    isUnreliable: null,
    isLiquidating: null,
    totalArrear: null,
    taxArrear: null,
  }
}

/**
 * A КГД taxpayer shaped like a lookup result.
 *
 * Thin on purpose: address, director and activity stay null because КГД does
 * not publish them, and `status` is left empty rather than invented — a
 * registration date is not the same statement as «Зарегистрирован».
 */
export function fromKgdTaxpayer(
  bin: string,
  taxpayer: { name: string; registeredAt: string | null },
): BinLookupResult {
  return {
    bin: normalizeBin(bin),
    name: taxpayer.name,
    address: null,
    director: null,
    activity: null,
    status: null,
    registeredAt: cleanRegistrationDate(taxpayer.registeredAt),
    source: 'kgd',
    isVatPayer: null,
    vatRegisteredAt: null,
    isUnreliable: null,
    isLiquidating: null,
    totalArrear: null,
    taxArrear: null,
  }
}

/** The gbd_ul query for one БИН. Kept here so the route and its tests agree. */
export function egovQuery(bin: string): string {
  return JSON.stringify({ size: 5, query: { match: { bin: normalizeBin(bin) } } })
}
