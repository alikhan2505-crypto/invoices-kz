import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isValidBin, normalizeBin } from '@/lib/binLookup'
import { performBinLookup } from '@/lib/binLookupServer'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Looks a counterparty up by БИН across both state registers. Вся механика
// (кэш, egov, КГД, НДС, риски) — в src/lib/binLookupServer.ts, общая с
// публичным /api/tools/kontragent.
//
// The browser never sees either credential -- the egov agreement forbids
// passing its key to anyone, and the КГД token is issued to one account by
// hand -- so the browser asks us and we ask them.
//
// Signed-in users only. Not because the data is private (both registers are
// public) but because an open proxy would spend our 40 requests a minute.
// (Публичный собрат на /api/tools/kontragent открыт, но ограничен 3 проверками
// на IP в день и общим дневным предохранителем.)
export async function GET(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bin = normalizeBin(req.nextUrl.searchParams.get('bin'))
  if (!isValidBin(bin)) {
    return NextResponse.json({ error: 'БИН должен состоять из 12 цифр' }, { status: 400 })
  }

  // Риски, налоговый режим и реестр должников Минюста (до ~9 с на повторах)
  // отдаём только тому, кто их показывает: /create просит их отдельным вторым
  // запросом (?extras=1) уже после подстановки названия. Реквизиты профиля и
  // первый запрос /create идут без них и не ждут Минюст.
  const extras = req.nextUrl.searchParams.get('extras') === '1'
  const result = await performBinLookup(supabase, bin, { extras })
  if (!result.found) return NextResponse.json({ found: false })
  return NextResponse.json({ found: true, company: result.company })
}
