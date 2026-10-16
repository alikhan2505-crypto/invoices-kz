// Серверная половина настроек уведомлений: загрузка профиля с
// notification_prefs так, чтобы код работал и ДО миграции (колонки ещё нет →
// повтор запроса без неё), и общая отправка владельцу в Telegram по prefs.
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendTelegramNotification } from '@/lib/telegramNotify'
import {
  NOTIFY_PROFILE_COLUMNS,
  wantsNotification,
  type NotificationEventKey,
  type NotifyProfile,
} from '@/lib/notificationPrefs'

type QueryResult<T> = { data: T | null; error: { code?: string; message?: string } | null }

// Колонка/функция, которой ещё нет в базе (миграция не применена).
//  42703 — undefined_column (в т.ч. во вложенном select), PGRST204 — колонки
//  нет в кэше схемы (запись), 42883/PGRST202 — функции нет.
export function isMissingSchemaError(error: { code?: string; message?: string } | null | undefined, name: string): boolean {
  if (!error) return false
  const code = error.code || ''
  const msg = error.message || ''
  if (['42703', 'PGRST204', '42883', 'PGRST202'].includes(code)) return msg.includes(name)
  return msg.includes(name) && /does not exist|could not find/i.test(msg)
}

// Чтобы не делать два запроса на каждое уведомление до миграции, факт
// «колонки нет» помним 5 минут (после применения SQL код подхватит её сам).
const MISSING_RECHECK_MS = 5 * 60 * 1000
let prefsColumnMissingUntil = 0

export function __resetPrefsColumnCacheForTests() { prefsColumnMissingUntil = 0 }

// Выполняет запрос с колонкой notification_prefs; если её нет — повторяет
// без неё. run получает строку колонок для select (можно вставлять во
// вложенный select: `profiles(${cols})`).
export async function selectWithNotificationPrefs<T>(
  baseColumns: string,
  run: (columns: string) => PromiseLike<QueryResult<T>>,
): Promise<QueryResult<T>> {
  if (Date.now() >= prefsColumnMissingUntil) {
    const withPrefs = await run(`${baseColumns}, notification_prefs`)
    if (!isMissingSchemaError(withPrefs.error, 'notification_prefs')) return withPrefs
    prefsColumnMissingUntil = Date.now() + MISSING_RECHECK_MS
  }
  return run(baseColumns)
}

export async function notificationPrefsColumnExists(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase.from('profiles').select('notification_prefs').limit(1)
  if (!error) { prefsColumnMissingUntil = 0; return true }
  if (isMissingSchemaError(error, 'notification_prefs')) return false
  throw new Error(error.message)
}

// Профиль владельца со всем, что нужно wantsNotification. extraColumns —
// если вызывающему нужно что-то ещё из той же строки.
export async function loadNotifyProfile<T extends object = Record<string, never>>(
  supabase: SupabaseClient,
  userId: string,
  extraColumns = '',
): Promise<(NotifyProfile & T) | null> {
  const base = extraColumns ? `${NOTIFY_PROFILE_COLUMNS}, ${extraColumns}` : NOTIFY_PROFILE_COLUMNS
  const { data, error } = await selectWithNotificationPrefs<NotifyProfile & T>(base, cols =>
    supabase.from('profiles').select(cols).eq('id', userId).maybeSingle() as unknown as PromiseLike<QueryResult<NotifyProfile & T>>,
  )
  if (error) {
    console.error('loadNotifyProfile failed for user', userId, ':', error.message)
    return null
  }
  return data ?? null
}

// Telegram владельцу по его настройкам события. Best-effort: никогда не
// бросает. text — уже готовый HTML (пользовательские куски экранирует
// вызывающий). Возвращает true, если сообщение ушло в Telegram.
export async function notifyOwnerTelegram(
  supabase: SupabaseClient,
  userId: string,
  event: NotificationEventKey,
  text: string,
  opts?: { timeoutMs?: number; profile?: NotifyProfile | null },
): Promise<boolean> {
  try {
    const profile = opts?.profile !== undefined ? opts.profile : await loadNotifyProfile(supabase, userId)
    if (!profile || !wantsNotification(profile, event, 'telegram')) return false
    return await sendTelegramNotification(profile.telegram_chat_id as string, text, opts?.timeoutMs ? { timeoutMs: opts.timeoutMs } : undefined)
  } catch (err: any) {
    console.error('notifyOwnerTelegram failed for user', userId, 'event', event, ':', err?.message || err)
    return false
  }
}
