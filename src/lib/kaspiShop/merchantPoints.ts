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
//   * полный результат живёт MERCHANT_POINTS_TTL_MS (сутки);
//   * НЕполный запоминается ненадолго (partial: true, MERCHANT_POINTS_PARTIAL_TTL_MS):
//     иначе магазин, у которого Kaspi стабильно отвечает не полностью (пустой список
//     снятых, нет справочника городов), пересканировался бы целиком (оба каталога,
//     details пачками по 50, города) при каждом открытии страницы заказов. Через
//     10 минут пробуем снова, и «застрять навсегда» он не может;
//   * старый голый массив читается как устаревший: пробуем обновить, а если Kaspi
//     сейчас не ответил полно, отдаём его (лучше старые точки, чем пустой список);
//   * неполный свежий скан не выбрасывается в пользу старого кэша: точки сливаются
//     (mergePoints), иначе новая точка не появилась бы, пока Kaspi отвечает неполно;
//   * неполный результат БЕЗ единой точки (разовый сбой Kaspi: таймаут, 429) живёт
//     всего минуту (MERCHANT_POINTS_EMPTY_TTL_MS), а не десять: первый же сбой не
//     должен на 10 минут оставлять пустой список городов.
export const MERCHANT_POINTS_TTL_MS = 24 * 60 * 60 * 1000
export const MERCHANT_POINTS_PARTIAL_TTL_MS = 10 * 60 * 1000
export const MERCHANT_POINTS_EMPTY_TTL_MS = 60 * 1000

/**
 * Объединение двух наборов точек по storeCode. Запись с cityId предпочтительнее записи
 * без города; если город есть у обеих, берётся свежая (вторая). Порядок: сначала старые
 * точки, затем новые.
 */
export function mergePoints(cached: MerchantPoint[], fresh: MerchantPoint[]): MerchantPoint[] {
  const byCode = new Map<string, MerchantPoint>()
  for (const p of [...cached, ...fresh]) {
    const prev = byCode.get(p.storeCode)
    // Запись с городом не заменяется записью без города; в остальных случаях побеждает поздняя.
    if (!prev || p.cityId || !prev.cityId) {
      // Название города из кэша не теряется, если у свежей записи его нет (справочник городов не ответил).
      byCode.set(p.storeCode, prev && p.cityId && prev.cityId === p.cityId && !p.cityName && prev.cityName ? { ...p, cityName: prev.cityName } : p)
    }
  }
  return [...byCode.values()]
}

export type MerchantPointsCache = { v: 2; cachedAt: string; points: MerchantPoint[]; partial?: true }

// Чистая часть: что лежит в кэше, свежо ли оно и полный ли это результат.
export function readPointsCache(raw: unknown, now = Date.now()): { points: MerchantPoint[]; fresh: boolean; partial: boolean } {
  if (Array.isArray(raw)) return { points: raw as MerchantPoint[], fresh: false, partial: false }
  if (raw && typeof raw === 'object' && Array.isArray((raw as MerchantPointsCache).points)) {
    const c = raw as MerchantPointsCache
    const partial = c.partial === true
    const ttl = partial ? (c.points.length > 0 ? MERCHANT_POINTS_PARTIAL_TTL_MS : MERCHANT_POINTS_EMPTY_TTL_MS) : MERCHANT_POINTS_TTL_MS
    const at = Date.parse(c.cachedAt)
    return { points: c.points, fresh: Number.isFinite(at) && now - at >= 0 && now - at < ttl, partial }
  }
  return { points: [], fresh: false, partial: false }
}

export async function getCachedMerchantPoints(connectionId: string, sessionCookies: string, merchantId: string): Promise<MerchantPoint[]> {
  const { data } = await supabase
    .from('kaspi_shop_connections')
    .select('merchant_points_cache')
    .eq('id', connectionId)
    .maybeSingle()
  const cached = readPointsCache(data?.merchant_points_cache)
  // Свежий полный результат. Свежий неполный (даже пустой) тоже отдаём без повторного скана.
  if (cached.fresh && (cached.partial || cached.points.length > 0)) return cached.points

  const writeCache = async (payload: MerchantPointsCache) => {
    const { error } = await supabase.from('kaspi_shop_connections').update({ merchant_points_cache: payload }).eq('id', connectionId)
    if (error) console.error('kaspi-shop merchantPoints: cache write failed (non-fatal)', error.message)
  }

  const fresh = await getMerchantPointsDetailed(sessionCookies, merchantId)
  if (fresh.complete) {
    await writeCache({ v: 2, cachedAt: new Date().toISOString(), points: fresh.points })
    return fresh.points
  }
  // Неполный свежий скан и старый кэш (полный, устаревший или тоже неполный) не
  // противопоставляются, а сливаются: в старом есть то, что Kaspi сейчас не отдал, в
  // свежем -- то, чего в старом ещё нет.
  const points = mergePoints(cached.points, fresh.points)
  // Мёртвая сессия: после переподключения точки нужны сразу, отрицательный результат не запоминаем.
  if (!fresh.sessionExpired) {
    await writeCache({ v: 2, cachedAt: new Date().toISOString(), points, partial: true })
  }
  return points
}
