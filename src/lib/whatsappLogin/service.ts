// Вход через WhatsApp: работа с таблицами whatsapp_login_codes и whatsapp_identities.
// Клиент базы передаётся снаружи (service role), поэтому всё проверяется тестами с фейком.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CODE_TTL_MS, TOKEN_TTL_MS, generateLinkToken, generateLoginCode, hashSecret, placeholderEmailFor,
  type LoginMeta,
} from './helpers'

const iso = (ms: number) => new Date(ms).toISOString()

/** Выдать код для кнопки «Войти через WhatsApp». Возвращает сам код (в базе только его хеш). */
export async function createLoginCode(db: SupabaseClient, meta: LoginMeta, now = Date.now()): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateLoginCode()
    const { error } = await db.from('whatsapp_login_codes').insert({
      code_hash: hashSecret(code),
      meta,
      expires_at: iso(now + CODE_TTL_MS),
    })
    if (!error) return code
    if (error.code !== '23505') throw new Error(`whatsapp_login_codes insert failed: ${error.message}`)
  }
  throw new Error('whatsapp_login_codes: code collision, 3 attempts')
}

export type ClaimResult = { token: string } | null

/**
 * Пришло сообщение «Вход <код>»: один условный UPDATE переводит код из pending в sent и выдаёт токен для
 * ссылки. Второе сообщение с тем же кодом (или просроченный код) ничего не находит и возвращает null:
 * ссылку можно получить по коду только один раз.
 */
export async function claimLoginCode(db: SupabaseClient, code: string, waId: string, now = Date.now()): Promise<ClaimResult> {
  const token = generateLinkToken()
  const { data, error } = await db
    .from('whatsapp_login_codes')
    .update({ status: 'sent', wa_id: waId, token_hash: hashSecret(token), token_expires_at: iso(now + TOKEN_TTL_MS) })
    .eq('code_hash', hashSecret(code))
    .eq('purpose', 'login')
    .eq('status', 'pending')
    .gt('expires_at', iso(now))
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`whatsapp_login_codes claim failed: ${error.message}`)
  return data ? { token } : null
}

/**
 * Ответ со ссылкой не ушёл человеку: код возвращается из sent в pending (пока не истёк), и то же сообщение
 * «Вход <код>» можно отправить ещё раз. Условие по wa_id и статусу: уже открытую ссылку (consumed) не трогаем.
 * Возвращает true, если код вернули.
 */
export async function releaseClaim(db: SupabaseClient, code: string, waId: string): Promise<boolean> {
  const { data, error } = await db
    .from('whatsapp_login_codes')
    .update({ status: 'pending', wa_id: null, token_hash: null, token_expires_at: null, confirm_hash: null })
    .eq('code_hash', hashSecret(code))
    .eq('status', 'sent')
    .eq('wa_id', waId)
    .select('id')
    .maybeSingle()
  if (error) {
    console.error('whatsapp login: release claim failed:', error.message)
    return false
  }
  return !!data
}

interface AdminApi {
  createUser(attrs: Record<string, unknown>): Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>
  getUserById(id: string): Promise<{ data: { user: { email?: string | null } | null }; error: { message: string } | null }>
  deleteUser(id: string): Promise<{ error: { message: string } | null }>
  generateLink(params: Record<string, unknown>): Promise<{ data: { properties?: { action_link?: string } } | null; error: { message: string } | null }>
}

async function identityUserId(db: SupabaseClient, waId: string): Promise<string | null> {
  const { data, error } = await db.from('whatsapp_identities').select('user_id').eq('wa_id', waId).maybeSingle()
  if (error) throw new Error(`whatsapp_identities read failed: ${error.message}`)
  return (data as { user_id?: string } | null)?.user_id ?? null
}

