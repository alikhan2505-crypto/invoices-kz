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

export async function createNicheCheck(query: string): Promise<string> {
  const { data, error } = await supabase
    .from('kaspi_niche_checks')
    .insert({ query, status: 'pending' })
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

export async function completeNicheCheck(id: string, result: NicheSummary): Promise<void> {
  const { error } = await supabase
    .from('kaspi_niche_checks')
    .update({ status: 'done', result })
    .eq('id', id)
  if (error) throw new Error(`kaspi_niche_checks complete failed for ${id}: ${error.message}`)
}

export async function failNicheCheck(id: string, message: string): Promise<void> {
  const { error } = await supabase
    .from('kaspi_niche_checks')
    .update({ status: 'error', error: message })
    .eq('id', id)
  if (error) throw new Error(`kaspi_niche_checks fail-update failed for ${id}: ${message}`)
}
