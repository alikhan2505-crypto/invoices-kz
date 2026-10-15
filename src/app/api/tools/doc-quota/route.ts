import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  almatyQuarter, claimCounterSlot, clientIp, docToolKey, DOC_TOOL_QUARTER_LIMIT,
  nextQuarterStart, parseDocQuotaTool, readCounter, remainingOf,
} from '@/lib/toolQuota'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Лимит бесплатных документов /tools/schet, /tools/avr, /tools/nakladnaya
// (и их /tools/kk/…, /tools/en/…): по 3 документа на IP в квартал по Алматы,
// у каждого инструмента свой счётчик — решение основателя 15.10.2026, «как в
// КП». Раньше было 3 в день в localStorage браузера (очищалось одной кнопкой).
//   GET  ?tool=schet|avr|nakladnaya — сколько осталось (подсказка под кнопкой);
//   POST { tool }                  — занять один документ ДО генерации; 429, если квартал исчерпан.
// Счётчик — общая таблица tool_kontragent_checks, ключ '<tool>:' + sha256('<tool>|ip|квартал')
// (IPv6 — по /64); сырой IP не хранится. Слот занимается compare-and-swap'ом,
// как в /api/tools/waybills: пачка параллельных кликов не проходит вся по одному
// прочитанному used. Счётчик не читается/не пишется — отказ 503, как у КП:
// лимит — продуктовое решение, раздавать без него нельзя.
const NO_STORE = { 'Cache-Control': 'no-store' }
const LIMIT = DOC_TOOL_QUARTER_LIMIT

function unavailable() {
  return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE })
}

function badTool() {
  return NextResponse.json({ error: 'bad_tool' }, { status: 400, headers: NO_STORE })
}

export async function GET(req: NextRequest) {
  const tool = parseDocQuotaTool(req.nextUrl.searchParams.get('tool'))
  if (!tool) return badTool()
  const counter = await readCounter(supabase, docToolKey(tool, clientIp(req.headers), almatyQuarter()))
  if (!counter.ok) return unavailable()
  return NextResponse.json(
    { remaining: remainingOf(counter.used, LIMIT), limit: LIMIT, resetsAt: nextQuarterStart() },
    { headers: NO_STORE },
  )
}

export async function POST(req: NextRequest) {
  let body: unknown = null
  try { body = await req.json() } catch {}
  const tool = parseDocQuotaTool((body as { tool?: unknown } | null)?.tool)
  if (!tool) return badTool()

  const key = docToolKey(tool, clientIp(req.headers), almatyQuarter())
  const resetsAt = nextQuarterStart()
  const limitReached = () => NextResponse.json(
    { error: 'limit', remaining: 0, limit: LIMIT, resetsAt },
    { status: 429, headers: NO_STORE },
  )

  const counter = await readCounter(supabase, key)
  if (!counter.ok) return unavailable()
  let used = counter.used
  if (used >= LIMIT) return limitReached()
  // 'raced' — слот перехватил параллельный запрос: перечитываем. Каждый 'raced'
  // значит, что кто-то другой занял слот, поэтому за LIMIT+1 попыток либо
  // займём, либо упрёмся в лимит.
  let claimed = false
  for (let attempt = 0; attempt <= LIMIT && !claimed; attempt++) {
    const claim = await claimCounterSlot(supabase, key, used)
    if (claim === 'error') return unavailable()
    if (claim === 'claimed') { claimed = true; break }
    const again = await readCounter(supabase, key)
    if (!again.ok) return unavailable()
    used = again.used
    if (used >= LIMIT) return limitReached()
  }
  if (!claimed) return unavailable()
  return NextResponse.json(
    { ok: true, remaining: remainingOf(used + 1, LIMIT), limit: LIMIT, resetsAt },
    { headers: NO_STORE },
  )
}
