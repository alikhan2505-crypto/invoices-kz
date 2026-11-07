// Предупреждение владельцу: на кошельке меньше 5 ₸, поэтому Kaspi Bot не меняет
// ему цены (правило основателя 07.11.2026: проверки бесплатны, 5 ₸ берётся только
// за изменение цены, а без денег изменение не оплатить).
//
// Откуда зовётся: getDueTrackedProducts (checkCycle.ts) для владельцев, чьи товары
// иначе были бы к проверке, но отсеяны по балансу. Тот же запуск раз в 10 минут
// вызывает это снова и снова, поэтому:
//  - раз в сутки на владельца (суточный слот windowLimits, как у уведомления о
//    мёртвой сессии): параллельные запуски делят один слот;
//  - колокольчик в приложении (единственный канал, который есть у всех). Telegram
//    не дублируем: дневная сводка Kaspi Bot (kaspi_daily_digest) и так присылает
//    «баланс меньше порога» тем, кто её включил.
// Никогда не бросает: уведомление не должно ломать список «пора проверять».

import type { SupabaseClient } from '@supabase/supabase-js'
import { claimWindowSlot, dayBucket, windowKey } from '@/lib/windowLimits'
import { createNotification } from '@/lib/notifications'
import { PRICE_MODEL_NOTE, PRICE_CHANGE_TENGE } from './dempingForm'

export const LOW_BALANCE_DAY_PREFIX = 'kaspilowbal'
export const LOW_BALANCE_NOTICE_TITLE = `Баланс меньше ${PRICE_CHANGE_TENGE} ₸: Kaspi Bot не меняет цены`
export const LOW_BALANCE_NOTICE_BODY = `Бот не сможет менять цены ваших товаров, пока вы не пополните кошелёк. ${PRICE_MODEL_NOTE}`
export const LOW_BALANCE_NOTICE_LINK = '/kaspi-shop'

export type LowBalanceNoticeResult = 'sent' | 'duplicate' | 'failed'

export async function notifyLowBalanceOwner(supabase: SupabaseClient, userId: string, now: number = Date.now()): Promise<LowBalanceNoticeResult> {
  try {
    // Суточный слот живёт только в базе. Счётчик не читается -- молчим: лучше
    // пропустить сообщение, чем слать его каждые 10 минут.
    const claim = await claimWindowSlot(supabase, windowKey(LOW_BALANCE_DAY_PREFIX, userId, dayBucket(now)), 1)
    if (!claim.ok) return claim.reason === 'limit' ? 'duplicate' : 'failed'
    await createNotification(userId, LOW_BALANCE_NOTICE_TITLE, LOW_BALANCE_NOTICE_BODY, LOW_BALANCE_NOTICE_LINK)
    return 'sent'
  } catch (err: any) {
    console.error('kaspi-shop lowBalanceNotice failed for user', userId, ':', err?.message || err)
    return 'failed'
  }
}

export async function notifyLowBalanceOwners(supabase: SupabaseClient, userIds: string[], now: number = Date.now()): Promise<void> {
  for (const userId of userIds) await notifyLowBalanceOwner(supabase, userId, now)
}
