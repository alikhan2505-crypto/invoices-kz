import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadWebsiteConnection } from '@/lib/aiAgent/websiteWebhookHandler'
import { isValidWidgetKeyFormat } from '@/lib/aiAgent/widget'
import { corsJson, corsPreflight } from '@/lib/aiAgent/corsJson'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function OPTIONS() {
  return corsPreflight()
}

// Public, cross-origin, unauthenticated -- polled by the widget every 5s.
// `since` omitted (first call after the widget mounts) returns the full
// existing history for this visitor; every later call passes the latest
// `createdAt` it has already rendered, so the response never repeats a
// message the widget already has (no separate client-side dedup needed).
export async function GET(req: NextRequest) {
  const widgetKey = req.nextUrl.searchParams.get('widgetKey') || ''
  const visitorId = (req.nextUrl.searchParams.get('visitorId') || '').trim()
  const since = req.nextUrl.searchParams.get('since')
  if (!isValidWidgetKeyFormat(widgetKey) || !visitorId) {
    return corsJson({ error: 'invalid_request' }, 400)
  }

  const conn = await loadWebsiteConnection(widgetKey)
  if (!conn) return corsJson({ error: 'not_found' }, 404)

  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .select('id')
    .eq('agent_id', conn.agentId)
    .eq('channel', 'website')
    .eq('external_thread_id', visitorId)
    .maybeSingle()
  if (!conversation) return corsJson({ messages: [] })

  let query = supabase
    .from('ai_agent_messages')
    .select('id, direction, text, buttons, created_at')
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: true })
  if (since) query = query.gt('created_at', since)

  const { data: rows, error } = await query
  if (error) return corsJson({ error: error.message }, 500)

  const messages = (rows || []).map(r => ({
    id: r.id,
    direction: r.direction,
    text: r.text,
    buttons: r.buttons as { label: string; payload: string }[] | null,
    createdAt: r.created_at,
  }))
  return corsJson({ messages })
}
