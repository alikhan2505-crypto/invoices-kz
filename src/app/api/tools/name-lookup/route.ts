import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isValidBin, normalizeBin } from '@/lib/binLookup'
import { performBinLookup } from '@/lib/binLookupServer'
import {
  almatyQuarter, cleanCompanyName, clientIp, nameLookupKey, NAME_LOOKUP_QUARTER_LIMIT,
  claimCounterSlot, parseNameLookupTarget, readCounter, registryLoadToday, REGISTRY_DAILY_GLOBAL,
} from '@/lib/toolQuota'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Название компании по БИН/ИИН для бесплатных документов /tools/kp, schet,
// avr, nakladnaya — и для своей компании («От кого»), и для клиента. Страница
// зовёт роут ТОЛЬКО по кнопке «Найти» (решение основателя 14.10.2026, подтверждено
// 29.10.2026). Автопоиск на 12-й цифре написан (BinNameField, binAutofill.ts), но выключен
// флагом AUTO_NAME_LOOKUP_ENABLED; если его включат, БИН из черновика или запомненных
// реквизитов поиск не будит: перезагрузка квоту не тратит.
// Отдаём ТОЛЬКО название — НДС, долги и неблагонадёжность остаются отдельному
// продукту /tools/kontragent с его лимитом.
//
// POST { bin: '12 цифр', tool: 'kp'|'schet'|'avr'|'nakladnaya', role: 'seller'|'client' }
//   200 { found: true, name, source: 'cache'|'registry' }
//   200 { found: false, reason: 'not_found'|'limit'|'busy'|'unavailable' }
//   400 { error } — не 12 цифр или tool/role не из белого списка
//   429 { error: 'rate_limited' } — перебор кэша с одного IP
//
//   1) bin_lookup_cache — бесплатно и без лимита, квоту реестров не тратит;
//   2) нет в кэше — живой performBinLookup, но не больше 3 раз на IP в квартал
//      на КАЖДОЕ поле каждого инструмента (ключ lookup:<tool>|<role>) и в рамках
//      общего дневного предохранителя REGISTRY_DAILY_GLOBAL, который делится с
//      проверкой контрагента.
// Бюджет кончился — { found:false, reason } и страница просит ввести вручную.
const NO_STORE = { 'Cache-Control': 'no-store' }

// Кэш отдаёт названия без похода в реестры, но перебирать его подряд не даём —
// оконный лимит в памяти инстанса.
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
  const target = parseNameLookupTarget(body?.tool, body?.role)
  if (!target) return NextResponse.json({ error: 'bad_target' }, { status: 400, headers: NO_STORE })
  const bin = normalizeBin(typeof body?.bin === 'string' ? body.bin : '')
  if (!isValidBin(bin)) return NextResponse.json({ error: 'БИН — 12 цифр' }, { status: 400, headers: NO_STORE })

  const { data: cached } = await supabase
    .from('bin_lookup_cache')
    .select('name')
    .eq('bin', bin)
    .maybeSingle()
  const cachedName = cleanCompanyName(cached?.name)
  if (cachedName) return NextResponse.json({ found: true, name: cachedName, source: 'cache' }, { headers: NO_STORE })

  const key = nameLookupKey(target.tool, target.role, ip, almatyQuarter())
  const counter = await readCounter(supabase, key)
  if (!counter.ok) return miss('unavailable')
  if (counter.used >= NAME_LOOKUP_QUARTER_LIMIT) return miss('limit')
  if ((await registryLoadToday(supabase)) >= REGISTRY_DAILY_GLOBAL) return miss('busy')

  // Списываем ДО похода в реестры: не заняли слот — не идём (иначе лимит
  // дырявый). Слот занимаем атомарно (compare-and-swap), чтобы пачка
  // параллельных запросов с одного IP не прошла вся по used=0. Попытка
  // считается и за «не найдено» — реестры мы уже спросили.
  let used = counter.used
  let claimed = false
  for (let attempt = 0; attempt < 3 && !claimed; attempt++) {
    const claim = await claimCounterSlot(supabase, key, used)
    if (claim === 'error') return miss('unavailable')
    if (claim === 'claimed') { claimed = true; break }
    const again = await readCounter(supabase, key)
    if (!again.ok) return miss('unavailable')
    used = again.used
    if (used >= NAME_LOOKUP_QUARTER_LIMIT) return miss('limit')
  }
  if (!claimed) return miss('unavailable')

  const result = await performBinLookup(supabase, bin)
  const name = result.found ? cleanCompanyName(result.company.name) : null
  if (!name) return miss('not_found')
  return NextResponse.json({ found: true, name, source: 'registry' }, { headers: NO_STORE })
}
