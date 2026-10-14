import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isValidBin, normalizeBin } from '@/lib/binLookup'
import { performBinLookup } from '@/lib/binLookupServer'
import {
  almatyQuarter, cleanCompanyName, clientIp, kpLookupKey, KP_LOOKUP_QUARTER_LIMIT,
  readCounter, registryLoadToday, REGISTRY_DAILY_GLOBAL, writeCounter,
} from '@/lib/toolQuota'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Название клиента по БИН для бесплатного КП — «пусть сама ищет» (решение
// основателя 14.10.2026): страница зовёт этот роут сама, как только в поле
// 12 цифр. Отдаём ТОЛЬКО название — НДС, долги и неблагонадёжность остаются
// отдельному продукту /tools/kontragent с его лимитом.
//   1) bin_lookup_cache — бесплатно, квоту реестров не тратит (как /api/tools/bin-cache);
//   2) нет в кэше — живой performBinLookup, но не больше 3 раз на IP в квартал
//      (решение основателя 14.10.2026) и в рамках общего дневного предохранителя
//      REGISTRY_DAILY_GLOBAL, который делится с проверкой контрагента.
// Бюджет кончился — { found:false, reason } и страница просит ввести вручную.
const NO_STORE = { 'Cache-Control': 'no-store' }

// Кэш отдаёт названия без похода в реестры, но перебирать его подряд не даём —
// тот же оконный лимит, что у /api/tools/bin-cache (в памяти инстанса).
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

function miss(reason: 'not_found' | 'limit' | 'busy' | 'unavailable') {
  return NextResponse.json({ found: false, reason }, { headers: NO_STORE })
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers)
  if (rateLimited(ip)) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: NO_STORE })

  const body = await req.json().catch(() => ({}))
  const bin = normalizeBin(typeof body?.bin === 'string' ? body.bin : '')
  if (!isValidBin(bin)) return NextResponse.json({ error: 'БИН — 12 цифр' }, { status: 400, headers: NO_STORE })

  const { data: cached } = await supabase
    .from('bin_lookup_cache')
    .select('name')
    .eq('bin', bin)
    .maybeSingle()
  const cachedName = cleanCompanyName(cached?.name)
  if (cachedName) return NextResponse.json({ found: true, name: cachedName, source: 'cache' }, { headers: NO_STORE })

  const key = kpLookupKey(ip, almatyQuarter())
  const counter = await readCounter(supabase, key)
  if (!counter.ok) return miss('unavailable')
  if (counter.used >= KP_LOOKUP_QUARTER_LIMIT) return miss('limit')
  if ((await registryLoadToday(supabase)) >= REGISTRY_DAILY_GLOBAL) return miss('busy')

  // Списываем ДО похода в реестры: не записали — не идём (иначе лимит дырявый).
  // Попытка считается и за «не найдено» — реестры мы уже спросили.
  if (!(await writeCounter(supabase, key, counter.used + 1))) return miss('unavailable')

  const result = await performBinLookup(supabase, bin)
  const name = result.found ? cleanCompanyName(result.company.name) : null
  if (!name) return miss('not_found')
  return NextResponse.json({ found: true, name, source: 'registry' }, { headers: NO_STORE })
}
