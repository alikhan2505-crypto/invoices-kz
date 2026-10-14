import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isValidBin, normalizeBin } from '@/lib/binLookup'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Автозаполнение названия по БИН для бесплатного генератора счёта —
// СТРОГО из уже накопленного bin_lookup_cache, без единого похода в egov/КГД:
// квоты реестров этот публичный эндпоинт не тратит вовсе, поэтому и жёсткий
// дневной лимит ему не нужен. Отдаёт только идентификацию (название, адрес) —
// риски и НДС остаются инструменту /tools/kontragent с его лимитом 3 в квартал.
const RATE_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT = 30
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
  if (rateLimited(ip)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const body = await req.json().catch(() => ({}))
  const bin = normalizeBin(typeof body?.bin === 'string' ? body.bin : '')
  if (!isValidBin(bin)) return NextResponse.json({ error: 'БИН — 12 цифр' }, { status: 400 })

  const { data } = await supabase
    .from('bin_lookup_cache')
    .select('name, address')
    .eq('bin', bin)
    .maybeSingle()
  if (!data?.name) return NextResponse.json({ found: false })
  return NextResponse.json({ found: true, name: data.name, address: data.address || null })
}
