import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadExternalApiConnection } from '@/lib/aiAgent/externalApiWebhookHandler'
import { isValidApiKeyFormat } from '@/lib/aiAgent/externalApi'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Polled by the caller's own backend. `since` omitted returns the full
// existing history for this end-user; every later call passes the latest
// `createdAt` it already has, same idiom as widget/messages.
export async function GET(req: NextRequest) {
  const apiKey = req.headers.get('authorization')?.replace('Bearer ', '') || ''
  if (!isValidApiKeyFormat(apiKey)) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const conn = await loadExternalApiConnection(apiKey)
  if (!conn) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const externalUserId = (req.nextUrl.searchParams.get('externalUserId') || '').trim()
  const since = req.nextUrl.searchParams.get('since')
  if (!externalUserId) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .select('id')
    .eq('agent_id', conn.agentId)
    .eq('channel', 'api')
    .eq('external_thread_id', externalUserId)
    .maybeSingle()
  if (!conversation) return NextResponse.json({ messages: [] })

  let query = supabase
    .from('ai_agent_messages')
    .select('id, direction, text, buttons, created_at')
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: true })
  if (since) query = query.gt('created_at', since)

  const { data: rows, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const messages = (rows || []).map(r => ({
    id: r.id,
    direction: r.direction,
    text: r.text,
    buttons: r.buttons as { label: string; payload: string }[] | null,
    createdAt: r.created_at,
  }))
  return NextResponse.json({ messages })
}
