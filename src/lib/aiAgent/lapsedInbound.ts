import type { SupabaseClient } from '@supabase/supabase-js'
import { after } from 'next/server'
import { sendTelegramNotification } from '@/lib/telegramNotify'
import { escapeHtml } from '@/lib/htmlEscape'
import { productAbsoluteUrl } from '@/lib/crossProduct'
import type { AgentReplyState } from './planGate'

// Про у владельца кончился, а агент включён (A2, 16.10.2026, направление
// одобрил основатель). Раньше входящее в этом случае отбрасывалось целиком, и
// после продления владелец так и не узнавал о клиентах, писавших в паузу, --
// обещание «переписка остаётся доступной на чтение» не выполнялось. Теперь:
//   * диалог находится/создаётся и входящее сохраняется (дедуп по external_id,
//     как в самих обработчиках);
//   * НИ ответа, ни сценариев, ни Meta CAPI, ни списаний с кошелька;
//   * владельцу -- колокольчик + Telegram «Клиенты пишут, а агент молчит»,
//     не чаще раза в сутки на агента (тот же приём, что в budgetAlert.ts:
//     отметка -- сама запись в app_notifications, без новой колонки).
// Выключенный владельцем агент (is_enabled=false) сюда не попадает -- там
// по-прежнему всё отбрасывается (planGate.agentReplyState → 'paused').

export const PRO_LAPSED_ALERT_TITLE = 'Клиенты пишут, а агент молчит — продлите Про'
export const PRO_LAPSED_ALERT_INTERVAL_MS = 24 * 60 * 60 * 1000
export const PRO_LAPSED_ALERT_TELEGRAM_TIMEOUT_MS = 5000

// Подписи для входящих, которые в паузу не скачиваются и не расшифровываются
// (Whisper платный, а ответа всё равно не будет).
export const LAPSED_MEDIA_PLACEHOLDERS: Record<string, string> = {
  image: '[Фото]',
  audio: '[Голосовое сообщение]',
  voice: '[Голосовое сообщение]',
  video: '[Видео]',
  document: '[Документ]',
  file: '[Файл]',
  sticker: '[Стикер]',
  location: '[Геолокация]',
  contacts: '[Контакт]',
}

export function lapsedPlaceholder(kind: string | undefined | null): string {
  return (kind && LAPSED_MEDIA_PLACEHOLDERS[kind]) || '[Вложение]'
}

// Ссылка на продление, своя для каждого агента: она же ключ суточного дедупа.
// from/back -- обычная пара «сходи и вернись» (crossProduct.ts).
export function proLapsedAlertLink(agentId: string): string {
  const qs = new URLSearchParams({ from: 'aiAgent', back: '/ai-agent/dialogs', agent: agentId }).toString()
  return productAbsoluteUrl('invoices', `/upgrade?${qs}`)
}

export function shouldSendProLapsedAlert(lastSentAt: string | null, now: Date): boolean {
  if (!lastSentAt) return true
  const last = new Date(lastSentAt).getTime()
  if (!Number.isFinite(last)) return true
  return now.getTime() - last >= PRO_LAPSED_ALERT_INTERVAL_MS
}

export type ProLapsedAlertAgent = { id: string; user_id: string; name?: string | null }

export function proLapsedAlertTexts(agent: ProLapsedAlertAgent, link: string): { title: string; body: string; telegram: string } {
  const agentName = (agent.name || '').trim() || 'ИИ-агент'
  return {
    title: PRO_LAPSED_ALERT_TITLE,
    body: `«${agentName}»: тариф Про закончился, поэтому агент не отвечает клиентам. Их сообщения сохраняются в «Диалогах». Продлите Про — агент снова начнёт отвечать сам.`,
    telegram: `Клиенты пишут, а агент «${escapeHtml(agentName)}» молчит: тариф Про закончился. Сообщения сохраняются в «Диалогах». Продлите Про: ${escapeHtml(link)}`,
  }
}

