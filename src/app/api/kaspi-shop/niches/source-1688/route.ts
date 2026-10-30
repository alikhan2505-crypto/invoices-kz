import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { kaspiShopPlanGate } from '@/lib/kaspiShop/planGate'
import { suggest1688Queries } from '@/lib/kaspiShop/source1688Llm'
import {
  build1688SearchUrl, cacheKey, canUseSource1688, marginHref, risksFor, type Source1688Suggestion,
} from '@/lib/kaspiShop/source1688'
import { getCached, overLimit, putCached } from '@/lib/kaspiShop/source1688Guard'

// «Найти на 1688» (этап 0, 30.10.2026): по названию товара из «Ниш» отвечает китайскими запросами,
// ссылками на поиск 1688, оценкой веса, плашками рисков и ссылкой в калькулятор маржи. Никаких данных
// 1688 не получает и не хранит. Пока включён админ-гейт (src/lib/kaspiShop/source1688.ts) отвечает
// только админу. Дорогой шаг (Anthropic) прикрыт кэшем по названию и лимитом на пользователя.

const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)
const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const notPro = await kaspiShopPlanGate(user.id)
  if (notPro) return notPro

  const { data: profile, error: profileError } = await supabaseService
    .from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (profileError) return NextResponse.json({ error: 'Сервис временно недоступен' }, { status: 503 })
  if (!canUseSource1688((profile as { is_admin?: boolean | null } | null)?.is_admin === true)) {
    return NextResponse.json({ error: 'Функция пока открыта только администратору', errorCode: 'admin_only' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const brand = typeof body?.brand === 'string' ? body.brand.trim() : ''
  const category = typeof body?.category === 'string' ? body.category.trim() : ''
  const price = Number(body?.price)
  if (name.length < 3 || name.length > 200) {
    return NextResponse.json({ error: 'Название товара должно быть от 3 до 200 символов' }, { status: 400 })
  }

  const now = Date.now()
  const key = cacheKey(name)
  let suggestion: Source1688Suggestion | null = getCached(key, now)

  if (!suggestion) {
    if (overLimit(user.id, now)) {
      return NextResponse.json({ error: 'Слишком много запросов, попробуйте через час' }, { status: 429 })
    }
    try {
      suggestion = await suggest1688Queries(name, brand || null, category || null)
    } catch (e) {
      console.error('source-1688: model call failed:', e instanceof Error ? e.message : e)
      return NextResponse.json({ error: 'Не удалось подобрать запросы, попробуйте ещё раз' }, { status: 502 })
    }
    if (!suggestion) {
      return NextResponse.json({ error: 'Не удалось подобрать запросы для этого названия' }, { status: 502 })
    }
    putCached(key, suggestion, now)
  }

  const { queries, weightGrams } = suggestion
  return NextResponse.json({
    queries: queries.map(q => ({ zh: q.zh, ru: q.ru, url: build1688SearchUrl(q.zh) })),
    weightGrams,
    risks: risksFor(name, brand || null),
    marginHref: marginHref({ name, price, weightGrams }),
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}
