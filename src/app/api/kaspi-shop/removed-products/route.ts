import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection, markSessionExpired } from '@/lib/kaspiShop/connection'
import { listCatalog, listCatalogWithStatus, fetchOffersDetails, extractOfferPointInfo, totalStock, CatalogOffer } from '@/lib/kaspiShop/cabinetApi'
import { restoreOfferToSale, removeOfferFromSale } from '@/lib/kaspiShop/cabinetPricePush'

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

type PointSummary = { storeCode: string; cityName: string | null; stockCount: number | null }

function toSummary(o: CatalogOffer, pointsBySku: Map<string, PointSummary[]>) {
  return {
    sku: o.sku,
    masterSku: o.masterSku,
    title: o.title,
    brandName: o.brandName,
    minPrice: o.minPrice,
    points: pointsBySku.get(o.sku) || [],
  }
}

// City per point comes from the details batch (one request for the whole
// page -- the endpoint takes an sku array natively); остаток per point
// comes from the LIST row's own availabilities (details carry no остаток
// at all, confirmed via runtime-log dump).
function buildPointSummaries(
  offers: CatalogOffer[],
  detailsBySku: Map<string, Record<string, any>>,
  merchantId: string,
  cityNames: Record<string, string>
): Map<string, PointSummary[]> {
  const result = new Map<string, PointSummary[]>()
  for (const offer of offers) {
    const details = detailsBySku.get(offer.sku)
    const infos = details ? extractOfferPointInfo(details, merchantId) : []
    const cityByCode = new Map(infos.map(i => [i.storeCode, i.cityId]))
    const codes = new Set<string>([...offer.points, ...infos.map(i => i.storeCode)])
    const stockByCode = new Map(
      offer.availabilities.map(a => [
        a.storeId.startsWith(`${merchantId}_`) ? a.storeId.slice(merchantId.length + 1) : a.storeId,
        a.stockCount,
      ])
    )
    result.set(offer.sku, Array.from(codes).map(code => {
      const cityId = cityByCode.get(code) || null
      return {
        storeCode: code,
        cityName: cityId ? (cityNames[cityId] || null) : null,
        stockCount: stockByCode.get(code) ?? null,
      }
    }))
  }
  return result
}

