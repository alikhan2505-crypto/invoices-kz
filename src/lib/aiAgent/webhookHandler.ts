import { createClient } from '@supabase/supabase-js'
import { decryptAtRest } from '@/lib/kaspiPay/crypto'
import { getKey } from './connection'
import { replyToComment, sendDirectMessage, InstagramApiError } from '@/lib/instagram'
import { generateAiReply } from '@/lib/instagramAiReply'
import { buildBusinessContextLine, AgentTone, AgentGoal } from './promptContext'
import { shouldExitTraining } from './trainingStatus'
import { debitAiAgentWallet, AI_AGENT_CREDITS_PER_AI_REPLY } from './wallet'
import { sendTelegramNotification } from '@/lib/telegramNotify'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface TenantConnection {
  connectionId: string
  agentId: string
  externalAccountId: string
  accessToken: string
}

// A 401 from Meta on an actual send means the stored token is dead
// (revoked, expired) -- per the design spec's "Обработка ошибок" section,
// this mirrors Kaspi Shop's own sessionExpired/markSessionExpired pattern:
// mark it in the DB so the settings page (Task 6) can show a reconnect
// banner, instead of silently retrying a token that will never work again.
// Any other error (network blip, malformed request, Meta outage) is left
// alone -- only a confirmed 401 means the token itself is the problem.
async function markTokenExpiredIfUnauthorized(connectionId: string, err: unknown): Promise<void> {
  if (err instanceof InstagramApiError && err.status === 401) {
    await supabase.from('ai_agent_channel_connections').update({ status: 'token_expired' }).eq('id', connectionId)
  }
}

// Looked up once per webhook entry (Task 8's POST handler calls this before
// its changes/messaging loop) -- null means this Instagram account isn't
// connected to any agent, which shouldn't happen for a real event but is
// handled as a defensive no-op rather than a crash.
export async function loadTenantConnection(externalAccountId: string): Promise<TenantConnection | null> {
  const { data } = await supabase
    .from('ai_agent_channel_connections')
    .select('id, agent_id, external_account_id, access_token_enc')
    .eq('channel', 'instagram')
    .eq('external_account_id', externalAccountId)
    .eq('status', 'active')
    .maybeSingle()
  if (!data) return null
  return {
    connectionId: data.id,
    agentId: data.agent_id,
    externalAccountId: data.external_account_id,
    accessToken: decryptAtRest(data.access_token_enc, getKey()).toString('utf8'),
  }
}

interface TenantIncomingParams {
  source: 'comment' | 'dm'
  externalId: string
  fromUsername: string
  incomingText: string
  replyTarget: string
}

