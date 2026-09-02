import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decryptAtRest } from '@/lib/kaspiPay/crypto'
import { getKey } from '@/lib/aiAgent/connection'
import { sendTelegramBotMessage } from '@/lib/aiAgent/telegram'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { getActivePlan } from '@/lib/plan'

type BroadcastChannel = 'telegram' | 'whatsapp'

// Broadcasts run the send loop inside the request (sequential, ~50ms gap),
// so a full 500-recipient batch takes ~2 minutes -- raise the Vercel
// function budget above the default (same mechanism as
// src/app/api/cron/kaspi-poll/route.ts).
export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

// AI-агент is admin-only for now (founder decision, not yet a public plan
// perk) -- same requireAdmin shape as src/app/api/ai-agent/settings/route.ts,
// kept as a separate check after requireUser so a logged-out caller still
// gets 401 Unauthorized and only a logged-in non-admin gets the distinct
// 403 admin_only body.
async function hasAiAgentAccess(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', userId).single()
  return !!profile?.is_admin || getActivePlan(profile).canAiAgent
}

const MAX_MESSAGE_LEN = 2000
// Vercel function time budget: 500 sequential sends at ~250ms each (~50ms
// deliberate gap + Telegram round-trip) fits inside maxDuration=300 with
// headroom. Larger audiences need a queue/cron design -- out of scope for v1.
const MAX_RECIPIENTS = 500
// Telegram allows ~30 messages/second for bulk sends; ~50ms between sends
// (~20/sec) stays safely under that without a token-bucket.
const SEND_DELAY_MS = 50

