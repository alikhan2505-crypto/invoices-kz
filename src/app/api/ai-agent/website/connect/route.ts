import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { encryptAtRest } from '@/lib/kaspiPay/crypto'
import { getKey } from '@/lib/aiAgent/connection'
import { generateWidgetKey } from '@/lib/aiAgent/widget'
import { getActivePlan } from '@/lib/plan'

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

async function hasAiAgentAccess(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', userId).single()
  return !!profile?.is_admin || getActivePlan(profile).canAiAgent
}

// Unlike Telegram/Instagram/WhatsApp there is no external platform to talk
// to here -- "connecting" is just generating a public widget key and
// storing the row. Idempotent: an agent that already has a website
// connection gets its EXISTING key back rather than a second row, so a
// stray extra click never silently orphans an already-embedded script tag.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAiAgentAccess(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const agentId = body?.agentId
  if (!agentId || typeof agentId !== 'string') return NextResponse.json({ error: 'agentId required' }, { status: 400 })

  const { data: agent } = await supabase.from('ai_agents').select('id').eq('id', agentId).eq('user_id', user.id).maybeSingle()
  if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: existing } = await supabase
    .from('ai_agent_channel_connections')
    .select('external_account_id')
    .eq('agent_id', agentId)
    .eq('channel', 'website')
    .maybeSingle()
  if (existing) return NextResponse.json({ connected: true, widgetKey: existing.external_account_id })

  const widgetKey = generateWidgetKey()
  // access_token_enc has no real meaning for this channel (no external API,
  // no real credential) -- a random value is stored purely to satisfy the
  // column's NOT NULL constraint and is never read back as a credential.
  const placeholderSecret = crypto.randomBytes(32).toString('hex')

  const { error } = await supabase.from('ai_agent_channel_connections').insert({
    agent_id: agentId,
    channel: 'website',
    external_account_id: widgetKey,
    access_token_enc: encryptAtRest(placeholderSecret, getKey()),
    status: 'active',
  })
  if (error) {
    console.error('ai-agent website connect: insert failed:', error.message)
    return NextResponse.json({ error: 'connect_failed' }, { status: 500 })
  }

  return NextResponse.json({ connected: true, widgetKey })
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAiAgentAccess(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const agentId = body?.agentId
  if (!agentId || typeof agentId !== 'string') return NextResponse.json({ error: 'agentId required' }, { status: 400 })

  const { data: agent } = await supabase.from('ai_agents').select('id').eq('id', agentId).eq('user_id', user.id).maybeSingle()
  if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  await supabase.from('ai_agent_channel_connections').delete().eq('agent_id', agentId).eq('channel', 'website')
  return NextResponse.json({ disconnected: true })
}
