// Суточная выгрузка списков КГД по реабилитационной процедуре в таблицу
// kgd_rehabilitation_debtors (крон /api/cron/kgd-rehabilitation).
//
// Правила безопасности (проверка потом читает эту таблицу как «чисто/не чисто»):
//  - любая неожиданность в ответе (нет response-массива, много записей без БИН,
//    подозрительно короткий список) = ошибка, В БАЗУ НИЧЕГО НЕ ПИШЕТСЯ;
//  - сначала upsert всего свежего, потом удаление тех, кого в выгрузке нет, и
//    только если выгрузка целиком записана; удаление «почти всех» блокируется;
//  - в логи и в ответ идут только числа. Ни имён, ни БИН.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  KGD_REHAB_ALL_URL, KGD_REHAB_TERMINATED_URL, REHAB_TABLE,
  isMissingRehabTable, mergeRehabilitationRows, parseRehabilitationAll, parseRehabilitationTerminated,
  type RehabilitationRow,
} from './kgdRehabilitation'

/** Сейчас в общем списке ~350 записей. Меньше этого: ответ усечён или сломан. */
export const MIN_REHAB_ROWS = 50
/** Сейчас в списке прекращённых 23. Меньше: усечён или пуст. */
export const MIN_TERMINATED_ROWS = 5
/** Удаление блокируется, если оно убрало бы больше этой доли таблицы. */
export const MAX_DELETE_SHARE = 0.5
/** Для маленькой таблицы доля не имеет смысла: пока строк меньше, удаляем без проверки. */
const DELETE_GUARD_MIN_EXISTING = 20
const UPSERT_CHUNK = 200
const REQUEST_TIMEOUT_MS = 40_000
/** Живой ответ ~650 КБ; больше 5 МБ - не наш формат, отбрасываем. */
const MAX_BODY_CHARS = 5_000_000

export interface RehabilitationSyncResult {
  ok: boolean
  /** Код причины неуспеха или пропуска; без персональных данных. */
  reason?: string
  dry?: boolean
  rehabilitation?: number
  terminated?: number
  merged?: number
  upserted?: number
  deleted?: number
  deleteSkipped?: string
}

/** Один POST к КГД. Бросает при не-200, таймауте и невалидном JSON. */
export async function fetchKgdRehabilitationList(
  kind: 'all' | 'terminated',
  token: string,
): Promise<unknown> {
  const header = { messageId: crypto.randomUUID(), sender: 'invoices.kz' }
  const res = await fetch(kind === 'all' ? KGD_REHAB_ALL_URL : KGD_REHAB_TERMINATED_URL, {
    method: 'POST',
    headers: { 'X-Portal-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(kind === 'all' ? { header, procedureType: 'REHABILITATION' } : { header }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`КГД ответил ${res.status}`)
  const text = await res.text()
  if (text.length > MAX_BODY_CHARS) throw new Error('ответ КГД слишком большой')
  return JSON.parse(text)
}

export interface RehabilitationSyncDeps {
  /** Подставляется в тестах. По умолчанию ходит в КГД с токеном из окружения. */
  fetchList?: (kind: 'all' | 'terminated') => Promise<unknown>
  now?: () => Date
  dry?: boolean
}

export async function syncRehabilitation(
  supabase: SupabaseClient,
  deps: RehabilitationSyncDeps = {},
): Promise<RehabilitationSyncResult> {
  const dry = deps.dry === true

  // Таблицы нет (SQL ещё не применён): не тратим 17 секунд на КГД впустую.
  const probe = await supabase.from(REHAB_TABLE).select('identifier', { count: 'exact', head: true })
  if (probe.error) {
    if (isMissingRehabTable(probe.error)) return { ok: false, reason: 'table_missing', dry }
    return { ok: false, reason: 'table_probe_failed', dry }
  }

  let fetchList = deps.fetchList
  if (!fetchList) {
    const token = process.env.KGD_PORTAL_TOKEN
    if (!token) return { ok: false, reason: 'no_kgd_token', dry }
    fetchList = kind => fetchKgdRehabilitationList(kind, token)
  }

  let allPayload: unknown
  let termPayload: unknown
  try {
    ;[allPayload, termPayload] = await Promise.all([fetchList('all'), fetchList('terminated')])
  } catch (e) {
    console.error('kgd-rehabilitation: fetch failed:', e instanceof Error ? e.message : e)
    return { ok: false, reason: 'fetch_failed', dry }
  }

  const all = parseRehabilitationAll(allPayload)
  const term = parseRehabilitationTerminated(termPayload)
  if (!all || !term) return { ok: false, reason: 'unexpected_shape', dry }
  if (all.rows.length < MIN_REHAB_ROWS) {
    return { ok: false, reason: 'rehabilitation_list_too_small', dry, rehabilitation: all.rows.length }
  }
  if (term.rows.length < MIN_TERMINATED_ROWS) {
    return { ok: false, reason: 'terminated_list_too_small', dry, terminated: term.rows.length }
  }

  const merged: RehabilitationRow[] = mergeRehabilitationRows(all.rows, term.rows)
  const counts = { rehabilitation: all.rows.length, terminated: term.rows.length, merged: merged.length }
  if (dry) return { ok: true, dry, ...counts }

  const stamp = (deps.now ? deps.now() : new Date()).toISOString()
  let upserted = 0
  for (let i = 0; i < merged.length; i += UPSERT_CHUNK) {
    const chunk = merged.slice(i, i + UPSERT_CHUNK).map(r => ({ ...r, fetched_at: stamp }))
    const { error } = await supabase.from(REHAB_TABLE).upsert(chunk, { onConflict: 'identifier' })
    if (error) {
      console.error('kgd-rehabilitation: upsert failed:', error.message)
      // Удаление не делаем: выгрузка записана не целиком.
      return { ok: false, reason: 'upsert_failed', ...counts, upserted }
    }
    upserted += chunk.length
  }

  // Удаляем тех, кого нет в свежей выгрузке (их fetched_at старше stamp).
  const total = await supabase.from(REHAB_TABLE).select('identifier', { count: 'exact', head: true })
  const stale = await supabase.from(REHAB_TABLE).select('identifier', { count: 'exact', head: true }).lt('fetched_at', stamp)
  if (total.error || stale.error || total.count === null || stale.count === null) {
    return { ok: true, ...counts, upserted, deleted: 0, deleteSkipped: 'count_failed' }
  }
  if (stale.count === 0) return { ok: true, ...counts, upserted, deleted: 0 }
  if (total.count >= DELETE_GUARD_MIN_EXISTING && stale.count > total.count * MAX_DELETE_SHARE) {
    console.error(`kgd-rehabilitation: delete blocked, ${stale.count} of ${total.count} rows would go`)
    return { ok: true, ...counts, upserted, deleted: 0, deleteSkipped: 'too_many_stale' }
  }
  const del = await supabase.from(REHAB_TABLE).delete().lt('fetched_at', stamp)
  if (del.error) {
    console.error('kgd-rehabilitation: delete failed:', del.error.message)
    return { ok: true, ...counts, upserted, deleted: 0, deleteSkipped: 'delete_failed' }
  }
  return { ok: true, ...counts, upserted, deleted: stale.count }
}
