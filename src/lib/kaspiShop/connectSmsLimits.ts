// Лимиты на POST /api/kaspi-shop/connect (аудит 06.11, K48). Каждый успешный
// вызов заставляет Kaspi слать SMS на указанный номер с ОБЩЕГО IP нашего
// сервера: без лимита любой Про-пользователь мог в цикле слать SMS чужим людям и
// навлечь антифрод Kaspi на этот IP -- а с ним на всех, кто подключает магазин.
//
// Как у запроса оплаты пушем (src/lib/kaspiPay/phonePushLimits.ts), но строже и
// «закрыто при сбое»: это защита, а не повод взять деньги, поэтому если счётчик
// недоступен, SMS не шлём (маршрут отвечает 503).
//  - на пользователя: USER_HOURLY_LIMIT в час (честный человек подключает магазин
//    раз, ну пять -- с опечатками в коде);
//  - на номер: PHONE_HOURLY_LIMIT в час -- чужому человеку не придёт больше пары SMS;
//  - на IP: IP_HOURLY_LIMIT в час.
// Слот занимается ДО обращения к Kaspi и не возвращается, если Kaspi отказал:
// неудачные попытки тоже считаются. Возвращаются только слоты, занятые ЭТИМ
// вызовом, если SMS всё равно не уйдёт из-за другого лимита.

import type { SupabaseClient } from '@supabase/supabase-js'
import { clientIp, quotaIp } from '@/lib/toolQuota'
import { claimWindowSlot, releaseWindowSlot, windowKey, phoneLimitSubject, hourBucket } from '@/lib/windowLimits'

export const USER_HOURLY_LIMIT = 5
export const PHONE_HOURLY_LIMIT = 3
export const IP_HOURLY_LIMIT = 10

export const CONNECT_USER_PREFIX = 'kaspiconnuser'
export const CONNECT_PHONE_PREFIX = 'kaspiconnphone'
export const CONNECT_IP_PREFIX = 'kaspiconnip'

const HOUR_MS = 3_600_000

export type ConnectSmsClaim =
  | { ok: true }
  | { ok: false; reason: 'limit'; scope: 'user' | 'phone' | 'ip'; retryAfterSec: number }
  | { ok: false; reason: 'error' }

/** Сколько секунд до начала следующего часового окна (когда счётчики обнулятся). */
export function secondsToNextHour(now = Date.now()): number {
  return Math.max(1, Math.ceil((HOUR_MS - (now % HOUR_MS)) / 1000))
}

type SmsStep = { scope: 'user' | 'phone' | 'ip'; key: string; limit: number }

/** Три (или две, если IP не определился) ключа счётчиков этого вызова: общие для занятия и возврата слотов. */
function connectSmsSteps(headers: Headers, userId: string, phone: unknown, now: number): SmsStep[] {
  const bucket = hourBucket(now)
  const steps: SmsStep[] = [
    { scope: 'user', key: windowKey(CONNECT_USER_PREFIX, userId, bucket), limit: USER_HOURLY_LIMIT },
  ]
  const subject = phoneLimitSubject(phone)
  if (subject) steps.push({ scope: 'phone', key: windowKey(CONNECT_PHONE_PREFIX, subject, bucket), limit: PHONE_HOURLY_LIMIT })
  const ip = clientIp(headers)
  // 'unknown' -- IP не определился; один общий счётчик на всех заблокировал бы
  // всех, поэтому без адреса остаются лимиты на пользователя и номер.
  if (ip !== 'unknown') steps.push({ scope: 'ip', key: windowKey(CONNECT_IP_PREFIX, quotaIp(ip), bucket), limit: IP_HOURLY_LIMIT })
  return steps
}

export async function claimConnectSmsSlots(
  supabase: SupabaseClient,
  headers: Headers,
  userId: string,
  phone: unknown,
  now = Date.now(),
): Promise<ConnectSmsClaim> {
  const claimed: string[] = []
  const rollback = async () => { for (const key of claimed) await releaseWindowSlot(supabase, key) }
  const steps = connectSmsSteps(headers, userId, phone, now)

  for (const step of steps) {
    const res = await claimWindowSlot(supabase, step.key, step.limit)
    if (res.ok) { claimed.push(step.key); continue }
    await rollback()
    if (res.reason === 'limit') {
      console.error(`Kaspi connect SMS: ${step.scope} hourly limit hit`)
      return { ok: false, reason: 'limit', scope: step.scope, retryAfterSec: secondsToNextHour(now) }
    }
    return { ok: false, reason: 'error' }
  }
  return { ok: true }
}

/**
 * Вернуть слоты, занятые claimConnectSmsSlots в этом вызове, когда SMS заведомо не
 * ушла: Kaspi не ответил (kaspi_unreachable), запрос до него не дошёл. Отказы Kaspi
 * (номер не принят и т. п.) слоты не возвращают: SMS мог уйти, и счёт попыткам нужен.
 * Передавайте тот же now, что и в claim: окно часа считается от него. Best-effort.
 */
export async function releaseConnectSmsSlots(
  supabase: SupabaseClient,
  headers: Headers,
  userId: string,
  phone: unknown,
  now = Date.now(),
): Promise<void> {
  for (const step of connectSmsSteps(headers, userId, phone, now)) await releaseWindowSlot(supabase, step.key)
}
