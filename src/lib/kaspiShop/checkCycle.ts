import { createClient } from '@supabase/supabase-js'
import { computeRepriceCandidate, DempingStrategy, resolveTargetCities, computePerCityReprice, CompetitorOffer, CityOffers } from './pricing'
import { debitKaspiShopWallet } from './wallet'
import { getKey } from './connection'
import { decryptAtRest } from '@/lib/kaspiPay/crypto'
import { isWithinBudget, KASPI_RATE_LIMIT_WINDOW_MS } from './rateLimitBudget'
import { pushPriceChange } from './cabinetPricePush'
import { sendTelegramNotification } from '@/lib/telegramNotify'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type DueTrackedProduct = { id: string; kaspiSku: string; targetCities: string[] }

// Kaspi returns a persistent HTTP 429 to its public product pages from
// Vercel's IP ranges (confirmed live 2026-08-12: identical block across 4
// attempts spanning 3.5 hours, no Retry-After/rate-limit headers -- not a
// transient throttle). A direct probe from a GitHub Actions runner IP got a
// clean 404 for the same nonexistent test SKU, so the actual fetch to
// kaspi.kz now happens from the GitHub Actions workflow itself (see
// .github/workflows/kaspi-shop-price-check.yml and its script). This
// function only reports which products are due; applyPriceCheckResult below
// takes the already-fetched competitor price and does the rest.
export async function getDueTrackedProducts(): Promise<DueTrackedProduct[]> {
  const { data: due } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('id, kaspi_sku, last_checked_at, check_frequency_minutes, enabled, excluded_city_codes, kaspi_shop_connections(paused, tracked_city_codes)')
    .eq('enabled', true)

  const now = Date.now()
  return (due || [])
    .filter((p: any) => {
      if (p.kaspi_shop_connections?.paused) return false
      if (!p.last_checked_at) return true
      const elapsedMinutes = (now - new Date(p.last_checked_at).getTime()) / 60000
      return elapsedMinutes >= p.check_frequency_minutes
    })
    .map((p: any) => ({
      id: p.id,
      kaspiSku: p.kaspi_sku,
      targetCities: resolveTargetCities(p.kaspi_shop_connections?.tracked_city_codes || [], p.excluded_city_codes || []),
    }))
}

// Pushes one city's recomputed price through the cabinet session, respecting
// the rolling rate-limit budget. Returns the resulting action for that city
// and whether the session turned out to be expired (caller stops the whole
// batch for this connection when that happens, rather than retrying a dead
// session city after city).
async function pushCityPrice(params: {
  connectionId: string
  merchantId: string
  sessionCookies: string
  trackedProductId: string
  sku: string
  model: string
  storeId: string
  cityCode: string
  newPrice: number
}): Promise<{ pushed: boolean; sessionExpired: boolean; message?: string }> {
  const since = new Date(Date.now() - KASPI_RATE_LIMIT_WINDOW_MS).toISOString()
  const { data: connProducts } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('id')
    .eq('connection_id', params.connectionId)
  const productIds = (connProducts || []).map((p: any) => p.id)
  const { data: recentPushes } = await supabase
    .from('kaspi_shop_product_city_prices')
    .select('updated_at')
    .in('tracked_product_id', productIds)
    .gte('updated_at', since)
  const timestamps = (recentPushes || []).map((r: any) => new Date(r.updated_at).getTime())
  if (!isWithinBudget(timestamps, Date.now())) {
    return { pushed: false, sessionExpired: false, message: 'rate limit budget exhausted for this 30-minute window' }
  }

  const result = await pushPriceChange({
    sessionCookies: params.sessionCookies,
    merchantUid: params.merchantId,
    sku: params.sku,
    model: params.model,
    storeId: `${params.merchantId}_${params.storeId}`,
    stockCount: 1,
    cityCode: params.cityCode,
    newPrice: params.newPrice,
  })

  if (result.success) return { pushed: true, sessionExpired: false }
  if (result.reason === 'session_expired') {
    await supabase.from('kaspi_shop_connections').update({ session_status: 'session_expired' }).eq('id', params.connectionId)
    return { pushed: false, sessionExpired: true, message: result.message }
  }
  return { pushed: false, sessionExpired: false, message: result.message }
}

export type ApplyOffers =
  | { perCityOffers: Record<string, CompetitorOffer[]> }
  | { competitorOffers: CompetitorOffer[] }

