import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// CRUD for ai_agent_reply_templates -- the saved "approved replies" the
// founder wants always visible and editable (Шаблоны tab). The webhook
// handlers (webhookHandler.ts / telegramWebhookHandler.ts) match these
// BEFORE calling the LLM: a trigger hit answers instantly and free.
// Rows are also created automatically by the review-queue approve flow;
// this route is the manual list/create/edit/delete surface for them.

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
async function isAdmin(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', userId).single()
  return !!profile?.is_admin
}

// Triggers are matched as case-insensitive substrings against every inbound
// message (findTemplateMatch), and reply_text is sent verbatim to customers
// -- both capped so a template can't balloon into an unbounded scan/send.
const MAX_TRIGGERS = 20
const MAX_TRIGGER_LEN = 80
const MAX_REPLY_LEN = 2000

// null means "not a usable trigger list" (wrong type or nothing left after
// trimming) -- the caller turns that into a 400.
function normalizeTriggers(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
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
  if (words.length === 0) return null
  return words.slice(0, MAX_TRIGGERS)
}

async function ownsAgent(userId: string, agentId: string): Promise<boolean> {
  const { data } = await supabase.from('ai_agents').select('id').eq('id', agentId).eq('user_id', userId).maybeSingle()
  return !!data
}

// PATCH/DELETE identify a template by its own id -- ownership is verified
// through its agent's user_id (template -> agent -> user), so a foreign id
// 404s identically to a nonexistent one.
async function loadOwnedTemplate(userId: string, templateId: string): Promise<{ id: string; agent_id: string } | null> {
  const { data: template } = await supabase
    .from('ai_agent_reply_templates')
    .select('id, agent_id')
    .eq('id', templateId)
    .maybeSingle()
  if (!template) return null
  if (!(await ownsAgent(userId, template.agent_id))) return null
  return template
}

function toClientShape(row: any) {
  return {
    id: row.id,
    triggerWords: Array.isArray(row.trigger_words) ? row.trigger_words : [],
    replyText: row.reply_text,
    channel: row.channel ?? null,
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

  // Oldest first -- matches the webhook handlers' own match order, so the
  // list on the Шаблоны tab reads in the same priority the bot applies.
  const { data: rows, error } = await supabase
    .from('ai_agent_reply_templates')
    .select('id, trigger_words, reply_text, channel, created_at')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ templates: (rows || []).map(toClientShape) })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const agentId = body?.agentId
  if (!agentId || typeof agentId !== 'string') return NextResponse.json({ error: 'agentId required' }, { status: 400 })
  if (!(await ownsAgent(user.id, agentId))) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const triggerWords = normalizeTriggers(body?.triggerWords)
  if (!triggerWords) return NextResponse.json({ error: 'triggerWords required' }, { status: 400 })
  const replyText = typeof body?.replyText === 'string' ? body.replyText.trim().slice(0, MAX_REPLY_LEN) : ''
  if (!replyText) return NextResponse.json({ error: 'replyText required' }, { status: 400 })

  // Manually created templates apply to every channel (channel stays null);
  // the review-approve flow may write channel-scoped rows itself.
  const { data: row, error } = await supabase
    .from('ai_agent_reply_templates')
    .insert({ agent_id: agentId, trigger_words: triggerWords, reply_text: replyText })
    .select('id, trigger_words, reply_text, channel, created_at')
    .single()
  if (error || !row) return NextResponse.json({ error: error?.message || 'insert_failed' }, { status: 500 })

  return NextResponse.json({ template: toClientShape(row) })
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const id = body?.id
  if (!id || typeof id !== 'string') return NextResponse.json({ error: 'id required' }, { status: 400 })
  const template = await loadOwnedTemplate(user.id, id)
  if (!template) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const update: Record<string, unknown> = {}
  if (body?.triggerWords !== undefined) {
    const triggerWords = normalizeTriggers(body.triggerWords)
    if (!triggerWords) return NextResponse.json({ error: 'invalid triggerWords' }, { status: 400 })
    update.trigger_words = triggerWords
  }
  if (body?.replyText !== undefined) {
    const replyText = typeof body.replyText === 'string' ? body.replyText.trim().slice(0, MAX_REPLY_LEN) : ''
    if (!replyText) return NextResponse.json({ error: 'invalid replyText' }, { status: 400 })
    update.reply_text = replyText
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

  const { data: row, error } = await supabase
    .from('ai_agent_reply_templates')
    .update(update)
    .eq('id', template.id)
    .select('id, trigger_words, reply_text, channel, created_at')
    .single()
  if (error || !row) return NextResponse.json({ error: error?.message || 'update_failed' }, { status: 500 })

  return NextResponse.json({ template: toClientShape(row) })
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const id = body?.id
  if (!id || typeof id !== 'string') return NextResponse.json({ error: 'id required' }, { status: 400 })
  const template = await loadOwnedTemplate(user.id, id)
  if (!template) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { error } = await supabase.from('ai_agent_reply_templates').delete().eq('id', template.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ deleted: true })
}
