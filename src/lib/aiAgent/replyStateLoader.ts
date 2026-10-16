import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { agentReplyState, type AgentReplyState } from './planGate'

// Состояние агента для маршрутов вебхуков (A1, 16.10.2026). Маршруты сами
// отвечают «не понимаю такой формат» на стикеры/видео/документы и сами
// скачивают фото и расшифровывают голосовые (Whisper -- платный) ДО вызова
// обработчика, а проверка agentReplyState была только в обработчике. Поэтому
// агент-черновик и агент владельца с кончившимся Про всё равно отвечали
// заготовкой, а голосовые расшифровывались впустую. Теперь маршрут узнаёт
// состояние один раз на агента за доставку и решает до скачивания.
//
// Модуль серверный (service-role клиент), в отличие от planGate.ts.

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type ReplyStateLoader = (agentId: string) => Promise<AgentReplyState>

// Один загрузчик на запрос: в одной доставке Meta бывает несколько сообщений
// одному агенту, состояние читается один раз.
export function createReplyStateLoader(supabase: SupabaseClient = serviceClient): ReplyStateLoader {
  const cache = new Map<string, Promise<AgentReplyState>>()
  return (agentId: string) => {
    let pending = cache.get(agentId)
    if (!pending) {
      pending = (async (): Promise<AgentReplyState> => {
        const { data: agent, error } = await supabase
          .from('ai_agents')
          .select('is_enabled, user_id')
          .eq('id', agentId)
          .maybeSingle()
        if (error) {
          console.error('ai-agent: agent lookup for reply gate failed for', agentId, ':', error.message)
          return 'unknown'
        }
        return agentReplyState(supabase, agent)
      })()
      cache.set(agentId, pending)
    }
    return pending
  }
}
