import type { SupabaseClient } from '@supabase/supabase-js'
import { getActivePlan } from '@/lib/plan'

// Тариф владельца для AI-агента (решение основателя 3, 16.10.2026).
//
// До этого обработчики входящих (WhatsApp, Instagram, Telegram, сайт,
// внешний API) смотрели только на is_enabled и баланс: когда у продавца
// кончался Про, кабинет закрывался, а бот продолжал отвечать клиентам и
// списывать деньги с кошелька. Теперь -- как у Kaspi Bot с 14.10
// (src/lib/kaspiShop/planGate.ts): проверка на лету, is_enabled в базе НЕ
// трогается, поэтому после продления всё заработало само. Админ (is_admin)
// всегда как Про -- getActivePlan сам это учитывает.
//
// Модуль без серверных импортов (тип SupabaseClient -- только тип), так что
// чистая часть годится и для клиентских страниц.

export const AI_AGENT_PROFILE_COLUMNS = 'is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at'

export function hasAiAgentPlan(profile: unknown, now: Date = new Date()): boolean {
  return !!(profile as { is_admin?: unknown } | null | undefined)?.is_admin || getActivePlan(profile, now).canAiAgent
}

// 'full' -- Про или админ: всё как раньше.
// 'read_only' -- Про кончился, но агенты есть: переписка открыта на чтение,
//   с плашкой «Продлите Про»; отвечать, подключать и настраивать нельзя.
// 'none' -- ни тарифа, ни агентов: обычная Про-стена.
export type AiAgentAccess = 'full' | 'read_only' | 'none'

export function aiAgentAccessLevel(profile: unknown, ownsAgents: boolean, now: Date = new Date()): AiAgentAccess {
  if (hasAiAgentPlan(profile, now)) return 'full'
  return ownsAgents ? 'read_only' : 'none'
}

// Что обработчику входящих делать с сообщением (A2, 16.10.2026):
// 'reply'   -- агент включён и у владельца Про: всё как обычно.
// 'paused'  -- владелец сам выключил агента (is_enabled=false) или агент ещё
//              черновик мастера: сообщение отбрасывается целиком, как и раньше.
// 'lapsed'  -- агент включён, но Про кончился: входящее СОХРАНЯЕТСЯ в
//              переписке (после продления владелец увидит этих клиентов), но
//              ни ответа, ни сценариев, ни CAPI, ни списаний; владельцу раз в
//              сутки -- «Клиенты пишут, а агент молчит» (proLapsedAlert.ts).
// 'unknown' -- не удалось прочитать профиль владельца: как 'lapsed', только
//              без уведомления (не пугаем «Про кончился», если это сбой).
//              Fail closed, как у Kaspi Bot: лучше пропустить ответ, чем
//              отвечать и списывать деньги без тарифа.
export type AgentReplyState = 'reply' | 'paused' | 'lapsed' | 'unknown'

type GateAgent = { is_enabled?: boolean | null; user_id?: string | null } | null | undefined

// Порядок важен: выключенный агент не стоит лишнего запроса к profiles.
export async function agentReplyState(supabase: SupabaseClient, agent: GateAgent): Promise<AgentReplyState> {
  if (!agent || agent.is_enabled === false) return 'paused'
  if (!agent.user_id) return 'paused'
  const { data, error } = await supabase
    .from('profiles')
    .select(AI_AGENT_PROFILE_COLUMNS)
    .eq('id', agent.user_id)
    .maybeSingle()
  if (error) {
    console.error('ai-agent plan gate: owner profile lookup failed for', agent.user_id, ':', error.message)
    return 'unknown'
  }
  return hasAiAgentPlan(data) ? 'reply' : 'lapsed'
}

// Сохранять ли входящее без ответа: да, если агент живой, но отвечать нельзя.
export function storesInboundOnly(state: AgentReplyState): boolean {
  return state === 'lapsed' || state === 'unknown'
}

// Может ли агент сейчас отвечать клиентам: включён И у владельца Про.
export async function agentCanReply(supabase: SupabaseClient, agent: GateAgent): Promise<boolean> {
  return (await agentReplyState(supabase, agent)) === 'reply'
}
