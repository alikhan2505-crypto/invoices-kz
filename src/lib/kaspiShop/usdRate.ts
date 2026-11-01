// Курсы доллара и юаня к тенге по данным Нацбанка РК (официальная лента курсов), чтобы показать
// цены Made-in-China ($) и 1688 (¥) в тенге. Официальный курс ниже курса обменника, поэтому в
// интерфейсе стоит пометка. null = курс не получили: тогда показываем только исходную валюту,
// а не выдуманный курс.

const RATES_URL = 'https://nationalbank.kz/rss/get_rates.cfm'
const TTL_MS = 6 * 3_600_000
const RETRY_AFTER_FAIL_MS = 60_000
const TIMEOUT_MS = 5_000
/** Если свежий курс не получили, устаревший до этого возраста лучше, чем «нет курса». */
const STALE_OK_MS = 48 * 3_600_000

type Code = 'USD' | 'CNY'
const RANGE: Record<Code, [number, number]> = { USD: [100, 2000], CNY: [10, 500] }

const cached: Partial<Record<Code, { at: number; value: number }>> = {}
let failedAt = 0
let inflight: Promise<boolean> | null = null

/** Только для тестов. */
export function resetUsdRateState(): void {
  delete cached.USD; delete cached.CNY
  failedAt = 0
  inflight = null
}

/** Разбор ленты: курс валюты за 1 единицу или null. Правдоподобный диапазон свой у каждой валюты. */
export function parseNbrkRate(xml: unknown, code: Code): number | null {
  if (typeof xml !== 'string') return null
  const m = new RegExp(`<title>\\s*${code}\\s*</title>\\s*<description>\\s*([\\d.]+)\\s*</description>\\s*<quant>\\s*(\\d+)\\s*</quant>`, 'i').exec(xml)
  if (!m) return null
  const rate = Number(m[1]) / Number(m[2])
  const [lo, hi] = RANGE[code]
  return Number.isFinite(rate) && rate >= lo && rate <= hi ? rate : null
}

export const parseNbrkUsd = (xml: unknown): number | null => parseNbrkRate(xml, 'USD')

/** Дата для ленты в формате ДД.ММ.ГГГГ по времени Алматы (UTC+5). */
export function nbrkDate(nowMs: number): string {
  const d = new Date(nowMs + 5 * 3_600_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`
}

/** Один запрос за лентой на обе валюты; одновременные вызовы делят его. true = лента получена. */
async function refresh(now: number): Promise<boolean> {
  try {
    const res = await fetch(`${RATES_URL}?fdate=${nbrkDate(now)}`, {
      headers: { 'User-Agent': 'invoices.kz-supplier-search (support@invoices.kz)' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (res.status !== 200) { failedAt = now; return false }
    const text = await res.text()
    let found = 0
    for (const c of ['USD', 'CNY'] as Code[]) {
      const r = parseNbrkRate(text, c)
      if (r !== null) { cached[c] = { at: now, value: r }; found++ }
    }
    // Не нашлась одна из валют: минуту не повторяем запрос (найденная остаётся в кэше).
    if (found < 2) failedAt = now
    return found > 0
  } catch (e) {
    console.error('usd-rate: request failed:', e instanceof Error ? e.message : e)
    failedAt = now
    return false
  }
}

async function getRate(code: Code): Promise<number | null> {
  const now = Date.now()
  const hit = cached[code]
  if (hit && now - hit.at < TTL_MS) return hit.value
  const stale = () => (hit && now - hit.at < STALE_OK_MS ? hit.value : null)
  if (now - failedAt < RETRY_AFTER_FAIL_MS) return stale()
  if (!inflight) inflight = refresh(now).finally(() => { inflight = null })
  await inflight
  const fresh = cached[code]
  return fresh && fresh.at !== (hit?.at ?? -1) ? fresh.value : stale()
}

export const getUsdKzt = (): Promise<number | null> => getRate('USD')
export const getCnyKzt = (): Promise<number | null> => getRate('CNY')