// Recipient set = DISTINCT external_thread_id of the agent's conversations on
// the given channel (ai_agent_conversations.external_thread_id is the
// Telegram chat.id or the WhatsApp wa_id -- see telegramWebhookHandler.ts /
// whatsappWebhookHandler.ts). These are exactly the people who have already
// written in, which for Telegram is also exactly the LEGAL recipient set:
// Telegram only lets a bot message users who started a chat with it, so
// there is no way (and no need) to broadcast beyond this list.
//
// WhatsApp has a STRICTER rule on top of that: Meta's Cloud API only allows
// a business to send a free-form (non-template) message within 24h of the
// customer's own most recent INBOUND message ("customer service window").
// Outside that window sending requires an approved message template, and
// this app has no programmatic template-send flow (templates are only ever
// created manually in Meta's WhatsApp Manager) -- so any WhatsApp
// conversation whose last inbound message is stale (or has none) must be
// excluded here, not just rejected at send time.
async function collectRecipients(agentId: string, channel: BroadcastChannel): Promise<string[]> {
  const { data } = await supabase
    .from('ai_agent_conversations')
    .select('id, external_thread_id')
    .eq('agent_id', agentId)
    .eq('channel', channel)
    .order('created_at', { ascending: true })
  const conversations = data || []

  let withinWindow: Set<string> | null = null
  if (channel === 'whatsapp') {
    withinWindow = new Set<string>()
    const conversationIds = conversations.map(c => c.id).filter(Boolean)
    if (conversationIds.length > 0) {
      // ONE query for all of this agent's WhatsApp conversations (not one
      // per recipient): pull every inbound message's (conversation_id,
      // created_at), newest first, then keep only the first (= newest) row
      // seen per conversation_id in JS below. That's equivalent to
      // `GROUP BY conversation_id HAVING MAX(created_at)` without needing a
      // Postgres function/view (migrations are out of scope here).
      const { data: inbound } = await supabase
        .from('ai_agent_messages')
        .select('conversation_id, created_at')
        .in('conversation_id', conversationIds)
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
      const cutoffMs = Date.now() - 24 * 60 * 60 * 1000
      const latestSeen = new Set<string>()
      for (const row of inbound || []) {
        if (latestSeen.has(row.conversation_id)) continue
        latestSeen.add(row.conversation_id)
        if (new Date(row.created_at).getTime() >= cutoffMs) {
          withinWindow.add(row.conversation_id)
        }
      }
    }
  }

  const seen = new Set<string>()
  for (const row of conversations) {
    if (!row.external_thread_id) continue
    if (withinWindow && !withinWindow.has(row.id)) continue
    seen.add(row.external_thread_id)
  }
  return Array.from(seen).slice(0, MAX_RECIPIENTS)
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAiAgentAccess(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  // ?agentId=…&preview=1&channel=… -- recipient-count preview for the
  // compose modal ("Отправить N получателям?") without creating a broadcast
  // row. channel defaults to 'telegram' for backward compatibility.
  const agentId = req.nextUrl.searchParams.get('agentId')
  const preview = req.nextUrl.searchParams.get('preview')
  const previewChannel: BroadcastChannel = req.nextUrl.searchParams.get('channel') === 'whatsapp' ? 'whatsapp' : 'telegram'
  if (preview && agentId) {
    const { data: agent } = await supabase.from('ai_agents').select('id').eq('id', agentId).eq('user_id', user.id).maybeSingle()
    if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    const recipients = await collectRecipients(agentId, previewChannel)
    return NextResponse.json({ recipients: recipients.length })
  }

  const { data: broadcasts, error } = await supabase
    .from('ai_agent_broadcasts')
    .select('id, agent_id, channel, message, recipients_total, sent_count, failed_count, status, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Agent names joined in JS via one .in() query -- same two-query shape as
  // src/app/api/ai-agent/agents/route.ts, no N+1.
  const agentIds = Array.from(new Set((broadcasts || []).map(b => b.agent_id)))
  const { data: agents } = agentIds.length > 0
    ? await supabase.from('ai_agents').select('id, name').in('id', agentIds)
    : { data: [] }
  const nameById: Record<string, string> = {}
  for (const a of agents || []) nameById[a.id] = a.name

  return NextResponse.json({
    broadcasts: (broadcasts || []).map(b => ({
      id: b.id,
      agentId: b.agent_id,
      agentName: nameById[b.agent_id] || 'Агент',
      channel: b.channel,
      message: b.message,
      recipientsTotal: b.recipients_total,
      sentCount: b.sent_count,
      failedCount: b.failed_count,
      status: b.status,
      createdAt: b.created_at,
    })),
  })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAiAgentAccess(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const agentId = body?.agentId
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  // channel defaults to 'telegram' for backward compatibility with any old
  // client that doesn't send it yet.
  const rawChannel = body?.channel
  if (rawChannel !== undefined && rawChannel !== 'telegram' && rawChannel !== 'whatsapp') {
    return NextResponse.json({ error: 'invalid channel' }, { status: 400 })
  }
  const channel: BroadcastChannel = rawChannel === 'whatsapp' ? 'whatsapp' : 'telegram'
  if (!agentId || typeof agentId !== 'string') return NextResponse.json({ error: 'agentId required' }, { status: 400 })
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 })
  if (message.length > MAX_MESSAGE_LEN) return NextResponse.json({ error: 'message too long' }, { status: 400 })

  const { data: agent } = await supabase.from('ai_agents').select('id, name').eq('id', agentId).eq('user_id', user.id).maybeSingle()
  if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: connection } = await supabase
    .from('ai_agent_channel_connections')
    .select('id, access_token_enc, external_account_id')
    .eq('agent_id', agentId)
    .eq('channel', channel)
    .eq('status', 'active')
    .maybeSingle()
  if (!connection) {
    return NextResponse.json({ error: channel === 'whatsapp' ? 'whatsapp_not_connected' : 'telegram_not_connected' }, { status: 404 })
  }
  const accessToken = decryptAtRest(connection.access_token_enc, getKey()).toString('utf8')

  const recipients = await collectRecipients(agentId, channel)
  if (recipients.length === 0) {
    return NextResponse.json({
      error: 'no_recipients',
      detail: channel === 'whatsapp'
        ? 'За последние 24 часа вам никто не писал в WhatsApp — по правилам Meta бизнес может писать первым только в ответ на недавнее сообщение клиента.'
        : 'Вашему Telegram-боту ещё никто не писал — рассылать пока некому.',
    }, { status: 400 })
  }

  // Broadcasts are FREE for now -- no wallet debit. Pricing (per-message
  // credits like AI replies? flat fee per broadcast? included in Pro?) is an
  // open product decision; revisit before opening AI-агент beyond admin.
  const { data: broadcast, error: insertError } = await supabase
    .from('ai_agent_broadcasts')
    .insert({
      user_id: user.id,
      agent_id: agentId,
      channel,
      message,
      recipients_total: recipients.length,
    })
    .select('id')
    .single()
  if (insertError || !broadcast) {
    return NextResponse.json({ error: insertError?.message || 'insert_failed' }, { status: 500 })
  }

  const phoneNumberId = connection.external_account_id || ''
  let sent = 0
  let failed = 0
  for (let i = 0; i < recipients.length; i++) {
    try {
      if (channel === 'whatsapp') {
        await sendWhatsAppMessage(phoneNumberId, recipients[i], message, { accessToken })
      } else {
        await sendTelegramBotMessage(accessToken, recipients[i], message)
      }
      sent++
    } catch {
      // Per-recipient failures (user blocked the bot, deleted the chat,
      // WhatsApp window closed between preview and send) are expected --
      // count and continue rather than aborting the whole batch.
      failed++
    }
    if (i < recipients.length - 1) {
      await new Promise(resolve => setTimeout(resolve, SEND_DELAY_MS))
    }
  }

  await supabase
    .from('ai_agent_broadcasts')
    .update({ sent_count: sent, failed_count: failed, status: 'done' })
    .eq('id', broadcast.id)

  return NextResponse.json({
    id: broadcast.id,
    recipientsTotal: recipients.length,
    sentCount: sent,
    failedCount: failed,
    status: 'done',
  })
}
