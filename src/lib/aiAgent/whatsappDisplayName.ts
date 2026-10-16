import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptAtRest } from '@/lib/kaspiPay/crypto'
import { getKey } from './connection'
import { getWhatsAppDisplayPhoneNumber } from '@/lib/whatsapp'

// Номер WhatsApp для чипа «Подключено: …». До 15.10.2026 callback получал
// displayPhoneNumber, но в external_account_name не записывал, и после
// перезагрузки страницы чип показывал просто «WhatsApp». Новые подключения
// пишут номер сразу (whatsapp/callback); эта функция лениво дозаполняет уже
// существующие строки без номера, когда список каналов загружается в
// настройках агента. Один запрос к Graph API на подключение и только пока
// номера нет -- после первой удачи строка больше сюда не попадает.
// Best-effort: любая ошибка (токен отозван, Meta недоступна) просто
// оставляет чип как был.
export async function backfillWhatsAppDisplayName(
  supabase: SupabaseClient,
  agentId: string,
): Promise<string | null> {
  try {
    const { data: conn } = await supabase
      .from('ai_agent_channel_connections')
      .select('id, external_account_id, external_account_name, access_token_enc, status')
      .eq('agent_id', agentId)
      .eq('channel', 'whatsapp')
      .eq('status', 'active')
      .maybeSingle()
    if (!conn || conn.external_account_name || !conn.external_account_id || !conn.access_token_enc) return null
    const accessToken = decryptAtRest(conn.access_token_enc, getKey()).toString('utf8')
    const display = await getWhatsAppDisplayPhoneNumber(conn.external_account_id, accessToken)
    if (!display) return null
    await supabase
      .from('ai_agent_channel_connections')
      .update({ external_account_name: display })
      .eq('id', conn.id)
      .is('external_account_name', null)
    return display
  } catch (err: any) {
    console.error('ai-agent: WhatsApp display number backfill failed for agent', agentId, ':', err?.message || err)
    return null
  }
}
