// DB access for the on-demand niche-check relay (see
// docs/superpowers/specs/2026-08-14-kaspi-shop-niches-design.md). The
// kaspi_niche_checks table already exists in production (migration
// kaspi_niche_checks_table) with RLS enabled and no policies -- only
// reachable via the service-role key, same as connection.ts's pattern.
import { createClient } from '@supabase/supabase-js'
import type { NicheSummary } from './niches'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type NicheCheckStatus = 'pending' | 'done' | 'error'

export type NicheCheck = {
  status: NicheCheckStatus
  result: NicheSummary | null
  error: string | null
}

export async function createNicheCheck(query: string, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('kaspi_niche_checks')
    .insert({ query, status: 'pending', user_id: userId })
    .select('id')
    .single()
  if (error) throw new Error(`kaspi_niche_checks insert failed: ${error.message}`)
  return data.id
}

export async function getNicheCheck(id: string): Promise<NicheCheck | null> {
  const { data, error } = await supabase
    .from('kaspi_niche_checks')
    .select('status, result, error')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`kaspi_niche_checks lookup failed for ${id}: ${error.message}`)
  if (!data) return null
  return { status: data.status, result: data.result, error: data.error }
}

// Returns the check's own user_id (whoever requested it) so the caller can
// debit the right wallet for a completed, billable check -- older rows
// (before this column existed) have no owner and are never charged.
//
// Идемпотентность (аудит 14.11.2026): строка переводится в 'done' одним условным UPDATE
// (status <> 'done'). Повторная доставка того же результата (ретрай воркера, дубль
// вебхука, параллельные доставки) не находит строку и возвращает firstCompletion=false:
// вызывающий не списывает деньги второй раз. Списывает только тот вызов, который
// действительно закрыл проверку.
export async function completeNicheCheck(
  id: string,
  result: NicheSummary,
): Promise<{ userId: string | null; query: string; firstCompletion: boolean }> {
  const { data, error } = await supabase
    .from('kaspi_niche_checks')
    .update({ status: 'done', result })
    .eq('id', id)
    .neq('status', 'done')
    .select('user_id, query')
    .maybeSingle()
  if (error) throw new Error(`kaspi_niche_checks complete failed for ${id}: ${error.message}`)
  if (!data) return { userId: null, query: '', firstCompletion: false }
  return { userId: data.user_id ?? null, query: data.query ?? '', firstCompletion: true }
}

export async function failNicheCheck(id: string, message: string): Promise<void> {
  const { error } = await supabase
    .from('kaspi_niche_checks')
    .update({ status: 'error', error: message })
    .eq('id', id)
    .neq('status', 'done') // поздняя доставка ошибки не затирает уже сохранённый результат
  if (error) throw new Error(`kaspi_niche_checks fail-update failed for ${id}: ${message}`)
}
