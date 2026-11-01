// Курс доллара к тенге по данным Нацбанка РК (официальная лента курсов), чтобы показать цены
// Made-in-China в тенге. Официальный курс ниже курса обменника, поэтому в интерфейсе стоит
// пометка. null = курс не получили: тогда показываем только доллары, а не выдуманный курс.

const RATES_URL = 'https://nationalbank.kz/rss/get_rates.cfm'
const TTL_MS = 6 * 3_600_000
const RETRY_AFTER_FAIL_MS = 60_000
const TIMEOUT_MS = 5_000
/** Если свежий курс не получили, устаревший до этого возраста лучше, чем «нет курса». */
const STALE_OK_MS = 48 * 3_600_000

let cached: { at: number; value: number } | null = null
let failedAt = 0

/** Только для тестов. */
export function resetUsdRateState(): void {
  cached = null
  failedAt = 0
}

/** Разбор ленты: курс USD за 1 доллар или null. Правдоподобный диапазон 100..2000 ₸. */
export function parseNbrkUsd(xml: unknown): number | null {
  if (typeof xml !== 'string') return null
  const m = /<title>\s*USD\s*<\/title>\s*<description>\s*([\d.]+)\s*<\/description>\s*<quant>\s*(\d+)\s*<\/quant>/i.exec(xml)
  if (!m) return null
  const rate = Number(m[1]) / Number(m[2])
  return Number.isFinite(rate) && rate >= 100 && rate <= 2000 ? rate : null
}

/** Дата для ленты в формате ДД.ММ.ГГГГ по времени Алматы (UTC+5). */
export function nbrkDate(nowMs: number): string {
  const d = new Date(nowMs + 5 * 3_600_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`
}

export async function getUsdKzt(): Promise<number | null> {
  const now = Date.now()
  if (cached && now - cached.at < TTL_MS) return cached.value
  const stale = () => (cached && now - cached.at < STALE_OK_MS ? cached.value : null)
  if (now - failedAt < RETRY_AFTER_FAIL_MS) return stale()
  try {
    const res = await fetch(`${RATES_URL}?fdate=${nbrkDate(now)}`, {
      headers: { 'User-Agent': 'invoices.kz-supplier-search (support@invoices.kz)' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (res.status !== 200) { failedAt = now; return stale() }
    const rate = parseNbrkUsd(await res.text())
    if (rate === null) { failedAt = now; return stale() }
    cached = { at: now, value: rate }
    return rate
  } catch (e) {
    console.error('usd-rate: request failed:', e instanceof Error ? e.message : e)
    failedAt = now
    return stale()
  }
}
