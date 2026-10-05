import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { encryptAtRest } from '@/lib/kaspiPay/crypto'
import { getMetaCapiKey } from '@/lib/aiAgent/connection'
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

// AI-агент is admin-only for now -- same shape as the other ai-agent
// connect routes (see whatsapp/callback/route.ts).
async function hasAiAgentAccess(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', userId).single()
  return !!profile?.is_admin || getActivePlan(profile).canAiAgent
}

// Manual Pixel ID + token, not OAuth -- deliberate choice (see spec) to
// avoid adding another Meta App Review dependency. Pixel ID is not a
// secret (it's visible wherever the seller already embeds their own Meta
// Pixel); the access token is encrypted at rest with its own dedicated key.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAiAgentAccess(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const agentId = body?.agentId
  const pixelId = typeof body?.pixelId === 'string' ? body.pixelId.trim() : ''
  const accessToken = typeof body?.accessToken === 'string' ? body.accessToken.trim() : ''
  if (!agentId || typeof agentId !== 'string') return NextResponse.json({ error: 'agentId required' }, { status: 400 })
  if (!pixelId) return NextResponse.json({ error: 'pixelId required' }, { status: 400 })
  if (!accessToken) return NextResponse.json({ error: 'accessToken required' }, { status: 400 })

  const { data: agent } = await supabase.from('ai_agents').select('id').eq('id', agentId).eq('user_id', user.id).maybeSingle()
  if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { error } = await supabase.from('ai_agents').update({
    meta_pixel_id: pixelId,
    meta_capi_token_enc: encryptAtRest(accessToken, getMetaCapiKey()),
  }).eq('id', agentId)
  if (error) {
    console.error('ai-agent meta-capi connect: update failed:', error.message)
    return NextResponse.json({ error: 'connect_failed' }, { status: 500 })
  }

  return NextResponse.json({ connected: true })
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

  await supabase.from('ai_agents').update({ meta_pixel_id: null, meta_capi_token_enc: null }).eq('id', agentId)
  return NextResponse.json({ disconnected: true })
}
