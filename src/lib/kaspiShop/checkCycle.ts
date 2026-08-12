import { createClient } from '@supabase/supabase-js'
import { computeRepriceCandidate } from './pricing'
import { fetchLowestCompetitorPrice } from './competitorPrice'
import { debitKaspiShopWallet } from './wallet'
import { sendTelegramNotification } from '@/lib/telegramNotify'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// One tracked product, one check cycle. Never throws -- a single product's
// failure (a transient Kaspi page fetch error, e.g.) must not abort the rest
// of the cron batch (Task 6 loops many of these). Always logs a
// kaspi_shop_price_checks row and debits one credit, even on error -- the
// competitor-price check itself is the billable work (see Global
// Constraints), and an error row is real information the seller should see
// in their history, not a silently dropped cycle.
export async function runPriceCheck(trackedProductId: string): Promise<void> {
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
  let competitorPrice: number | null = null
  let ownPriceAfter = ownPriceBefore
  let errorMessage: string | null = null

  try {
    competitorPrice = await fetchLowestCompetitorPrice(product.kaspi_sku)
    const { price, heldAtFloor } = computeRepriceCandidate({
      competitorPrice,
      undercutStep: Number(product.undercut_step),
      floorPrice: Number(product.floor_price),
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
  } catch (err: any) {
    action = 'error'
    errorMessage = err.message
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
    error_message: errorMessage,
  })

  try {
    await debitKaspiShopWallet(userId, 1, `Проверка цены: ${product.product_name}`)
  } catch (err: any) {
    console.error('kaspi-shop checkCycle: wallet debit failed for user', userId, 'product', trackedProductId, ':', err.message)
  }
}
