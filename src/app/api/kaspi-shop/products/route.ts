import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { kaspiShopPlanGate } from '@/lib/kaspiShop/planGate'
import { loadConnection } from '@/lib/kaspiShop/connection'
import { isCheckDue, isSessionActive } from '@/lib/kaspiShop/checkCycle'
import { validateProductCreate, validateProductPatch } from '@/lib/kaspiShop/productSettings'
import { isUuid } from '@/lib/uuidFormat'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const notPro = await kaspiShopPlanGate(user.id)
  if (notPro) return notPro

  // Scoped to the ACTIVE connection, not user_id -- with multi-store
  // support a user_id-wide query mixed both stores' products into one list
  // (confirmed live 2026-08-21: Abil-Sisters products showing under the ИП
  // FIRST PROJECT header right after the founder connected their 2nd store).
  let connectionPaused = false
  let connectionId: string | null = null
  let sessionActive = true
  try {
    const connection = await loadConnection(user.id)
    connectionPaused = !!connection?.paused
    connectionId = connection?.id ?? null
    // Мёртвая сессия кабинета: бот такое подключение не проверяет (см.
    // getDueTrackedProducts), значит и «готовых к применению» нет.
    if (connectionId) {
      const { data: sessionRow } = await supabase.from('kaspi_shop_connections').select('session_status').eq('id', connectionId).maybeSingle()
      sessionActive = isSessionActive(sessionRow?.session_status)
    }
  } catch {
    // Stats are a best-effort summary, not the source of truth for whether
    // the connection itself works -- the rest of the page already surfaces
    // connection problems (loadError banner, session-expired banner).
  }
  if (!connectionId) {
    return NextResponse.json({ products: [], stats: { totalRules: 0, activeCount: 0, readyToApply: 0, blockedAtFloor: 0 } })
  }

  const { data, error } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('*')
    .eq('connection_id', connectionId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const products = data || []

  // Stats for the summary cards row on /kaspi-shop. readyToApply reuses
  // isCheckDue -- the exact same predicate getDueTrackedProducts (the
  // cron/due route's global, cron-secret-gated version) uses -- rather than
  // a second, per-user reimplementation of the elapsed-minutes math that
  // could silently drift from it. While the connection is paused, nothing
  // is actually "ready" (the scheduled check-cycle skips paused connections
  // entirely, same as apply-now would), so readyToApply is forced to 0 in
  // that case instead of reporting a number that can't actually be acted on.
  // blockedAtFloor reads kaspi_shop_tracked_products.held_at_floor, written
  // by applyPriceCheckResult every cycle (see checkCycle.ts) -- no extra
  // query needed since '*' above already selects it.
  const now = Date.now()
  const stats = {
    totalRules: products.length,
    // «Активных» -- только включённые товары в продаже: снятые с продажи бот не проверяет
    // (null у старых строк = в продаже), и считать их работающими было бы неправдой.
    activeCount: products.filter((p: any) => p.enabled && p.available_for_sale !== false).length,
    readyToApply: connectionPaused || !sessionActive
      ? 0
      : products.filter((p: any) => p.enabled && p.available_for_sale !== false && isCheckDue(p.last_checked_at, p.check_frequency_minutes, now)).length,
    blockedAtFloor: products.filter((p: any) => p.enabled && p.held_at_floor).length,
  }

  return NextResponse.json({ products, stats })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const notPro = await kaspiShopPlanGate(user.id)
  if (notPro) return notPro

  const connection = await loadConnection(user.id)
  if (!connection) return NextResponse.json({ error: 'Kaspi Shop не подключён' }, { status: 400 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }
  const { kaspiSku, productName, brand, storeId, ownCurrentPrice, floorPrice, undercutStep } = body
  if (!kaspiSku || !productName || !brand || !storeId || ownCurrentPrice == null || floorPrice == null || undercutStep == null) {
    return NextResponse.json({ error: 'kaspiSku, productName, brand, storeId, ownCurrentPrice, floorPrice и undercutStep обязательны' }, { status: 400 })
  }
  // Number(...) first, then validate the RESULT is a real finite number
  // above zero -- validating the raw input and inserting it unconverted
  // (the brief's original shape) let a non-numeric floorPrice like "abc"
  // slip past `Number("abc") <= 0` (false, since NaN compares false to
  // everything) straight into the insert, defeating the one check this
  // field exists for. Все денежные поля (цена, пол, шаг, частота, остаток)
  // проверяются одним набором правил с PATCH и bulk -- см. productSettings.ts
  // (аудит Kaspi 06.11.2026, K7).
  const checked = validateProductCreate(body)
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })

  const { data, error } = await supabase.from('kaspi_shop_tracked_products').insert({
    connection_id: connection.id,
    user_id: user.id,
    kaspi_sku: kaspiSku,
    product_name: productName,
    brand,
    store_id: storeId,
    stock_count: checked.value.stockCount,
    own_current_price: checked.value.ownCurrentPrice,
    floor_price: checked.value.floorPrice,
    undercut_step: checked.value.undercutStep,
    check_frequency_minutes: checked.value.checkFrequencyMinutes,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ product: data })
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const notPro = await kaspiShopPlanGate(user.id)
  if (notPro) return notPro

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }
  const { id, ...updates } = body
  if (!id || typeof id !== 'string' || !isUuid(id)) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Previous state: stock_count (to detect a real change for the honest
  // notice below) and the stored floor/max -- когда пришло только одно из
  // двух, второе берётся отсюда (аудит Kaspi 06.11.2026, K7/K16: раньше max
  // сверялся с полом только если оба пришли в одном запросе).
  const { data: row, error: rowError } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('stock_count, floor_price, max_price, own_current_price')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (rowError) return NextResponse.json({ error: rowError.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'Товар не найден' }, { status: 404 })

  const checked = validateProductPatch(updates, row)
  if (!checked.ok) {
    // Пол сильно выше цены: стабильный код и числа, чтобы форма спросила
    // продавца и повторила запрос с confirmFloor: true.
    if (checked.code) return NextResponse.json({ error: checked.error, code: checked.code, ...checked.details }, { status: 400 })
    return NextResponse.json({ error: checked.error }, { status: 400 })
  }
  const patch = checked.patch

  const { error } = await supabase
    .from('kaspi_shop_tracked_products')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Остаток is OUR bookkeeping only -- it is deliberately NOT pushed to
  // Kaspi. Confirmed live twice (2026-08-21): every upload that carried a
  // stockCount field was followed by Kaspi removing the offer with «Не
  // указано наличие в прайс листе», and the cabinet's own captured batch
  // item carries no stockCount at all. Until a safe stock channel is
  // captured from the cabinet's real «Изменить цену и остатки» flow,
  // остатками управляет кабинет Kaspi, and the UI says so honestly.
  let stockPushWarning: string | null = null
  const newStock = Number(patch.stock_count)
  if ('stock_count' in patch && Number.isFinite(newStock) && newStock !== Number(row.stock_count)) {
    stockPushWarning = 'Остаток сохранён у нас и виден на карточке. На Kaspi остатки безопасно передавать пока нельзя — управляйте ими в кабинете Kaspi.'
  }

  return NextResponse.json({ ok: true, stockPushed: false, stockPushWarning })
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const notPro = await kaspiShopPlanGate(user.id)
  if (notPro) return notPro

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }
  const { id } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('kaspi_shop_tracked_products').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
