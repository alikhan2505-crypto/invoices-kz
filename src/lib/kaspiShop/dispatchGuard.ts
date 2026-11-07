import type { SupabaseClient } from '@supabase/supabase-js'
import { COUNTER_TABLE } from '@/lib/toolQuota'
import { claimWindowSlot, releaseWindowSlot, windowKey } from '@/lib/windowLimits'

// «Не чаще одного запуска за окно» для действий, которые отправляют GitHub
// workflow_dispatch (обновление отзывов): каждый запуск до 9 минут ходит в Kaspi с
// одного IP раннера, а токен общий для репрайсера, ниш и отзывов (аудит K42).
//
// Окна фиксированные и выровнены по эпохе, поэтому одного счётчика мало: запуск в
// конце окна и ещё один в начале следующего шли бы почти подряд, то есть параллельно
// с первым. Поэтому слот считается занятым, если занято текущее ИЛИ предыдущее окно:
// между двумя запусками проходит не меньше одного окна (а окно не короче самого
// длинного запуска). Счётчик -- общий windowLimits, без новых колонок.

export type DispatchClaim =
  | { ok: true; slotKey: string; since: string }
  | {
      ok: false
      reason: 'running'
      /** Через сколько секунд слот гарантированно свободен. */
      retryAfterSeconds: number
      /** Нижняя граница времени запуска, который держит слот (ISO). */
      since: string
    }
  | { ok: false; reason: 'error' }

export async function claimDispatchSlot(
  supabase: SupabaseClient,
  prefix: string,
  subject: string,
  windowMs: number,
  nowMs: number = Date.now(),
): Promise<DispatchClaim> {
  const bucket = Math.floor(nowMs / windowMs)

  const prevKey = windowKey(prefix, subject, bucket - 1)
  const prev = await supabase.from(COUNTER_TABLE).select('count').eq('key', prevKey).maybeSingle()
  if (prev.error) {
    console.error('dispatchGuard: read failed:', prev.error.message)
    return { ok: false, reason: 'error' }
  }
  if (((prev.data as { count?: number } | null)?.count ?? 0) >= 1) {
    return {
      ok: false,
      reason: 'running',
      retryAfterSeconds: Math.max(1, Math.ceil(((bucket + 1) * windowMs - nowMs) / 1000)),
      since: new Date((bucket - 1) * windowMs).toISOString(),
    }
  }

  const slotKey = windowKey(prefix, subject, bucket)
  const claim = await claimWindowSlot(supabase, slotKey, 1)
  if (!claim.ok) {
    if (claim.reason === 'limit') {
      return {
        ok: false,
        reason: 'running',
        // Следующее окно закрыто «предыдущим» правилом, свободно с начала через одно.
        retryAfterSeconds: Math.max(1, Math.ceil(((bucket + 2) * windowMs - nowMs) / 1000)),
        since: new Date(bucket * windowMs).toISOString(),
      }
    }
    return { ok: false, reason: 'error' }
  }
  return { ok: true, slotKey, since: new Date(nowMs).toISOString() }
}

/** Вернуть слот, если запуск не состоялся (GitHub отказал). */
export async function releaseDispatchSlot(supabase: SupabaseClient, slotKey: string): Promise<void> {
  await releaseWindowSlot(supabase, slotKey)
}
