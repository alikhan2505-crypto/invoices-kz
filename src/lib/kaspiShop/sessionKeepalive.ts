import { createClient } from '@supabase/supabase-js'
import { refreshStoredSession, SESSION_REFRESH_AFTER_MS, SESSION_REFRESH_RETRY_MS } from './connection'
import { filterByOwnerAccess, loadOwnerPlanProfiles } from './planGate'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Продление сессий кабинета Kaspi заранее (10.11.2026), пока бот работает.
//
// Сессия кабинета живёт ~12-14 часов; после неё бот молчит до нового SMS. Раз в 10 минут
// (тик pg_cron, маршрут kaspi-check-dispatch) берём подключения, у которых есть включённый
// товар, живая сессия и «возраст» больше SESSION_REFRESH_AFTER_MS, и пробуем получить
// новую сессию без SMS (refreshStoredSession). Не вышло -- старая остаётся как есть; если
// заодно выяснилось, что она мертва, продавцу уходит уведомление (см. connection.ts).
// Подключения без включённых товаров не трогаем: нечего защищать, и чужие кабинеты, где
// бот не работает, не получают лишних входов.

export const KEEPALIVE_MAX_PER_TICK = 3
// Запас по времени на тик: маршрут живёт до 60 с, а один заход в Kaspi может занять много
// секунд. Не начинаем новое продление, если с начала тика прошло больше этого.
export const KEEPALIVE_TIME_BUDGET_MS = 35_000

export type KeepaliveRow = {
  id: string
  user_id?: string | null
  session_status: string | null
  paused: boolean | null
  session_refreshed_at: string | null
  session_refresh_attempt_at: string | null
}

// Чистая часть: кого продлевать сейчас. Старые строки без отметки (null) считаются
// «пора»: возраст неизвестен, а одна попытка стоит дёшево и заводит отметку.
export function selectConnectionsToRefresh(rows: KeepaliveRow[], now: number, limit: number = KEEPALIVE_MAX_PER_TICK): string[] {
  const due = rows.filter(r => {
    if ((r.session_status || 'active') !== 'active') return false
    if (r.paused) return false
    const refreshedAt = r.session_refreshed_at ? Date.parse(r.session_refreshed_at) : NaN
    if (Number.isFinite(refreshedAt) && now - refreshedAt < SESSION_REFRESH_AFTER_MS) return false
    const attemptAt = r.session_refresh_attempt_at ? Date.parse(r.session_refresh_attempt_at) : NaN
    if (Number.isFinite(attemptAt) && now - attemptAt < SESSION_REFRESH_RETRY_MS) return false
    return true
  })
  // Самые давние вперёд: у кого отметки нет или она старше, тому нужнее.
  due.sort((a, b) => {
    const ta = a.session_refreshed_at ? Date.parse(a.session_refreshed_at) : 0
    const tb = b.session_refreshed_at ? Date.parse(b.session_refreshed_at) : 0
    return ta - tb
  })
  return due.slice(0, Math.max(0, limit)).map(r => r.id)
}

export async function refreshAgingSessions(now: number = Date.now()): Promise<{ attempted: number; refreshed: number }> {
  const { data: products, error: productsError } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('connection_id')
    .eq('enabled', true)
  if (productsError) throw new Error(`keepalive tracked products lookup failed: ${productsError.message}`)
  const connectionIds = Array.from(new Set((products || []).map((p: any) => p.connection_id).filter(Boolean)))
  if (connectionIds.length === 0) return { attempted: 0, refreshed: 0 }

  const { data: rows, error: rowsError } = await supabase
    .from('kaspi_shop_connections')
    .select('id, user_id, session_status, paused, session_refreshed_at, session_refresh_attempt_at')
    .in('id', connectionIds)
  if (rowsError) throw new Error(`keepalive connections lookup failed: ${rowsError.message}`)

  // Бот работает только у владельцев с доступом (Про): тем, у кого он закончился, но
  // включённые товары остались, вход в кабинет и тревога о мёртвой сессии не нужны.
  const all = (rows || []) as KeepaliveRow[]
  const profiles = await loadOwnerPlanProfiles(all.map(r => r.user_id ?? null))
  const allowed = filterByOwnerAccess(all, (r: KeepaliveRow) => r.user_id ?? null, profiles)

  const targets = selectConnectionsToRefresh(allowed, now)
  let refreshed = 0
  let attempted = 0
  const startedAt = Date.now()
  for (const id of targets) {
    if (attempted > 0 && Date.now() - startedAt > KEEPALIVE_TIME_BUDGET_MS) break
    attempted += 1
    try {
      const r = await refreshStoredSession(id, 'cron')
      if (r.outcome === 'refreshed') refreshed += 1
    } catch (err: any) {
      console.error('kaspi-session-keepalive: refresh failed for connection', id, ':', err?.message || err)
    }
  }
  return { attempted, refreshed }
}
