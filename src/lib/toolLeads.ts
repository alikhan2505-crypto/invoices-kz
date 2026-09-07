import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Shared handler behind every free tool's optional "leave a contact" box.
//
// Public, unauthenticated, optional -- shown only after the tool has already
// done its job, never as a gate in front of it. A free-form email-or-phone
// string, not two separate fields: the person just used the tool anonymously,
// so asking for exactly one thing they're willing to give keeps the ask as
// small as the tool's own "no signup" promise.
//
// Lives in lib/ rather than in one of the routes because a Next route file may
// only export route handlers -- importing a helper out of one would break the
// build.

// Whitelisted rather than stored as given, so a public endpoint cannot write
// arbitrary strings into the column the funnel is grouped by.
const TOOL_LABELS: Record<string, string> = {
  waybills: 'Склейка накладных',
  margin: 'Калькулятор маржи',
}

const RATE_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT = 10
const hits = new Map<string, number[]>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS)
  recent.push(now)
  hits.set(ip, recent)
  if (hits.size > 5000) hits.clear()
  return recent.length > RATE_LIMIT
}

export async function saveToolLead(req: NextRequest, fallbackTool: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const body = await req.json().catch(() => ({}))
  const trimmed = typeof body?.contact === 'string' ? body.contact.trim() : ''
  if (!trimmed || trimmed.length > 200) {
    return NextResponse.json({ error: 'invalid_contact' }, { status: 400 })
  }

  const tool = typeof body?.tool === 'string' && TOOL_LABELS[body.tool] ? body.tool : fallbackTool
  if (!TOOL_LABELS[tool]) {
    return NextResponse.json({ error: 'unknown_tool' }, { status: 400 })
  }

  const { error } = await supabase.from('tool_leads').insert({ tool, contact: trimmed })
  if (error) {
    console.error('tools/lead: insert failed:', error.message)
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 })
  }

  // Fire-and-forget, same as every other admin notice in this codebase
  // (e.g. api/account/delete) -- a failed Telegram send must never turn an
  // already-stored lead into an error response for the visitor.
  fetch('https://invoices.kz/api/telegram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET! },
    body: JSON.stringify({ message: `🆓 Лид с «${TOOL_LABELS[tool]}»: ${trimmed}` }),
  }).catch((e: any) => console.error('tools/lead: telegram notice failed:', e.message))

  return NextResponse.json({ ok: true })
}