// The active store's catalog split the way Kaspi's own «Управление товарами»
// splits it: В продаже (available=true) / Сняты с продажи (available=false).
// Born from a live founder report (2026-08-21): 2 real removed products were
// invisible in our cabinet because import only ever pulled available=true.
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const connection = await loadConnection(user.id)
  if (!connection) return NextResponse.json({ error: 'Kaspi Магазин не подключён' }, { status: 400 })
  if (!connection.sessionCookies) return NextResponse.json({ error: 'Сессия кабинета Kaspi не активна — переподключитесь' }, { status: 400 })

  const [activeRes, removedRes] = await Promise.all([
    listCatalogWithStatus(connection.sessionCookies, connection.merchantId, true),
    listCatalogWithStatus(connection.sessionCookies, connection.merchantId, false),
  ])
  if (activeRes.sessionExpired || removedRes.sessionExpired) {
    await markSessionExpired(connection.id)
    return NextResponse.json({ error: 'Сессия кабинета Kaspi истекла — переподключите магазин («+ Добавить магазин» → тот же магазин).' }, { status: 400 })
  }

  const allOffers = [...activeRes.offers, ...removedRes.offers]

  // Reconcile the storefront's own available_for_sale cache with the live
  // truth this page just fetched -- this table only otherwise updates on
  // catalog import/refresh or the Снять с продажи/Восстановить actions, so
  // it silently drifted from reality whenever a product's availability
  // changed on Kaspi's own native cabinet, or wasn't yet re-synced (founder
  // repro 2026-09-03: Витрина's product count didn't match В продаже here).
  // Best-effort: never blocks this page's own response.
  // stock_count travels with it: catalog import hardcodes 0 and only the
  // repricer's own cycle ever refreshes it, so a product the seller never
  // enrolled in Демпинг sat at 0 forever and the storefront's stock filter
  // hid it even though Kaspi reported real stock.
  try {
    const removedMasterSkus = Array.from(new Set(removedRes.offers.map(o => o.masterSku).filter((s): s is string => !!s)))
    await Promise.all([
      ...activeRes.offers
        .filter(o => !!o.masterSku)
        .map(o => supabase
          .from('kaspi_shop_tracked_products')
          .update({ available_for_sale: true, stock_count: totalStock(o) })
          .eq('connection_id', connection.id)
          .eq('kaspi_master_sku', o.masterSku!)),
      removedMasterSkus.length > 0
        ? supabase.from('kaspi_shop_tracked_products').update({ available_for_sale: false }).eq('connection_id', connection.id).in('kaspi_master_sku', removedMasterSkus)
        : Promise.resolve(),
    ])
  } catch (err: any) {
    console.error('kaspi-shop removed-products: available_for_sale reconcile failed (non-fatal)', err.message)
  }

  const detailsBySku = new Map<string, Record<string, any>>()
  try {
    const detailsItems = await fetchOffersDetails(connection.sessionCookies, connection.merchantId, allOffers.map(o => o.sku))
    // TEMP diagnostic (2026-09-03): checking whether the raw offer-details
    // response carries any image field, for the storefront-photos feature.
    // Remove once confirmed either way.
    if (detailsItems[0]) console.log('DIAG raw offer detail:', JSON.stringify(detailsItems[0]).slice(0, 4000))
    for (const item of detailsItems) {
      if (typeof item.sku === 'string') detailsBySku.set(item.sku, item)
    }
  } catch (err: any) {
    console.error('kaspi-shop removed-products: details batch failed (non-fatal, cards show no cities)', err.message)
  }
  const { data: connRow } = await supabase
    .from('kaspi_shop_connections')
    .select('city_lookup_cache')
    .eq('id', connection.id)
    .maybeSingle()
  const cityNames: Record<string, string> = connRow?.city_lookup_cache || {}
  const pointsBySku = buildPointSummaries(allOffers, detailsBySku, connection.merchantId, cityNames)

  return NextResponse.json({
    active: activeRes.offers.map(o => toSummary(o, pointsBySku)),
    removed: removedRes.offers.map(o => toSummary(o, pointsBySku)),
  })
}

