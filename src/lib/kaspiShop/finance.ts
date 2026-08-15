import { listOrders, Order, PAGE_SIZE } from './cabinetApi'

// Real Kaspi cabinet's own nav has no finance section (confirmed live
// 2026-08-13 against two real accounts) -- this is a report WE compute
// from order data, not a passthrough of a Kaspi endpoint. See
// docs/superpowers/specs/2026-08-13-kaspi-shop-finance-design.md and
// docs/superpowers/specs/2026-08-13-kaspi-finance-api-findings.md.
export type FinanceSummary = {
  totalRevenue: number
  orderCount: number
  averageOrderValue: number
  byDay: { date: string; revenue: number; orderCount: number; unitsSold: number }[]
  behavioral: BehavioralAnalytics
  truncated: boolean
  sessionExpired: boolean
}

export type BehavioralAnalytics = {
  byWeekday: { day: number; label: string; orderCount: number; revenue: number }[]
  byHour: { hour: number; orderCount: number }[]
  beforePayday: { orderCount: number; revenue: number }
  afterPayday: { orderCount: number; revenue: number }
  genderEstimate: { male: number; female: number; unknown: number }
  holidayOrders: { date: string; label: string; orderCount: number; revenue: number }[]
}

// Kaspi's own order timestamps have no locale guarantee about which
// timezone a server process reads Date.getHours()/getDay() in (Vercel's
// Node runtime defaults to UTC) -- shifting by Kazakhstan's fixed +5
// offset (no DST observed) before reading UTC getters gives a real,
// environment-independent Kazakhstan-local hour/weekday/day-of-month
// instead of silently reporting UTC ones.
const KZ_OFFSET_MS = 5 * 60 * 60 * 1000
function toKzLocal(iso: string): Date {
  return new Date(new Date(iso).getTime() + KZ_OFFSET_MS)
}

const WEEKDAY_LABELS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] // indexed by getUTCDay() (0 = Sunday)

// Fixed-date Kazakhstan public holidays only -- deliberately excludes
// Kurban Ait/Rozha Ait (Islamic lunar calendar, date varies by year and
// wasn't worth guessing without live confirmation for each year).
const KZ_HOLIDAYS: Record<string, string> = {
  '01-01': 'Новый год', '01-02': 'Новый год',
  '03-08': 'Международный женский день',
  '03-21': 'Наурыз мейрамы', '03-22': 'Наурыз мейрамы', '03-23': 'Наурыз мейрамы',
  '05-01': 'День единства народа Казахстана',
  '05-07': 'День защитника Отечества',
  '05-09': 'День Победы',
  '07-06': 'День столицы',
  '08-30': 'День Конституции',
  '12-01': 'День Первого Президента',
  '12-16': 'День Независимости',
}

// Kaspi's order data carries no gender field -- this first-name-ending
// heuristic (Cyrillic names ending in а/я are usually female) is the
// honest ceiling of what's derivable from what we actually have, not a
// real Kaspi attribute. Always surfaced as an estimate, never presented
// as authoritative data. Short exceptions list for common male names
// that also end in а/я.
//
// KNOWN LIMITATION, confirmed while writing this module's own tests: this
// pattern is a Russian-name convention, not a universal one -- common
// Kazakh female names like "Айгерим"/"Айгуль"/"Балжан" don't end in а/я
// and get misclassified as male. There's no cheap fix for this without a
// real Kazakh-name dictionary, which is out of scope here -- the estimate
// is genuinely weaker for Kazakh names than Russian ones, and the UI
// copy says "оценочно по имени" rather than implying real accuracy.
const MALE_NAME_EXCEPTIONS = new Set(['никита', 'илья', 'данила', 'кузьма', 'фома', 'nikita', 'ilya'])
export function estimateGender(firstName: string): 'male' | 'female' | 'unknown' {
  const name = firstName.trim().toLowerCase()
  if (!name) return 'unknown'
  if (MALE_NAME_EXCEPTIONS.has(name)) return 'male'
  const last = name[name.length - 1]
  return last === 'а' || last === 'я' ? 'female' : 'male'
}

