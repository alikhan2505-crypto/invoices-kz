import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptAtRest } from '@/lib/kaspiPay/crypto'
import { getKey } from './connection'
import { sendTelegramBotMessage } from './telegram'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { sendDirectMessage } from '@/lib/instagram'

// Sends one plain-text message into a conversation via its channel's
// active connection, and records it as an outbound ai_agent_messages row
// so the dialog history shows it. Shared by invoiceSend.ts (invoice
// links) and the dialogs reply route (manual operator replies) --
// extracted here since a second feature now needs it. Returns null on
// success, an error string on failure (caller decides how to surface it).
export async function sendIntoConversation(
  supabase: SupabaseClient,
  conversation: { id: string; channel: string; external_thread_id: string; agent_id: string },
  text: string,
): Promise<string | null> {
  const { data: connection } = await supabase.from('ai_agent_channel_connections')
    .select('external_account_id, access_token_enc, status')
    .eq('agent_id', conversation.agent_id)
    .eq('channel', conversation.channel)
    .eq('status', 'active')
    .maybeSingle()
  if (!connection) return `нет активного подключения канала ${conversation.channel}`

  try {
    const accessToken = decryptAtRest(connection.access_token_enc, getKey()).toString('utf8')
    if (conversation.channel === 'telegram') {
      await sendTelegramBotMessage(accessToken, conversation.external_thread_id, text)
    } else if (conversation.channel === 'whatsapp') {
      await sendWhatsAppMessage(connection.external_account_id, conversation.external_thread_id, text, { accessToken })
    } else if (conversation.channel === 'instagram') {
      await sendDirectMessage(conversation.external_thread_id, text, {
        igUserId: connection.external_account_id,
        accessToken,
      })
    } else if (conversation.channel === 'website') {
      // No external send API for this channel -- the outbound row inserted
      // below IS the delivery mechanism (the widget's own poll picks it up).
    } else {
      return `неизвестный канал ${conversation.channel}`
    }
  } catch (err: any) {
    return String(err?.message || err)
  }

  await supabase.from('ai_agent_messages').insert({
    conversation_id: conversation.id,
    direction: 'outbound',
    text,
    is_ai_generated: false,
    status: 'sent',
  })
  return null
}
