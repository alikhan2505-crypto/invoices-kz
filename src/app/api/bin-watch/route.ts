import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizeBin } from '@/lib/binLookup'
import { performBinLookup } from '@/lib/binLookupServer'
import { resolveAccess } from '@/lib/binWatch/access'
import { BIN_WATCH_CACHE_TTL_MS } from '@/lib/binWatch/config'
import { addWatch, listWatch, removeWatch, takeFirstSnapshot } from '@/lib/binWatch/service'
import { parseDetails, parseSignals } from '@/lib/binWatch/signals'
import type { WatchRow } from '@/lib/binWatch/check'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Первый снимок при добавлении делает живую проверку (до ~35 с на повторах реестров).
export const maxDuration = 60

// Список слежения за БИН (решение основателя 29.10.2026). Личность - только из
// Bearer-токена сессии; user_id из тела запроса не читается нигде. Все строки
// читаются и меняются через service-role С фильтром user_id = владелец токена,
// так что ни чужую строку, ни чужой БИН увидеть или удалить нельзя. Вставка
// строк идёт ТОЛЬКО здесь (в базе у клиента нет права insert/update): лимит
// тарифа не обойти прямым вызовом Supabase. Пока включён админ-гейт
// (src/lib/binWatch/config.ts), добавлять и читать список могут только админы.

/** Что видит клиент: без user_id и без служебной базы сравнения. */
function publicRow(r: WatchRow) {
  const last = r.last_result && typeof r.last_result === 'object' ? (r.last_result as { signals?: unknown; details?: unknown }) : null
  return {
    id: r.id,
    bin: r.bin,
    name: r.name,
    createdAt: r.created_at,
    lastCheckedAt: r.last_checked_at,
    lastStatus: r.last_status,
    // null = ещё не проверялся. Внутри signals null = «не проверено», не «чисто».
    signals: last ? parseSignals(last.signals) : null,
    details: last ? parseDetails(last.details) : null,
  }
}

export async function GET(req: NextRequest) {
  const access = await resolveAccess(supabase, req.headers)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const list = await listWatch(supabase, access.userId)
  if (!list.ok) {
    return NextResponse.json({ error: list.reason === 'not_ready' ? 'not_ready' : 'unavailable' }, { status: 503 })
  }
  return NextResponse.json({ limit: access.limit, count: list.rows.length, items: list.rows.map(publicRow) })
}

export async function POST(req: NextRequest) {
  const access = await resolveAccess(supabase, req.headers)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const body = await req.json().catch(() => ({}))
  const bin = typeof body?.bin === 'string' ? body.bin : ''
  const result = await addWatch(supabase, access.userId, bin, access.limit)
  if (!result.ok) {
    if (result.reason === 'invalid_bin') return NextResponse.json({ error: 'invalid_bin' }, { status: 400 })
    if (result.reason === 'limit') return NextResponse.json({ error: 'limit', limit: result.limit, count: result.count }, { status: 403 })
    if (result.reason === 'not_ready') return NextResponse.json({ error: 'not_ready' }, { status: 503 })
    return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  }

  // Первый снимок (без письма: базы ещё нет). Для уже добавленного БИН не нужен.
  let snapshot: 'done' | 'skipped' | 'failed' | null = null
  if (result.status === 'added') {
    snapshot = await takeFirstSnapshot(
      supabase,
      { id: result.id, bin: normalizeBin(bin) },
      b => performBinLookup(supabase, b, { extras: true, cacheTtlMs: BIN_WATCH_CACHE_TTL_MS }),
    )
  }
  return NextResponse.json({ ok: true, status: result.status, snapshot, limit: access.limit, count: result.count })
}

export async function DELETE(req: NextRequest) {
  // Удалить свою строку можно всегда (в том числе когда гейт закрыт).
  const access = await resolveAccess(supabase, req.headers, { requireFeature: false })
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const id = req.nextUrl.searchParams.get('id') || ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  const res = await removeWatch(supabase, access.userId, id)
  if (res === 'error') return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  if (res === 'not_found') return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
