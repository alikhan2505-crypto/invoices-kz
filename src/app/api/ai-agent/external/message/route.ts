import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadExternalApiConnection, handleExternalApiIncoming } from '@/lib/aiAgent/externalApiWebhookHandler'
import {
  isValidApiKeyFormat, EXTERNAL_API_AGENT_RATE_LIMIT, EXTERNAL_API_AGENT_DAILY_LIMIT, EXTERNAL_API_MAX_TEXT_LENGTH,
  EXTERNAL_API_MAX_BODY_CHARS, EXTERNAL_API_MAX_USER_ID_LENGTH, EXTERNAL_API_MAX_CUSTOMER_NAME_LENGTH,
} from '@/lib/aiAgent/externalApi'
import { checkLimits, pruneLimiterRows, shouldPrune, readBodyCapped, type LimitSpec } from '@/lib/aiAgent/widgetLimiter'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Server-to-server -- the caller's own backend holds the secret key, so
// unlike the website widget's POST this needs no CORS handling and no
// per-visitor or per-IP tier (one integration server = one IP): see
// externalApi.ts for why aggregate limits are enough here.
//
// Limits FAIL CLOSED (audit 2026-10-24): the old agent-wide count selected
// every conversation id and ran .in(ids), so past ~1000 conversations the
// list was truncated, the error became "0 messages" and the limit vanished.
// Now one counter row per window (widgetLimiter.ts) plus a daily cap, and any
// counter error answers 503 without reaching the model.
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('authorization')?.replace('Bearer ', '') || ''
  if (!isValidApiKeyFormat(apiKey)) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const conn = await loadExternalApiConnection(apiKey)
  if (!conn) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = await readBodyCapped(req, EXTERNAL_API_MAX_BODY_CHARS)
  if (!parsed.ok) {
    return parsed.reason === 'too_large'
      ? NextResponse.json({ error: 'payload_too_large' }, { status: 413 })
      : NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
  const body = (parsed.json && typeof parsed.json === 'object' ? parsed.json : null) as Record<string, unknown> | null
  const externalUserId = typeof body?.externalUserId === 'string' ? body.externalUserId.trim() : ''
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  const customerName = typeof body?.customerName === 'string' ? body.customerName.trim().slice(0, EXTERNAL_API_MAX_CUSTOMER_NAME_LENGTH) : undefined
  const isButtonClick = !!body?.isButtonClick
  if (!externalUserId || externalUserId.length > EXTERNAL_API_MAX_USER_ID_LENGTH || !text || text.length > EXTERNAL_API_MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const limits: LimitSpec[] = [
    { scope: 'ea', id: conn.agentId, unit: 'm', limit: EXTERNAL_API_AGENT_RATE_LIMIT },
    { scope: 'ea', id: conn.agentId, unit: 'd', limit: EXTERNAL_API_AGENT_DAILY_LIMIT },
  ]
  const verdict = await checkLimits(supabase, limits)
  if (verdict === 'error') return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  if (verdict === 'limited') return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  if (shouldPrune()) await pruneLimiterRows(supabase)

  await handleExternalApiIncoming(conn, { externalUserId, text, customerName: customerName || undefined, isButtonClick })
  return NextResponse.json({ ok: true })
}
