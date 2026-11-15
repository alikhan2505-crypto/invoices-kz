// Почта для аккаунта, созданного входом через WhatsApp: код на адрес, потом либо почта становится почтой
// аккаунта, либо (если такая почта уже есть) номер переезжает в тот аккаунт. См. supabase/migrations/account_email_claim.sql.

import { randomInt } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sha256Hex } from '@/lib/toolQuota'

export const CLAIM_CODE_LENGTH = 6
export const CLAIM_TTL_MS = 15 * 60_000
export const MAX_ATTEMPTS = 5

const iso = (ms: number) => new Date(ms).toISOString()
export const hashClaimCode = (userId: string, email: string, code: string) => sha256Hex(`claim|${userId}|${email}|${code}`)

export function generateClaimCode(): string {
  let out = ''
  for (let i = 0; i < CLAIM_CODE_LENGTH; i++) out += String(randomInt(10))
  return out
}

/** Выдать код на адрес. Прежние неиспользованные коды этого человека гасятся: действует только последний. */
export async function startEmailClaim(db: SupabaseClient, userId: string, email: string, now = Date.now()): Promise<string> {
  await db.from('email_claim_codes').update({ consumed_at: iso(now) }).eq('user_id', userId).is('consumed_at', null)
  const code = generateClaimCode()
  const { error } = await db.from('email_claim_codes').insert({
    user_id: userId,
    email,
    code_hash: hashClaimCode(userId, email, code),
    expires_at: iso(now + CLAIM_TTL_MS),
  })
  if (error) throw new Error(`email_claim_codes insert failed: ${error.message}`)
  return code
}

interface AdminApi {
  updateUserById(id: string, attrs: Record<string, unknown>): Promise<{ error: { message: string } | null }>
  deleteUser(id: string): Promise<{ error: { message: string } | null }>
  generateLink(params: Record<string, unknown>): Promise<{ data: { properties?: { action_link?: string } } | null; error: { message: string } | null }>
}

/** Аккаунт, только что созданный входом по WhatsApp и ещё ничем не заполненный: его не жалко заменить. */
export async function isDisposableAccount(db: SupabaseClient, userId: string): Promise<boolean> {
  // Любая ошибка чтения считается «не пустой»: сомневаемся, значит, не удаляем.
  const counts = await Promise.all(['invoices', 'wallet_ledger', 'kaspi_shop_connections', 'ai_agents'].map(async table => {
    const { count, error } = await db.from(table).select('id', { count: 'exact', head: true }).eq('user_id', userId)
    return error ? 1 : (count ?? 0)
  }))
  if (counts.some(c => c > 0)) return false
  const { data, error } = await db.from('profiles').select('company_name, bin_iin').eq('id', userId).maybeSingle()
  if (error) return false
  const p = data as { company_name?: string | null; bin_iin?: string | null } | null
  return !p?.company_name && !p?.bin_iin
}

export type VerifyResult =
  | { ok: true; mode: 'attached' }
  | { ok: true; mode: 'linked'; url: string }
  | { ok: false; reason: 'wrong_code' | 'expired' | 'too_many' | 'has_data' | 'other_has_number' | 'error' }

/**
 * Проверка кода. Попытки считаются на строке кода (5), код гасится одним условным UPDATE.
 * Дальше по состоянию адреса:
 * - адреса в invoices.kz нет: он становится почтой аккаунта (подтверждённой кодом), рассылки включаются;
 * - адрес принадлежит этому же аккаунту: ничего не меняем;
 * - адрес принадлежит другому аккаунту: человек доказал владение почтой, номер переезжает туда, пустой
 *   аккаунт-заготовка удаляется, выдаётся вход-ссылка в тот аккаунт. Если в заготовке уже есть данные
 *   или у того аккаунта уже привязан другой номер, ничего не трогаем и говорим об этом.
 */
export async function verifyEmailClaim(
  db: SupabaseClient, admin: AdminApi, p: { userId: string; email: string; code: string; redirectTo: string; now?: number },
): Promise<VerifyResult> {
  const now = p.now ?? Date.now()
  const email = p.email.trim().toLowerCase()
  try {
    const { data: row, error } = await db.from('email_claim_codes')
      .select('id, code_hash, attempts, expires_at')
      .eq('user_id', p.userId).eq('email', email).is('consumed_at', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw new Error(`claim read failed: ${error.message}`)
    const claim = row as { id: string; code_hash: string; attempts: number; expires_at: string } | null
    if (!claim || Date.parse(claim.expires_at) <= now) return { ok: false, reason: 'expired' }
    if (claim.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'too_many' }

    if (hashClaimCode(p.userId, email, p.code.trim()) !== claim.code_hash) {
      await db.from('email_claim_codes').update({ attempts: claim.attempts + 1 }).eq('id', claim.id).eq('attempts', claim.attempts)
      return { ok: false, reason: claim.attempts + 1 >= MAX_ATTEMPTS ? 'too_many' : 'wrong_code' }
    }
    // Верный код гасим один раз: параллельные запросы с одним кодом получат «просрочен».
    const { data: used, error: useErr } = await db.from('email_claim_codes')
      .update({ consumed_at: iso(now) }).eq('id', claim.id).is('consumed_at', null).select('id').maybeSingle()
    if (useErr) throw new Error(`claim consume failed: ${useErr.message}`)
    if (!used) return { ok: false, reason: 'expired' }

    const { data: ownerId, error: rpcErr } = await db.rpc('auth_user_id_by_email', { p_email: email })
    if (rpcErr) throw new Error(`email lookup failed: ${rpcErr.message}`)
    const owner = (ownerId as string | null) ?? null

    if (!owner || owner === p.userId) {
      const { error: upErr } = await admin.updateUserById(p.userId, { email, email_confirm: true })
      if (upErr) throw new Error(`updateUserById failed: ${upErr.message}`)
      const { error: profErr } = await db.from('profiles').update({ email, email_optout: false, notify_email: true }).eq('id', p.userId)
      if (profErr) console.error('account email: profile update failed:', profErr.message)
      return { ok: true, mode: 'attached' }
    }

    // Почта уже есть у другого аккаунта.
    if (!(await isDisposableAccount(db, p.userId))) return { ok: false, reason: 'has_data' }
    const { data: ownerNumber } = await db.from('whatsapp_identities').select('wa_id').eq('user_id', owner).maybeSingle()
    if (ownerNumber) return { ok: false, reason: 'other_has_number' }

    const { error: moveErr } = await db.from('whatsapp_identities').update({ user_id: owner }).eq('user_id', p.userId)
    if (moveErr) throw new Error(`identity move failed: ${moveErr.message}`)
    // Телефон в профиле того аккаунта не трогаем: там может быть телефон компании. Заготовку помечаем удалённой
    // (как делает удаление аккаунта) и убираем из Auth; строка профиля остаётся по тому же правилу мягкого удаления.
    await db.from('profiles').update({ deleted_at: iso(now) }).eq('id', p.userId)
    const { error: delErr } = await admin.deleteUser(p.userId)
    if (delErr) console.error('account email: placeholder delete failed:', delErr.message)

    const { data: link, error: linkErr } = await admin.generateLink({ type: 'magiclink', email, options: { redirectTo: p.redirectTo } })
    const url = link?.properties?.action_link
    if (linkErr || !url) throw new Error(`generateLink failed: ${linkErr?.message ?? 'no action_link'}`)
    return { ok: true, mode: 'linked', url }
  } catch (e) {
    console.error('account email: verify failed:', e instanceof Error ? e.message : e)
    return { ok: false, reason: 'error' }
  }
}
