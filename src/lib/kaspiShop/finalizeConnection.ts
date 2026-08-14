import { createClient } from '@supabase/supabase-js'
import { listCatalog, fetchCityNames } from './cabinetApi'
import { saveConnection, loadConnection } from './connection'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Shared by both connect completion paths (single-merchant auto-select and
// explicit merchant-picker selection) -- saves the connection, then
// auto-imports the seller's existing catalog (disabled by default, same as
// before: the seller reviews and turns tracking on deliberately).
export async function finalizeConnection(userId: string, sessionCookies: string, merchantId: string, companyName: string): Promise<{ importedProducts: number }> {
  await saveConnection({ userId, sessionCookies, merchantId, companyName })
  const connection = await loadConnection(userId)
  if (!connection) throw new Error('Подключение не удалось сохранить')

  let imported = 0
  try {
    const offers = await listCatalog(sessionCookies, merchantId, true)
    for (const offer of offers) {
      const { data: product, error: productError } = await supabase
        .from('kaspi_shop_tracked_products')
        .insert({
          connection_id: connection.id,
          user_id: userId,
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
      if (productError || !product) {
        console.error('kaspi-shop finalizeConnection: failed to import offer', offer.sku, productError?.message)
        continue
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
  } catch (err: any) {
    // The connection itself is already saved and valid -- a partial or
    // failed catalog import is a recoverable follow-up, not a reason to
    // report the whole connect as failed.
    console.error('kaspi-shop finalizeConnection: catalog import failed', err.message)
  }

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
      await supabase.from('kaspi_shop_connections').update({ city_lookup_cache: cityNames }).eq('id', connection.id)
    }
  } catch (err: any) {
    console.error('kaspi-shop finalizeConnection: city name cache seed failed (non-fatal)', err.message)
  }

  return { importedProducts: imported }
}
