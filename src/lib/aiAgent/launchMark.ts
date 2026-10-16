import type { SupabaseClient } from '@supabase/supabase-js'
import { isMissingColumnError } from './setupWizard'

// Канал подключили к уже ВКЛЮЧЁННОМУ агенту, у которого пустой launched_at
// (A4, 16.10.2026): старый агент без канала, получивший канал через
// настройки, -- он уже отвечает клиентам, значит, запущен. Без этой отметки в
// списке у работающего агента висел бы «Черновик», а «Запустить» в мастере
// перевело бы режим «обучение» в «сразу».
//
// Черновик мастера создаётся выключенным -- его это не касается: запускает
// его только кнопка «Запустить». Best-effort: до миграции ai_agent_launch.sql
// колонки нет (PGRST204/42703) -- молча ничего; любая ошибка подключение не
// ломает.
export async function markLaunchedIfLive(supabase: SupabaseClient, agentId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('ai_agents')
      .update({ launched_at: new Date().toISOString() })
      .eq('id', agentId)
      // null в is_enabled (строка до колонки) читается как «включён».
      .not('is_enabled', 'is', false)
      .is('launched_at', null)
    if (error && !isMissingColumnError(error, 'launched_at')) {
      console.error('ai-agent: launched_at mark on connect failed for', agentId, ':', error.message)
    }
  } catch (err: any) {
    console.error('ai-agent: launched_at mark on connect failed for', agentId, ':', err?.message || err)
  }
}
