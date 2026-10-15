import { createClient } from '@supabase/supabase-js'
import { listCatalog, fetchCityNames, fetchOffersDetails, extractOfferPointInfo, totalStock } from './cabinetApi'
import { saveConnection, loadConnectionByMerchant } from './connection'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Shared by both connect completion paths (single-merchant auto-select and
// explicit merchant-picker selection) -- saves the connection, then
// auto-imports the seller's existing catalog (disabled by default, same as
// before: the seller reviews and turns tracking on deliberately).
// runInBackground (Next's after() из роута): переподключение магазина, у
// которого товары уже есть, отвечает сразу после сохранения сессии, а
// обновление каталога доделывает после ответа. Раньше человек после ввода
// кода из SMS ждал на «Проверяем...» минуту-две, пока шёл импорт всех
// товаров (живой случай 15.10.2026: 212 товаров). Новый магазин импортируется
// как раньше, до ответа: странице сразу нужен его список товаров.
export async function finalizeConnection(
  userId: string,
  sessionCookies: string,
  merchantId: string,
  companyName: string,
  opts: { runInBackground?: (task: () => Promise<unknown>) => void } = {},
): Promise<{ importedProducts: number | null }> {
  await saveConnection({ userId, sessionCookies, merchantId, companyName })
  // Not loadConnection(userId): a 2nd+ store saves as inactive (see
  // saveConnection), so "the active one" would resolve to a DIFFERENT,
  // already-connected store instead of the one just finalized here.
  const connection = await loadConnectionByMerchant(userId, merchantId)
  if (!connection) throw new Error('Подключение не удалось сохранить')

  if (opts.runInBackground) {
    const { count } = await supabase
      .from('kaspi_shop_tracked_products')
      .select('id', { count: 'exact', head: true })
      .eq('connection_id', connection.id)
    if ((count ?? 0) > 0) {
      opts.runInBackground(async () => {
        await importCatalogProducts(connection.id, userId, sessionCookies, merchantId)
        await seedCityNames(connection.id, sessionCookies, merchantId)
      })
      return { importedProducts: null }
    }
  }

  const imported = await importCatalogProducts(connection.id, userId, sessionCookies, merchantId)
  await seedCityNames(connection.id, sessionCookies, merchantId)
  return { importedProducts: imported }
}

async function seedCityNames(connectionId: string, sessionCookies: string, merchantId: string) {
  // Best-effort seed of the city-name cache so the city picker on
  // /kaspi-shop has real names to render right after connecting, instead
  // of depending entirely on the lazy on-demand refresh in
  // GET /api/kaspi-shop/settings/cities. There are no city chips to click
  // until this cache has *something* in it (self-referential gap fixed as
  // final-review finding C1) -- for a brand-new connection we already have
  // valid session cookies right here, so there's no reason to wait.
  // Independent try/catch from the catalog import above: a failure here
  // must never affect catalog import or fail the connect itself.
  try {
    const cityNames = await fetchCityNames(sessionCookies, merchantId)
    if (Object.keys(cityNames).length > 0) {
      await supabase.from('kaspi_shop_connections').update({ city_lookup_cache: cityNames }).eq('id', connectionId)
    }
  } catch (err: any) {
    console.error('kaspi-shop finalizeConnection: city name cache seed failed (non-fatal)', err.message)
  }
}

// Сколько товаров обрабатываем одновременно. Раньше шли строго по одному
// (2–3 запроса к базе на товар последовательно) -- 200 товаров ≈ минута.
const IMPORT_CONCURRENCY = 8

async function forEachConcurrent<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]
      await fn(item)
    }
  })
  await Promise.all(workers)
}

