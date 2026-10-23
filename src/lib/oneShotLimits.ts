// Серверные счётчики «не больше N раз» и «ровно один раз» без новых колонок и
// миграций: те же строки общей таблицы tool_kontragent_checks (key, day, count),
// что и у лимитов /tools (src/lib/toolQuota.ts), но с СВОИМИ ключами.
//
// Зачем свои, а не claimCounterSlot из toolQuota: он пишет в day сегодняшнюю
// дату, а registryLoadToday складывает count всех строк «за сегодня» в общий
// предохранитель живых походов в реестры КГД (300). Письма и уведомления
// реестры не трогают — но если бы их строки попадали в эту сумму, любой
// залогиненный мог бы одной рассылкой выбить проверку контрагента у всех.
// Поэтому у наших строк day = COUNTER_SENTINEL_DAY (давно в прошлом), а окно
// «сутки» живёт в самом ключе (ключ = sha256 с датой по Алматы). Префикс с
// двоеточием держит их и вне дайджеста (он считает только голые ключи).
//
// Сырых id/почт в базе нет — только sha256.

import type { SupabaseClient } from '@supabase/supabase-js'
import { COUNTER_TABLE, almatyDay, sha256Hex } from '@/lib/toolQuota'

/** Дата в колонке day у наших строк: вне «сегодня» предохранителя реестров. */
export const COUNTER_SENTINEL_DAY = '2000-01-01'

/** Сколько раз за сутки можно отправить письмо с ОДНИМ счётом. */
export const SEND_INVOICE_PER_INVOICE_DAILY = 5
/** Сколько писем со счетами за сутки может отправить ОДИН пользователь. */
export const SEND_INVOICE_PER_USER_DAILY = 30

export const SEND_INVOICE_KEY_PREFIX = 'sendinv:'
export const NOTIFY_ONCE_KEY_PREFIX = 'notifyonce:'

export type SendLimitScope = 'invoice' | 'user'

/** Ключ суточного лимита отправки: 'sendinv:i:' / 'sendinv:u:' + sha256(...|день по Алматы). */
export function sendInvoiceKey(scope: SendLimitScope, id: string, now = Date.now()): string {
  const tag = scope === 'invoice' ? 'i' : 'u'
  return `${SEND_INVOICE_KEY_PREFIX}${tag}:` + sha256Hex(`sendinv|${scope}|${id}|${almatyDay(now)}`)
}

export type OneShotEvent = 'viewed' | 'paid'

/** Ключ разового уведомления владельцу о событии со счётом: один на счёт и событие, без срока. */
export function notifyOnceKey(event: OneShotEvent, invoiceId: string): string {
  return `${NOTIFY_ONCE_KEY_PREFIX}${event}:` + sha256Hex(`notifyonce|${event}|${invoiceId}`)
}

type Read = { ok: true; used: number } | { ok: false }

async function read(supabase: SupabaseClient, key: string): Promise<Read> {
  const { data, error } = await supabase.from(COUNTER_TABLE).select('count').eq('key', key).maybeSingle()
  if (error) {
    console.error('oneShotLimits: read failed:', error.message)
    return { ok: false }
  }
  return { ok: true, used: (data as { count?: number } | null)?.count ?? 0 }
}

/** Один шаг compare-and-swap: count used → used+1 при условии, что в базе всё ещё used. */
async function casIncrement(supabase: SupabaseClient, key: string, used: number): Promise<'claimed' | 'raced' | 'error'> {
  const { data, error } = await supabase.from(COUNTER_TABLE)
    .update({ day: COUNTER_SENTINEL_DAY, count: used + 1 }).eq('key', key).eq('count', used).select('key')
  if (error) {
    console.error('oneShotLimits: claim failed:', error.message)
    return 'error'
  }
  if ((data ?? []).length > 0) return 'claimed'
  if (used !== 0) return 'raced'
  // Строки ещё нет. Первичный ключ не даст вставить её дважды: проигравший
  // параллельный запрос получит 23505.
  const ins = await supabase.from(COUNTER_TABLE).insert({ key, day: COUNTER_SENTINEL_DAY, count: 1 })
  if (!ins.error) return 'claimed'
  if (ins.error.code === '23505') return 'raced'
  console.error('oneShotLimits: claim insert failed:', ins.error.message)
  return 'error'
}

export type ClaimResult =
  | { ok: true; used: number }
  | { ok: false; reason: 'limit' | 'error' }

/**
 * Атомарно занять слот под лимит: пока count < limit — пробуем count → count+1
 * (compare-and-swap, параллельные запросы не проскакивают пачкой). 'limit' —
 * лимит исчерпан; 'error' — счётчик не читается/не пишется (вызывающий
 * отказывает: лимит — защита, без счётчика не раздаём).
 */
export async function claimDailySlot(supabase: SupabaseClient, key: string, limit: number): Promise<ClaimResult> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await read(supabase, key)
    if (!cur.ok) return { ok: false, reason: 'error' }
    if (cur.used >= limit) return { ok: false, reason: 'limit' }
    const res = await casIncrement(supabase, key, cur.used)
    if (res === 'claimed') return { ok: true, used: cur.used + 1 }
    if (res === 'error') return { ok: false, reason: 'error' }
    // raced — кто-то успел раньше, перечитываем.
  }
  // Пять проигранных гонок подряд — это уже не человек.
  return { ok: false, reason: 'limit' }
}

/**
 * Вернуть занятый слот (письмо не ушло — отправителю лимит тратить незачем).
 * Best-effort: ошибки только в лог, наружу не бросает.
 */
export async function releaseDailySlot(supabase: SupabaseClient, key: string): Promise<void> {
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const cur = await read(supabase, key)
      if (!cur.ok || cur.used <= 0) return
      const { data, error } = await supabase.from(COUNTER_TABLE)
        .update({ day: COUNTER_SENTINEL_DAY, count: cur.used - 1 }).eq('key', key).eq('count', cur.used).select('key')
      if (error) {
        console.error('oneShotLimits: release failed:', error.message)
        return
      }
      if ((data ?? []).length > 0) return
    }
  } catch (e: any) {
    console.error('oneShotLimits: release threw:', e?.message)
  }
}

/**
 * Разовый claim: true — этот запрос первый и единственный, кому можно слать
 * уведомление; false — уже слали (или счётчик недоступен: при сбое лучше
 * пропустить уведомление, чем спамить владельца при каждой перезагрузке).
 */
export async function claimOnce(supabase: SupabaseClient, key: string): Promise<boolean> {
  try {
    const res = await casIncrement(supabase, key, 0)
    return res === 'claimed'
  } catch (e: any) {
    console.error('oneShotLimits: claimOnce threw:', e?.message)
    return false
  }
}
