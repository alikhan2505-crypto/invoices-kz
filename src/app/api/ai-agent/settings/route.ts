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

const VALID_TONES = ['friendly', 'professional', 'energetic', 'caring']
const VALID_GOALS = ['answer_questions', 'qualify_lead', 'book_appointment']
// Preset keys mirror COLLECT_FIELD_LABELS in src/lib/aiAgent/promptContext.ts;
// anything else in the array is a user-typed custom field (free text, capped).
const VALID_TIMEZONES = ['Asia/Almaty', 'Asia/Aqtobe', 'Asia/Atyrau', 'Asia/Oral', 'Asia/Aqtau']
const VALID_CURRENCIES = ['KZT', 'USD', 'EUR', 'RUB']
const MAX_COLLECT_FIELDS = 15
const MAX_CUSTOM_FIELD_LEN = 60

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  // Multi-agent (2026-08-20): ?agentId= loads a specific agent (404 if not
  // owned); without it, fall back to the most recently created agent, which
  // preserves the exact pre-multi-agent behavior for a single-agent user.
  const agentId = req.nextUrl.searchParams.get('agentId')
  let agent: any = null
  if (agentId) {
    const { data } = await supabase.from('ai_agents').select('*').eq('id', agentId).eq('user_id', user.id).maybeSingle()
    if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    agent = data
  } else {
    const { data } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    agent = data
  }
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
      collectFields: Array.isArray(agent.collect_fields) ? agent.collect_fields : [],
      timezone: agent.timezone || 'Asia/Almaty',
      currency: agent.currency || 'KZT',
      status: agent.status,
    } : null,
    suggestedName: profile?.company_name || '',
    connections: connections || [],
  })
}

// Multi-agent (2026-08-20): an explicit `agentId` in the body means UPDATE
// that agent (ownership-verified); no agentId means INSERT a new agent row.
// The old upsert-on-user_id is gone along with the UNIQUE(user_id)
// constraint. The payload still deliberately omits status/
// training_started_at/training_message_count -- re-saving settings (editing
// the business description, say) never resets an agent's training clock
// back to defaults. Those three columns are only ever set by their own
// defaults (first creation) or by the review-queue route (training
// progress).
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const body = await req.json()
  const { agentId, name, tone, businessDescription, goal, collectFields, timezone, currency } = body

  if (agentId !== undefined && typeof agentId !== 'string') return NextResponse.json({ error: 'invalid agentId' }, { status: 400 })

  if (!name || typeof name !== 'string') return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (!VALID_TONES.includes(tone)) return NextResponse.json({ error: 'invalid tone' }, { status: 400 })
  if (!VALID_GOALS.includes(goal)) return NextResponse.json({ error: 'invalid goal' }, { status: 400 })
  if (timezone !== undefined && !VALID_TIMEZONES.includes(timezone)) return NextResponse.json({ error: 'invalid timezone' }, { status: 400 })
  if (currency !== undefined && !VALID_CURRENCIES.includes(currency)) return NextResponse.json({ error: 'invalid currency' }, { status: 400 })

  // collectFields: preset keys pass through as-is, anything else is a
  // user-typed custom field -- kept as trimmed free text with a length cap
  // (it gets interpolated into the agent's prompt, promptContext.ts).
  const fields: string[] = Array.isArray(collectFields)
    ? collectFields
        .filter((f: unknown): f is string => typeof f === 'string')
        .map(f => f.trim().slice(0, MAX_CUSTOM_FIELD_LEN))
        .filter(f => f.length > 0)
        .slice(0, MAX_COLLECT_FIELDS)
    : []

  const payload = {
    name,
    tone,
    business_description: typeof businessDescription === 'string' ? businessDescription : '',
    goal,
    collect_fields: fields,
    // Legacy booleans stay in sync for rollback safety (never-drop
    // convention) -- nothing reads them anymore after 2026-08-20.
    collect_name: fields.includes('name'),
    collect_phone: fields.includes('phone'),
    timezone: timezone || 'Asia/Almaty',
    currency: currency || 'KZT',
  }

  let agent: any = null
  if (agentId) {
    const { data, error } = await supabase
      .from('ai_agents')
      .update(payload)
      .eq('id', agentId)
      .eq('user_id', user.id)
      .select()
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    agent = data
  } else {
    const { data, error } = await supabase
      .from('ai_agents')
      .insert({ user_id: user.id, ...payload })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    agent = data
  }

  // No wallet row to seed since the 2026-08-18 unified-wallet merge: spend
  // now debits the shared profiles.kaspi_wallet_balance, which always exists
  // (every user has a profiles row) and reads as 0 via COALESCE when untouched.

  return NextResponse.json({ agent })
}
