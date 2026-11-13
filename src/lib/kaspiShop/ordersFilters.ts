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

// Срок передачи заказа курьеру для карточки (P24, 13.11.2026): продавец сортирует работу по нему
// («Завтра до 20:00»), а на карточке его не было. Дни считаются по Алматы, как и фильтр выше.
const DAY_MS = 24 * 60 * 60 * 1000
const dayFmt = new Intl.DateTimeFormat('ru-KZ', { day: 'numeric', month: 'short', timeZone: 'Asia/Almaty' })

function almatyDayIndex(ms: number): number {
  return Math.floor((ms + ALMATY_OFFSET_MS) / DAY_MS)
}

export function deliveryDueLabel(planned: string | null, now: Date = new Date()): { text: string; urgent: boolean } | null {
  if (!planned) return null
  const t = new Date(planned).getTime()
  if (Number.isNaN(t)) return null
  const diff = almatyDayIndex(t) - almatyDayIndex(now.getTime())
  const day = dayFmt.format(new Date(t))
  if (diff < 0) return { text: `Просрочен, ${day}`, urgent: true }
  if (diff === 0) return { text: 'Передать сегодня', urgent: true }
  if (diff === 1) return { text: 'Передать завтра', urgent: false }
  return { text: `Передать до ${day}`, urgent: false }
}
