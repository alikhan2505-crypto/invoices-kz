// Числа «в работе» рядом с пунктами меню Kaspi Bot (18.10.2026, просьба основателя:
// видеть в боковом меню, в каких разделах что-то ждёт действия).
//
// Здесь только чистая часть (без сети и Supabase), чтобы её можно было и
// тестировать, и импортировать и из серверного маршрута, и из браузера.
// Определения «что считается в работе» НЕ придуманы заново -- взяты из самих
// страниц, чтобы меню не расходилось со страницей, на которую человек попадает:
//   orders           -- WORKING_ORDER_STATUSES (orderStatuses.ts), как «Заказов в
//                       работе» на странице Обзор
//   refunds          -- REFUND_ATTENTION_TABS (refunds.ts), как «вкладки, где
//                       заявка требует внимания» на странице Возвраты
//   pendingProducts  -- CHECK-счётчик, как «Нераспознанные товары · N» на странице
import { WORKING_ORDER_STATUSES } from './orderStatuses'
import { REFUND_ATTENTION_TABS } from './refunds'

export type MenuCounts = {
  orders: number | null
  refunds: number | null
  pendingProducts: number | null
}

export type MenuCountKey = keyof MenuCounts

// null = «не знаем» (ещё не загружено или Kaspi не ответил). Это не ноль:
// клиент в обоих случаях ничего не рисует, но для неизвестного оставляет
// прошлое значение, а для нуля -- обнуляет.
export const EMPTY_MENU_COUNTS: MenuCounts = { orders: null, refunds: null, pendingProducts: null }

// Пункт меню -> какое число показывать. Только разделы, где число действительно
// значит «ждёт действия»; остальные (Демпинг, Финансы, Ниши, Прибыль, Калькулятор,
// НКТ, Управление товарами, Отзывы, Качество, Обзор, «скоро») числа не получают.
const KEY_BY_HREF: Record<string, MenuCountKey> = {
  '/kaspi-shop/orders': 'orders',
  '/kaspi-shop/refunds': 'refunds',
  '/kaspi-shop/pending-products': 'pendingProducts',
}

export function menuCountKeyForHref(href: string): MenuCountKey | null {
  return KEY_BY_HREF[href] ?? null
}

function toCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  return Math.floor(value)
}

// Ответ /api/kaspi-shop/menu-counts (или что угодно, что вернулось) -> безопасный вид.
// Лишние поля отбрасываются, неправильные значения становятся null.
export function normalizeMenuCounts(raw: unknown): MenuCounts {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    orders: toCount(r.orders),
    refunds: toCount(r.refunds),
    pendingProducts: toCount(r.pendingProducts),
  }
}

// Новое значение перекрывает старое, кроме null: временный сбой Kaspi на одном из
// трёх запросов не должен стирать число, которое только что было на экране.
export function mergeMenuCounts(prev: MenuCounts, next: MenuCounts): MenuCounts {
  return {
    orders: next.orders ?? prev.orders,
    refunds: next.refunds ?? prev.refunds,
    pendingProducts: next.pendingProducts ?? prev.pendingProducts,
  }
}

// Строка для значка: ничего при 0 / неизвестно, '99+' от 100.
export const BADGE_CAP = 99
export function formatBadgeCount(n: number | null | undefined): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null
  const whole = Math.floor(n)
  if (whole <= 0) return null
  return whole > BADGE_CAP ? `${BADGE_CAP}+` : String(whole)
}

// «В работе» заказов = сумма счётчиков кабинета по рабочим статусам.
// Пустой объект (запрос не удался) -> null, а не 0: это «не знаем».
export function ordersInWork(counters: Record<string, number> | null | undefined): number | null {
  if (!counters || Object.keys(counters).length === 0) return null
  return WORKING_ORDER_STATUSES.reduce((sum, status) => sum + (toCount(counters[status]) ?? 0), 0)
}

// Возвраты, требующие внимания = сумма по вкладкам NEW / ON_DELIVERY /
// WAITING_DECISION / DISPUTE (закрытые не считаются). Пустой список -> null.
export function refundsNeedingAttention(list: { tab: string; total: number }[] | null | undefined): number | null {
  if (!Array.isArray(list) || list.length === 0) return null
  return list.reduce((sum, c) => (REFUND_ATTENTION_TABS as readonly string[]).includes(c?.tab) ? sum + (toCount(c.total) ?? 0) : sum, 0)
}

export const MENU_COUNTS_STALE_MS = 60_000