export async function handleTenantIncoming(conn: TenantConnection, params: TenantIncomingParams): Promise<void> {
  // Dedup first, same principle as the single-tenant path's external_id
  // unique constraint -- Meta can redeliver the same event.
  const { data: existingMsg } = await supabase
    .from('ai_agent_messages')
    .select('id')
    .eq('external_id', params.externalId)
    .maybeSingle()
  if (existingMsg) return

  const { data: agent } = await supabase.from('ai_agents').select('*').eq('id', conn.agentId).single()
  if (!agent) return

  // Find or create the conversation thread for this sender.
  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .upsert({
      agent_id: conn.agentId,
      channel: 'instagram',
      external_thread_id: params.replyTarget,
      customer_handle: params.fromUsername,
    }, { onConflict: 'agent_id,channel,external_thread_id', ignoreDuplicates: false })
    .select('id')
    .single()
  if (!conversation) return

  // Log the inbound message.
  await supabase.from('ai_agent_messages').insert({
    conversation_id: conversation.id,
    direction: 'inbound',
    text: params.incomingText,
    external_id: params.externalId,
  })

  // Template match first, same channel-scoping rule as instagram_reply_templates.
  const { data: templates } = await supabase
    .from('ai_agent_reply_templates')
    .select('id, trigger_words, reply_text')
    .eq('agent_id', conn.agentId)
    .or(`channel.is.null,channel.eq.${params.source}`)
    .order('created_at', { ascending: true })

  const match = findTemplateMatch(params.incomingText, templates || [])

  if (match) {
    try {
      if (params.source === 'comment') {
        await replyToComment(params.replyTarget, match.reply_text, { accessToken: conn.accessToken })
      } else {
        await sendDirectMessage(params.replyTarget, match.reply_text, { igUserId: conn.externalAccountId, accessToken: conn.accessToken })
      }
      await supabase.from('ai_agent_messages').insert({
        conversation_id: conversation.id,
        direction: 'outbound',
        text: match.reply_text,
        is_ai_generated: false,
        status: 'sent',
      })
    } catch (err: any) {
      console.error('ai-agent webhook: template reply send failed for', params.externalId, ':', err.message)
      await markTokenExpiredIfUnauthorized(conn.connectionId, err)
    }
    return
  }

  // No template -- generate an AI reply.
  let draftReply: string
  let urgent: boolean
  try {
    const result = await generateAiReply({
      incomingText: params.incomingText,
      fromUsername: params.fromUsername,
      source: params.source,
      businessContextLine: buildBusinessContextLine({
        name: agent.name,
        tone: agent.tone as AgentTone,
        description: agent.business_description,
        goal: agent.goal as AgentGoal,
      }),
    })
    draftReply = result.replyText
    urgent = result.urgent
  } catch (err: any) {
    console.error('ai-agent webhook: AI reply generation failed for', params.externalId, ':', err.message)
    return
  }

  if (agent.status === 'training') {
    const { data: inserted } = await supabase.from('ai_agent_messages').insert({
      conversation_id: conversation.id,
      direction: 'outbound',
      text: draftReply,
      is_ai_generated: true,
      status: 'pending_review',
      urgent,
    }).select('id').single()

    // Best-effort nudge -- wrapped in try/catch so a Telegram failure can
    // never block or abort the rest of this webhook delivery.
    const { data: profile } = await supabase.from('profiles').select('telegram_chat_id, notify_telegram').eq('id', agent.user_id).single()
    if (profile?.notify_telegram && profile.telegram_chat_id && inserted) {
      try {
        await sendTelegramNotification(profile.telegram_chat_id, 'У вас новый черновик ответа на проверке в AI-агенте. Загляните в приложение, чтобы отправить или отредактировать.')
      } catch (telegramErr: any) {
        console.error('ai-agent webhook: training-mode Telegram nudge failed for user', agent.user_id, ':', telegramErr.message)
      }
    }
    return
  }

  // Agent is active -- send immediately.
  try {
    if (params.source === 'comment') {
      await replyToComment(params.replyTarget, draftReply, { accessToken: conn.accessToken })
    } else {
      await sendDirectMessage(params.replyTarget, draftReply, { igUserId: conn.externalAccountId, accessToken: conn.accessToken })
    }
    await supabase.from('ai_agent_messages').insert({
      conversation_id: conversation.id,
      direction: 'outbound',
      text: draftReply,
      is_ai_generated: true,
      status: 'sent',
      urgent,
    })
    try {
      await debitAiAgentWallet(agent.user_id, AI_AGENT_CREDITS_PER_AI_REPLY, `ИИ-ответ: ${params.source === 'comment' ? 'комментарий' : 'DM'}`)
    } catch (walletErr: any) {
      console.error('ai-agent webhook: wallet debit failed for user', agent.user_id, ':', walletErr.message)
    }
  } catch (err: any) {
    console.error('ai-agent webhook: AI reply send failed for', params.externalId, ':', err.message)
    await markTokenExpiredIfUnauthorized(conn.connectionId, err)
  }
}

// Same contiguous-substring matching as this codebase's existing
// findMatchingTemplate (src/lib/instagramReplyMatch.ts) -- deliberately not
// reused directly since that function is typed against
// instagram_reply_templates's row shape; this is the same algorithm
// against ai_agent_reply_templates's identical trigger_words/reply_text
// shape. If instagramReplyMatch.ts's matching logic ever changes, mirror
// the change here too.
function findTemplateMatch(text: string, templates: { id: string; trigger_words: string[]; reply_text: string }[]): { id: string; reply_text: string } | null {
  const lower = text.toLowerCase()
  for (const t of templates) {
    if (t.trigger_words.some(w => lower.includes(w.toLowerCase()))) {
      return { id: t.id, reply_text: t.reply_text }
    }
  }
  return null
}
