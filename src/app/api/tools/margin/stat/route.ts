import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Anonymous usage stats for the free margin calculator.
//
// The point is to learn what numbers Kaspi sellers actually type -- typical
// cost, typical price, what commission they believe they pay -- so the
// calculator's defaults and fields can be made to fit them instead of being
// guessed at. Nothing here identifies a person: no account, no contact, no
// IP is stored. `sessionId` is a random id the page mints for itself and
// keeps for the visit, so a visitor who keeps editing collapses into one
// row rather than writing one per keystroke.

const RATE_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT = 60
const hits = new Map<string, number[]>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS)
  recent.push(now)
  hits.set(ip, recent)
  if (hits.size > 5000) hits.clear()
  return recent.length > RATE_LIMIT
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
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (rateLimited(ip)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const body = await req.json().catch(() => ({}))
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''
  if (!UUID_RE.test(sessionId)) {
    return NextResponse.json({ error: 'invalid_session' }, { status: 400 })
  }

  const lang = ['ru', 'kk', 'en'].includes(body?.lang) ? body.lang : null

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Upsert on session_id: the last state of the form wins, so a visitor who
  // never downloads the Excel is still counted with whatever they ended on.
  const { error } = await supabase.from('tool_margin_stats').upsert({
    session_id: sessionId,
    lang,
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
    // Never allowed to go back to false: a later autosave must not erase the
    // fact that this visitor downloaded the file.
    ...(body?.exported === true ? { exported: true } : {}),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'session_id' })

  if (error) {
    console.error('tools/margin/stat: upsert failed:', error.message)
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
