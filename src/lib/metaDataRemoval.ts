import type { SupabaseClient } from '@supabase/supabase-js'
import { parseMetaSignedRequest } from './metaSignedRequest'

// Обратные вызовы Meta «Отзыв доступа» (deauthorize) и «Запрос удаления данных» (data deletion).
// Обязательны для приложения в публичном режиме: страница /data-deletion обещает, что отзыв доступа
// на стороне Meta удаляет сохранённый токен. Здесь это и делается: подключения каналов
// (Instagram, WhatsApp) этого пользователя Meta стираются вместе с зашифрованным токеном.
// Остальные данные аккаунта удаляются по письму (раздел 1 страницы /data-deletion).

const CHANNELS = ['instagram', 'whatsapp']

export interface MetaRemovalResult {
  ok: boolean
  /** Сколько подключений каналов удалено. */
  removed: number
  userId: string | null
}

export async function removeMetaConnections(supabase: SupabaseClient, formData: FormData | URLSearchParams): Promise<MetaRemovalResult> {
  const payload = parseMetaSignedRequest(formData.get('signed_request'), [process.env.INSTAGRAM_APP_SECRET, process.env.WHATSAPP_APP_SECRET])
  if (!payload) return { ok: false, removed: 0, userId: null }

  const { data, error } = await supabase
    .from('ai_agent_channel_connections')
    .delete()
    .in('channel', CHANNELS)
    .eq('external_account_id', payload.userId)
    .select('id')
  if (error) {
    // Без текста ошибки наружу: в лог только код/сообщение базы. Meta повторит вызов.
    console.error('meta data removal: delete failed:', error.message)
    return { ok: false, removed: 0, userId: payload.userId }
  }
  return { ok: true, removed: data?.length ?? 0, userId: payload.userId }
}
