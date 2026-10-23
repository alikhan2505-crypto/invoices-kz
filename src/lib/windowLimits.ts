// Серверные счётчики «не больше N раз за окно (час/сутки)» без новых колонок и
// миграций: те же строки общей таблицы tool_kontragent_checks (key, day, count),
// что и у лимитов /tools (src/lib/toolQuota.ts), но с СВОИМИ ключами.
//
// Окно живёт в самом ключе (ключ = sha256 от «префикс|кто|номер окна»), поэтому
// сброс не нужен: новое окно — новая строка. В колонку day пишем давнюю
// дату-заглушку: registryLoadToday складывает count всех строк «за сегодня» в
// дневной предохранитель живых походов в реестры КГД (300), и наши строки туда
// попасть не должны (иначе любой аноним выбивал бы проверку контрагента у всех).
// Префикс с двоеточием держит их вне дайджеста (он считает только голые ключи).
// Сырых IP, телефонов и id в базе нет — только sha256.
//
// Занять слот можно ДО дорогого действия (claimWindowSlot -- compare-and-swap,
// пачка параллельных запросов не проскакивает) и вернуть (releaseWindowSlot),
// если действие не состоялось по причине, которая лимит тратить не должна.

import type { SupabaseClient } from '@supabase/supabase-js'
import { COUNTER_TABLE, sha256Hex } from '@/lib/toolQuota'

/** Дата в колонке day у наших строк: вне «сегодня» предохранителя реестров. */
export const WINDOW_SENTINEL_DAY = '2000-01-01'

const HOUR_MS = 3_600_000

/** Номер часового окна (по UTC; граница часа от пояса не зависит). */
export function hourBucket(now = Date.now()): number {
  return Math.floor(now / HOUR_MS)
}

/** Номер суточного окна (по UTC). */
export function dayBucket(now = Date.now()): number {
  return Math.floor(now / (24 * HOUR_MS))
}

/** Ключ счётчика: '<prefix>:' + sha256('<prefix>|<subject>|<окно>'). */
export function windowKey(prefix: string, subject: string, bucket: number | string): string {
  return `${prefix}:` + sha256Hex(`${prefix}|${subject}|${bucket}`)
}

/** Номер телефона для ключа лимита: последние 10 цифр, чтобы +7…, 8… и 7… считались одним номером. */
export function phoneLimitSubject(raw: unknown): string {
  return String(raw ?? '').replace(/\D/g, '').slice(-10)
}

export type WindowClaim =
  | { ok: true; used: number }
  | { ok: false; reason: 'limit' | 'error' }

async function readCount(supabase: SupabaseClient, key: string): Promise<{ ok: true; used: number } | { ok: false }> {
  const { data, error } = await supabase.from(COUNTER_TABLE).select('count').eq('key', key).maybeSingle()
  if (error) {
    console.error('windowLimits: read failed:', error.message)
    return { ok: false }
  }
  return { ok: true, used: (data as { count?: number } | null)?.count ?? 0 }
}

/** Один шаг compare-and-swap: count used → used+1, только если в базе всё ещё used. */
async function casIncrement(supabase: SupabaseClient, key: string, used: number): Promise<'claimed' | 'raced' | 'error'> {
  const { data, error } = await supabase.from(COUNTER_TABLE)
    .update({ day: WINDOW_SENTINEL_DAY, count: used + 1 }).eq('key', key).eq('count', used).select('key')
  if (error) {
    console.error('windowLimits: claim failed:', error.message)
    return 'error'
  }
  if ((data ?? []).length > 0) return 'claimed'
  if (used !== 0) return 'raced'
  // Строки ещё нет. Первичный ключ не даст вставить её дважды: проигравший
  // параллельный запрос получит 23505.
  const ins = await supabase.from(COUNTER_TABLE).insert({ key, day: WINDOW_SENTINEL_DAY, count: 1 })
  if (!ins.error) return 'claimed'
  if (ins.error.code === '23505') return 'raced'
  console.error('windowLimits: claim insert failed:', ins.error.message)
  return 'error'
}

/**
 * Атомарно занять слот под лимит: пока count < limit — count → count+1.
 * 'limit' — лимит окна исчерпан; 'error' — счётчик не читается/не пишется
 * (вызывающий сам решает: защитный лимит отказывает, лимит на платёж пропускает).
 */
export async function claimWindowSlot(supabase: SupabaseClient, key: string, limit: number): Promise<WindowClaim> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await readCount(supabase, key)
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

/** Вернуть занятый слот (действие не состоялось по вине не отправителя). Best-effort: наружу не бросает. */
export async function releaseWindowSlot(supabase: SupabaseClient, key: string): Promise<void> {
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const cur = await readCount(supabase, key)
      if (!cur.ok || cur.used <= 0) return
      const { data, error } = await supabase.from(COUNTER_TABLE)
        .update({ day: WINDOW_SENTINEL_DAY, count: cur.used - 1 }).eq('key', key).eq('count', cur.used).select('key')
      if (error) {
        console.error('windowLimits: release failed:', error.message)
        return
      }
      if ((data ?? []).length > 0) return
    }
  } catch (e: any) {
    console.error('windowLimits: release threw:', e?.message)
  }
}
