// Уведомление продавцу, что сессия кабинета Kaspi умерла (аудит 06.11, K45).
//
// Раньше о смерти сессии продавец узнавал, только открыв страницу, чей запрос к
// Kaspi получил 401: репрайсер молча переставал менять цены, акции через бота
// не доходили, а дневная сводка молчала. Теперь событие kaspi_session_expired:
//  - Telegram по настройке владельца (тумблер в Профиль → Уведомления);
//  - колокольчик в приложении (информационный, без тумблера).
//
// Откуда зовётся:
//  - markSessionExpired (connection.ts) -- любой маршрут, получивший 401 от Kaspi;
//  - cron/notifications -- раз в сутки обходит соединения со session_expired,
//    это покрывает и путь пуша цен в checkCycle, который пишет статус напрямую.
//
// Чтобы не спамить, без новых колонок и миграций (счётчики windowLimits):
//  - раз в сутки на продавца (ключ с номером суток) -- параллельные 401 и cron
//    делят один слот;
//  - не больше SESSION_NOTICE_MAX_PER_EPISODE уведомлений за один «обрыв»:
//    брошенный магазин с мёртвой сессией не получает сообщения вечно. Счётчик
//    обрыва сбрасывается при успешном переподключении (saveConnection).
// Ключи счётчиков привязаны к продавцу, а не к соединению: у продавца с двумя
// магазинами уходит одно сообщение со списком, а не по одному на магазин.

import type { SupabaseClient } from '@supabase/supabase-js'
import { COUNTER_TABLE } from '@/lib/toolQuota'
import { claimWindowSlot, dayBucket, windowKey } from '@/lib/windowLimits'
import { sendTelegramNotification } from '@/lib/telegramNotify'
import { createNotification } from '@/lib/notifications'
import { wantsNotification, type NotifyProfile } from '@/lib/notificationPrefs'
import { loadNotifyProfile } from '@/lib/notificationPrefsServer'
import { hasKaspiShopAccess, KASPI_SHOP_PROFILE_COLUMNS } from '@/lib/kaspiShop/access'
import { escapeHtml } from '@/lib/htmlEscape'

export const SESSION_EXPIRED_EVENT = 'kaspi_session_expired' as const
export const SESSION_NOTICE_DAY_PREFIX = 'kaspisessexp'
export const SESSION_NOTICE_EPISODE_PREFIX = 'kaspisessexpn'
export const SESSION_NOTICE_MAX_PER_EPISODE = 3
export const SESSION_NOTICE_TELEGRAM_TIMEOUT_MS = 4000

const RECONNECT_URL = 'https://invoices.kz/kaspi-shop'

export type SessionNoticeResult = {
  status: 'sent' | 'duplicate' | 'capped' | 'skipped' | 'failed'
  /** Сообщение реально ушло в Telegram в этом вызове. */
  telegram: boolean
}

function cleanNames(names: string[]): string[] {
  return names.map(n => (n || '').trim()).filter(Boolean)
}

function storesLabel(names: string[]): string {
  return cleanNames(names).map(n => `«${escapeHtml(n)}»`).join(', ')
}

/** Текст для Telegram (HTML). */
export function formatSessionExpiredText(names: string[]): string {
  const clean = cleanNames(names)
  const what = clean.length === 0 ? 'ваш кабинет' : `${clean.length > 1 ? 'магазины' : 'магазин'} ${storesLabel(clean)}`
  return `⚠️ <b>Kaspi Bot: сессия кабинета истекла</b>\n`
    + `Kaspi разлогинил ${what}: цены не меняются, заказы не загружаются.\n`
    + `<a href="${RECONNECT_URL}">Переподключить</a> можно за минуту, по SMS.`
}

/** Строка для дневной сводки (HTML). */
export function formatSessionExpiredDigestLine(names: string[]): string {
  const label = storesLabel(names)
  return `⚠️ Сессия кабинета Kaspi истекла${label ? ` (${label})` : ''}: цены не меняются. <a href="${RECONNECT_URL}">Переподключить</a>`
}

// Один и тот же продавец за сутки в одном экземпляре функции: не ходим в базу за
// счётчиком на каждый 401 (страницы опрашивают Kaspi часто). Общий слот в базе
// остаётся главным -- это только предохранитель от лишних запросов.
const claimedToday = new Map<string, number>()

