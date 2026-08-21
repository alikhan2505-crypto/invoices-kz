import { createClient } from '@supabase/supabase-js'
import { computeRepriceCandidate, DempingStrategy, resolveTargetCities, computePerCityReprice, computeMarketPosition, CompetitorOffer, CityOffers } from './pricing'
import { debitKaspiShopWallet } from './wallet'
import { getKey } from './connection'
import { decryptAtRest } from '@/lib/kaspiPay/crypto'
import { isWithinBudget, KASPI_RATE_LIMIT_WINDOW_MS } from './rateLimitBudget'
import { pushOfferState } from './cabinetPricePush'
import { sendTelegramNotification } from '@/lib/telegramNotify'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type DueTrackedProduct = { id: string; kaspiSku: string; targetCities: string[] }

// Pure predicate, factored out of getDueTrackedProducts below so the
// "Готовы применить" stat on /kaspi-shop (GET /api/kaspi-shop/products,
// scoped to one user) can compute the exact same due/not-due answer instead
// of a second, slightly different reimplementation of the elapsed-minutes
// math that could silently drift from this one over time.
export function isCheckDue(lastCheckedAt: string | null, checkFrequencyMinutes: number, now: number = Date.now()): boolean {
  if (!lastCheckedAt) return true
  const elapsedMinutes = (now - new Date(lastCheckedAt).getTime()) / 60000
  return elapsedMinutes >= checkFrequencyMinutes
}

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
      return isCheckDue(p.last_checked_at, p.check_frequency_minutes, now)
    })
    .map((p: any) => ({
      id: p.id,
      kaspiSku: p.kaspi_sku,
      targetCities: resolveTargetCities(p.kaspi_shop_connections?.tracked_city_codes || [], p.excluded_city_codes || []),
    }))
}

// ONE full-state batch upload per product per cycle, carrying every changed
// city price at once -- replaces the old per-city single-item pushes. Root
// cause, confirmed live TWICE on 2026-08-21: the single-item process
// endpoint got this account's offer REMOVED with «Не указано наличие в
// прайс листе» (once after a restore attempt, again immediately after a
// stock save), while the cabinet's own full-offer batch echo both restores
// and updates cleanly. Side benefit: one upload per product instead of
// up-to-~320 per-city uploads per cycle, which stops draining Kaspi's
// 250-changes/30-min budget.
//
// `productIds` is the connection's product id list, hoisted up to
// applyPriceCheckResult and passed in -- loop-invariant for the product
// being processed (final-review finding I4).
async function pushProductPrices(params: {
  connectionId: string
  merchantId: string
  sessionCookies: string
  productIds: string[]
  sku: string
  masterSku: string | null
  model: string
  storeId: string
  cityPrices: Record<string, number>
}): Promise<{ pushed: boolean; sessionExpired: boolean; message?: string }> {
  // Budget signal is last_pushed_at, not updated_at -- updated_at is also
  // set by finalizeConnection's bulk catalog-import insert (NOT NULL
  // DEFAULT now(), 43,840 rows in one shot on the live account), which
  // isn't a real push to Kaspi and must never count against the real
  // 250/30min ceiling. last_pushed_at is nullable and written ONLY on a
  // confirmed successful push, so rows from catalog import never
  // contribute here (final-review finding I1).
  const since = new Date(Date.now() - KASPI_RATE_LIMIT_WINDOW_MS).toISOString()
  const { data: recentPushes } = await supabase
    .from('kaspi_shop_product_city_prices')
    .select('last_pushed_at')
    .in('tracked_product_id', params.productIds)
    .gte('last_pushed_at', since)
  const timestamps = (recentPushes || []).map((r: any) => new Date(r.last_pushed_at).getTime())
  if (!isWithinBudget(timestamps, Date.now())) {
    return { pushed: false, sessionExpired: false, message: 'rate limit budget exhausted for this 30-minute window' }
  }

  // The EXACT captured cabinet batch item (see pushOfferState's comment):
  // minimal fields, merchant-prefixed storeId, NO stockCount ever -- every
  // upload of ours that carried stockCount was followed by Kaspi removing
  // the offer with «Не указано наличие в прайс листе».
  const result = await pushOfferState({
    sessionCookies: params.sessionCookies,
    merchantUid: params.merchantId,
    sku: params.sku,
    masterSku: params.masterSku,
    model: params.model,
    storeId: `${params.merchantId}_${params.storeId}`,
    storeCode: params.storeId,
    cityPrices: Object.entries(params.cityPrices).map(([cityId, value]) => ({ cityId, value })),
    available: 'yes',
  })

  if (result.success) return { pushed: true, sessionExpired: false }
  if (result.reason === 'session_expired') {
    await supabase.from('kaspi_shop_connections').update({ session_status: 'session_expired' }).eq('id', params.connectionId)
    return { pushed: false, sessionExpired: true, message: result.message }
  }
  return { pushed: false, sessionExpired: false, message: result.message }
}

