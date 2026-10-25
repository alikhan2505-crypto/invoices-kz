import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isValidBin, normalizeBin } from '@/lib/binLookup'
import { performBinLookup } from '@/lib/binLookupServer'
import { almatyQuarter, clientIp, readCounter, registryLoadToday, REGISTRY_DAILY_GLOBAL, sha256Hex, writeCounter } from '@/lib/toolQuota'

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
// Общий дневной предохранитель (REGISTRY_DAILY_GLOBAL) делится с живым
// поиском названия клиента в /tools/kp — оба тратят одну квоту реестров.
// Квартал/день по Алматы и чтение счётчика — в src/lib/toolQuota.ts.

export async function POST(req: NextRequest) {
  // Сырой IP в базу не пишем — только хэш с кварталом, этого достаточно для лимита.
  // Колонка day у строки = день последней проверки (для дневного предохранителя:
  // он чуть завышает счёт, это безопасная сторона).
  const ip = clientIp(req.headers)
  // Формат ключа прежний — sha256('ip|квартал'), чтобы смена кода не обнулила
  // уже накопленные за квартал счётчики. Ключи КП живут в своём пространстве имён.
  const key = sha256Hex(`${ip}|${almatyQuarter()}`)

  const counter = await readCounter(supabase, key)
  // Если счётчик не читается, честнее отказать, чем раздавать без лимита:
  // лимит — продуктовое решение, а не только защита квоты.
  if (!counter.ok) {
    return NextResponse.json({ error: 'Сервис временно недоступен, попробуйте позже' }, { status: 503 })
  }
  const used = counter.used
  if (used >= QUARTER_PER_IP) {
    return NextResponse.json({ error: 'limit', remaining: 0 }, { status: 429 })
  }

  if ((await registryLoadToday(supabase)) >= REGISTRY_DAILY_GLOBAL) {
    return NextResponse.json({ error: 'busy' }, { status: 429 })
  }

  const body = await req.json().catch(() => ({}))
  const bin = normalizeBin(typeof body?.bin === 'string' ? body.bin : '')
  if (!isValidBin(bin)) {
    return NextResponse.json({ error: 'БИН должен состоять из 12 цифр' }, { status: 400 })
  }

  // extras: категории неблагонадёжных, налоговый режим и реестр должников Минюста
  // (25.10.2026). Все три независимы: сбой даёт null в своём поле, не 503.
  const result = await performBinLookup(supabase, bin, { extras: true })

  // Оба реестра не ответили (сеть, таймаут, не 2xx): это не «не найдено», и
  // попытку из квартального лимита мы НЕ тратим. Счётчик не трогаем вообще.
  if (!result.found && result.unavailable) {
    return NextResponse.json(
      { error: 'Реестры сейчас не отвечают, попробуйте позже', unavailable: true, remaining: QUARTER_PER_IP - used },
      { status: 503 },
    )
  }

  // Попытка списывается и за «не найдено»: реестры мы уже спросили. Ошибки
  // валидации выше не считаются. Гонка двух одновременных запросов может
  // недосчитать единицу — на этом масштабе безвредно.
  await writeCounter(supabase, key, used + 1)
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
      // Новые проверки: undefined в JSON превращается в «нет поля», а клиент
      // читает это как null («не проверяли»), поэтому приводим к null явно.
      unreliableCategories: c.unreliableCategories ?? null,
      taxRegimes: c.taxRegimes ?? null,
      // Только агрегаты, перечисленные поимённо: ни имён должников и судебных
      // исполнителей, ни категорий взыскания (у ИП БИН это ИИН человека).
      enforcement: c.enforcement
        ? {
            found: c.enforcement.found,
            count: c.enforcement.count,
            activeCount: c.enforcement.activeCount,
            totalAmount: c.enforcement.totalAmount,
            earliestStart: c.enforcement.earliestStart,
          }
        : null,
      hasFullCard: Boolean(c.address || c.director || c.activity),
    },
  })
}