/** Аккаунт этого номера: существующий или новый (с пробным периодом, как у любой регистрации, через /auth/callback). */
export async function ensureUserForWaId(db: SupabaseClient, admin: AdminApi, waId: string, meta: LoginMeta): Promise<string> {
  const existing = await identityUserId(db, waId)
  if (existing) return existing

  const email = placeholderEmailFor(waId)
  const created = await admin.createUser({
    email,
    email_confirm: true,
    // Те же ключи, что у письма: /auth/callback достаёт их из user_metadata у нового аккаунта.
    user_metadata: { ...meta, wa_login: true, wa_phone: `+${waId}` },
  })
  let userId = created.data.user?.id ?? null
  if (!userId) {
    // Сбой между созданием пользователя и записью номера в прошлый раз: пользователь есть, привязки нет.
    // Профиль создан триггером и пока хранит тот же служебный адрес.
    const { data } = await db.from('profiles').select('id').eq('email', email).maybeSingle()
    userId = (data as { id?: string } | null)?.id ?? null
    if (!userId) throw new Error(`whatsapp login: createUser failed: ${created.error?.message ?? 'unknown'}`)
  }

  const { error: linkError } = await db.from('whatsapp_identities').insert({ wa_id: waId, user_id: userId })
  if (linkError) {
    if (linkError.code === '23505') {
      // Параллельный вход этого же номера успел раньше: берём его аккаунт, свой лишний убираем.
      const winner = await identityUserId(db, waId)
      if (winner && winner !== userId) {
        await admin.deleteUser(userId).catch(() => {})
        return winner
      }
      if (winner) return winner
    }
    throw new Error(`whatsapp_identities insert failed: ${linkError.message}`)
  }

  // Служебный адрес в профиле не нужен: письма туда не отправить, рассылки отключаем. Не критично для входа.
  const { error: profileError } = await db
    .from('profiles')
    .update({ email: null, email_optout: true, notify_email: false, phone: `+${waId}` })
    .eq('id', userId)
  if (profileError) console.error('whatsapp login: profile cleanup failed:', profileError.message)
  return userId
}

export type ExchangeResult = { ok: true; url: string } | { ok: false; reason: 'invalid' | 'error' }

/**
 * Человек открыл ссылку из WhatsApp: токен гасится одним условным UPDATE (sent → consumed), создаётся или
 * находится аккаунт номера и выдаётся обычная вход-ссылка Supabase. Дальше всё как после письма:
 * /auth/callback заводит пробный период, тур и маршрут после входа.
 */
export async function exchangeLoginToken(
  db: SupabaseClient, admin: AdminApi, token: string, redirectTo: string, now = Date.now(),
): Promise<ExchangeResult> {
  const { data, error } = await db
    .from('whatsapp_login_codes')
    .update({ status: 'consumed', consumed_at: iso(now) })
    .eq('token_hash', hashSecret(token))
    .eq('status', 'sent')
    .gt('token_expires_at', iso(now))
    .select('wa_id, meta')
    .maybeSingle()
  if (error) {
    console.error('whatsapp login: token update failed:', error.message)
    return { ok: false, reason: 'error' }
  }
  const row = data as { wa_id?: string; meta?: LoginMeta } | null
  if (!row?.wa_id) return { ok: false, reason: 'invalid' }

  try {
    const userId = await ensureUserForWaId(db, admin, row.wa_id, row.meta ?? {})
    const { data: u, error: uErr } = await admin.getUserById(userId)
    const email = u.user?.email
    if (uErr || !email) throw new Error(`user email not found: ${uErr?.message ?? 'empty'}`)
    const { data: link, error: linkErr } = await admin.generateLink({ type: 'magiclink', email, options: { redirectTo } })
    const url = link?.properties?.action_link
    if (linkErr || !url) throw new Error(`generateLink failed: ${linkErr?.message ?? 'no action_link'}`)
    return { ok: true, url }
  } catch (e) {
    console.error('whatsapp login: exchange failed:', e instanceof Error ? e.message : e)
    return { ok: false, reason: 'error' }
  }
}
