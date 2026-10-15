import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildWaybillsPdf } from '@/lib/kaspiShop/waybills'
import {
  almatyMonth, claimCounterSlot, clientIp, nextMonthStart, readCounter,
  releaseCounterSlot, remainingOf, waybillsKey, waybillsUnlimited, WAYBILLS_MONTH_LIMIT,
} from '@/lib/toolQuota'

// PUBLIC, unauthenticated, and deliberately does NOT touch Kaspi at all --
// the seller downloads their own накладные from their own cabinet and
// uploads the PDFs here. That's what makes this usable as a free no-signup
// tool (competitor research 2026-09-04: AlemData runs exactly this as a
// lead-gen utility, and we already had the merging code behind a Pro-plan
// gate). The authenticated version at /api/kaspi-shop/orders/waybills is
// unchanged and still fetches from Kaspi directly.
//
// Nothing is persisted: files are merged in memory and streamed back.
//
// Лимит (решение основателя 15.10.2026, «5 → сразу Про»): 5 склеек на IP в
// календарный месяц по Алматы всем, у кого нет Kaspi Bot, — и без входа, и
// вошедшим на Free/Базовом/триале (вход ничего не добавляет, считаем по тому же
// IP). Без ограничений — только с доступом к Kaspi Bot (Про или is_admin) по
// Authorization: Bearer <токен Supabase>, см. waybillsUnlimited. Счётчик — общая таблица tool_kontragent_checks,
// ключ 'wb:' + sha256('wb|ip|месяц'), сами файлы по-прежнему не пишутся никуда.
// Слот занимаем ДО склейки (атомарно), а если склейка упала — возвращаем:
// битые PDF и 400 лимит не тратят, а пачка параллельных запросов не проходит
// вся по одному прочитанному used.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const NO_STORE = { 'Cache-Control': 'no-store' }

function unavailable() {
  return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE })
}

const MAX_FILES = 30
const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_TOTAL_BYTES = 30 * 1024 * 1024

const RATE_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT = 10
// Best-effort only: serverless instances are ephemeral and there may be
// several at once, so this throttles the common case rather than being a
// real guarantee. Good enough for a free tool whose worst case is CPU on a
// PDF merge -- deliberately not a DB table. (The monthly quota below is a
// separate, DB-backed counter; it stores a hashed key, never the files.)
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
  const ip = clientIp(req.headers)
  if (rateLimited(ip)) {
    // error — код, чтобы клиент отличал частые запросы от исчерпанного месяца (error: 'limit').
    return NextResponse.json({
      error: 'rate_limited',
      message: 'Слишком много запросов подряд. Попробуйте через несколько минут.',
    }, { status: 429 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Не удалось прочитать файлы' }, { status: 400 })
  }

  const format = form.get('format') === 'a6' ? 'a6' : 'a4'
  const files = form.getAll('files').filter((f): f is File => f instanceof File)

  if (files.length === 0) return NextResponse.json({ error: 'Добавьте хотя бы один PDF' }, { status: 400 })
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `За раз можно склеить не больше ${MAX_FILES} файлов` }, { status: 400 })
  }

  let total = 0
  const buffers: Buffer[] = []
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `Файл «${file.name}» больше 5 МБ` }, { status: 400 })
    }
    total += file.size
    if (total > MAX_TOTAL_BYTES) {
      return NextResponse.json({ error: 'Суммарный размер файлов больше 30 МБ' }, { status: 400 })
    }
    buffers.push(Buffer.from(await file.arrayBuffer()))
  }

  // С Kaspi Bot (Про/админ) — без лимита. Остальным: счётчик не читается —
  // отказ 503, как у КП: лимит — продуктовое решение, раздавать без него нельзя.
  const unlimited = await waybillsUnlimited(supabase, req.headers)
  const key = unlimited ? null : waybillsKey(ip, almatyMonth())
  let usedAfter = 0
  if (key) {
    const limitReached = () => NextResponse.json(
      { error: 'limit', remaining: 0, limit: WAYBILLS_MONTH_LIMIT, resetsAt: nextMonthStart() },
      { status: 429, headers: NO_STORE },
    )
    const counter = await readCounter(supabase, key)
    if (!counter.ok) return unavailable()
    let used = counter.used
    if (used >= WAYBILLS_MONTH_LIMIT) return limitReached()
    // Занимаем слот compare-and-swap'ом, как в name-lookup. 'raced' — слот
    // перехватил параллельный запрос: перечитываем. Каждый 'raced' значит, что
    // кто-то другой занял слот, поэтому за LIMIT+1 попыток либо займём, либо
    // упрёмся в лимит.
    let claimed = false
    for (let attempt = 0; attempt <= WAYBILLS_MONTH_LIMIT && !claimed; attempt++) {
      const claim = await claimCounterSlot(supabase, key, used)
      if (claim === 'error') return unavailable()
      if (claim === 'claimed') { claimed = true; break }
      const again = await readCounter(supabase, key)
      if (!again.ok) return unavailable()
      used = again.used
      if (used >= WAYBILLS_MONTH_LIMIT) return limitReached()
    }
    if (!claimed) return unavailable()
    usedAfter = used + 1
  }

  let merged: Uint8Array
  try {
    merged = await buildWaybillsPdf(buffers, format)
  } catch (e: any) {
    // pdf-lib throws on anything that isn't a readable PDF -- the common
    // real cause is someone uploading a ZIP straight from Kaspi instead of
    // unpacking it first, so say that rather than echoing the raw error.
    console.error('tools/waybills: merge failed:', e.message)
    // Неудачная склейка лимит не тратит — возвращаем занятый слот.
    if (key) await releaseCounterSlot(supabase, key, usedAfter)
    return NextResponse.json({
      error: 'Не удалось прочитать один из файлов. Убедитесь, что загружаете именно PDF-накладные (а не ZIP-архив из Kaspi — его сначала нужно распаковать).',
    }, { status: 400 })
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="waybills-${format}.pdf"`,
    ...NO_STORE,
  }
  if (key) headers['X-Waybills-Remaining'] = String(remainingOf(usedAfter, WAYBILLS_MONTH_LIMIT))
  return new NextResponse(new Uint8Array(merged), { headers })
}