// Best-effort: никогда не бросает.
export async function notifyOwnerProLapsed(
  supabase: SupabaseClient,
  agent: ProLapsedAlertAgent,
  now: Date = new Date(),
): Promise<void> {
  try {
    const link = proLapsedAlertLink(agent.id)
    const since = new Date(now.getTime() - PRO_LAPSED_ALERT_INTERVAL_MS).toISOString()
    const { data: recent, error: recentError } = await supabase
      .from('app_notifications')
      .select('created_at')
      .eq('user_id', agent.user_id)
      .eq('title', PRO_LAPSED_ALERT_TITLE)
      .eq('link', link)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1)
    if (recentError) {
      console.error('ai-agent: pro-lapsed alert dedupe lookup failed for agent', agent.id, ':', recentError.message)
      return
    }
    if (!shouldSendProLapsedAlert(recent?.[0]?.created_at ?? null, now)) return

    const texts = proLapsedAlertTexts(agent, link)
    const { error: insertError } = await supabase
      .from('app_notifications')
      .insert({ user_id: agent.user_id, title: texts.title, body: texts.body, link })
    if (insertError) {
      console.error('ai-agent: pro-lapsed alert notification insert failed for agent', agent.id, ':', insertError.message)
      return
    }

    const { data: profile } = await supabase.from('profiles').select('telegram_chat_id, notify_telegram').eq('id', agent.user_id).maybeSingle()
    if (profile?.notify_telegram && profile.telegram_chat_id) {
      await sendTelegramNotification(profile.telegram_chat_id, texts.telegram, { timeoutMs: PRO_LAPSED_ALERT_TELEGRAM_TIMEOUT_MS })
    }
  } catch (err: any) {
    console.error('ai-agent: pro-lapsed owner alert failed for agent', agent.id, ':', err?.message || err)
  }
}

export function scheduleProLapsedAlert(supabase: SupabaseClient, agent: ProLapsedAlertAgent): void {
  const snapshot: ProLapsedAlertAgent = { id: agent.id, user_id: agent.user_id, name: agent.name }
  const run = () => notifyOwnerProLapsed(supabase, snapshot).catch(() => {})
  try {
    after(run)
  } catch {
    void run()
  }
}

export interface LapsedInboundParams {
  agentId: string
  channel: 'whatsapp' | 'instagram' | 'telegram' | 'website' | 'api'
  externalThreadId: string
  customerHandle: string
  text: string
  externalId: string
  // Только Instagram: комментарий или директ (как в handleTenantIncoming).
  source?: 'comment' | 'dm'
}

// Сохранить входящее без ответа. Те же поля диалога и тот же upsert, что в
// обычном пути обработчиков, чтобы после продления это был ТОТ ЖЕ диалог.
// Возвращает true, если строка реально вставлена (не дубль).
export async function storeInboundWithoutReply(supabase: SupabaseClient, p: LapsedInboundParams): Promise<boolean> {
  const conversationRow: Record<string, unknown> = {
    agent_id: p.agentId,
    channel: p.channel,
    external_thread_id: p.externalThreadId,
    customer_handle: p.customerHandle,
  }
  if (p.source) conversationRow.source = p.source
  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .upsert(conversationRow, { onConflict: 'agent_id,channel,external_thread_id', ignoreDuplicates: false })
    .select('id')
    .single()
  if (!conversation) return false

  const { error } = await supabase.from('ai_agent_messages').insert({
    conversation_id: (conversation as { id: string }).id,
    direction: 'inbound',
    text: p.text,
    external_id: p.externalId,
  })
  if (error) {
    if (error.code !== '23505') console.error('ai-agent: failed to store inbound (no reply, Pro lapsed) for', p.externalId, ':', error.message)
    return false
  }
  return true
}

// Общая точка для обработчиков: сохранить и (если это именно «Про кончился»,
// а не сбой чтения профиля) напомнить владельцу.
export async function handleInboundWithoutReply(
  supabase: SupabaseClient,
  state: AgentReplyState,
  agent: { id: string; user_id: string; name?: string | null },
  p: LapsedInboundParams,
): Promise<void> {
  const stored = await storeInboundWithoutReply(supabase, p)
  if (stored && state === 'lapsed') scheduleProLapsedAlert(supabase, agent)
}
