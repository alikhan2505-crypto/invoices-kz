// Лимиты на запрос оплаты «пушем» в Kaspi-приложение по номеру телефона
// (/api/payment/create-phone и /api/kaspi/wallet/topup-phone). Оба маршрута шлют
// push с ОБЩЕГО мерчанта платформы на любой номер, а прежний лимит считал только
// запросы одного пользователя (5/мин): десяток бесплатных аккаунтов могли
// заспамить чужой номер или набрать флаг Kaspi на единственном мерчанте
// (аудит 24.10, billing-logic-6).
//
// Теперь, кроме лимита на пользователя, действуют:
//  - на НОМЕР: не больше PHONE_HOURLY_LIMIT пушей в час на номер (оба маршрута
//    считаются вместе) -- чужому человеку не придёт больше пары запросов;
//  - на IP: не больше IP_HOURLY_LIMIT пушей в час с одного адреса.
// Слот занимается ДО обращения к Kaspi и не возвращается, если Kaspi отказал:
// неудачные попытки тоже считаются. Не вернулся он и при сбое счётчика --
// тогда платёж пропускаем (лимит -- защита, а не повод не взять деньги).

import type { SupabaseClient } from '@supabase/supabase-js'
import { clientIp, quotaIp } from '@/lib/toolQuota'
import { claimWindowSlot, releaseWindowSlot, windowKey, phoneLimitSubject, hourBucket } from '@/lib/windowLimits'

export const PHONE_HOURLY_LIMIT = 3
export const IP_HOURLY_LIMIT = 10

export const PUSH_PHONE_PREFIX = 'pushphone'
export const PUSH_IP_PREFIX = 'puship'

/**
 * true -- пуш отправлять можно; false -- лимит на номер или IP исчерпан
 * (маршрут отвечает 429 rate_limited, как и при лимите на пользователя).
 */
export async function claimPhonePushSlots(
  supabase: SupabaseClient,
  headers: Headers,
  phone: unknown,
  now = Date.now(),
): Promise<boolean> {
  const bucket = hourBucket(now)

  const subject = phoneLimitSubject(phone)
  const phoneKey = subject ? windowKey(PUSH_PHONE_PREFIX, subject, bucket) : null
  if (phoneKey) {
    const res = await claimWindowSlot(supabase, phoneKey, PHONE_HOURLY_LIMIT)
    if (!res.ok && res.reason === 'limit') {
      console.error('Phone push: per-phone hourly limit hit')
      return false
    }
  }

  const ip = clientIp(headers)
  // 'unknown' -- IP не определился; один общий счётчик на всех заблокировал бы
  // всех, поэтому без адреса остаётся только лимит на номер.
  if (ip !== 'unknown') {
    const res = await claimWindowSlot(supabase, windowKey(PUSH_IP_PREFIX, quotaIp(ip), bucket), IP_HOURLY_LIMIT)
    if (!res.ok && res.reason === 'limit') {
      console.error('Phone push: per-IP hourly limit hit')
      // Пуш не уйдёт -- номеру слот возвращаем.
      if (phoneKey) await releaseWindowSlot(supabase, phoneKey)
      return false
    }
  }

  return true
}
