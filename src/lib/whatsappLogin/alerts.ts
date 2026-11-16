// Тревоги основателю по входу через WhatsApp (кроме обрыва связи с номером: он в health.ts).

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendFounderTelegram } from '@/lib/founderTelegram'
import { claimWindowSlot, hourBucket, windowKey } from '@/lib/windowLimits'
import { maskWaId } from './link'

/** Тревог об отказе отправки в час: при обрыве связи их может быть много, одна-две в час хватает. */
export const SEND_FAILURE_ALERTS_PER_HOUR = 2

export function sendFailureAlertText(i: { waId: string; kind: 'login' | 'link'; reason: string; released: boolean }): string {
  const what = i.kind === 'login' ? 'ссылку для входа' : 'код привязки'
  return `⚠ Вход через WhatsApp: не удалось отправить ${what} на ${maskWaId(i.waId)}.\n`
    + `Причина: ${i.reason}\n`
    + (i.released
      ? 'Код возвращён: человек может отправить то же сообщение ещё раз, пока код не истёк.'
      : 'Код вернуть не удалось: человеку нужно нажать кнопку входа заново.')
}

/** Не бросает. Лимит держит одну-две тревоги в час, чтобы при обрыве связи не завалить Telegram. */
export async function alertSendFailure(
  db: SupabaseClient,
  info: { waId: string; kind: 'login' | 'link'; reason: string; released: boolean },
): Promise<void> {
  try {
    const slot = await claimWindowSlot(db, windowKey('walogin-send-fail', 'founder', hourBucket()), SEND_FAILURE_ALERTS_PER_HOUR)
    if (!slot.ok && slot.reason === 'limit') return
    const sent = await sendFounderTelegram(sendFailureAlertText(info))
    if (!sent.ok) console.error('whatsapp login: send-failure alert not delivered:', sent.reason)
  } catch (e) {
    console.error('whatsapp login: send-failure alert failed:', e instanceof Error ? e.message : e)
  }
}
