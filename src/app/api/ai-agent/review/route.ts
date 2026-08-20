import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decryptAtRest } from '@/lib/kaspiPay/crypto'
import { getKey } from '@/lib/aiAgent/connection'
import { replyToComment, sendDirectMessage, InstagramApiError } from '@/lib/instagram'
import { sendTelegramBotMessage, TelegramApiError } from '@/lib/aiAgent/telegram'
import { shouldExitTraining } from '@/lib/aiAgent/trainingStatus'
import { debitAiAgentWallet, AI_AGENT_CREDITS_PER_AI_REPLY } from '@/lib/aiAgent/wallet'

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
// perk) -- same requireAdmin shape as src/app/api/kaspi/admin-stats/route.ts
// and src/app/api/kaspi-shop/niches/{request,result}/route.ts, kept as a
// separate check after requireUser (rather than folded into one function)
// so a logged-out caller still gets 401 Unauthorized and only a logged-in
// non-admin gets the distinct 403 admin_only body.
async function isAdmin(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', userId).single()
  return !!profile?.is_admin
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  // Multi-agent (2026-08-20): the review queue deliberately aggregates
  // across ALL of the user's agents rather than taking an ?agentId= filter.
  // Chosen as the least-invasive correct option: the old .maybeSingle()
  // would error (data: null) as soon as a second agent existed, silently
  // emptying the queue. One combined queue also matches how the user
  // actually works it -- approve/skip everything pending, whichever agent
  // it came from. POST needs no change: it resolves message -> conversation
  // -> agent and ownership-checks that agent by user_id per item.
  const { data: agents } = await supabase.from('ai_agents').select('id').eq('user_id', user.id)
  if (!agents || agents.length === 0) return NextResponse.json({ items: [] })

  const { data: conversations } = await supabase
    .from('ai_agent_conversations')
    .select('id, customer_handle')
    .in('agent_id', agents.map(a => a.id))
  const conversationIds = (conversations || []).map(c => c.id)
  const handleByConversation: Record<string, string> = {}
  for (const c of conversations || []) handleByConversation[c.id] = c.customer_handle || 'клиент'

  if (conversationIds.length === 0) return NextResponse.json({ items: [] })

  const { data: messages } = await supabase
    .from('ai_agent_messages')
    .select('id, conversation_id, text, urgent, created_at')
    .in('conversation_id', conversationIds)
    .eq('status', 'pending_review')
    .order('created_at', { ascending: true })

  return NextResponse.json({
    items: (messages || []).map(m => ({
      id: m.id,
      customerHandle: handleByConversation[m.conversation_id] || 'клиент',
      text: m.text,
      urgent: m.urgent,
      createdAt: m.created_at,
    })),
  })
}

// One action endpoint, mirroring how this codebase's other approve-queue
// features (e.g. the single-tenant bot's Telegram ig_reply_send/skip
// callbacks) keep send/edit/skip as one small state machine rather than
// three separate routes.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const { messageId, action, editedText } = await req.json()
  if (!messageId || !['send', 'skip'].includes(action)) {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 })
  }

  const { data: message } = await supabase
    .from('ai_agent_messages')
    .select('id, conversation_id, text, status')
    .eq('id', messageId)
    .eq('status', 'pending_review')
    .maybeSingle()
  if (!message) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .select('id, agent_id, channel, external_thread_id')
    .eq('id', message.conversation_id)
    .single()
  if (!conversation) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: agent } = await supabase.from('ai_agents').select('*').eq('id', conversation.agent_id).eq('user_id', user.id).single()
  if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const finalText = action === 'send' && typeof editedText === 'string' && editedText.trim() ? editedText.trim() : message.text

  if (action === 'send') {
    const { data: connection } = await supabase
      .from('ai_agent_channel_connections')
      .select('id, access_token_enc, external_account_id')
      .eq('agent_id', agent.id)
      .eq('channel', conversation.channel)
      .single()
    if (!connection) return NextResponse.json({ error: 'channel_not_connected' }, { status: 400 })

    const accessToken = decryptAtRest(connection.access_token_enc, getKey()).toString('utf8')
    try {
      // ai_agent_conversations.external_thread_id doubles as the reply
      // target for both comment and DM sends, same as the single-tenant
      // bot's reply_target column.
      if (conversation.channel === 'instagram') {
        // A conversation thread doesn't record whether it's a comment
        // thread or a DM thread today -- v1 review-queue sends only ever
        // apply to DMs in practice (comment replies are short and public,
        // less likely to need editing before sending), but if a comment
        // draft ever reaches this queue, sendDirectMessage would be wrong.
        // Flagged here rather than silently guessed -- if comment drafts
        // do reach training-mode review in practice, this needs a
        // source column on ai_agent_conversations (or ai_agent_messages)
        // to pick the right send function.
        await sendDirectMessage(conversation.external_thread_id, finalText, { igUserId: connection.external_account_id, accessToken })
      } else if (conversation.channel === 'telegram') {
        // For telegram rows access_token_enc holds the encrypted BotFather
        // token (same column, same encryption -- see telegram/connect) and
        // external_thread_id is the Telegram chat.id.
        await sendTelegramBotMessage(accessToken, conversation.external_thread_id, finalText)
      }
    } catch (e: any) {
      console.error('ai-agent review: send failed for message', messageId, ':', e.message)
      // Same 401 -> token_expired marker as the webhook path (Task 8) --
      // per the design spec's error-handling section, a dead token surfaces
      // as a reconnect banner on the settings page (Task 6), not a retry
      // loop against a token that will never work again. A Telegram 401
      // means the bot token was revoked via BotFather -- same treatment.
      if ((e instanceof InstagramApiError && e.status === 401) || (e instanceof TelegramApiError && e.status === 401)) {
        await supabase.from('ai_agent_channel_connections').update({ status: 'token_expired' }).eq('id', connection.id)
      }
      return NextResponse.json({ error: 'send_failed' }, { status: 502 })
    }

    await supabase.from('ai_agent_messages').update({ status: 'sent', text: finalText }).eq('id', messageId)
    try {
      await debitAiAgentWallet(user.id, AI_AGENT_CREDITS_PER_AI_REPLY, 'ИИ-ответ: одобрено в режиме обучения')
    } catch (e: any) {
      console.error('ai-agent review: wallet debit failed for user', user.id, ':', e.message)
    }
  } else {
    await supabase.from('ai_agent_messages').update({ status: 'skipped' }).eq('id', messageId)
  }

  const nextCount = agent.training_message_count + 1
  const exit = shouldExitTraining(
    { status: agent.status, trainingStartedAt: agent.training_started_at, trainingMessageCount: nextCount },
    new Date()
  )
  await supabase.from('ai_agents').update({
    training_message_count: nextCount,
    ...(exit ? { status: 'active' } : {}),
  }).eq('id', agent.id)

  return NextResponse.json({ ok: true, exitedTraining: exit })
}
