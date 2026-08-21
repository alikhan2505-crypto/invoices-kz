import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection, markSessionExpired } from '@/lib/kaspiShop/connection'
import { fetchOfferDetails, extractOfferPointInfo, listCatalogWithStatus } from '@/lib/kaspiShop/cabinetApi'
import { savePointStockPrice } from '@/lib/kaspiShop/cabinetPricePush'

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

type PointEntry = {
  storeCode: string
  cityId: string | null
  cityName: string | null
  price: number | null
  stockCount: number | null
  available: string | null
}

// GET ?sku=... -- the offer's per-point (склад/город) price+stock state,
// for the «Цена и остатки» modal. City/price per point come from the
// details response (shared extractOfferPointInfo); остаток comes from the
// catalog LIST row's availabilities -- the details response carries no
// остаток at all (confirmed via runtime-log dump 2026-08-21).
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sku = req.nextUrl.searchParams.get('sku')
  if (!sku) return NextResponse.json({ error: 'sku обязателен' }, { status: 400 })

  const connection = await loadConnection(user.id)
  if (!connection?.sessionCookies) return NextResponse.json({ error: 'Kaspi Магазин не подключён' }, { status: 400 })

  const details = await fetchOfferDetails(connection.sessionCookies, connection.merchantId, sku)
  if (!details) return NextResponse.json({ error: 'Не удалось получить карточку товара из Kaspi' }, { status: 502 })

  const entriesMap = new Map<string, PointEntry>()
  for (const info of extractOfferPointInfo(details, connection.merchantId)) {
    entriesMap.set(info.storeCode, { ...info, cityName: null })
  }

  // Остаток per point from the list row (searching the active side first,
  // the removed side as a fallback -- the modal opens from either tab).
  try {
    const activeList = await listCatalogWithStatus(connection.sessionCookies, connection.merchantId, true)
    let listOffer = activeList.offers.find(o => o.sku === sku)
    if (!listOffer) {
      const removedList = await listCatalogWithStatus(connection.sessionCookies, connection.merchantId, false)
      listOffer = removedList.offers.find(o => o.sku === sku)
    }
    for (const a of listOffer?.availabilities || []) {
      const code = a.storeId.startsWith(`${connection.merchantId}_`) ? a.storeId.slice(connection.merchantId.length + 1) : a.storeId
      const entry = entriesMap.get(code)
      if (entry && a.stockCount !== null) entry.stockCount = a.stockCount
    }
  } catch (err: any) {
    console.error('offer-stocks: list stock merge failed (non-fatal)', err.message)
  }

  // Self-diagnosis when the scan can't resolve cities: dump a truncated
  // structural sample to the runtime logs so the parsing can be fixed from
  // the server side without asking the founder for more DevTools captures.
  if (Array.from(entriesMap.values()).every(e => !e.cityId)) {
    console.log('offer-stocks debug keys:', Object.keys(details).join(','))
    const json = JSON.stringify(details)
    for (let i = 0; i < Math.min(json.length, 12000); i += 3000) {
      console.log(`offer-stocks debug [${i}]:`, json.slice(i, i + 3000))
    }
  }

  const { data: connRow } = await supabase
    .from('kaspi_shop_connections')
    .select('city_lookup_cache')
    .eq('id', connection.id)
    .maybeSingle()
  const cityNames: Record<string, string> = connRow?.city_lookup_cache || {}

  const entries = Array.from(entriesMap.values()).map(e => ({
    ...e,
    cityName: e.cityId ? (cityNames[e.cityId] || null) : null,
  }))

  return NextResponse.json({
    sku,
    masterSku: details.masterSku ?? null,
    model: details.title ?? details.model ?? '',
    // minPrice as the price fallback when a point entry carried no price of
    // its own -- the modal needs SOMETHING editable per point.
    minPrice: Number(details.minPrice) || null,
    entries,
  })
}

// POST -- save price+stock for the edited points, one captured-shape save
// per point (exactly how the cabinet's own modal behaves).
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }
  const { sku, masterSku, model, entries } = body
  if (!sku || !model || !Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: 'sku, model и entries обязательны' }, { status: 400 })
  }

  const connection = await loadConnection(user.id)
  if (!connection?.sessionCookies) return NextResponse.json({ error: 'Kaspi Магазин не подключён' }, { status: 400 })

  const results: { storeCode: string; ok: boolean; message?: string }[] = []
  for (const entry of entries) {
    const storeCode = String(entry.storeCode || '')
    const cityId = String(entry.cityId || '')
    const price = Number(entry.price)
    if (!storeCode || !cityId || !Number.isFinite(price) || price <= 0) {
      results.push({ storeCode, ok: false, message: 'нет города или цены для этой точки' })
      continue
    }
    const stockRaw = entry.stockCount
    const stockCount = stockRaw === null || stockRaw === undefined || stockRaw === '' ? null : Number(stockRaw)
    const result = await savePointStockPrice({
      sessionCookies: connection.sessionCookies,
      merchantUid: connection.merchantId,
      sku,
      masterSku: masterSku ?? null,
      model,
      storeCode,
      cityId,
      price,
      stockCount: stockCount !== null && Number.isFinite(stockCount) ? stockCount : null,
    })
    if (!result.success && result.reason === 'session_expired') {
      await markSessionExpired(connection.id)
      return NextResponse.json({ error: 'Сессия кабинета Kaspi истекла — переподключитесь' }, { status: 400 })
    }
    results.push({ storeCode, ok: result.success, message: result.success ? undefined : result.message })

    // Founder-approved experiment (2026-08-21): remember the seller's
    // остаток per point so the repricer re-attaches it to price pushes
    // (Kaspi's own pipeline wipes остаток on every price-list change).
    // Clearing the field deletes the row = experiment off for that point.
    if (result.success) {
      try {
        if (stockCount !== null && Number.isFinite(stockCount) && stockCount > 0) {
          await supabase
            .from('kaspi_shop_point_stocks')
            .upsert(
              { connection_id: connection.id, sku, store_code: storeCode, stock_count: stockCount, updated_at: new Date().toISOString() },
              { onConflict: 'connection_id,sku,store_code' }
            )
        } else {
          await supabase
            .from('kaspi_shop_point_stocks')
            .delete()
            .eq('connection_id', connection.id)
            .eq('sku', sku)
            .eq('store_code', storeCode)
        }
      } catch (err: any) {
        console.error('offer-stocks: point stock persistence failed (non-fatal)', err.message)
      }
    }
  }

  const failed = results.filter(r => !r.ok)
  return NextResponse.json({ ok: failed.length === 0, results })
}