// Toggle one offer's availability. action 'restore' returns a removed offer
// to sale; action 'remove' takes an active offer off sale ("в ожидание").
// Kaspi processes both asynchronously (the cabinet shows «В обработке»,
// usually done within the hour).
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }
  const { sku, action } = body
  if (!sku) return NextResponse.json({ error: 'sku обязателен' }, { status: 400 })
  if (action !== 'restore' && action !== 'remove') {
    return NextResponse.json({ error: "action должен быть 'restore' или 'remove'" }, { status: 400 })
  }

  const connection = await loadConnection(user.id)
  if (!connection) return NextResponse.json({ error: 'Kaspi Магазин не подключён' }, { status: 400 })
  if (!connection.sessionCookies) return NextResponse.json({ error: 'Сессия кабинета Kaspi не активна — переподключитесь' }, { status: 400 })

  // The offer must currently sit on the side the action moves it FROM.
  const offers = await listCatalog(connection.sessionCookies, connection.merchantId, action === 'restore' ? false : true)
  const offer = offers.find(o => o.sku === sku)
  if (!offer) {
    return NextResponse.json({
      error: action === 'restore' ? 'Товар не найден среди снятых с продажи' : 'Товар не найден среди товаров в продаже',
    }, { status: 404 })
  }

  // The EXACT captured cabinet batch item (see pushOfferState's comment for
  // the verbatim payload): minimal fields, merchant-prefixed storeId, NO
  // stockCount, all current city prices, batch endpoint.
  const pushParams = {
    sessionCookies: connection.sessionCookies,
    merchantUid: connection.merchantId,
    sku: offer.sku,
    masterSku: offer.masterSku,
    model: offer.title,
    // ALL points -- listing only one left the other point's наличие
    // unspecified (Kaspi materialized остаток 0 there, confirmed live).
    storeCodes: offer.points,
    cityPrices: Object.entries(offer.allCityPrices).map(([cityId, entry]) => ({ cityId, value: entry.price })),
  }
  const result = action === 'restore' ? await restoreOfferToSale(pushParams) : await removeOfferFromSale(pushParams)
  if (!result.success) {
    if (result.reason === 'session_expired') {
      await markSessionExpired(connection.id)
      return NextResponse.json({ error: 'Сессия кабинета Kaspi истекла — переподключитесь' }, { status: 400 })
    }
    return NextResponse.json({ error: `Kaspi отклонил операцию: ${result.message}` }, { status: 502 })
  }

  if (action === 'remove') {
    // CRITICAL: the repricer's own price push always sends available:"yes"
    // (pushPriceChange above in cabinetPricePush.ts) -- an enabled demping
    // rule on a just-removed offer would silently resurrect it on the next
    // check cycle. Disable the rule alongside the removal. available_for_sale
    // also goes false here -- it's the public storefront's own filter
    // (independent of enabled, which only means "repricer on"), so a removed
    // product must stop showing there too.
    try {
      if (offer.masterSku) {
        await supabase
          .from('kaspi_shop_tracked_products')
          .update({ enabled: false, available_for_sale: false })
          .eq('connection_id', connection.id)
          .eq('kaspi_master_sku', offer.masterSku)
      }
    } catch (err: any) {
      console.error('kaspi-shop removed-products: post-remove rule disable failed (non-fatal)', err.message)
    }
    return NextResponse.json({ ok: true })
  }

  // Best-effort import into tracked products (disabled, same defaults as the
  // connect-time import; dedup by (connection_id, kaspi_master_sku) same as
  // finalizeConnection). Failure here never fails the restore itself -- the
  // offer IS being returned to sale on Kaspi's side regardless.
  let imported = false
  try {
    if (offer.masterSku) {
      const { data: existing } = await supabase
        .from('kaspi_shop_tracked_products')
        .select('id')
        .eq('connection_id', connection.id)
        .eq('kaspi_master_sku', offer.masterSku)
        .maybeSingle()
      if (existing) {
        // The row already exists from before it was removed (the common
        // case) -- restoring must flip available_for_sale back on, or the
        // public storefront stays blind to it even though Kaspi now lists
        // it again. enabled (repricer) is deliberately left untouched: it
        // was turned off by the removal on purpose and restoring to sale
        // doesn't imply the seller wants automatic repricing back on too.
        await supabase.from('kaspi_shop_tracked_products').update({ available_for_sale: true }).eq('id', existing.id)
      } else {
        const { data: product, error: insertError } = await supabase
          .from('kaspi_shop_tracked_products')
          .insert({
            connection_id: connection.id,
            user_id: user.id,
            kaspi_sku: offer.sku,
            product_name: offer.title,
            brand: offer.brandName || offer.brandCode || '',
            store_id: offer.points[0] || '',
            stock_count: 0,
            own_current_price: offer.minPrice,
            floor_price: offer.minPrice,
            undercut_step: 100,
            check_frequency_minutes: 15,
            enabled: false,
            available_for_sale: true,
            kaspi_master_sku: offer.masterSku,
            kaspi_brand: offer.brandName || offer.brandCode || null,
            kaspi_category: offer.masterCategory,
          })
          .select('id')
          .single()
        if (!insertError && product) {
          const cityRows = Object.entries(offer.allCityPrices).map(([cityCode, entry]) => ({
            tracked_product_id: product.id,
            city_code: cityCode,
            own_current_price: entry.price,
          }))
          if (cityRows.length > 0) await supabase.from('kaspi_shop_product_city_prices').insert(cityRows)
          imported = true
        }
      }
    }
  } catch (err: any) {
    console.error('kaspi-shop removed-products: post-restore import failed (non-fatal)', err.message)
  }

  return NextResponse.json({ ok: true, imported })
}
