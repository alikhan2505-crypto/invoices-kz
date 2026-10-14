import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  almatyQuarter, clientIp, kpClaimKey, KP_QUARTER_LIMIT, nextQuarterStart,
  readCounter, remainingOf, writeCounter,
} from '@/lib/toolQuota'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Лимит бесплатного генератора КП (/tools/kp, /tools/kk/kp, /tools/en/kp):
// 3 предложения на IP в квартал по Алматы — решение основателя 14.10.2026,
// было 3 в день в localStorage браузера (очищалось одной кнопкой).
//   GET  — сколько осталось (для подсказки «Осталось N из 3 в этом квартале»);
//   POST — списать одно КП перед генерацией; 429, если квартал исчерпан.
// Счётчик — общая таблица tool_kontragent_checks, ключ 'kp:' + sha256('kp|ip|квартал');
// сырой IP не хранится. Если счётчик не читается — отказ 503, как у контрагента:
// лимит — продуктовое решение, раздавать без него нельзя.
const NO_STORE = { 'Cache-Control': 'no-store' }

function unavailable() {
  return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE })
}

export async function GET(req: NextRequest) {
  const key = kpClaimKey(clientIp(req.headers), almatyQuarter())
  const counter = await readCounter(supabase, key)
  if (!counter.ok) return unavailable()
  return NextResponse.json(
    { remaining: remainingOf(counter.used, KP_QUARTER_LIMIT), limit: KP_QUARTER_LIMIT, resetsAt: nextQuarterStart() },
    { headers: NO_STORE },
  )
}

export async function POST(req: NextRequest) {
  const key = kpClaimKey(clientIp(req.headers), almatyQuarter())
  const counter = await readCounter(supabase, key)
  if (!counter.ok) return unavailable()
  const resetsAt = nextQuarterStart()
  if (counter.used >= KP_QUARTER_LIMIT) {
    return NextResponse.json(
      { error: 'limit', remaining: 0, limit: KP_QUARTER_LIMIT, resetsAt },
      { status: 429, headers: NO_STORE },
    )
  }
  // Читаем-и-пишем без транзакции: два одновременных клика с одного IP могут
  // недосчитать единицу — на этом масштабе безвредно (так же у контрагента).
  // Не записали — не выдаём: иначе КП ушло бы мимо лимита.
  const used = counter.used + 1
  if (!(await writeCounter(supabase, key, used))) return unavailable()
  return NextResponse.json(
    { ok: true, remaining: remainingOf(used, KP_QUARTER_LIMIT), limit: KP_QUARTER_LIMIT, resetsAt },
    { headers: NO_STORE },
  )
}
