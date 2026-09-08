import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { KASPI_CATEGORY_COMMISSIONS } from '@/lib/kaspiShop/margin'

// Anonymous usage stats for the free margin calculator.
//
// The point is to learn what numbers Kaspi sellers actually type -- typical
// cost, typical price, what commission they believe they pay -- so the
// calculator's defaults and fields can be made to fit them instead of being
// guessed at. Nothing here identifies a person: no account, no contact, no
// IP is stored. `sessionId` is a random id the page mints for itself and
// keeps for the visit, so a visitor who keeps editing collapses into one
// row rather than writing one per keystroke.
//
// The session id is chosen by the client, so a caller minting a fresh one per
// request would insert a new row every time. The per-IP counter below is only
// best-effort -- it lives in one lambda instance's memory, and an attacker
// gets a fresh counter on every cold start -- so the ceiling that actually
// bounds this table is the database-side one in `newSessionsExhausted`,
// which no amount of instance churn or spoofed headers can get around. Same
// reasoning as isConversationRateLimited in src/lib/aiAgent/rateLimit.ts.

const RATE_WINDOW_MS = 10 * 60 * 1000
// A real visit sends a handful: the client debounces 2.5s and only fires
// after the visitor edits something.
const REQUESTS_PER_IP = 20
const SESSIONS_PER_IP = 5
const NEW_SESSIONS_PER_HOUR = 500

const requestHits = new Map<string, number[]>()
const sessionHits = new Map<string, Map<string, number>>()

function rateLimited(ip: string, sessionId: string): boolean {
  const now = Date.now()

  const recent = (requestHits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS)
  recent.push(now)
  requestHits.set(ip, recent)
  if (requestHits.size > 5000) requestHits.clear()
  if (recent.length > REQUESTS_PER_IP) return true

  // Distinct sessions, not just request count: one row is created per session
  // id, so this is the part that maps to rows written.
  const seen = sessionHits.get(ip) || new Map<string, number>()
  for (const [id, at] of seen) if (now - at >= RATE_WINDOW_MS) seen.delete(id)
  const isNew = !seen.has(sessionId)
  seen.set(sessionId, now)
  sessionHits.set(ip, seen)
  if (sessionHits.size > 5000) sessionHits.clear()
  return isNew && seen.size > SESSIONS_PER_IP
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Anything outside this is a typo or a probe, not a real seller's figure.
// Clamped rather than rejected so one absurd field doesn't discard the rest
// of an otherwise useful row.
const MAX_MONEY = 1_000_000_000

function num(v: unknown): number | null {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.max(-MAX_MONEY, Math.min(MAX_MONEY, Math.round(n * 100) / 100))
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''
  if (!UUID_RE.test(sessionId)) {
    return NextResponse.json({ error: 'invalid_session' }, { status: 400 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (rateLimited(ip, sessionId)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const lang = ['ru', 'kk', 'en'].includes(body?.lang) ? body.lang : null

  // Checked against the real category list rather than stored as sent: this
  // is a public endpoint, and a free-text column is a free-text column.
  const category = KASPI_CATEGORY_COMMISSIONS.some(c => c.label === body?.category)
    ? String(body.category)
    : null

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const fields = {
    lang,
    category,
    cost_price: num(body?.costPrice),
    sell_price: num(body?.sellPrice),
    commission_percent: num(body?.commissionPercent),
    delivery_cost: num(body?.deliveryCost),
    tax_percent: num(body?.taxPercent),
    other_costs: num(body?.otherCosts),
    monthly_units: num(body?.monthlyUnits),
    profit_per_unit: num(body?.profitPerUnit),
    margin_percent: num(body?.marginPercent),
    break_even_price: num(body?.breakEvenPrice),
    updated_at: new Date().toISOString(),
    // Never allowed to go back to false: a later autosave must not erase the
    // fact that this visitor downloaded the file.
    ...(body?.exported === true ? { exported: true } : {}),
  }

  // Update first, so the common case -- a visitor still editing -- never
  // touches the ceiling below and never writes a second row.
  const { data: updated, error: updateError } = await supabase
    .from('tool_margin_stats')
    .update(fields)
    .eq('session_id', sessionId)
    .select('id')
    .maybeSingle()

  if (updateError) {
    console.error('tools/margin/stat: update failed:', updateError.message)
    return NextResponse.json({ error: 'write_failed' }, { status: 500 })
  }
  if (updated) return NextResponse.json({ ok: true })

  // A brand-new session is the only thing that grows the table, so that is
  // where the ceiling belongs. Fails CLOSED, unlike the AI rate limit: this
  // is analytics, so dropping a sample costs a data point, while letting the
  // table grow without bound costs the database.
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count, error: countError } = await supabase
    .from('tool_margin_stats')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since)
  if (countError) {
    console.error('tools/margin/stat: ceiling check failed:', countError.message)
    return NextResponse.json({ ok: true, recorded: false })
  }
  if ((count ?? 0) >= NEW_SESSIONS_PER_HOUR) {
    console.warn(`tools/margin/stat: hourly ceiling reached (${count}) -- not recording new sessions`)
    return NextResponse.json({ ok: true, recorded: false })
  }

  const { error: insertError } = await supabase
    .from('tool_margin_stats')
    .insert({ session_id: sessionId, ...fields })
  if (insertError) {
    console.error('tools/margin/stat: insert failed:', insertError.message)
    return NextResponse.json({ error: 'write_failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
