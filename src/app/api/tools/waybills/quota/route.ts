import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  almatyMonth, clientIp, nextMonthStart, readCounter, remainingOf,
  waybillsKey, waybillsUnlimited, WAYBILLS_MONTH_LIMIT,
} from '@/lib/toolQuota'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Сколько бесплатных склеек накладных осталось (/tools/waybills, /tools/kk/waybills,
// /tools/en/waybills) — для подсказки под кнопкой. Только чтение: списывает сам
// POST /api/tools/waybills: занимает слот до склейки, неудачной — возвращает.
//   есть Kaspi Bot (Про или is_admin, Authorization: Bearer) — { unlimited: true };
//   все остальные, в том числе вошедшие на Free/Базовом/триале, —
//   { remaining, limit, resetsAt } на IP в месяц по Алматы;
//   счётчик не читается — 503 (клиент тогда не блокирует, решает POST).
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET(req: NextRequest) {
  if (await waybillsUnlimited(supabase, req.headers)) {
    return NextResponse.json({ unlimited: true }, { headers: NO_STORE })
  }
  const counter = await readCounter(supabase, waybillsKey(clientIp(req.headers), almatyMonth()))
  if (!counter.ok) return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE })
  return NextResponse.json(
    { remaining: remainingOf(counter.used, WAYBILLS_MONTH_LIMIT), limit: WAYBILLS_MONTH_LIMIT, resetsAt: nextMonthStart() },
    { headers: NO_STORE },
  )
}
