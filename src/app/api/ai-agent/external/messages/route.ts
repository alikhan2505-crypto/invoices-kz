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

  // Only approved messages. Both of these channels deliver by row — the client
  // polls this endpoint — so without the filter a reply still sitting in the
  // review queue was served to the customer the moment it was drafted, and
  // training mode simply did not exist here. Rejected drafts ('skipped') stay
  // hidden for the same reason.
  let query = supabase
    .from('ai_agent_messages')
    .select('id, direction, text, buttons, image_url, created_at')
    .eq('conversation_id', conversation.id)
    .eq('status', 'sent')
    .order('created_at', { ascending: true })
  if (since) query = query.gt('created_at', since)

  const { data: rows, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const messages = (rows || []).map(r => ({
    id: r.id,
    direction: r.direction,
    text: r.text,
    buttons: r.buttons as { label: string; payload: string }[] | null,
    // Product photo attached to this reply, null on most messages.
    imageUrl: r.image_url as string | null,
    createdAt: r.created_at,
  }))
  return NextResponse.json({ messages })
}