// One tracked product, one already-fetched set of competitor offers (or a
// fetch error, reported by the caller since the fetch itself no longer
// happens here). Never throws -- a single product's failure must not abort
// the rest of the caller's batch. Always logs a kaspi_shop_price_checks row
// and debits one credit, even on error -- the competitor-price check itself
// is the billable work, and an error row is real information the seller
// should see in their history, not a silently dropped cycle.
//
// Two payload shapes: `perCityOffers` (the store has configured
// tracked_city_codes -- each city gets its own competitor offers and its
// own computeRepriceCandidate call) and the legacy `competitorOffers` flat
// array (the store hasn't configured per-city tracking yet -- exact
// pre-existing behavior, untouched, so nothing changes for a store that
// hasn't opted in). See docs/superpowers/specs/2026-08-14-kaspi-shop-city-pricing-design.md.
export async function applyPriceCheckResult(
  trackedProductId: string,
  offers: ApplyOffers | null,
  fetchError: string | null
): Promise<void> {
  const { data: product } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('*, kaspi_shop_connections(id, user_id, paused, merchant_id, session_cookies, session_status)')
    .eq('id', trackedProductId)
    .single()
  if (!product || !product.enabled) return
  const connection = product.kaspi_shop_connections
  if (connection?.paused) return

  const userId = product.user_id
  const ownPriceBefore = Number(product.own_current_price)
  let action: 'updated' | 'held_at_floor' | 'no_change' | 'error' = 'no_change'
  let ownPriceAfter = ownPriceBefore
  let competitorPrice: number | null = null

  if (!fetchError && offers && 'perCityOffers' in offers) {
    const excludedMerchants: string[] = product.excluded_merchant_ids || []
    const { data: cityRows } = await supabase
      .from('kaspi_shop_product_city_prices')
      .select('city_code, own_current_price')
      .eq('tracked_product_id', trackedProductId)
    const currentCityPrices: Record<string, number> = {}
    for (const c of cityRows || []) currentCityPrices[c.city_code] = Number(c.own_current_price)

    const cityOffersList: CityOffers[] = Object.entries(offers.perCityOffers).map(([cityCode, cityOffers]) => ({ cityCode, offers: cityOffers }))
    const results = computePerCityReprice({
      cityOffers: cityOffersList,
      excludedMerchantIds: excludedMerchants,
      undercutStep: Number(product.undercut_step),
      floorPrice: Number(product.floor_price),
      strategy: (product.demping_strategy as DempingStrategy) || 'undercut_leader',
      currentCityPrices,
    })

    if (results.length > 0) {
      ownPriceAfter = Math.min(...results.map(r => r.price))
      const anyHeldAtFloor = results.some(r => r.heldAtFloor)
      action = anyHeldAtFloor ? 'held_at_floor' : (ownPriceAfter === ownPriceBefore ? 'no_change' : 'updated')
      const allCompetitorPrices = cityOffersList.flatMap(c => c.offers.filter(o => !excludedMerchants.includes(o.merchantId)).map(o => o.price))
      competitorPrice = allCompetitorPrices.length > 0 ? Math.min(...allCompetitorPrices) : null

      await supabase
        .from('kaspi_shop_tracked_products')
        .update({ own_current_price: ownPriceAfter, last_checked_at: new Date().toISOString(), last_competitor_price: competitorPrice })
        .eq('id', trackedProductId)

      if (connection?.session_cookies && connection.session_status === 'active') {
        const sessionCookies = decryptAtRest(connection.session_cookies, getKey()).toString('utf8')
        for (const result of results) {
          // Decide per city, not from the aggregate `action` above -- the
          // aggregate can read "no_change" even when one city genuinely
          // moved, if a different city happens to still hold the overall
          // minimum.
          if (currentCityPrices[result.cityCode] !== undefined && result.price === currentCityPrices[result.cityCode]) continue
          const pushResult = await pushCityPrice({
            connectionId: connection.id,
            merchantId: connection.merchant_id,
            sessionCookies,
            trackedProductId,
            sku: product.kaspi_sku,
            model: product.product_name,
            storeId: product.store_id,
            cityCode: result.cityCode,
            newPrice: result.price,
          })
          if (pushResult.pushed) {
            await supabase
              .from('kaspi_shop_product_city_prices')
              .update({ own_current_price: result.price, last_competitor_price: competitorPrice, updated_at: new Date().toISOString() })
              .eq('tracked_product_id', trackedProductId)
              .eq('city_code', result.cityCode)
          }
          if (pushResult.sessionExpired) {
            console.error('kaspi-shop checkCycle: session expired for connection', connection.id, '-- stopping city pushes for this product')
            break
          }
        }
      }

      if (anyHeldAtFloor) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('telegram_chat_id, notify_telegram')
          .eq('id', userId)
          .single()
        if (profile?.notify_telegram && profile.telegram_chat_id) {
          await sendTelegramNotification(profile.telegram_chat_id,
            `🔴 Kaspi Магазин: цена товара «${product.product_name}» упёрлась в ваш минимум (${product.floor_price} ₸) в одном или нескольких городах — конкурент дешевле, но снижать дальше нельзя. Проверьте вручную, если хотите скорректировать минимум.`)
        }
      }
    }
  } else if (!fetchError) {
    const competitorOffers = offers && 'competitorOffers' in offers ? offers.competitorOffers : null
    const excludedMerchants: string[] = product.excluded_merchant_ids || []
    const competitorPrices = (competitorOffers || [])
      .filter(o => !excludedMerchants.includes(o.merchantId))
      .map(o => o.price)
    competitorPrice = competitorPrices.length > 0 ? Math.min(...competitorPrices) : null
    const { price, heldAtFloor } = computeRepriceCandidate({
      competitorPrices,
      undercutStep: Number(product.undercut_step),
      floorPrice: Number(product.floor_price),
      strategy: (product.demping_strategy as DempingStrategy) || 'undercut_leader',
      ownCurrentPrice: ownPriceBefore,
    })
    ownPriceAfter = price
    action = heldAtFloor ? 'held_at_floor' : (price === ownPriceBefore ? 'no_change' : 'updated')

    await supabase
      .from('kaspi_shop_tracked_products')
      .update({ own_current_price: ownPriceAfter, last_checked_at: new Date().toISOString(), last_competitor_price: competitorPrice })
      .eq('id', trackedProductId)

    if (action === 'updated' && connection?.session_cookies && connection.session_status === 'active') {
      const { data: cityRows } = await supabase
        .from('kaspi_shop_product_city_prices')
        .select('city_code, own_current_price')
        .eq('tracked_product_id', trackedProductId)
      const excludedCities: string[] = product.excluded_city_codes || []
      const citiesToPush = (cityRows || []).filter(c => !excludedCities.includes(c.city_code))

      if (citiesToPush.length > 0) {
        const sessionCookies = decryptAtRest(connection.session_cookies, getKey()).toString('utf8')
        for (const city of citiesToPush) {
          const cityCandidate = computeRepriceCandidate({
            competitorPrices,
            undercutStep: Number(product.undercut_step),
            floorPrice: Number(product.floor_price),
            strategy: (product.demping_strategy as DempingStrategy) || 'undercut_leader',
            ownCurrentPrice: Number(city.own_current_price ?? ownPriceBefore),
          })

          const result = await pushCityPrice({
            connectionId: connection.id,
            merchantId: connection.merchant_id,
            sessionCookies,
            trackedProductId,
            sku: product.kaspi_sku,
            model: product.product_name,
            storeId: product.store_id,
            cityCode: city.city_code,
            newPrice: cityCandidate.price,
          })

          if (result.pushed) {
            await supabase
              .from('kaspi_shop_product_city_prices')
              .update({ own_current_price: cityCandidate.price, last_competitor_price: competitorPrice, updated_at: new Date().toISOString() })
              .eq('tracked_product_id', trackedProductId)
              .eq('city_code', city.city_code)
          }
          if (result.sessionExpired) {
            console.error('kaspi-shop checkCycle: session expired for connection', connection.id, '-- stopping city pushes for this product')
            break
          }
        }
      }
    }

    if (heldAtFloor) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('telegram_chat_id, notify_telegram')
        .eq('id', userId)
        .single()
      if (profile?.notify_telegram && profile.telegram_chat_id) {
        await sendTelegramNotification(profile.telegram_chat_id,
          `🔴 Kaspi Магазин: цена товара «${product.product_name}» упёрлась в ваш минимум (${product.floor_price} ₸) — конкурент дешевле, но снижать дальше нельзя. Проверьте вручную, если хотите скорректировать минимум.`)
      }
    }
  } else {
    action = 'error'
    await supabase
      .from('kaspi_shop_tracked_products')
      .update({ last_checked_at: new Date().toISOString() })
      .eq('id', trackedProductId)
  }

  await supabase.from('kaspi_shop_price_checks').insert({
    tracked_product_id: trackedProductId,
    competitor_price: competitorPrice,
    own_price_before: ownPriceBefore,
    own_price_after: ownPriceAfter,
    action,
    credit_cost: 1,
    error_message: fetchError,
  })

  try {
    await debitKaspiShopWallet(userId, 1, `Проверка цены: ${product.product_name}`)
  } catch (err: any) {
    console.error('kaspi-shop checkCycle: wallet debit failed for user', userId, 'product', trackedProductId, ':', err.message)
  }
}
