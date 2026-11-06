// Real endpoints confirmed live 2026-08-13 against merchant 425002
// ("ABIL-SISTERS") -- see docs/superpowers/specs/2026-08-13-kaspi-nkt-api-findings.md.
// Only the "Без привязки" (approvalStatus: CHECK) tab's shape was observed
// with real data; the other 3 tabs' approvalStatus keys are inferred, not
// confirmed, so v1 only ever requests CHECK.
import { authHeaders, isAuthFailureStatus } from './cabinetApi'

export type PendingProduct = {
  code: string
  name: string
  brand: string | null
  categoryName: string | null
  imageUrl: string | null
}

export const PENDING_PAGE_SIZE = 5
const PAGE_SIZE = PENDING_PAGE_SIZE

// Любой ответ Kaspi дольше этого -- «не знаем», а не повод висеть до лимита функции.
const PENDING_TIMEOUT_MS = 15_000

function errorText(err: unknown): string {
  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) return 'Kaspi не ответил вовремя'
  return err instanceof Error ? err.message : 'Неизвестная ошибка'
}

// failed (аудит K26): список НЕ получен (не-2xx, таймаут, неверная форма). Пустой
// products при failed значит «не знаем», а не «нераспознанных товаров нет».
// 403 читается как 401 (мёртвая сессия), как и в остальных кабинетных вызовах.
export type PendingListResult = { products: PendingProduct[]; hasMore: boolean; sessionExpired: boolean; failed?: boolean; error?: string }

// Real page numbering starts at 1, not 0 -- different from getOrders.
export async function listPendingProducts(
  sessionCookies: string,
  merchantId: string,
  page: number,
  fetchFn: typeof fetch = fetch
): Promise<PendingListResult> {
  let res: Response
  try {
    res = await fetchFn(`https://mc.shop.kaspi.kz/bff/pending-products/${merchantId}`, {
      method: 'POST',
      headers: authHeaders(sessionCookies),
      signal: AbortSignal.timeout(PENDING_TIMEOUT_MS),
      body: JSON.stringify({ page, searchTerm: '', pageSize: PAGE_SIZE, approvalStatus: 'CHECK', isMobileApp: false }),
    })
  } catch (err) {
    return { products: [], hasMore: false, sessionExpired: false, failed: true, error: errorText(err) }
  }
  if (!res.ok) {
    return { products: [], hasMore: false, sessionExpired: isAuthFailureStatus(res.status), failed: true, error: `Kaspi ответил HTTP ${res.status}` }
  }
  const json = await res.json().catch(() => null)
  const data = json?.data
  if (!Array.isArray(data)) {
    return { products: [], hasMore: false, sessionExpired: false, failed: true, error: 'Kaspi вернул неожиданный ответ' }
  }
  return {
    products: data.map((p: any) => ({
      code: p.code,
      name: p.name,
      brand: p.brand ?? null,
      categoryName: p.category?.name ?? null,
      imageUrl: p.images?.[0]?.medium ?? null,
    })),
    // Грубая оценка по размеру страницы; точный ответ даёт счётчик (hasMoreByCount),
    // и маршрут перекрывает им эту оценку, когда счётчик получен.
    hasMore: data.length === PAGE_SIZE,
    sessionExpired: false,
    failed: false,
  }
}

// Есть ли следующая страница по общему числу (CHECK-счётчик Kaspi): страницы
// нумеруются с 1, на странице PAGE_SIZE карточек. Ровно кратное PAGE_SIZE число
// карточек больше не даёт «Дальше» на пустую страницу.
export function hasMoreByCount(page: number, count: number): boolean {
  return page * PAGE_SIZE < count
}

// Real response carries all 4 tabs' counts -- v1 only surfaces CHECK
// (the only tab with a confirmed, functional list view).
// failed: сбой счётчика; count при этом 0 как раньше (старые вызывающие), но
// страница и маршрут обязаны смотреть на failed и не показывать этот 0 как правду.
export async function getPendingCount(
  sessionCookies: string,
  merchantId: string,
  fetchFn: typeof fetch = fetch
): Promise<{ count: number; sessionExpired: boolean; failed?: boolean }> {
  const r = await getPendingCountOrNull(sessionCookies, merchantId, fetchFn)
  return { count: r.count ?? 0, sessionExpired: r.sessionExpired, failed: r.count === null }
}

// Variant for the sidebar badge (menu-counts route): same endpoint, but a
// failed call or a response without a CHECK number is "unknown" (count: null),
// not a real 0 -- so a transient Kaspi failure never clears the badge.
export async function getPendingCountOrNull(
  sessionCookies: string,
  merchantId: string,
  fetchFn: typeof fetch = fetch
): Promise<{ count: number | null; sessionExpired: boolean }> {
  let res: Response
  try {
    res = await fetchFn(`https://mc.shop.kaspi.kz/content/pending/mc/product/${merchantId}/count`, {
      headers: authHeaders(sessionCookies),
      signal: AbortSignal.timeout(PENDING_TIMEOUT_MS),
    })
  } catch {
    return { count: null, sessionExpired: false }
  }
  if (!res.ok) return { count: null, sessionExpired: isAuthFailureStatus(res.status) }
  const json = await res.json().catch(() => null)
  const n = Number(json?.CHECK)
  return { count: json?.CHECK != null && Number.isFinite(n) ? n : null, sessionExpired: false }
}
