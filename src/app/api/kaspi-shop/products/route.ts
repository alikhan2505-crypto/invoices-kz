import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection, loadConnectionById, markSessionExpired } from '@/lib/kaspiShop/connection'
import { isCheckDue } from '@/lib/kaspiShop/checkCycle'
import { updateOfferStock } from '@/lib/kaspiShop/cabinetPricePush'

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

  // Scoped to the ACTIVE connection, not user_id -- with multi-store
  // support a user_id-wide query mixed both stores' products into one list
  // (confirmed live 2026-08-21: Abil-Sisters products showing under the ИП
  // FIRST PROJECT header right after the founder connected their 2nd store).
  let connectionPaused = false
  let connectionId: string | null = null
  try {
    const connection = await loadConnection(user.id)
    connectionPaused = !!connection?.paused
    connectionId = connection?.id ?? null
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
    activeCount: products.filter((p: any) => p.enabled).length,
    readyToApply: connectionPaused
      ? 0
      : products.filter((p: any) => p.enabled && isCheckDue(p.last_checked_at, p.check_frequency_minutes, now)).length,
    blockedAtFloor: products.filter((p: any) => p.enabled && p.held_at_floor).length,
  }

  return NextResponse.json({ products, stats })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const connection = await loadConnection(user.id)
  if (!connection) return NextResponse.json({ error: 'Kaspi Shop не подключён' }, { status: 400 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }
  const { kaspiSku, productName, brand, storeId, stockCount, ownCurrentPrice, floorPrice, undercutStep, checkFrequencyMinutes } = body
  if (!kaspiSku || !productName || !brand || !storeId || ownCurrentPrice == null || floorPrice == null || undercutStep == null) {
    return NextResponse.json({ error: 'kaspiSku, productName, brand, storeId, ownCurrentPrice, floorPrice и undercutStep обязательны' }, { status: 400 })
  }
  // Number(...) first, then validate the RESULT is a real finite number
  // above zero -- validating the raw input and inserting it unconverted
  // (the brief's original shape) let a non-numeric floorPrice like "abc"
  // slip past `Number("abc") <= 0` (false, since NaN compares false to
  // everything) straight into the insert, defeating the one check this
  // field exists for.
  const floorPriceNum = Number(floorPrice)
  if (!Number.isFinite(floorPriceNum) || floorPriceNum <= 0) {
    return NextResponse.json({ error: 'floorPrice должен быть числом больше нуля' }, { status: 400 })
  }

  const { data, error } = await supabase.from('kaspi_shop_tracked_products').insert({
    connection_id: connection.id,
    user_id: user.id,
    kaspi_sku: kaspiSku,
    product_name: productName,
    brand,
    store_id: storeId,
    stock_count: stockCount ?? 0,
    own_current_price: ownCurrentPrice,
    floor_price: floorPriceNum,
    undercut_step: undercutStep,
    check_frequency_minutes: checkFrequencyMinutes ?? 15,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ product: data })
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const allowed = ['floor_price', 'undercut_step', 'check_frequency_minutes', 'enabled', 'stock_count', 'demping_strategy', 'excluded_city_codes', 'excluded_merchant_ids', 'max_price']
  const patch: Record<string, any> = {}
  for (const key of allowed) if (key in updates) patch[key] = updates[key]
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'no updatable fields provided' }, { status: 400 })

  // Only checked when both fields are being set in the same PATCH -- the
  // live caller (the product settings form) always sends floor_price and
  // max_price together, and validating a max_price-only PATCH against the
  // row's existing floor_price would need an extra read before the write.
  // A PATCH touching only one of the two fields (or neither) is unaffected.
  if ('floor_price' in patch && 'max_price' in patch && patch.max_price !== null) {
    const floorPriceNum = Number(patch.floor_price)
    const maxPriceNum = Number(patch.max_price)
    if (Number.isFinite(floorPriceNum) && Number.isFinite(maxPriceNum) && maxPriceNum <= floorPriceNum) {
      return NextResponse.json({ error: 'max_price должен быть больше floor_price' }, { status: 400 })
    }
  }

  // Read the row's previous state BEFORE the update -- needed to know
  // whether stock_count actually changed (the immediate Kaspi push below
  // only fires on a real change) and for the push payload's identifiers.
  const { data: row, error: rowError } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('stock_count, connection_id, kaspi_sku, product_name, store_id, own_current_price')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (rowError) return NextResponse.json({ error: rowError.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'Товар не найден' }, { status: 404 })

  const { error } = await supabase
    .from('kaspi_shop_tracked_products')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Immediate stock push (2026-08-21, founder request): a changed остаток
  // goes to Kaspi right away instead of riding along with the next price
  // change. Best-effort -- the settings save above must succeed regardless.
  // Never pushes zero (that would flip the offer to «нет в наличии»), and
  // sends the offer's current city prices unchanged alongside, in the same
  // full-state MANUAL_CHANGES shape as restore. storeId carries the
  // confirmed merchant prefix.
  let stockPushed = false
  let stockPushWarning: string | null = null
  const newStock = Number(patch.stock_count)
  if ('stock_count' in patch && Number.isFinite(newStock) && newStock > 0 && newStock !== Number(row.stock_count)) {
    try {
      const connection = await loadConnectionById(row.connection_id)
      if (!connection?.sessionCookies) {
        stockPushWarning = 'Остаток сохранён, но сессия кабинета Kaspi не активна — на Kaspi он уйдёт после переподключения.'
      } else {
        const { data: cityRows } = await supabase
          .from('kaspi_shop_product_city_prices')
          .select('city_code, own_current_price')
          .eq('tracked_product_id', id)
        const cityPrices = (cityRows || [])
          .filter((c: any) => c.own_current_price !== null)
          .map((c: any) => ({ cityId: c.city_code as string, value: Number(c.own_current_price) }))
        const result = await updateOfferStock({
          sessionCookies: connection.sessionCookies,
          merchantUid: connection.merchantId,
          sku: row.kaspi_sku,
          model: row.product_name,
          storeId: row.store_id ? `${connection.merchantId}_${row.store_id}` : '',
          cityPrices: cityPrices.length > 0 ? cityPrices : [{ cityId: '750000000', value: Number(row.own_current_price) }],
          stockCount: newStock,
        })
        if (result.success) {
          stockPushed = true
        } else if (result.reason === 'session_expired') {
          await markSessionExpired(connection.id)
          stockPushWarning = 'Остаток сохранён, но сессия кабинета Kaspi истекла — переподключитесь, чтобы он ушёл на Kaspi.'
        } else {
          stockPushWarning = `Остаток сохранён, но Kaspi не принял обновление: ${result.message}`
        }
      }
    } catch (err: any) {
      console.error('kaspi-shop products PATCH: stock push failed (non-fatal)', err.message)
      stockPushWarning = 'Остаток сохранён, но отправить его на Kaspi сейчас не удалось.'
    }
  }

  return NextResponse.json({ ok: true, stockPushed, stockPushWarning })
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
