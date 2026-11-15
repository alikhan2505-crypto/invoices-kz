// Привязка WhatsApp-номера к существующему аккаунту из профиля. Код привязки (в чат номера входа) и 6-значный
// код подтверждения (из ответа в WhatsApp, вводится в кабинете): номер привязывается к тому, кто ввёл код.
// Так «отправь этот код» от чужого аккаунта не срабатывает: человек видит предупреждение в самом ответе.

import type { SupabaseClient } from '@supabase/supabase-js'
import { CODE_TTL_MS, TOKEN_TTL_MS, generateConfirmCode, generateLoginCode, hashSecret } from './helpers'

const iso = (ms: number) => new Date(ms).toISOString()
export const MAX_CONFIRM_ATTEMPTS = 5

const confirmHash = (userId: string, code: string) => hashSecret(`linkconfirm|${userId}|${code}`)

/** Номер, привязанный к аккаунту, или null. */
export async function linkedWaId(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await db.from('whatsapp_identities').select('wa_id').eq('user_id', userId).maybeSingle()
  if (error) throw new Error(`whatsapp_identities read failed: ${error.message}`)
  return (data as { wa_id?: string } | null)?.wa_id ?? null
}

/** Выдать код «Привязать <код>» для кнопки в профиле. Прежние неподтверждённые коды человека гасятся. */
export async function createLinkCode(db: SupabaseClient, userId: string, now = Date.now()): Promise<string> {
  await db.from('whatsapp_login_codes').update({ status: 'consumed', consumed_at: iso(now) })
    .eq('link_user_id', userId).eq('purpose', 'link').neq('status', 'consumed')
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateLoginCode()
    const { error } = await db.from('whatsapp_login_codes').insert({
      code_hash: hashSecret(code), purpose: 'link', link_user_id: userId, meta: {}, expires_at: iso(now + CODE_TTL_MS),
    })
    if (!error) return code
    if (error.code !== '23505') throw new Error(`whatsapp_login_codes insert failed: ${error.message}`)
  }
  throw new Error('whatsapp_login_codes: code collision, 3 attempts')
}

/** Пришло «Привязать <код>»: код переходит pending → sent, выдаётся 6-значный код подтверждения. */
export async function claimLinkCode(db: SupabaseClient, code: string, waId: string, now = Date.now()): Promise<{ confirm: string } | null> {
  const confirm = generateConfirmCode()
  const { data: row, error: readErr } = await db.from('whatsapp_login_codes')
    .select('id, link_user_id').eq('code_hash', hashSecret(code)).eq('purpose', 'link').eq('status', 'pending').gt('expires_at', iso(now)).maybeSingle()
  if (readErr) throw new Error(`whatsapp_login_codes read failed: ${readErr.message}`)
  const found = row as { id: string; link_user_id: string } | null
  if (!found?.link_user_id) return null
  const { data, error } = await db.from('whatsapp_login_codes')
    .update({ status: 'sent', wa_id: waId, confirm_hash: confirmHash(found.link_user_id, confirm), token_expires_at: iso(now + TOKEN_TTL_MS) })
    .eq('id', found.id).eq('status', 'pending').select('id').maybeSingle()
  if (error) throw new Error(`whatsapp_login_codes claim failed: ${error.message}`)
  return data ? { confirm } : null
}

export type ConfirmResult =
  | { ok: true; waId: string }
  | { ok: false; reason: 'wrong_code' | 'expired' | 'too_many' | 'taken' | 'already_linked' | 'error' }

/** Человек ввёл 6-значный код в кабинете: номер привязывается к его аккаунту. */
export async function confirmLink(db: SupabaseClient, userId: string, code: string, now = Date.now()): Promise<ConfirmResult> {
  try {
    const { data: row, error } = await db.from('whatsapp_login_codes')
      .select('id, wa_id, confirm_hash, confirm_attempts, token_expires_at')
      .eq('link_user_id', userId).eq('purpose', 'link').eq('status', 'sent')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw new Error(`read failed: ${error.message}`)
    const r = row as { id: string; wa_id: string; confirm_hash: string; confirm_attempts: number; token_expires_at: string } | null
    if (!r || Date.parse(r.token_expires_at) <= now) return { ok: false, reason: 'expired' }
    if (r.confirm_attempts >= MAX_CONFIRM_ATTEMPTS) return { ok: false, reason: 'too_many' }
    if (confirmHash(userId, code.trim()) !== r.confirm_hash) {
      await db.from('whatsapp_login_codes').update({ confirm_attempts: r.confirm_attempts + 1 }).eq('id', r.id).eq('confirm_attempts', r.confirm_attempts)
      return { ok: false, reason: r.confirm_attempts + 1 >= MAX_CONFIRM_ATTEMPTS ? 'too_many' : 'wrong_code' }
    }
    // Верный код гасим один раз.
    const { data: used, error: useErr } = await db.from('whatsapp_login_codes')
      .update({ status: 'consumed', consumed_at: iso(now) }).eq('id', r.id).eq('status', 'sent').select('id').maybeSingle()
    if (useErr) throw new Error(`consume failed: ${useErr.message}`)
    if (!used) return { ok: false, reason: 'expired' }

    if (await linkedWaId(db, userId)) return { ok: false, reason: 'already_linked' }
    const { error: insErr } = await db.from('whatsapp_identities').insert({ wa_id: r.wa_id, user_id: userId })
    if (insErr) {
      if (insErr.code === '23505') return { ok: false, reason: 'taken' } // номер уже привязан к другому аккаунту
      throw new Error(`identity insert failed: ${insErr.message}`)
    }
    return { ok: true, waId: r.wa_id }
  } catch (e) {
    console.error('whatsapp link: confirm failed:', e instanceof Error ? e.message : e)
    return { ok: false, reason: 'error' }
  }
}

/** Отвязать номер от аккаунта. */
export async function unlinkWhatsApp(db: SupabaseClient, userId: string): Promise<void> {
  const { error } = await db.from('whatsapp_identities').delete().eq('user_id', userId)
  if (error) throw new Error(`whatsapp_identities delete failed: ${error.message}`)
}

/** Показ номера без середины: +7•••0406. */
export function maskWaId(waId: string): string {
  return `+${waId.slice(0, 1)}•••${waId.slice(-4)}`
}