export function computeBehavioralAnalytics(orders: Order[]): BehavioralAnalytics {
  const weekdayMap = new Map<number, { orderCount: number; revenue: number }>()
  const hourMap = new Map<number, number>()
  const beforePayday = { orderCount: 0, revenue: 0 }
  const afterPayday = { orderCount: 0, revenue: 0 }
  const genderEstimate = { male: 0, female: 0, unknown: 0 }
  const holidayMap = new Map<string, { label: string; orderCount: number; revenue: number }>()

  for (const o of orders) {
    const local = toKzLocal(o.creationTime)
    const weekday = local.getUTCDay()
    const hour = local.getUTCHours()
    const dayOfMonth = local.getUTCDate()
    const monthDay = `${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`

    const wBucket = weekdayMap.get(weekday) || { orderCount: 0, revenue: 0 }
    wBucket.orderCount += 1
    wBucket.revenue += o.totalPrice
    weekdayMap.set(weekday, wBucket)

    hourMap.set(hour, (hourMap.get(hour) || 0) + 1)

    const paydayBucket = dayOfMonth <= 10 ? beforePayday : afterPayday
    paydayBucket.orderCount += 1
    paydayBucket.revenue += o.totalPrice

    genderEstimate[estimateGender(o.customerFirstName)] += 1

    const holidayLabel = KZ_HOLIDAYS[monthDay]
    if (holidayLabel) {
      const dateKey = `${local.getUTCFullYear()}-${monthDay}`
      const hBucket = holidayMap.get(dateKey) || { label: holidayLabel, orderCount: 0, revenue: 0 }
      hBucket.orderCount += 1
      hBucket.revenue += o.totalPrice
      holidayMap.set(dateKey, hBucket)
    }
  }

  const byWeekday = Array.from({ length: 7 }, (_, day) => ({
    day, label: WEEKDAY_LABELS[day],
    orderCount: weekdayMap.get(day)?.orderCount || 0,
    revenue: weekdayMap.get(day)?.revenue || 0,
  }))
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, orderCount: hourMap.get(hour) || 0 }))
  const holidayOrders = Array.from(holidayMap.entries())
    .map(([date, v]) => ({ date, label: v.label, orderCount: v.orderCount, revenue: v.revenue }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return { byWeekday, byHour, beforePayday, afterPayday, genderEstimate, holidayOrders }
}

// Only these two statuses represent fulfilled/completed orders -- an order
// still in NEW or UPAKOVKA hasn't happened yet and shouldn't count as
// revenue.
const REVENUE_STATUSES = ['KASPI_DELIVERY_TRANSMITTED', 'ARCHIVED']

// Per status, per request -- a real, deliberate v1 limit, not an oversight.
// A seller past this volume in the selected window sees a totalRevenue
// computed from a subset, with truncated:true telling the UI to say so.
const MAX_PAGES_PER_STATUS = 20

export async function computeFinanceSummary(
  sessionCookies: string,
  merchantId: string,
  sinceDays: number,
  listOrdersFn: typeof listOrders = listOrders
): Promise<FinanceSummary> {
  const cutoffMs = Date.now() - sinceDays * 24 * 60 * 60 * 1000
  const allOrders: Order[] = []
  let truncated = false
  let sessionExpired = false

  statusLoop: for (const status of REVENUE_STATUSES) {
    let page = 0
    let fetchedForStatus = 0
    let totalForStatus = 0
    while (page < MAX_PAGES_PER_STATUS) {
      const result = await listOrdersFn(sessionCookies, merchantId, status, page)
      if (result.sessionExpired) {
        // A dead session won't recover mid-loop -- stop paginating
        // entirely rather than burning MAX_PAGES_PER_STATUS more 401s.
        sessionExpired = true
        break statusLoop
      }
      allOrders.push(...result.orders)
      fetchedForStatus += result.orders.length
      totalForStatus = result.total
      page += 1
      if (result.orders.length < PAGE_SIZE) break // real last page (short of a full page)
    }
    if (fetchedForStatus < totalForStatus) truncated = true
  }

  const inWindow = allOrders.filter(o => new Date(o.creationTime).getTime() >= cutoffMs)

  const byDayMap = new Map<string, { revenue: number; orderCount: number; unitsSold: number }>()
  for (const o of inWindow) {
    const date = o.creationTime.slice(0, 10) // YYYY-MM-DD, real creationTime is ISO 8601
    const bucket = byDayMap.get(date) || { revenue: 0, orderCount: 0, unitsSold: 0 }
    bucket.revenue += o.totalPrice
    bucket.orderCount += 1
    bucket.unitsSold += o.items.reduce((sum, item) => sum + item.quantity, 0)
    byDayMap.set(date, bucket)
  }
  const byDay = Array.from(byDayMap.entries())
    .map(([date, v]) => ({ date, revenue: v.revenue, orderCount: v.orderCount, unitsSold: v.unitsSold }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const totalRevenue = inWindow.reduce((sum, o) => sum + o.totalPrice, 0)
  const orderCount = inWindow.length
  const averageOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0
  const behavioral = computeBehavioralAnalytics(inWindow)

  return { totalRevenue, orderCount, averageOrderValue, byDay, behavioral, truncated, sessionExpired }
}
