// Список слежения: добавление (с лимитом тарифа), удаление, чтение. Всё через
// service-role клиент, переданный вызывающим: единственный путь вставки строк -
// /api/bin-watch (у клиента в базе нет права на insert/update).

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeBin, isValidBin } from '@/lib/binLookup'
import { planRowUpdate, runLookup, type LookupFn, type WatchRow } from './check'
import { almatyDay, claimCounterSlot, readCounter, registryLoadToday, REGISTRY_DAILY_GLOBAL } from '@/lib/toolQuota'
import { BIN_WATCH_ADD_COUNTER_PREFIX, BIN_WATCH_ADD_DAILY_MAX, BIN_WATCH_TOOL_RESERVE } from './config'

export const WATCH_TABLE = 'bin_watch'
export const WATCH_COLUMNS =
  'id, user_id, bin, name, baseline, last_result, last_checked_at, last_attempt_at, last_status, pending_changes, created_at'

type DbError = { code?: string; message?: string } | null | undefined

/** Таблицы нет (миграция bin_watch.sql ещё не применена): 42P01 / PGRST205. */
export function isMissingWatchTable(error: DbError): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  return /bin_watch.*(does not exist|schema cache)|could not find the table.*bin_watch/i.test(error.message || '')
}

export type AddResult =
  | { ok: true; status: 'added' | 'already'; id: string; count: number }
  | { ok: false; reason: 'invalid_bin' | 'limit' | 'not_ready' | 'error'; limit?: number; count?: number }

/**
 * Добавить БИН в список. Повтор того же БИН лимит не тратит и ничего не меняет.
 * Лимит проверяется до вставки и ПОСЛЕ неё: две одновременные вставки на границе
 * лимита не пропускают лишнюю (проигравшая откатывается).
 */
export async function addWatch(
  supabase: SupabaseClient,
  userId: string,
  rawBin: string,
  limit: number,
): Promise<AddResult> {
  const bin = normalizeBin(rawBin)
  if (!isValidBin(bin)) return { ok: false, reason: 'invalid_bin' }

  const existing = await supabase.from(WATCH_TABLE).select('id').eq('user_id', userId).eq('bin', bin).maybeSingle()
  if (existing.error) {
    return { ok: false, reason: isMissingWatchTable(existing.error) ? 'not_ready' : 'error' }
  }

  const countRows = async (): Promise<number | null> => {
    const { count, error } = await supabase.from(WATCH_TABLE).select('id', { count: 'exact', head: true }).eq('user_id', userId)
    return error ? null : count ?? 0
  }

  const before = await countRows()
  if (before === null) return { ok: false, reason: 'error' }
  if (existing.data) return { ok: true, status: 'already', id: (existing.data as { id: string }).id, count: before }
  if (before >= limit) return { ok: false, reason: 'limit', limit, count: before }

  const ins = await supabase.from(WATCH_TABLE).insert({ user_id: userId, bin }).select('id').single()
  if (ins.error) {
    if (ins.error.code === '23505') {
      // Параллельный запрос успел добавить тот же БИН.
      const again = await supabase.from(WATCH_TABLE).select('id').eq('user_id', userId).eq('bin', bin).maybeSingle()
      if (again.data) return { ok: true, status: 'already', id: (again.data as { id: string }).id, count: before }
    }
    return { ok: false, reason: isMissingWatchTable(ins.error) ? 'not_ready' : 'error' }
  }
  const id = (ins.data as { id: string }).id

  const after = await countRows()
  if (after !== null && after > limit) {
    await supabase.from(WATCH_TABLE).delete().eq('id', id).eq('user_id', userId)
    return { ok: false, reason: 'limit', limit, count: after - 1 }
  }
  return { ok: true, status: 'added', id, count: after ?? before + 1 }
}

export async function listWatch(supabase: SupabaseClient, userId: string): Promise<{ ok: true; rows: WatchRow[] } | { ok: false; reason: 'not_ready' | 'error' }> {
  const { data, error } = await supabase.from(WATCH_TABLE).select(WATCH_COLUMNS).eq('user_id', userId).order('created_at', { ascending: false })
  if (error) return { ok: false, reason: isMissingWatchTable(error) ? 'not_ready' : 'error' }
  return { ok: true, rows: (data ?? []) as WatchRow[] }
}

/** Удалить свою строку. Чужой id не затрагивается: фильтр по user_id обязателен. */
export async function removeWatch(supabase: SupabaseClient, userId: string, id: string): Promise<'removed' | 'not_found' | 'error'> {
  const { data, error } = await supabase.from(WATCH_TABLE).delete().eq('id', id).eq('user_id', userId).select('id')
  if (error) return 'error'
  return (data ?? []).length > 0 ? 'removed' : 'not_found'
}

/**
 * Слот живой проверки для первого снимка при добавлении: из своего суточного
 * счётчика (не из крона) и только пока общая нагрузка на реестры не съела запас
 * бесплатных инструментов. false - слота нет: строка остаётся без снимка, его
 * сделает крон.
 */
export async function claimAddLookupSlot(supabase: SupabaseClient, now = Date.now()): Promise<boolean> {
  if ((await registryLoadToday(supabase, now)) >= REGISTRY_DAILY_GLOBAL - BIN_WATCH_TOOL_RESERVE) return false
  const key = `${BIN_WATCH_ADD_COUNTER_PREFIX}${almatyDay(now)}`
  for (let attempt = 0; attempt < 3; attempt++) {
    const c = await readCounter(supabase, key)
    if (!c.ok || c.used >= BIN_WATCH_ADD_DAILY_MAX) return false
    const claim = await claimCounterSlot(supabase, key, c.used, now)
    if (claim === 'claimed') return true
    if (claim === 'error') return false
  }
  return false
}

/**
 * Первый снимок сразу после добавления (без письма, по определению: базы ещё нет).
 * Best-effort: не получилось - строка остаётся без снимка, сделает крон.
 */
export async function takeFirstSnapshot(
  supabase: SupabaseClient,
  row: Pick<WatchRow, 'id' | 'bin'>,
  lookup: LookupFn,
  now = Date.now(),
): Promise<'done' | 'skipped' | 'failed'> {
  if (!(await claimAddLookupSlot(supabase, now))) return 'skipped'
  const outcome = await runLookup(lookup, row.bin)
  const { patch } = planRowUpdate({ baseline: null, pending_changes: [] }, outcome, new Date(now).toISOString())
  const { error } = await supabase.from(WATCH_TABLE).update(patch).eq('id', row.id)
  if (error) return 'failed'
  return outcome.status === 'ok' ? 'done' : 'failed'
}
