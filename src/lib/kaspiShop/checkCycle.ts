import { createClient } from '@supabase/supabase-js'
import { computeRepriceCandidate } from './pricing'
import { debitKaspiShopWallet } from './wallet'
import { sendTelegramNotification } from '@/lib/telegramNotify'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type DueTrackedProduct = { id: string; kaspiSku: string }

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
    .select('id, kaspi_sku, last_checked_at, check_frequency_minutes, enabled, kaspi_shop_connections(paused)')
    .eq('enabled', true)

  const now = Date.now()
  return (due || [])
    .filter((p: any) => {
      if (p.kaspi_shop_connections?.paused) return false
      if (!p.last_checked_at) return true
      const elapsedMinutes = (now - new Date(p.last_checked_at).getTime()) / 60000
      return elapsedMinutes >= p.check_frequency_minutes
    })
    .map((p: any) => ({ id: p.id, kaspiSku: p.kaspi_sku }))
}

// One tracked product, one already-fetched competitor price (or a fetch
// error, reported by the caller since the fetch itself no longer happens
// here). Never throws -- a single product's failure must not abort the
// rest of the caller's batch. Always logs a kaspi_shop_price_checks row and
// debits one credit, even on error -- the competitor-price check itself is
// the billable work (see Global Constraints), and an error row is real
// information the seller should see in their history, not a silently
// dropped cycle.
export async function applyPriceCheckResult(
  trackedProductId: string,
  competitorPrice: number | null,
  fetchError: string | null
): Promise<void> {
  const { data: product } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('*, kaspi_shop_connections(user_id, paused)')
    .eq('id', trackedProductId)
    .single()
  if (!product || !product.enabled) return
  if (product.kaspi_shop_connections?.paused) return

  const userId = product.user_id
  const ownPriceBefore = Number(product.own_current_price)
  let action: 'updated' | 'held_at_floor' | 'no_change' | 'error' = 'no_change'
  let ownPriceAfter = ownPriceBefore

  if (!fetchError) {
    // TEMPORARY: single-price/single-city call, matching v1 behavior --
    // Task 9 (Kaspi Shop v2) rewires this to loop per city with the
    // seller's chosen demping_strategy and excluded cities/merchants.
    const { price, heldAtFloor } = computeRepriceCandidate({
      competitorPrices: competitorPrice === null ? [] : [competitorPrice],
      undercutStep: Number(product.undercut_step),
      floorPrice: Number(product.floor_price),
      ownCurrentPrice: ownPriceBefore,
    })
    ownPriceAfter = price
    action = heldAtFloor ? 'held_at_floor' : (price === ownPriceBefore ? 'no_change' : 'updated')

    await supabase
      .from('kaspi_shop_tracked_products')
      .update({ own_current_price: ownPriceAfter, last_checked_at: new Date().toISOString(), last_competitor_price: competitorPrice })
      .eq('id', trackedProductId)

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