export function __resetSessionNoticeCacheForTests() { claimedToday.clear() }

/**
 * Сообщить продавцу о мёртвой сессии. Никогда не бросает. names -- названия
 * магазинов с мёртвой сессией. profile можно передать, если вызывающий его уже
 * загрузил (cron): иначе загрузится здесь.
 */
export async function notifySessionExpired(
  supabase: SupabaseClient,
  userId: string,
  names: string[],
  opts?: { now?: number; profile?: (NotifyProfile & { deleted_at?: string | null }) | null },
): Promise<SessionNoticeResult> {
  try {
    const now = opts?.now ?? Date.now()
    const today = dayBucket(now)
    if (claimedToday.get(userId) === today) return { status: 'duplicate', telegram: false }

    // 1. Суточный слот. Не читается счётчик -- молчим: лучше пропустить
    //    сообщение, чем слать его на каждый запрос.
    const day = await claimWindowSlot(supabase, windowKey(SESSION_NOTICE_DAY_PREFIX, userId, today), 1)
    if (!day.ok) {
      if (day.reason === 'limit') { claimedToday.set(userId, today); return { status: 'duplicate', telegram: false } }
      return { status: 'failed', telegram: false }
    }
    claimedToday.set(userId, today)

    // 2. Кому: удалённый аккаунт и закончившийся Про уведомлений не получают
    //    (тот же гейт, что у сводки). Проверяем ДО счётчика обрыва, чтобы
    //    пропущенные сутки не съедали лимит уведомлений.
    const profile = opts?.profile !== undefined
      ? opts.profile
      : await loadNotifyProfile<{ deleted_at?: string | null }>(supabase, userId, `deleted_at, ${KASPI_SHOP_PROFILE_COLUMNS}`)
    if (!profile || profile.deleted_at || !hasKaspiShopAccess(profile)) return { status: 'skipped', telegram: false }

    // 3. Не больше N уведомлений за один обрыв.
    const episode = await claimWindowSlot(supabase, windowKey(SESSION_NOTICE_EPISODE_PREFIX, userId, 'episode'), SESSION_NOTICE_MAX_PER_EPISODE)
    if (!episode.ok) return { status: episode.reason === 'limit' ? 'capped' : 'failed', telegram: false }

    let telegram = false
    if (wantsNotification(profile, SESSION_EXPIRED_EVENT, 'telegram')) {
      telegram = await sendTelegramNotification(
        profile.telegram_chat_id as string,
        formatSessionExpiredText(names),
        { timeoutMs: SESSION_NOTICE_TELEGRAM_TIMEOUT_MS },
      )
    }
    // Колокольчик -- всегда: он единственный канал для продавца без Telegram.
    await createNotification(
      userId,
      'Сессия кабинета Kaspi истекла',
      'Цены не меняются и заказы не загружаются, пока вы не переподключите магазин.',
      '/kaspi-shop',
    )
    return { status: 'sent', telegram }
  } catch (err: any) {
    console.error('notifySessionExpired failed for user', userId, ':', err?.message || err)
    return { status: 'failed', telegram: false }
  }
}

/**
 * Новый обрыв после переподключения начинается с нуля: сбрасывается и счётчик обрыва,
 * и сегодняшний суточный слот (иначе повторный обрыв в тот же день остался бы без
 * уведомления). Best-effort, наружу не бросает.
 */
export async function resetSessionExpiredNotices(supabase: SupabaseClient, userId: string, now = Date.now()): Promise<void> {
  try {
    claimedToday.delete(userId)
    for (const key of [
      windowKey(SESSION_NOTICE_EPISODE_PREFIX, userId, 'episode'),
      windowKey(SESSION_NOTICE_DAY_PREFIX, userId, dayBucket(now)),
    ]) {
      const { error } = await supabase.from(COUNTER_TABLE).delete().eq('key', key)
      if (error) console.error('resetSessionExpiredNotices failed for user', userId, ':', error.message)
    }
  } catch (err: any) {
    console.error('resetSessionExpiredNotices threw for user', userId, ':', err?.message || err)
  }
}

