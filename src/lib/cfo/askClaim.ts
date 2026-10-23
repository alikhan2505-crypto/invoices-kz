// Суточный лимит вопросов «Спроси CFO» на компанию (cfo_companies.ask_day /
// ask_count) с атомарным занятием слота ДО вызова модели.
//
// Раньше маршрут читал счётчик, звал модель и только потом писал used+1: пачка
// параллельных запросов читала одно и то же used и каждая шла к модели -- лимит
// 30/сутки обходился, а каждый ответ стоит денег (аудит 24.10, api-authz-8).
// Теперь слот занимается условным UPDATE (compare-and-swap по ask_day и
// ask_count): проигравшие гонку перечитывают счётчик и пробуют снова или
// получают отказ. Если модель не ответила, слот возвращается -- как и раньше,
// считаются только состоявшиеся ответы.

import type { SupabaseClient } from '@supabase/supabase-js'

export type AskClaim =
  | { ok: true; used: number }
  | { ok: false; reason: 'limit' | 'error' | 'no_company' }

type CountRow = { ask_day: string | null; ask_count: number | null }

/** Условие «в строке всё ещё то, что мы прочитали» — null сравнивается через IS NULL. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function whereUnchanged(q: any, row: CountRow): any {
  const withDay = row.ask_day === null || row.ask_day === undefined ? q.is('ask_day', null) : q.eq('ask_day', row.ask_day)
  return row.ask_count === null || row.ask_count === undefined ? withDay.is('ask_count', null) : withDay.eq('ask_count', row.ask_count)
}

/**
 * Занять слот: used (вопросов сегодня до этого) → used+1. 'limit' — лимит
 * исчерпан; 'error' — счётчик не читается/не пишется (маршрут отказывает:
 * лимит защищает деньги, без счётчика модель не зовём).
 */
export async function claimAskSlot(
  supabase: SupabaseClient,
  companyId: string,
  today: string,
  limit: number,
): Promise<AskClaim> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase.from('cfo_companies')
      .select('ask_day, ask_count').eq('id', companyId).maybeSingle()
    if (error) {
      console.error('cfo/ask: counter read failed:', error.message)
      return { ok: false, reason: 'error' }
    }
    if (!data) return { ok: false, reason: 'no_company' }
    const row = data as CountRow
    const used = row.ask_day === today ? row.ask_count ?? 0 : 0
    if (used >= limit) return { ok: false, reason: 'limit' }

    const upd = supabase.from('cfo_companies')
      .update({ ask_day: today, ask_count: used + 1 }).eq('id', companyId)
    const { data: won, error: updError } = await whereUnchanged(upd, row).select('id')
    if (updError) {
      console.error('cfo/ask: counter claim failed:', updError.message)
      return { ok: false, reason: 'error' }
    }
    if ((won ?? []).length > 0) return { ok: true, used }
    // Проиграли гонку — кто-то сдвинул счётчик раньше, перечитываем.
  }
  // Пять проигранных гонок подряд — это уже не человек.
  return { ok: false, reason: 'limit' }
}

/** Вернуть слот, занятый claimAskSlot (модель не ответила). Best-effort: наружу не бросает. */
export async function releaseAskSlot(supabase: SupabaseClient, companyId: string, today: string): Promise<void> {
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase.from('cfo_companies')
        .select('ask_day, ask_count').eq('id', companyId).maybeSingle()
      if (error || !data) return
      const row = data as CountRow
      // День уже сменился (ответ шёл через полночь) или счётчик на нуле — возвращать нечего.
      if (row.ask_day !== today || (row.ask_count ?? 0) <= 0) return
      const upd = supabase.from('cfo_companies')
        .update({ ask_count: (row.ask_count ?? 0) - 1 }).eq('id', companyId)
      const { data: won, error: updError } = await whereUnchanged(upd, row).select('id')
      if (updError) {
        console.error('cfo/ask: counter release failed:', updError.message)
        return
      }
      if ((won ?? []).length > 0) return
    }
  } catch (e) {
    console.error('cfo/ask: counter release threw:', e instanceof Error ? e.message : e)
  }
}
