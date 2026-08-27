import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { loadWebsiteConnection, handleWebsiteIncoming } from '@/lib/aiAgent/websiteWebhookHandler'
import { isValidWidgetKeyFormat, exceedsRateLimit, WIDGET_MESSAGE_RATE_WINDOW_MS } from '@/lib/aiAgent/widget'
import { corsJson, corsPreflight } from '@/lib/aiAgent/corsJson'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function OPTIONS() {
  return corsPreflight()
}

// Public, cross-origin, unauthenticated -- the widget's own JS calls this
// directly from whatever domain the seller embedded it on. No webhook
// redelivery concept exists here (unlike Telegram/WhatsApp/Instagram), so
// externalId is generated fresh per call rather than sourced from a
// platform -- there is nothing to deduplicate a genuine double-send against.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const widgetKey = typeof body?.widgetKey === 'string' ? body.widgetKey : ''
  const visitorId = typeof body?.visitorId === 'string' ? body.visitorId.trim() : ''
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  const isButtonClick = !!body?.isButtonClick
  if (!isValidWidgetKeyFormat(widgetKey) || !visitorId || !text || text.length > 2000) {
    return corsJson({ error: 'invalid_request' }, 400)
  }

  const conn = await loadWebsiteConnection(widgetKey)
  if (!conn) return corsJson({ error: 'not_found' }, 404)

  // Rate limit scoped to (agent, visitor) -- counts messages this visitor's
  // conversation has received in the last minute, regardless of whether it
  // already exists yet (a brand-new visitor's first message always passes).
  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .select('id')
    .eq('agent_id', conn.agentId)
    .eq('channel', 'website')
    .eq('external_thread_id', visitorId)
    .maybeSingle()
  if (conversation) {
    const { count } = await supabase
      .from('ai_agent_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversation.id)
      .eq('direction', 'inbound')
      .gte('created_at', new Date(Date.now() - WIDGET_MESSAGE_RATE_WINDOW_MS).toISOString())
    if (exceedsRateLimit(count ?? 0)) {
      return corsJson({ error: 'rate_limited' }, 429)
    }
  }

  await handleWebsiteIncoming(conn, { externalId: crypto.randomUUID(), visitorId, text, isButtonClick })
  return corsJson({ ok: true })
}
