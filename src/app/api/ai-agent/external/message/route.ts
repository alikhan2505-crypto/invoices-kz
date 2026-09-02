import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadExternalApiConnection, handleExternalApiIncoming } from '@/lib/aiAgent/externalApiWebhookHandler'
import { isValidApiKeyFormat, exceedsExternalApiRateLimit, EXTERNAL_API_RATE_WINDOW_MS } from '@/lib/aiAgent/externalApi'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Server-to-server -- the caller's own backend holds the secret key, so
// unlike the website widget's POST this needs no CORS handling and no
// per-visitor rate tier: see externalApi.ts for why one aggregate limit is
// enough here.
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('authorization')?.replace('Bearer ', '') || ''
  if (!isValidApiKeyFormat(apiKey)) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const conn = await loadExternalApiConnection(apiKey)
  if (!conn) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const externalUserId = typeof body?.externalUserId === 'string' ? body.externalUserId.trim() : ''
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  const customerName = typeof body?.customerName === 'string' ? body.customerName : undefined
  const isButtonClick = !!body?.isButtonClick
  if (!externalUserId || !text || text.length > 2000) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const rateWindowStart = new Date(Date.now() - EXTERNAL_API_RATE_WINDOW_MS).toISOString()
  const { data: agentConversations } = await supabase
    .from('ai_agent_conversations')
    .select('id')
    .eq('agent_id', conn.agentId)
    .eq('channel', 'api')
  const agentConversationIds = (agentConversations || []).map(c => c.id)
  if (agentConversationIds.length > 0) {
    const { count } = await supabase
      .from('ai_agent_messages')
      .select('id', { count: 'exact', head: true })
      .in('conversation_id', agentConversationIds)
      .eq('direction', 'inbound')
      .gte('created_at', rateWindowStart)
    if (exceedsExternalApiRateLimit(count ?? 0)) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }
  }

  await handleExternalApiIncoming(conn, { externalUserId, text, customerName, isButtonClick })
  return NextResponse.json({ ok: true })
}