// The catalog-import loop, shared by finalizeConnection (connect-time) and
// the on-demand «Обновить каталог» sync (2026-08-21: a product restored to
// sale AFTER connect-time import was otherwise invisible in Демпинг until a
// full reconnect). Never throws -- the connection itself being valid is not
// contingent on a clean import.
export async function importCatalogProducts(connectionId: string, userId: string, sessionCookies: string, merchantId: string): Promise<number> {
  let imported = 0
  try {
    const offers = await listCatalog(sessionCookies, merchantId, true)

    // Point-city codes per sku, one batched details request for the whole
    // catalog (the endpoint takes an sku array natively). Used as the
    // automatic competitor-check cities when tracked cities aren't picked
    // manually. Best-effort: a failed details fetch leaves the column
    // empty and the check falls back to the legacy reference city.
    const pointCitiesBySku = new Map<string, string[]>()
    try {
      const detailsItems = await fetchOffersDetails(sessionCookies, merchantId, offers.map(o => o.sku))
      for (const item of detailsItems) {
        if (typeof item.sku !== 'string') continue
        const cityIds = Array.from(new Set(
          extractOfferPointInfo(item, merchantId)
            .map(i => i.cityId)
            .filter((c): c is string => !!c)
        ))
        pointCitiesBySku.set(item.sku, cityIds)
      }
    } catch (err: any) {
      console.error('kaspi-shop importCatalogProducts: details batch failed (non-fatal, point cities skipped)', err.message)
    }

    const importOne = async (offer: (typeof offers)[number]) => {
      // Kaspi изредка отдаёт товар без названия -- product_name NOT NULL, и
      // такой товар раньше молча не импортировался.
      const productName = offer.title || offer.sku
      // Reconnecting (e.g. after a session expiry) used to blind-INSERT a
      // fresh row per offer every time, producing real duplicate rows per
      // (connection_id, kaspi_master_sku) in production -- confirmed live
      // 2026-08-15, 204 rows for 70 real products before this was fixed.
      // Look up whether this product already has a row for this connection
      // first: if it does, refresh only the fields Kaspi's own catalog
      // actually owns (name/brand/category/the seller's own per-offer sku)
      // and leave every seller-configured field untouched (floor_price,
      // max_price, undercut_step, enabled, demping_strategy, excluded_*,
      // cogs_amount, no_competitor_streak, own_current_price -- the last of
      // these is the repricer's own live state, not a catalog snapshot, so
      // overwriting it here would clobber real repricing progress on every
      // reconnect). City price rows are left alone entirely for an
      // existing product -- they already exist from its first import.
      const { data: existing, error: lookupError } = await supabase
        .from('kaspi_shop_tracked_products')
        .select('id')
        .eq('connection_id', connectionId)
        .eq('kaspi_master_sku', offer.masterSku)
        .maybeSingle()
      if (lookupError) {
        console.error('kaspi-shop finalizeConnection: failed to check for an existing row for', offer.sku, lookupError.message)
        return
      }

      if (existing) {
        const { error: updateError } = await supabase
          .from('kaspi_shop_tracked_products')
          .update({
            kaspi_sku: offer.sku,
            product_name: productName,
            brand: offer.brandName || offer.brandCode || '',
            store_id: offer.points[0] || '',
            kaspi_brand: offer.brandName || offer.brandCode || null,
            kaspi_category: offer.masterCategory,
            point_city_codes: pointCitiesBySku.get(offer.sku) || [],
            // offers here always come from listCatalog(..., true) below --
            // being present in this refresh reconfirms Kaspi still lists it
            // as available, self-healing a product restored via Kaspi's own
            // native cabinet (never touched removed-products/route.ts).
            available_for_sale: true,
            // Real stock from Kaspi, not the 0 this used to leave untouched:
            // only the repricer's cycle refreshed stock_count, so a product
            // the seller never enrolled in Демпинг stayed at 0 and the
            // storefront's stock filter hid it (founder repro 2026-09-03).
            stock_count: totalStock(offer),
          })
          .eq('id', existing.id)
        if (updateError) {
          console.error('kaspi-shop finalizeConnection: failed to refresh existing offer', offer.sku, updateError.message)
          return
        }
        imported += 1
        return
      }

      const { data: product, error: productError } = await supabase
        .from('kaspi_shop_tracked_products')
        .insert({
          connection_id: connectionId,
          user_id: userId,
          kaspi_sku: offer.sku,
          product_name: productName,
          brand: offer.brandName || offer.brandCode || '',
          store_id: offer.points[0] || '',
          stock_count: totalStock(offer),
          own_current_price: offer.minPrice,
          floor_price: offer.minPrice,
          undercut_step: 100,
          check_frequency_minutes: 15,
          enabled: false,
          available_for_sale: true,
          kaspi_master_sku: offer.masterSku,
          kaspi_brand: offer.brandName || offer.brandCode || null,
          kaspi_category: offer.masterCategory,
          point_city_codes: pointCitiesBySku.get(offer.sku) || [],
        })
        .select('id')
        .single()
      if (productError || !product) {
        console.error('kaspi-shop finalizeConnection: failed to import offer', offer.sku, productError?.message)
        return
      }

      const cityRows = Object.entries(offer.allCityPrices).map(([cityCode, entry]) => ({
        tracked_product_id: product.id,
        city_code: cityCode,
        own_current_price: entry.price,
      }))
      if (cityRows.length > 0) {
        const { error: cityError } = await supabase.from('kaspi_shop_product_city_prices').insert(cityRows)
        if (cityError) console.error('kaspi-shop finalizeConnection: failed to import city prices for', offer.sku, cityError.message)
      }
      imported += 1
    }

    // Офферы одного kaspi_master_sku идут строго по очереди внутри своей
    // группы: второй должен увидеть строку, вставленную первым, и обновить
    // её, а не упереться в уникальный индекс (connection_id, kaspi_master_sku).
    const groups = new Map<string, typeof offers>()
    for (const offer of offers) {
      const key = offer.masterSku || `sku:${offer.sku}`
      const g = groups.get(key)
      if (g) g.push(offer)
      else groups.set(key, [offer])
    }
    await forEachConcurrent([...groups.values()], IMPORT_CONCURRENCY, async group => {
      for (const offer of group) {
        try { await importOne(offer) } catch (err: any) {
          console.error('kaspi-shop importCatalogProducts: offer import threw', offer.sku, err?.message)
        }
      }
    })
  } catch (err: any) {
    // The connection itself is already saved and valid -- a partial or
    // failed catalog import is a recoverable follow-up, not a reason to
    // report the whole import call as failed.
    console.error('kaspi-shop importCatalogProducts: catalog import failed', err.message)
  }

  return imported
}
