import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { encryptAtRest, decryptAtRest } from '@/lib/kaspiPay/crypto'
import { getKey } from '@/lib/aiAgent/connection'
import { getTelegramMe, setTelegramWebhook, deleteTelegramWebhook } from '@/lib/aiAgent/telegram'
import { getActivePlan } from '@/lib/plan'

// Connect (POST) / disconnect (DELETE) a customer's Telegram bot to an
// agent -- the BotFather-token flow: the user pastes a bot token, getMe
// validates it and identifies the bot, setWebhook points that bot's updates
// at /api/ai-agent/telegram/webhook. Unlike Instagram there is no OAuth
// dance; the token IS the credential, stored encrypted at rest exactly like
// Instagram access tokens (access_token_enc, AI_AGENT_ENCRYPTION_KEY).

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

// AI-агент is admin-only for now -- same requireAdmin shape as the other
// ai-agent routes (see settings/route.ts for the 401-vs-403 reasoning).
async function hasAiAgentAccess(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', userId).single()
  return !!profile?.is_admin || getActivePlan(profile).canAiAgent
}

// BotFather tokens are "<numeric bot id>:<35-char base64ish blob>" -- the
// loose shape check just rejects obvious garbage (and whitespace-mangled
// pastes) before a network round-trip; getMe is the real validation.
const BOT_TOKEN_SHAPE = /^\d+:[\w-]{20,}$/

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAiAgentAccess(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const agentId = body?.agentId
  const rawToken = body?.botToken
  if (!agentId || typeof agentId !== 'string') return NextResponse.json({ error: 'agentId required' }, { status: 400 })
  if (!rawToken || typeof rawToken !== 'string' || !BOT_TOKEN_SHAPE.test(rawToken.trim())) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
  }
  const botToken = rawToken.trim()

  // Ownership: the connection attaches to THIS user's agent only.
  const { data: agent } = await supabase.from('ai_agents').select('id').eq('id', agentId).eq('user_id', user.id).maybeSingle()
  if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // getMe both proves the token works and identifies the bot -- its id
  // becomes external_account_id (the upsert key), its username the display
  // name on the settings page.
  let me: { id: string; username: string }
  try {
    me = await getTelegramMe(botToken)
  } catch {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
  }

  // Fresh secret on every (re)connect -- doubles as the webhook URL's
  // ?secret= lookup key and the secret_token Telegram echoes back in the
  // X-Telegram-Bot-Api-Secret-Token header (the webhook route verifies
  // both). Hex chars only, well inside Telegram's [A-Za-z0-9_-]{1,256}.
  const webhookSecret = crypto.randomBytes(32).toString('hex')

  // Same onConflict as the Instagram OAuth callback: reconnecting the same
  // bot (even to a different agent) overwrites the existing row and always
  // restores status 'active', which clears a token_expired banner.
  const { data: connection, error: upsertError } = await supabase.from('ai_agent_channel_connections').upsert({
    agent_id: agentId,
    channel: 'telegram',
    external_account_id: me.id,
    external_account_name: me.username,
    access_token_enc: encryptAtRest(botToken, getKey()),
    status: 'active',
    webhook_secret: webhookSecret,
  }, { onConflict: 'channel,external_account_id' }).select('id').single()
  if (upsertError || !connection) {
    console.error('ai-agent telegram connect: connection upsert failed:', upsertError?.message)
    return NextResponse.json({ error: 'connect_failed' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.invoices.kz'
  try {
    await setTelegramWebhook(botToken, `${appUrl}/api/ai-agent/telegram/webhook?secret=${webhookSecret}`, webhookSecret)
  } catch (e: any) {
    // A row whose webhook never registered would LOOK connected but the
    // agent would never hear anything (the Instagram per-account
    // subscription lesson, 2026-08-16) -- roll the row back instead.
    await supabase.from('ai_agent_channel_connections').delete().eq('id', connection.id)
    console.error('ai-agent telegram connect: setWebhook failed:', e.message)
    return NextResponse.json({ error: 'webhook_setup_failed' }, { status: 502 })
  }

  return NextResponse.json({ connected: true, botUsername: me.username })
}

// DELETE with JSON body { agentId }: deregisters the webhook with Telegram
// (best-effort -- a revoked token can't deleteWebhook, but the row must
// still go) and removes the connection row. Conversations/messages stay:
// they belong to the agent, not the connection.
export async function DELETE(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAiAgentAccess(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const agentId = body?.agentId
  if (!agentId || typeof agentId !== 'string') return NextResponse.json({ error: 'agentId required' }, { status: 400 })

  const { data: agent } = await supabase.from('ai_agents').select('id').eq('id', agentId).eq('user_id', user.id).maybeSingle()
  if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: connection } = await supabase
    .from('ai_agent_channel_connections')
    .select('id, access_token_enc')
    .eq('agent_id', agentId)
    .eq('channel', 'telegram')
    .maybeSingle()
  if (!connection) return NextResponse.json({ disconnected: true })

  try {
    const botToken = decryptAtRest(connection.access_token_enc, getKey()).toString('utf8')
    await deleteTelegramWebhook(botToken)
  } catch (e: any) {
    console.error('ai-agent telegram disconnect: deleteWebhook failed:', e.message)
  }

  await supabase.from('ai_agent_channel_connections').delete().eq('id', connection.id)
  return NextResponse.json({ disconnected: true })
}
