import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseFlowDefinition, type FlowDefinition } from '@/lib/aiAgent/flow'

// CRUD for ai_agent_flows -- the Сценарии tab's save/load surface. Mirrors
// src/app/api/ai-agent/templates/route.ts's shape (admin-only, agent
// ownership check, GET list / POST create-or-update / DELETE), except flows
// have no PATCH: the editor always sends the whole definition at once, so
// POST alone covers both create and update.

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

async function ownsAgent(userId: string, agentId: string): Promise<boolean> {
  const { data } = await supabase.from('ai_agents').select('id').eq('id', agentId).eq('user_id', userId).maybeSingle()
  return !!data
}

async function loadOwnedFlow(userId: string, flowId: string): Promise<{ id: string; agent_id: string } | null> {
  const { data: flow } = await supabase.from('ai_agent_flows').select('id, agent_id').eq('id', flowId).maybeSingle()
  if (!flow) return null
  if (!(await ownsAgent(userId, flow.agent_id))) return null
  return flow
}

const MAX_TRIGGERS = 20
const MAX_TRIGGER_LEN = 80
const MAX_NAME_LEN = 60
const MAX_STEPS = 30
const MAX_BUTTONS_PER_STEP = 8
const MAX_STEP_TEXT_LEN = 2000
const MAX_BUTTON_LABEL_LEN = 60

function normalizeTriggers(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const words: string[] = []
  for (const w of raw) {
    if (typeof w !== 'string') continue
    const trimmed = w.trim().slice(0, MAX_TRIGGER_LEN)
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    words.push(trimmed)
  }
  return words.slice(0, MAX_TRIGGERS)
}

// Re-validates shape AND enforces this route's own size caps --
// parseFlowDefinition (flow.ts) only checks structural validity (ids exist,
// references resolve); it has no opinion on limits, which belong to the API
// boundary, not the shared engine.
function normalizeDefinition(raw: unknown): FlowDefinition | null {
  const parsed = parseFlowDefinition(raw)
  if (!parsed) return null
  if (parsed.steps.length > MAX_STEPS) return null
  for (const step of parsed.steps) {
    if (step.text.length > MAX_STEP_TEXT_LEN) return null
    if (step.buttons.length > MAX_BUTTONS_PER_STEP) return null
    for (const button of step.buttons) {
      if (button.label.length > MAX_BUTTON_LABEL_LEN) return null
    }
  }
  return parsed
}

function toClientShape(row: any) {
  return {
    id: row.id,
    name: row.name,
    triggerWords: Array.isArray(row.trigger_words) ? row.trigger_words : [],
    isStart: !!row.is_start,
    definition: row.definition,
    createdAt: row.created_at,
  }
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const agentId = req.nextUrl.searchParams.get('agentId')
  if (!agentId) return NextResponse.json({ error: 'agentId required' }, { status: 400 })
  if (!(await ownsAgent(user.id, agentId))) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: rows, error } = await supabase
    .from('ai_agent_flows')
    .select('id, name, trigger_words, is_start, definition, created_at')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ flows: (rows || []).map(toClientShape) })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, MAX_NAME_LEN) : ''
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const triggerWords = normalizeTriggers(body?.triggerWords)
  if (triggerWords.length === 0) return NextResponse.json({ error: 'triggerWords required' }, { status: 400 })
  const definition = normalizeDefinition(body?.definition)
  if (!definition) return NextResponse.json({ error: 'invalid definition' }, { status: 400 })
  const isStart = !!body?.isStart

  const id = typeof body?.id === 'string' ? body.id : undefined
  let agentId: string
  if (id) {
    const existing = await loadOwnedFlow(user.id, id)
    if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    agentId = existing.agent_id
  } else {
    agentId = body?.agentId
    if (!agentId || typeof agentId !== 'string') return NextResponse.json({ error: 'agentId required' }, { status: 400 })
    if (!(await ownsAgent(user.id, agentId))) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // Enforce "at most one is_start flow per agent" server-side -- the client
  // toggling one on doesn't guarantee it also turned the old one off (a
  // stale tab, a race between two saves). Unset any OTHER flow's is_start
  // for this agent BEFORE the upsert, inside the same request, so the DB's
  // partial unique index never sees two true rows even transiently.
  if (isStart) {
    await supabase.from('ai_agent_flows').update({ is_start: false }).eq('agent_id', agentId).eq('is_start', true)
  }

  const { data: row, error } = await supabase
    .from('ai_agent_flows')
    .upsert(
      { ...(id ? { id } : {}), agent_id: agentId, name, trigger_words: triggerWords, definition, is_start: isStart },
      { onConflict: 'id' }
    )
    .select('id, name, trigger_words, is_start, definition, created_at')
    .single()
  if (error || !row) return NextResponse.json({ error: error?.message || 'save_failed' }, { status: 500 })

  return NextResponse.json({ flow: toClientShape(row) })
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const id = body?.id
  if (!id || typeof id !== 'string') return NextResponse.json({ error: 'id required' }, { status: 400 })
  const flow = await loadOwnedFlow(user.id, id)
  if (!flow) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Clear conversations pointing at this flow BEFORE deleting it -- the
  // DB's own "on delete set null" FK behavior only nulls active_flow_id,
  // leaving active_step_id populated as orphaned data. Doing it explicitly
  // here means the row is never left half-cleared.
  await supabase.from('ai_agent_conversations').update({ active_flow_id: null, active_step_id: null }).eq('active_flow_id', flow.id)

  const { error } = await supabase.from('ai_agent_flows').delete().eq('id', flow.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ deleted: true })
}
