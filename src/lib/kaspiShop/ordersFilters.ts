// Kaspi's getOrders `input` has no server-side date field (confirmed shape:
// presetFilter/orderCode/cityId only -- docs/superpowers/specs/2026-08-13-
// kaspi-orders-api-findings.md section 2), so the "Завтра до 20:00" tab
// filters the already-fetched page client-side instead. Kazakhstan (Asia/
// Almaty) is a fixed UTC+5 offset with no DST.
const ALMATY_OFFSET_MS = 5 * 60 * 60 * 1000

export type DeliveryDateMode = 'all' | 'tomorrow'

// "Завтра до 20:00" means "must reach the courier by tomorrow 20:00 Almaty
// time" -- includes anything overdue or due today too, not only orders
// dated exactly tomorrow.
export function filterByDeliveryCutoff<T extends { plannedDeliveryDate: string | null }>(
  orders: T[],
  mode: DeliveryDateMode,
  now: Date = new Date()
): T[] {
  if (mode === 'all') return orders
  const localNow = new Date(now.getTime() + ALMATY_OFFSET_MS)
  const cutoffLocal = new Date(Date.UTC(
    localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate() + 1, 20, 0, 0
  ))
  const cutoffUtc = cutoffLocal.getTime() - ALMATY_OFFSET_MS
  return orders.filter(o => {
    if (!o.plannedDeliveryDate) return false
    const t = new Date(o.plannedDeliveryDate).getTime()
    return !Number.isNaN(t) && t <= cutoffUtc
  })
}

// Name-only: confirmed live 2026-08-23 that an order's own `warehouse.city.id`
// is a different, smaller id space than the KATO-style cityId Kaspi's real
// "Выберите город" filter actually expects (e.g. "511010000" for Шымкент) --
// the raw id on an order is not safe to send back as a filter value. Collect
// distinct NAMES only; the caller resolves each name to its real filterable
// id via the confirmed getCities catalog (see orders/cities/route.ts).
export function collectDistinctCityNames<T extends { cityName: string | null }>(orders: T[]): string[] {
  const names = new Set<string>()
  for (const o of orders) {
    if (o.cityName) names.add(o.cityName)
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b, 'ru'))
}
