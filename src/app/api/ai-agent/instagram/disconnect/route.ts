import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decryptAtRest } from '@/lib/kaspiPay/crypto'
import { getKey } from '@/lib/aiAgent/connection'
import { getActivePlan } from '@/lib/plan'

// Disconnect an agent's Instagram account (Каналы tab) -- the counterpart
// to the OAuth connect/callback pair, mirroring the Telegram DELETE in
// telegram/connect/route.ts: ownership check, best-effort webhook
// deregistration, then remove the connection row. Conversations/messages
// stay: they belong to the agent, not the connection. POST (not DELETE) so
// the client call shape matches the other one-shot ai-agent actions.

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

export async function POST(req: NextRequest) {
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
    .eq('channel', 'instagram')
    .maybeSingle()
  if (!connection) return NextResponse.json({ disconnected: true })

  // Best-effort: undo the per-account webhook subscription the OAuth
  // callback created (POST me/subscribed_apps -> DELETE me/subscribed_apps).
  // A revoked/expired token can't deregister, same as a revoked BotFather
  // token can't deleteWebhook -- the row must still go either way, since a
  // deleted row already stops loadTenantConnection from ever answering for
  // this account again.
  try {
    const accessToken = decryptAtRest(connection.access_token_enc, getKey()).toString('utf8')
    await fetch(`https://graph.instagram.com/v21.0/me/subscribed_apps?access_token=${encodeURIComponent(accessToken)}`, { method: 'DELETE' })
  } catch (e: any) {
    console.error('ai-agent instagram disconnect: unsubscribe failed:', e.message)
  }

  await supabase.from('ai_agent_channel_connections').delete().eq('id', connection.id)
  return NextResponse.json({ disconnected: true })
}
