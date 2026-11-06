import { createClient } from '@supabase/supabase-js'
import { getMerchantPointsDetailed, type MerchantPoint } from './cabinetApi'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Cached on kaspi_shop_connections.merchant_points_cache -- same lazy-refresh
// convention already established for city_lookup_cache
// (settings/cities/route.ts). A merchant's own pickup points change rarely;
// scanning the full catalog (500+ products) on every request would be wasteful.
//
// Формат кэша (аудит, минор по Заказам): раньше хранился голый массив точек,
// писался при любом непустом результате и больше никогда не обновлялся -- частичный
// результат (обрыв каталога, города не получены) застревал навсегда. Теперь:
//   * пишется ТОЛЬКО полный результат (getMerchantPointsDetailed.complete);
//   * хранится вместе со временем записи и живёт MERCHANT_POINTS_TTL_MS;
//   * старый голый массив читается как устаревший: пробуем обновить, а если Kaspi
//     сейчас не ответил полно, отдаём его (лучше старые точки, чем пустой список).
export const MERCHANT_POINTS_TTL_MS = 24 * 60 * 60 * 1000

export type MerchantPointsCache = { v: 2; cachedAt: string; points: MerchantPoint[] }

// Чистая часть: что лежит в кэше и свежо ли оно.
export function readPointsCache(raw: unknown, now = Date.now()): { points: MerchantPoint[]; fresh: boolean } {
  if (Array.isArray(raw)) return { points: raw as MerchantPoint[], fresh: false }
  if (raw && typeof raw === 'object' && Array.isArray((raw as MerchantPointsCache).points)) {
    const c = raw as MerchantPointsCache
    const at = Date.parse(c.cachedAt)
    return { points: c.points, fresh: Number.isFinite(at) && now - at >= 0 && now - at < MERCHANT_POINTS_TTL_MS }
  }
  return { points: [], fresh: false }
}

export async function getCachedMerchantPoints(connectionId: string, sessionCookies: string, merchantId: string): Promise<MerchantPoint[]> {
  const { data } = await supabase
    .from('kaspi_shop_connections')
    .select('merchant_points_cache')
    .eq('id', connectionId)
    .maybeSingle()
  const cached = readPointsCache(data?.merchant_points_cache)
  if (cached.fresh && cached.points.length > 0) return cached.points

  const fresh = await getMerchantPointsDetailed(sessionCookies, merchantId)
  if (fresh.complete) {
    const payload: MerchantPointsCache = { v: 2, cachedAt: new Date().toISOString(), points: fresh.points }
    const { error } = await supabase.from('kaspi_shop_connections').update({ merchant_points_cache: payload }).eq('id', connectionId)
    if (error) console.error('kaspi-shop merchantPoints: cache write failed (non-fatal)', error.message)
    return fresh.points
  }
  // Неполный результат не кэшируется. Если есть старый кэш, он полнее случайного обрыва.
  if (cached.points.length > 0) return cached.points
  return fresh.points
}
