// Как назвать нового человека в Telegram-пинге о регистрации. У вошедшего по WhatsApp почты нет, и пинг
// «без email» ничего не говорит: вместо этого пишем «через WhatsApp +7•••0406».

import type { SupabaseClient } from '@supabase/supabase-js'
import { maskWaId } from './link'
import { realEmailOrNull } from './placeholderEmail'

export interface SignupLabelOpts {
  /** Сколько раз перечитать привязку номера, если её ещё нет (хук приходит почти одновременно с созданием аккаунта). */
  retries?: number
  delayMs?: number
  sleep?: (ms: number) => Promise<void>
}

/** Возвращает подпись без экранирования: экранирует вызывающий. */
export async function signupLabel(
  db: SupabaseClient, userId: string, profileEmail: unknown, opts: SignupLabelOpts = {},
): Promise<string> {
  const email = realEmailOrNull(profileEmail)
  if (email) return email

  const retries = opts.retries ?? 2
  const delayMs = opts.delayMs ?? 1000
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)))
  for (let attempt = 0; attempt <= retries; attempt++) {
    const { data } = await db.from('whatsapp_identities').select('wa_id').eq('user_id', userId).maybeSingle()
    const waId = (data as { wa_id?: string } | null)?.wa_id
    if (waId) return `через WhatsApp ${maskWaId(waId)}`
    if (attempt < retries) await sleep(delayMs)
  }
  return 'без email'
}
