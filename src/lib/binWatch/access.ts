// Доступ к API слежения: кто вызывает и есть ли у него функция. Общий для
// /api/bin-watch (GET/POST/DELETE); чистая часть решения - canUseBinWatch/binWatchLimit.

import type { SupabaseClient } from '@supabase/supabase-js'
import { bearerUserId } from '@/lib/toolQuota'
import { binWatchLimit, canUseBinWatch } from './config'

export const ACCESS_PROFILE_COLUMNS = 'is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at, deleted_at'

export type Access =
  | { ok: true; userId: string; isAdmin: boolean; limit: number }
  | { ok: false; status: 401 | 403 | 503; error: 'unauthorized' | 'admin_only' | 'account_deleted' | 'unavailable' }

/**
 * Личность - только из Bearer-токена сессии (user_id никогда не берётся из тела
 * запроса). Профиль читается service-role по этому id.
 * requireFeature=false: для удаления своей строки гейт не нужен.
 */
export async function resolveAccess(
  supabase: SupabaseClient,
  headers: Headers,
  { requireFeature = true }: { requireFeature?: boolean } = {},
  now: Date = new Date(),
): Promise<Access> {
  const userId = await bearerUserId(supabase, headers)
  if (!userId) return { ok: false, status: 401, error: 'unauthorized' }
  const { data, error } = await supabase.from('profiles').select(ACCESS_PROFILE_COLUMNS).eq('id', userId).maybeSingle()
  if (error) return { ok: false, status: 503, error: 'unavailable' }
  const profile = data as { is_admin?: boolean | null; deleted_at?: string | null } | null
  if (!profile || profile.deleted_at) return { ok: false, status: 403, error: 'account_deleted' }
  const isAdmin = profile.is_admin === true
  if (requireFeature && !canUseBinWatch(isAdmin)) return { ok: false, status: 403, error: 'admin_only' }
  return { ok: true, userId, isAdmin, limit: binWatchLimit(profile, now) }
}
