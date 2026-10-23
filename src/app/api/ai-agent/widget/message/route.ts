import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { loadWebsiteConnection, handleWebsiteIncoming } from '@/lib/aiAgent/websiteWebhookHandler'
import {
  isValidWidgetKeyFormat, isValidVisitorId, exceedsRateLimit, WIDGET_MESSAGE_RATE_WINDOW_MS,
  WIDGET_AGENT_MESSAGE_RATE_LIMIT, WIDGET_AGENT_DAILY_LIMIT, WIDGET_IP_RATE_LIMIT, WIDGET_IP_DAILY_LIMIT,
  WIDGET_MAX_TEXT_LENGTH, WIDGET_MAX_BODY_CHARS,
} from '@/lib/aiAgent/widget'
import { checkLimits, hashIpForLimiter, pruneLimiterRows, shouldPrune, readBodyCapped, type LimitSpec } from '@/lib/aiAgent/widgetLimiter'
import { clientIp, quotaIp } from '@/lib/toolQuota'
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
//
// Every limit below FAILS CLOSED (audit 2026-10-24): a database error while
// checking one answers 503 and never reaches the model -- the old agent-wide
// count silently turned an error into "0 messages" and lost the limit.
export async function POST(req: NextRequest) {
  const parsed = await readBodyCapped(req, WIDGET_MAX_BODY_CHARS)
  if (!parsed.ok) {
    return parsed.reason === 'too_large' ? corsJson({ error: 'payload_too_large' }, 413) : corsJson({ error: 'invalid_request' }, 400)
  }
  const body = (parsed.json && typeof parsed.json === 'object' ? parsed.json : null) as Record<string, unknown> | null
  const widgetKey = typeof body?.widgetKey === 'string' ? body.widgetKey : ''
  const visitorId = typeof body?.visitorId === 'string' ? body.visitorId.trim() : ''
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  const isButtonClick = !!body?.isButtonClick
  if (!isValidWidgetKeyFormat(widgetKey) || !isValidVisitorId(visitorId) || !text || text.length > WIDGET_MAX_TEXT_LENGTH) {
    return corsJson({ error: 'invalid_request' }, 400)
  }

  const conn = await loadWebsiteConnection(widgetKey)
  if (!conn) return corsJson({ error: 'not_found' }, 404)

  const rateWindowStart = new Date(Date.now() - WIDGET_MESSAGE_RATE_WINDOW_MS).toISOString()

  // Rate limit scoped to (agent, visitor) -- counts messages this visitor's
  // conversation has received in the last minute, regardless of whether it
  // already exists yet (a brand-new visitor's first message always passes).
  const { data: conversation, error: conversationError } = await supabase
    .from('ai_agent_conversations')
    .select('id')
    .eq('agent_id', conn.agentId)
    .eq('channel', 'website')
    .eq('external_thread_id', visitorId)
    .maybeSingle()
  if (conversationError) {
    console.error('ai-agent widget: visitor conversation lookup failed:', conversationError.message)
    return corsJson({ error: 'unavailable' }, 503)
  }
  if (conversation) {
    const { count, error: countError } = await supabase
      .from('ai_agent_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversation.id)
      .eq('direction', 'inbound')
      .gte('created_at', rateWindowStart)
    if (countError || count === null) {
      console.error('ai-agent widget: visitor rate count failed:', countError?.message)
      return corsJson({ error: 'unavailable' }, 503)
    }
    if (exceedsRateLimit(count)) {
      return corsJson({ error: 'rate_limited' }, 429)
    }
  }

  // Limits scoped beyond one visitor -- visitorId is entirely client-supplied
  // and free to fabricate, so a script dodges the per-visitor limit above by
  // rotating it on every request. These are the actual backstop: per IP (a
  // rotating script usually still comes from few addresses), per agent per
  // minute, and a per-agent daily cap so even a distributed flood has a
  // ceiling on how much of the seller's wallet it can burn. Counters live in
  // widgetLimiter.ts (one row per window, compare-and-swap, no id lists).
  const ipHash = hashIpForLimiter(quotaIp(clientIp(req.headers)))
  const limits: LimitSpec[] = [
    { scope: 'wi', id: ipHash, unit: 'm', limit: WIDGET_IP_RATE_LIMIT },
    { scope: 'wi', id: ipHash, unit: 'd', limit: WIDGET_IP_DAILY_LIMIT },
    { scope: 'wa', id: conn.agentId, unit: 'm', limit: WIDGET_AGENT_MESSAGE_RATE_LIMIT },
    { scope: 'wa', id: conn.agentId, unit: 'd', limit: WIDGET_AGENT_DAILY_LIMIT },
  ]
  const verdict = await checkLimits(supabase, limits)
  if (verdict === 'error') return corsJson({ error: 'unavailable' }, 503)
  if (verdict === 'limited') return corsJson({ error: 'rate_limited' }, 429)

  if (shouldPrune()) await pruneLimiterRows(supabase)

  await handleWebsiteIncoming(conn, { externalId: crypto.randomUUID(), visitorId, text, isButtonClick })
  return corsJson({ ok: true })
}
