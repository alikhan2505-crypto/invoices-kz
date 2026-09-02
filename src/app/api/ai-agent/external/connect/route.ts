import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { encryptAtRest } from '@/lib/kaspiPay/crypto'
import { getKey } from '@/lib/aiAgent/connection'
import { generateApiKey, hashApiKey } from '@/lib/aiAgent/externalApi'

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

async function isAdmin(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', userId).single()
  return !!profile?.is_admin
}

// Unlike website/connect's widget key (harmlessly re-shown from storage --
// it's meant to be publicly visible in embedded page source), this key is a
// real secret and only its hash is ever persisted, so there is no "existing
// key" to hand back on a repeat call. Every POST therefore (re)generates: a
// fresh agent gets its first key, an already-connected one gets a new key
// that immediately invalidates the old one -- same one-button idiom as
// Kaspi's regenerate-token route.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const agentId = body?.agentId
  if (!agentId || typeof agentId !== 'string') return NextResponse.json({ error: 'agentId required' }, { status: 400 })

  const { data: agent } = await supabase.from('ai_agents').select('id').eq('id', agentId).eq('user_id', user.id).maybeSingle()
  if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const apiKey = generateApiKey()
  const apiTokenHash = hashApiKey(apiKey)
  // access_token_enc has no real meaning for this channel (the secret lives
  // in api_token_hash, not here) -- a random value satisfies the column's
  // NOT NULL constraint and is never read back as a credential, same as
  // website/connect's placeholderSecret.
  const placeholderSecret = crypto.randomBytes(32).toString('hex')

  const { data: existing } = await supabase
    .from('ai_agent_channel_connections')
    .select('id')
    .eq('agent_id', agentId)
    .eq('channel', 'api')
    .maybeSingle()

  const row = {
    agent_id: agentId,
    channel: 'api',
    external_account_id: 'api',
    access_token_enc: encryptAtRest(placeholderSecret, getKey()),
    api_token_hash: apiTokenHash,
    status: 'active',
  }

  const { error } = existing
    ? await supabase.from('ai_agent_channel_connections').update(row).eq('id', existing.id)
    : await supabase.from('ai_agent_channel_connections').insert(row)
  if (error) {
    console.error('ai-agent external connect: save failed:', error.message)
    return NextResponse.json({ error: 'connect_failed' }, { status: 500 })
  }

  return NextResponse.json({ connected: true, apiKey })
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const agentId = body?.agentId
  if (!agentId || typeof agentId !== 'string') return NextResponse.json({ error: 'agentId required' }, { status: 400 })

  const { data: agent } = await supabase.from('ai_agents').select('id').eq('id', agentId).eq('user_id', user.id).maybeSingle()
  if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  await supabase.from('ai_agent_channel_connections').delete().eq('agent_id', agentId).eq('channel', 'api')
  return NextResponse.json({ disconnected: true })
}
