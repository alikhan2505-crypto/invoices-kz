import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Public, unauthenticated, optional -- shown only after a successful merge
// on /tools/waybills, never a gate in front of the download. A free-form
// email-or-phone string, not two separate fields: the person just used the
// tool anonymously, so asking for exactly one thing they're willing to give
// keeps the ask as small as the tool's own "no signup" promise.
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

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const { contact } = await req.json().catch(() => ({ contact: null }))
  const trimmed = typeof contact === 'string' ? contact.trim() : ''
  if (!trimmed || trimmed.length > 200) {
    return NextResponse.json({ error: 'invalid_contact' }, { status: 400 })
  }

  const { error } = await supabase.from('tool_leads').insert({ tool: 'waybills', contact: trimmed })
  if (error) {
    console.error('tools/waybills/lead: insert failed:', error.message)
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 })
  }

  // Fire-and-forget, same as every other admin notice in this codebase
  // (e.g. api/account/delete) -- a failed Telegram send must never turn an
  // already-stored lead into an error response for the visitor.
  fetch('https://invoices.kz/api/telegram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET! },
    body: JSON.stringify({ message: `🆓 Лид со «Склейки накладных»: ${trimmed}` }),
  }).catch((e: any) => console.error('tools/waybills/lead: telegram notice failed:', e.message))

  return NextResponse.json({ ok: true })
}