// A single throttled cycle can generate one issue per remaining city in the
// loop (up to ~320 on the live legacy path, almost all identical "rate
// limit budget exhausted" messages) -- capped so kaspi_shop_price_checks'
// error_message stays a readable signal instead of a wall of repeats.
// Previously this was discarded entirely: own_current_price got updated in
// our DB to a price Kaspi never actually received, with no log line and no
// signal anywhere the seller could see (final-review finding I2; also the
// only visibility into I1's fix actually taking effect).
function summarizePushIssues(issues: string[]): string | null {
  if (issues.length === 0) return null
  const shown = issues.slice(0, 5)
  const suffix = issues.length > shown.length ? ` (+${issues.length - shown.length} more)` : ''
  return (shown.join('; ') + suffix).slice(0, 2000)
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
  // Collects a message for every push that didn't happen (rate-limited,
  // session issue, upstream error) across whichever branch below runs, so
  // it can be surfaced in the kaspi_shop_price_checks row at the end --
  // previously these were silently discarded (final-review finding I2).
  const pushIssues: string[] = []

  // maxPrice/noCompetitorStreak are read once here and reused by both the
  // top-level computeRepriceCandidate call AND the legacy branch's inner
  // per-city loop -- the loop's own newStreak results are never persisted
  // (the legacy path only tracks one streak per product, per the design),
  // so all its calls deliberately reuse this same "before this cycle"
  // value rather than each other's outputs.
  const maxPrice = product.max_price !== null && product.max_price !== undefined ? Number(product.max_price) : undefined
  const noCompetitorStreak = Number(product.no_competitor_streak) || 0

  if (!fetchError && offers && 'perCityOffers' in offers) {
    const excludedMerchants: string[] = product.excluded_merchant_ids || []
    const { data: cityRows } = await supabase
      .from('kaspi_shop_product_city_prices')
      .select('city_code, own_current_price, no_competitor_streak')
      .eq('tracked_product_id', trackedProductId)
    const currentCityPrices: Record<string, number> = {}
    const currentCityStreaks: Record<string, number> = {}
    for (const c of cityRows || []) {
      currentCityPrices[c.city_code] = Number(c.own_current_price)
      currentCityStreaks[c.city_code] = Number(c.no_competitor_streak) || 0
    }

    const cityOffersList: CityOffers[] = Object.entries(offers.perCityOffers).map(([cityCode, cityOffers]) => ({ cityCode, offers: cityOffers }))
    const results = computePerCityReprice({
      cityOffers: cityOffersList,
      excludedMerchantIds: excludedMerchants,
      undercutStep: Number(product.undercut_step),
      floorPrice: Number(product.floor_price),
      maxPrice,
      strategy: (product.demping_strategy as DempingStrategy) || 'undercut_leader',
      currentCityPrices,
      currentCityStreaks,
    })

    if (results.length > 0) {
      ownPriceAfter = Math.min(...results.map(r => r.price))
      const anyHeldAtFloor = results.some(r => r.heldAtFloor)
      action = anyHeldAtFloor ? 'held_at_floor' : (ownPriceAfter === ownPriceBefore ? 'no_change' : 'updated')
      const allCompetitorPrices = cityOffersList.flatMap(c => c.offers.filter(o => !excludedMerchants.includes(o.merchantId)).map(o => o.price))
      competitorPrice = allCompetitorPrices.length > 0 ? Math.min(...allCompetitorPrices) : null

      await supabase
        .from('kaspi_shop_tracked_products')
        .update({ own_current_price: ownPriceAfter, last_checked_at: new Date().toISOString(), last_competitor_price: competitorPrice, held_at_floor: anyHeldAtFloor })
        .eq('id', trackedProductId)

      // Streak persistence runs unconditionally, independent of the
      // session-active guard below -- the competitor observation happens in
      // the GitHub Actions relay, which has nothing to do with whether the
      // cabinet session is alive. Writing this only inside the push-attempt
      // loop (as before) meant an expired/absent session silently dropped
      // every city's streak for the cycle, freezing the Макс-памп countdown
      // exactly when a stale session made it most likely to matter
      // (final-review finding I1). Also carries this cycle's market
      // position (price-rank among ALL sellers in this city, computed from
      // the raw per-city offers -- not the excludedMerchants-filtered
      // competitorPrices used for the repricing math above, since position
      // should reflect real market reality, not this seller's own "ignore
      // this competitor" preference). No longer skips on an unchanged
      // streak -- position can move even when the streak doesn't (e.g. a
      // competitor's price shifts without disappearing), so every city gets
      // written every cycle now.
      for (const result of results) {
        const rawOffers = cityOffersList.find(c => c.cityCode === result.cityCode)?.offers || []
        const { position, totalOffers } = computeMarketPosition(rawOffers, connection.merchant_id, result.price)
        await supabase
          .from('kaspi_shop_product_city_prices')
          .update({ no_competitor_streak: result.newStreak, market_position: position, market_offer_count: totalOffers })
          .eq('tracked_product_id', trackedProductId)
          .eq('city_code', result.cityCode)
      }

      if (connection?.session_cookies && connection.session_status === 'active') {
        const sessionCookies = decryptAtRest(connection.session_cookies, getKey()).toString('utf8')
        const { data: connProducts } = await supabase
          .from('kaspi_shop_tracked_products')
          .select('id')
          .eq('connection_id', connection.id)
        const productIds = (connProducts || []).map((p: any) => p.id)
        // Decide per city, not from the aggregate `action` above -- the
        // aggregate can read "no_change" even when one city genuinely
        // moved, if a different city happens to still hold the overall
        // minimum. All changed cities ride ONE batch upload together.
        const changedCityPrices: Record<string, number> = {}
        for (const result of results) {
          if (currentCityPrices[result.cityCode] !== undefined && result.price === currentCityPrices[result.cityCode]) {
            continue
          }
          changedCityPrices[result.cityCode] = result.price
        }
        if (Object.keys(changedCityPrices).length > 0) {
          const pushResult = await pushProductPrices({
            connectionId: connection.id,
            merchantId: connection.merchant_id,
            sessionCookies,
            productIds,
            sku: product.kaspi_sku,
            masterSku: product.kaspi_master_sku || null,
            model: product.product_name,
            storeId: product.store_id,
            cityPrices: changedCityPrices,
          })
          if (pushResult.pushed) {
            const pushedAt = new Date().toISOString()
            for (const [cityCode, price] of Object.entries(changedCityPrices)) {
              await supabase
                .from('kaspi_shop_product_city_prices')
                .update({ own_current_price: price, last_competitor_price: competitorPrice, updated_at: pushedAt, last_pushed_at: pushedAt })
                .eq('tracked_product_id', trackedProductId)
                .eq('city_code', cityCode)
            }
          } else {
            console.error('kaspi-shop checkCycle: batch price push skipped for product', trackedProductId, '--', pushResult.message)
            pushIssues.push(pushResult.message || 'batch push failed')
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
    const { price, heldAtFloor, newStreak } = computeRepriceCandidate({
      competitorPrices,
      undercutStep: Number(product.undercut_step),
      floorPrice: Number(product.floor_price),
      maxPrice,
      strategy: (product.demping_strategy as DempingStrategy) || 'undercut_leader',
      ownCurrentPrice: ownPriceBefore,
      noCompetitorStreak,
    })
    ownPriceAfter = price
    action = heldAtFloor ? 'held_at_floor' : (price === ownPriceBefore ? 'no_change' : 'updated')

    // Raw competitorOffers (not the excludedMerchants-filtered
    // competitorPrices used for the repricing math above) -- position
    // reflects real market reality, not this seller's own "ignore this
    // competitor" preference.
    const { position, totalOffers } = computeMarketPosition(competitorOffers || [], connection.merchant_id, ownPriceAfter)

    await supabase
      .from('kaspi_shop_tracked_products')
      .update({ own_current_price: ownPriceAfter, last_checked_at: new Date().toISOString(), last_competitor_price: competitorPrice, no_competitor_streak: newStreak, market_position: position, market_offer_count: totalOffers, held_at_floor: heldAtFloor })
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
        const { data: connProducts } = await supabase
          .from('kaspi_shop_tracked_products')
          .select('id')
          .eq('connection_id', connection.id)
        const productIds = (connProducts || []).map((p: any) => p.id)
        const legacyCityPrices: Record<string, number> = {}
        for (const city of citiesToPush) {
          const cityCandidate = computeRepriceCandidate({
            competitorPrices,
            undercutStep: Number(product.undercut_step),
            floorPrice: Number(product.floor_price),
            maxPrice,
            strategy: (product.demping_strategy as DempingStrategy) || 'undercut_leader',
            ownCurrentPrice: Number(city.own_current_price ?? ownPriceBefore),
            noCompetitorStreak,
          })
          legacyCityPrices[city.city_code] = cityCandidate.price
        }

        const result = await pushProductPrices({
          connectionId: connection.id,
          merchantId: connection.merchant_id,
          sessionCookies,
          productIds,
          sku: product.kaspi_sku,
          masterSku: product.kaspi_master_sku || null,
          model: product.product_name,
          storeId: product.store_id,
          cityPrices: legacyCityPrices,
        })

        if (result.pushed) {
          const pushedAt = new Date().toISOString()
          for (const [cityCode, price] of Object.entries(legacyCityPrices)) {
            await supabase
              .from('kaspi_shop_product_city_prices')
              .update({ own_current_price: price, last_competitor_price: competitorPrice, updated_at: pushedAt, last_pushed_at: pushedAt })
              .eq('tracked_product_id', trackedProductId)
              .eq('city_code', cityCode)
          }
        } else {
          console.error('kaspi-shop checkCycle: batch price push skipped for product', trackedProductId, '--', result.message)
          pushIssues.push(result.message || 'batch push failed')
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
    // held_at_floor deliberately left untouched here -- a fetch error tells
    // us nothing new about whether the floor is still binding, so clearing
    // it would hide a real still-held product behind a transient upstream
    // failure, and setting it would assert something this cycle never
    // observed.
    await supabase
      .from('kaspi_shop_tracked_products')
      .update({ last_checked_at: new Date().toISOString() })
      .eq('id', trackedProductId)
  }

  // fetchError takes priority (it's a distinct, more specific failure this
  // cycle never got past); otherwise surface any push issues collected
  // above -- e.g. own_current_price was updated in our DB but Kaspi never
  // actually received it because the rate-limit budget was exhausted, one
  // of the two cases finding I2 flagged as previously silent.
  const errorMessage = fetchError ?? summarizePushIssues(pushIssues)

  await supabase.from('kaspi_shop_price_checks').insert({
    tracked_product_id: trackedProductId,
    competitor_price: competitorPrice,
    own_price_before: ownPriceBefore,
    own_price_after: ownPriceAfter,
    action,
    credit_cost: 1,
    error_message: errorMessage,
  })

  try {
    await debitKaspiShopWallet(userId, 1, `Проверка цены: ${product.product_name}`)
  } catch (err: any) {
    console.error('kaspi-shop checkCycle: wallet debit failed for user', userId, 'product', trackedProductId, ':', err.message)
  }
}
