import { listOrders, Order, PAGE_SIZE } from './cabinetApi'

// Общая выборка «выполненных заказов» для Финансов и Прибыли (и Обзора, который
// грузит Прибыль): окно по суткам Алматы, листание Kaspi, честный признак
// неполноты и короткий кэш на подключение + период (аудит Kaspi 06.11.2026,
// K37, K38).

export { KZ_OFFSET_MS, MAX_PERIOD_DAYS, almatyDateOf, almatyDayStartMs, windowStartForDays, parseSinceDate } from './almatyDates'
export type { SincePeriod } from './almatyDates'

const REVENUE_STATUSES = ['KASPI_DELIVERY_TRANSMITTED', 'ARCHIVED']

// Per status, per request -- a real, deliberate v1 limit, not an oversight.
export const MAX_PAGES_PER_STATUS = 20

export type RevenueOrders = {
  orders: Order[]
  /** Окно выбора НЕ закрыто целиком: Kaspi отдал не все заказы периода. */
  truncated: boolean
  sessionExpired: boolean
  /** Kaspi не ответил на страницу заказов: всё набранное неполное. */
  upstreamFailed: boolean
  /** Сколько заказов реально получено от Kaspi (по обоим статусам, до фильтра окна). */
  fetchedCount: number
  /** По каждому статусу Kaspi отдал заказы от новых к старым (проверено по данным, не предположено). */
  newestFirst: boolean
  /** Самый старый из полученных заказов (ISO), null если заказов нет. */
  oldestFetchedAt: string | null
}

async function loadRevenueOrders(
  sessionCookies: string,
  merchantId: string,
  cutoffMs: number,
  listOrdersFn: typeof listOrders,
): Promise<RevenueOrders> {
  const orders: Order[] = []
  let truncated = false
  let sessionExpired = false
  let upstreamFailed = false
  let fetchedCount = 0
  let newestFirstEverywhere = true
  let anyOrdered = false
  let oldestMs: number | null = null

  statusLoop: for (const status of REVENUE_STATUSES) {
    let page = 0
    let fetchedForStatus = 0
    let totalForStatus = 0
    // Порядок листания Kaspi не подтверждён (параметр sort в запрос не передаём:
    // его значения нигде не снимались). Поэтому «от новых к старым» выводим из самих
    // данных: каждая следующая запись не новее предыдущей и хотя бы раз строго старше.
    let nonIncreasing = true
    let sawDecrease = false
    let prevMs: number | null = null
    let windowCovered = false
    while (page < MAX_PAGES_PER_STATUS) {
      const result = await listOrdersFn(sessionCookies, merchantId, status, page)
      if (result.sessionExpired) {
        // A dead session won't recover mid-loop -- stop paginating entirely.
        sessionExpired = true
        break statusLoop
      }
      if (result.failed) {
        // Сбой страницы НЕ превращается в «заказов нет» и не затирает totalForStatus нулём.
        upstreamFailed = true
        break statusLoop
      }
      for (const o of result.orders) {
        const ts = Date.parse(o.creationTime)
        if (!Number.isFinite(ts)) { nonIncreasing = false; continue }
        if (prevMs !== null) {
          if (ts > prevMs) nonIncreasing = false
          else if (ts < prevMs) sawDecrease = true
        }
        prevMs = ts
        if (oldestMs === null || ts < oldestMs) oldestMs = ts
      }
      orders.push(...result.orders)
      fetchedForStatus += result.orders.length
      fetchedCount += result.orders.length
      totalForStatus = result.total
      page += 1
      if (result.orders.length < PAGE_SIZE) break // real last page (short of a full page)
      // Заказы идут от новых к старым, а самый старый на странице уже старше окна:
      // дальше только более старые, листать незачем (Kaspi не просим об остальном).
      if (nonIncreasing && sawDecrease && prevMs !== null && prevMs < cutoffMs) {
        windowCovered = true
        break
      }
    }
    if (fetchedForStatus >= 2) {
      anyOrdered = true
      if (!(nonIncreasing && sawDecrease)) newestFirstEverywhere = false
    }
    // Неполнота только если окно не закрыто: заказы старше окна нам не нужны.
    if (fetchedForStatus < totalForStatus && !windowCovered) truncated = true
  }

  return {
    orders,
    truncated,
    sessionExpired,
    upstreamFailed,
    fetchedCount,
    newestFirst: anyOrdered && newestFirstEverywhere,
    oldestFetchedAt: oldestMs === null ? null : new Date(oldestMs).toISOString(),
  }
}

// Кэш на несколько минут на подключение и окно: Финансы, Прибыль и Обзор
// открываются по очереди, а каждая загрузка -- до 40 последовательных запросов к
// Kaspi. Хранится промис, поэтому одновременные открытия делят один обход.
// Память одного серверного экземпляра: это смягчение, не гарантия.
const CACHE_TTL_MS = 3 * 60_000
const CACHE_MAX_ENTRIES = 100
const cache = new Map<string, { at: number; value: Promise<RevenueOrders> }>()

export function clearRevenueOrdersCache() {
  cache.clear()
}

export async function fetchRevenueOrders(
  sessionCookies: string,
  merchantId: string,
  cutoffMs: number,
  listOrdersFn: typeof listOrders = listOrders,
  opts: { cacheKey?: string; nowMs?: number } = {},
): Promise<RevenueOrders> {
  const { cacheKey } = opts
  if (!cacheKey) return loadRevenueOrders(sessionCookies, merchantId, cutoffMs, listOrdersFn)

  const now = opts.nowMs ?? Date.now()
  const key = `${cacheKey}|${cutoffMs}`
  const hit = cache.get(key)
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.value

  const value = loadRevenueOrders(sessionCookies, merchantId, cutoffMs, listOrdersFn)
  cache.set(key, { at: now, value })
  if (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  try {
    const result = await value
    // Мёртвую сессию и сбой Kaspi не запоминаем: следующий заход пробует заново.
    if (result.sessionExpired || result.upstreamFailed) {
      if (cache.get(key)?.value === value) cache.delete(key)
    }
  } catch (err) {
    if (cache.get(key)?.value === value) cache.delete(key)
    throw err
  }
  return value
}
