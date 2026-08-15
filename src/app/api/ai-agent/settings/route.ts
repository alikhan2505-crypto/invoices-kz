import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

const VALID_TONES = ['friendly', 'professional', 'energetic', 'caring']
const VALID_GOALS = ['answer_questions', 'qualify_lead']

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: agent } = await supabase.from('ai_agents').select('*').eq('user_id', user.id).maybeSingle()
  const { data: profile } = await supabase.from('profiles').select('company_name').eq('id', user.id).maybeSingle()
  const { data: connections } = agent
    ? await supabase.from('ai_agent_channel_connections').select('channel, external_account_name, status').eq('agent_id', agent.id)
    : { data: [] }

  return NextResponse.json({
    agent: agent ? {
      id: agent.id,
      name: agent.name,
      tone: agent.tone,
      businessDescription: agent.business_description,
      goal: agent.goal,
      collectName: agent.collect_name,
      collectPhone: agent.collect_phone,
      status: agent.status,
    } : null,
    suggestedName: profile?.company_name || '',
    connections: connections || [],
  })
}

// Upsert on user_id. Deliberately omits status/training_started_at/
// training_message_count from the payload -- Supabase's upsert only sets
// the columns present in the object, so re-saving settings later (editing
// the business description, say) never resets an agent's training clock
// back to defaults. Those three columns are only ever set by their own
// defaults (first creation) or by Task 9's review-queue route (training
// progress).
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, tone, businessDescription, goal, collectName, collectPhone } = body

  if (!name || typeof name !== 'string') return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (!VALID_TONES.includes(tone)) return NextResponse.json({ error: 'invalid tone' }, { status: 400 })
  if (!VALID_GOALS.includes(goal)) return NextResponse.json({ error: 'invalid goal' }, { status: 400 })

  const { data: agent, error } = await supabase
    .from('ai_agents')
    .upsert({
      user_id: user.id,
      name,
      tone,
      business_description: typeof businessDescription === 'string' ? businessDescription : '',
      goal,
      collect_name: !!collectName,
      collect_phone: !!collectPhone,
    }, { onConflict: 'user_id' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { error: walletError } = await supabase.from('ai_agent_wallet').upsert(
    { user_id: user.id, balance: 0 },
    { onConflict: 'user_id', ignoreDuplicates: true }
  )
  if (walletError) console.error('ai_agent_wallet creation failed for user', user.id, ':', walletError.message)

  return NextResponse.json({ agent })
}
