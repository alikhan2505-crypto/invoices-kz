import type { SupabaseClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'
import { sendTelegramNotification } from '@/lib/telegramNotify'
import { escapeHtml } from '@/lib/htmlEscape'
import {
  agentRowShouldExitTraining,
  trainingDayClockMayHaveRun,
  TRAINING_MESSAGE_THRESHOLD,
  type TrainingAgentRow,
} from './trainingStatus'
import { aiAgentUrl } from './links'

// Выход из режима обучения, проверяемый там, где он реально что-то решает:
// при обработке нового входящего сообщения, прямо перед развилкой
// «черновик на проверку или отправить клиенту», и после решения владельца
// по черновику в очереди проверки (review/route.ts).
//
// Почему не ежедневный крон: обещание «N одобрений или D дней» касается
// только того, как агент ответит следующему клиенту. Проверка на входящем
// срабатывает ровно в этот момент, без задержки до суток и без отдельной
// инфраструктуры; агента, которому никто не пишет, переключать незачем.
//
// Срок в днях идёт от первого черновика на проверку, не от создания агента
// (см. agentRowShouldExitTraining). Открытие настроек агента статус больше не
// меняет (до 16.10.2026 GET настроек тоже переключал агента -- молча).
//
// Возвращает true, если агент только что вышел из обучения; вызывающий код
// тогда обращается с ним как с активным уже на этом сообщении. Условное
// обновление (.eq('status', 'training')) не перетирает ручную паузу,
// поставленную параллельно, и гарантирует, что из двух одновременных
// входящих переключит (и уведомит владельца) только один. При ошибке записи
// агент остаётся в обучении -- черновик на проверку безопаснее, чем ответ
// клиенту без подтверждения.

export type TrainingExitAgent = TrainingAgentRow & { id: string; user_id: string; name?: string | null }

// Самый ранний ответ агента, ушедший на проверку. Пока агент в обучении,
// любой его ответ ИИ -- это черновик (is_ai_generated), а заготовка при
// пустом кошельке пишется с is_ai_generated = false, но остаётся
// pending_review/skipped, пока её не одобрили. Агент в обучение не
// возвращается (статус 'training' бывает только с момента создания), так что
// «отправленных напрямую» ответов ИИ у него быть не может.
export async function firstReviewDraftAt(supabase: SupabaseClient, agentId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('ai_agent_messages')
    .select('created_at, ai_agent_conversations!inner(agent_id)')
    .eq('ai_agent_conversations.agent_id', agentId)
    .eq('direction', 'outbound')
    .or('is_ai_generated.eq.true,status.in.(pending_review,skipped)')
    .order('created_at', { ascending: true })
    .limit(1)
  if (error) {
    console.error('ai-agent: first review draft lookup failed for agent', agentId, ':', error.message)
    return null
  }
  return (data?.[0] as { created_at?: string } | undefined)?.created_at ?? null
}

// Чистое решение «пора ли» с ленивым запросом первого черновика: запрос
// идёт только когда порог по одобрениям не набран и срок вообще мог пройти.
export async function trainingExitDue(supabase: SupabaseClient, agent: TrainingAgentRow & { id: string }, now: Date = new Date()): Promise<boolean> {
  if (agent.status !== 'training') return false
  if ((agent.training_message_count ?? 0) >= TRAINING_MESSAGE_THRESHOLD) return true
  if (!trainingDayClockMayHaveRun(agent, now)) return false
  const firstDraftAt = await firstReviewDraftAt(supabase, agent.id)
  return agentRowShouldExitTraining(agent, now, firstDraftAt)
}

export function trainingExitNotificationTitle(agentName: string | null | undefined): string {
  const name = (agentName || '').trim() || 'ИИ-агент'
  return `Агент «${name}» вышел из обучения и теперь отвечает клиентам сам`
}

export function trainingExitSettingsUrl(agentId: string): string {
  return aiAgentUrl(`/ai-agent/settings?${new URLSearchParams({ agent: agentId, tab: 'control' }).toString()}`)
}

// Колокольчик + Telegram (если подключён). Best-effort: никогда не бросает.
export async function notifyOwnerTrainingExit(supabase: SupabaseClient, agent: TrainingExitAgent): Promise<void> {
  try {
    const title = trainingExitNotificationTitle(agent.name)
    const reason = (agent.training_message_count ?? 0) >= TRAINING_MESSAGE_THRESHOLD
      ? `Вы одобрили ${TRAINING_MESSAGE_THRESHOLD} черновиков.`
      : 'Прошла неделя с первого черновика на проверке.'
    const body = `${reason} Ответы больше не ждут вашей проверки и сразу уходят клиентам. Приостановить агента можно в его настройках.`
    const link = trainingExitSettingsUrl(agent.id)
    await createNotification(agent.user_id, title, body, link)

    const { data: profile } = await supabase.from('profiles').select('telegram_chat_id, notify_telegram').eq('id', agent.user_id).maybeSingle()
    if (profile?.notify_telegram && profile.telegram_chat_id) {
      // parse_mode HTML: имя агента и «&» в адресе экранируются.
      await sendTelegramNotification(profile.telegram_chat_id, `${escapeHtml(title)}. ${escapeHtml(reason)} Настройки агента: ${escapeHtml(link)}`, { timeoutMs: 5000 })
    }
  } catch (err: any) {
    console.error('ai-agent: training-exit owner notification failed for agent', agent.id, ':', err?.message || err)
  }
}

// Переключает training -> active, если пора, и один раз сообщает владельцу.
export async function exitTrainingIfDue(
  supabase: SupabaseClient,
  agent: TrainingExitAgent,
  now: Date = new Date(),
): Promise<boolean> {
  if (!(await trainingExitDue(supabase, agent, now))) return false
  const { data, error } = await supabase
    .from('ai_agents')
    .update({ status: 'active' })
    .eq('id', agent.id)
    .eq('status', 'training')
    .select('id')
  if (error) {
    console.error('ai-agent: training exit update failed for agent', agent.id, ':', error.message)
    return false
  }
  const exited = !!data && data.length > 0
  if (exited) await notifyOwnerTrainingExit(supabase, agent)
  return exited
}
