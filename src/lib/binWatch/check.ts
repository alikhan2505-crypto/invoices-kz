// Одна проверка БИН для слежения: результат реестров -> что записать в строку
// bin_watch и о чём предупредить. Чистая логика (без сети и базы), кроме
// runLookup, который лишь вызывает переданную функцию проверки.

import type { BinLookupOutcome } from '@/lib/binLookupServer'
import { BIN_WATCH_MIN_RECHECK_MS, BIN_WATCH_PARTIAL_RETRY_MS } from './config'
import {
  CHANGE_KEYS, compareSignals, extractResult, mergeBaseline, parseSignals, stillActive,
  type ChangeKey, type WatchResult,
} from './signals'

export interface WatchRow {
  id: string
  user_id: string
  bin: string
  name: string | null
  baseline: unknown
  last_result: unknown
  last_checked_at: string | null
  last_attempt_at: string | null
  last_status: 'ok' | 'not_found' | 'unavailable' | null
  pending_changes: string[] | null
  created_at: string
}

export type CheckOutcome =
  | { status: 'ok'; result: WatchResult; name: string }
  | { status: 'not_found' }
  | { status: 'unavailable' }

export type LookupFn = (bin: string) => Promise<BinLookupOutcome>

/**
 * Спросить реестры. Исключение, «реестры не ответили» и «не найдено» никогда не
 * превращаются в результат: проверка просто не удалась.
 */
export async function runLookup(lookup: LookupFn, bin: string): Promise<CheckOutcome> {
  try {
    const r = await lookup(bin)
    if (r.found) return { status: 'ok', result: extractResult(r.company), name: r.company.name }
    return r.unavailable ? { status: 'unavailable' } : { status: 'not_found' }
  } catch (e) {
    console.error('bin-watch: lookup threw:', e instanceof Error ? e.message : e)
    return { status: 'unavailable' }
  }
}

/** Хоть один признак не проверен (null): результат неполный. */
export function isPartialResult(result: WatchResult): boolean {
  return Object.values(result.signals).some(v => v === null)
}

export const isChangeKey =(k: unknown): k is ChangeKey => (CHANGE_KEYS as readonly unknown[]).includes(k)

export interface RowUpdate {
  patch: Record<string, unknown>
  /** Новые негативные признаки по этой проверке (для счётчиков и тестов). */
  worsened: ChangeKey[]
}

/**
 * Что записать в строку после проверки.
 *  - всегда: время и итог попытки (по ним порядок обработки и правило «раз в сутки»);
 *  - только при успешной проверке: результат, название, новая база, ожидающие
 *    предупреждения. Неудавшаяся проверка ничего из этого не трогает: сбой реестра
 *    не улучшение и не ухудшение;
 *  - предупреждения: прежние (если проблема ещё есть) + новые ухудшения. Первая
 *    проверка (базы нет) ухудшений не даёт.
 */
export function planRowUpdate(row: Pick<WatchRow, 'baseline' | 'pending_changes'>, outcome: CheckOutcome, nowIso: string): RowUpdate {
  const patch: Record<string, unknown> = { last_attempt_at: nowIso, last_status: outcome.status }
  if (outcome.status !== 'ok') return { patch, worsened: [] }

  // Частичный результат (часть реестров не ответила): попытка записывается как
  // сделанная раньше, чтобы повтор был доступен через BIN_WATCH_PARTIAL_RETRY_MS,
  // а не через 20 часов. Данные при этом сохраняются как обычно.
  const partial = isPartialResult(outcome.result)
  if (partial) {
    patch.last_attempt_at = new Date(Date.parse(nowIso) - (BIN_WATCH_MIN_RECHECK_MS - BIN_WATCH_PARTIAL_RETRY_MS)).toISOString()
  }

  const base = parseSignals(row.baseline)
  const { worsened } = compareSignals(base, outcome.result.signals)
  const newBase = mergeBaseline(base, outcome.result.signals)
  const previous = stillActive((row.pending_changes ?? []).filter(isChangeKey), newBase)
  const pending = [...new Set<ChangeKey>([...previous, ...worsened])]

  patch.name = outcome.name
  patch.baseline = newBase
  patch.last_result = outcome.result
  patch.last_checked_at = nowIso
  patch.pending_changes = pending
  return { patch, worsened }
}
