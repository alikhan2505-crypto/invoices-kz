// Launch flag and verified-data dates for the Kaspi tariff / bank BIK SEO pages.
// While SEO_TARIFF_BIK_LIVE is false the new pages are noindex, and are not in the
// sitemap, the guides index/hub links or llms.txt. The founder reviews the pages
// first and flips the flag.
export const SEO_TARIFF_BIK_LIVE = true

// ISO dates (YYYY-MM-DD): when the data was verified and when the tariff took effect.
export const KASPI_TARIFF_CHECKED = '2026-10-23'
export const KASPI_TARIFF_EFFECTIVE = '2026-01-05'
export const NBK_BIK_CHECKED = '2026-10-23'

const RU_MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const KK_MONTHS = ['қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым', 'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан']

function parseIso(iso: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) throw new Error(`Bad ISO date: ${iso}`)
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  if (m < 1 || m > 12 || d < 1 || d > 31) throw new Error(`Bad ISO date: ${iso}`)
  return { y, m, d }
}

// '2026-10-23' -> '23 октября 2026'
export function formatRuDate(iso: string): string {
  const { y, m, d } = parseIso(iso)
  return `${d} ${RU_MONTHS[m - 1]} ${y}`
}

// '2026-10-23' -> '2026 жылғы 23 қазан'
export function formatKkDate(iso: string): string {
  const { y, m, d } = parseIso(iso)
  return `${y} жылғы ${d} ${KK_MONTHS[m - 1]}`
}
