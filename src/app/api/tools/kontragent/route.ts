import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { isValidBin, normalizeBin } from '@/lib/binLookup'
import { performBinLookup } from '@/lib/binLookupServer'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Публичная проверка контрагента на /tools/kontragent — без входа, но не
// открытый прокси: 3 проверки на IP в КВАРТАЛ (решение основателя 14.10.2026,
// было 3 в день: маленькой компании хватает, остальным — кабинет) плюс общий
// дневной предохранитель, чтобы страница не выжгла квоту КГД (40 запросов в
// минуту на токен) и ключ egov.
const QUARTER_PER_IP = 3
const DAILY_GLOBAL = 300

// День считаем по Казахстану (единый UTC+5 по всей стране), чтобы «3 в день»
// обнулялось в местную полночь, а не в 06:00 утра.
function almatyDay(): string {
  return new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10)
}

// Квартал по Алматы: '2026-Q4'. Счётчик на IP живёт весь квартал.
function almatyQuarter(now = Date.now()): string {
  const d = new Date(now + 5 * 3600_000)
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`
}

export async function POST(req: NextRequest) {
  // Сырой IP в базу не пишем — только хэш с кварталом, этого достаточно для лимита.
  // Колонка day у строки = день последней проверки (для дневного предохранителя:
  // он чуть завышает счёт, это безопасная сторона).
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
  const day = almatyDay()
  const key = createHash('sha256').update(`${ip}|${almatyQuarter()}`).digest('hex')

  const { data: row, error: readError } = await supabase
    .from('tool_kontragent_checks')
    .select('count')
    .eq('key', key)
    .maybeSingle()
  // Если счётчик не читается, честнее отказать, чем раздавать без лимита:
  // лимит — продуктовое решение, а не только защита квоты.
  if (readError) {
    console.error('tools/kontragent: counter read failed:', readError.message)
    return NextResponse.json({ error: 'Сервис временно недоступен, попробуйте позже' }, { status: 503 })
  }
  const used = row?.count ?? 0
  if (used >= QUARTER_PER_IP) {
    return NextResponse.json({ error: 'limit', remaining: 0 }, { status: 429 })
  }

  const { data: dayRows } = await supabase
    .from('tool_kontragent_checks')
    .select('count')
    .eq('day', day)
  const totalToday = (dayRows ?? []).reduce((sum, r) => sum + (r.count || 0), 0)
  if (totalToday >= DAILY_GLOBAL) {
    return NextResponse.json({ error: 'busy' }, { status: 429 })
  }

  const body = await req.json().catch(() => ({}))
  const bin = normalizeBin(typeof body?.bin === 'string' ? body.bin : '')
  if (!isValidBin(bin)) {
    return NextResponse.json({ error: 'БИН должен состоять из 12 цифр' }, { status: 400 })
  }

  const result = await performBinLookup(supabase, bin)

  // Попытка списывается и за «не найдено»: реестры мы уже спросили. Ошибки
  // валидации выше не считаются. Гонка двух одновременных запросов может
  // недосчитать единицу — на этом масштабе безвредно.
  const { error: cntError } = await supabase
    .from('tool_kontragent_checks')
    .upsert({ key, day, count: used + 1 })
  if (cntError) console.error('tools/kontragent: counter write failed:', cntError.message)
  const remaining = Math.max(0, QUARTER_PER_IP - used - 1)

  if (!result.found) return NextResponse.json({ found: false, remaining })

  const c = result.company
  // Публичный ответ тоньше внутреннего: адрес, руководитель и ОКЭД остаются
  // за регистрацией — это и есть крючок. Отдаём только факт их наличия.
  return NextResponse.json({
    found: true,
    remaining,
    company: {
      bin: c.bin,
      name: c.name,
      status: c.status,
      registeredAt: c.registeredAt,
      source: c.source,
      isVatPayer: c.isVatPayer,
      vatRegisteredAt: c.vatRegisteredAt,
      isUnreliable: c.isUnreliable,
      isLiquidating: c.isLiquidating,
      totalArrear: c.totalArrear,
      taxArrear: c.taxArrear,
      hasFullCard: Boolean(c.address || c.director || c.activity),
    },
  })
}
