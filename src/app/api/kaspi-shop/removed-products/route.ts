import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection, markSessionExpired } from '@/lib/kaspiShop/connection'
import { listCatalog, CatalogOffer } from '@/lib/kaspiShop/cabinetApi'
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

function toSummary(o: CatalogOffer) {
  return {
    sku: o.sku,
    masterSku: o.masterSku,
    title: o.title,
    brandName: o.brandName,
    minPrice: o.minPrice,
  }
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

  const [active, removed] = await Promise.all([
    listCatalog(connection.sessionCookies, connection.merchantId, true),
    listCatalog(connection.sessionCookies, connection.merchantId, false),
  ])
  return NextResponse.json({
    active: active.map(toSummary),
    removed: removed.map(toSummary),
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

  const pushParams = {
    sessionCookies: connection.sessionCookies,
    merchantUid: connection.merchantId,
    sku: offer.sku,
    model: offer.title,
    storeId: offer.points[0] || '',
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
    // check cycle. Disable the rule alongside the removal.
    try {
      if (offer.masterSku) {
        await supabase
          .from('kaspi_shop_tracked_products')
          .update({ enabled: false })
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
      if (!existing) {
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
