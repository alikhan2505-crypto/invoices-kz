import type { SupabaseClient } from '@supabase/supabase-js'

// Daily Kaspi-shop digest for the Telegram notification cron (competitor
// research 2026-09-04: AlemData sells this as a paid feature from 9 900 ₸/mo
// and it's the one thing that gives a seller a daily reason to open the
// product at all). Deliberately built ONLY from tables we write ourselves:
//
//   - kaspi_shop_price_checks  -- written by the repricer's own cycle
//   - kaspi_shop_orders        -- written when a storefront order is placed
//   - wallet_ledger            -- written on every debit
//
// Kaspi's own order/revenue history is NOT usable here: it isn't persisted
// (computeFinanceSummary fetches it live via loadConnection, needing a
// session that regularly expires), and the live Kaspi fetch deliberately
// runs from GitHub Actions rather than Vercel -- see the comment in
// src/app/api/kaspi-shop/cron/apply/route.ts. Reviews are out for the same
// class of reason: kaspi_shop_product_reviews is a per-product SNAPSHOT
// (reviews jsonb + fetched_at), refreshed only when the seller opens the
// Отзывы page, so "new reviews yesterday" would silently report nothing for
// anyone who simply hadn't visited. Both belong in a v2 that reads a real
// snapshot table filled by the Actions runner.

export interface DigestData {
  pricesUpdated: number
  heldAtFloor: number
  storefrontOrders: number
  storefrontRevenue: number
  walletSpent: number
  walletBalance: number
}

function formatTenge(n: number): string {
  return new Intl.NumberFormat('ru-KZ').format(Math.round(n)) + ' ₸'
}

// Pure -- no I/O. Returns null when there is genuinely nothing to report, so
// the cron stays silent instead of sending "за сутки ничего не произошло"
// every morning. A low wallet balance counts as something worth saying even
// on an otherwise quiet day, since that's what silently stops the repricer.
export function formatDigest(data: DigestData, lowBalanceThreshold = 100): string | null {
  const lines: string[] = []

  if (data.pricesUpdated > 0 || data.heldAtFloor > 0) {
    const parts: string[] = []
    if (data.pricesUpdated > 0) parts.push(`изменено цен: <b>${data.pricesUpdated}</b>`)
    if (data.heldAtFloor > 0) parts.push(`упёрлись в минимум: <b>${data.heldAtFloor}</b>`)
    lines.push(`🤖 Демпинг — ${parts.join(', ')}`)
  }

  if (data.storefrontOrders > 0) {
    lines.push(`🛒 Витрина — заказов: <b>${data.storefrontOrders}</b> на <b>${formatTenge(data.storefrontRevenue)}</b>`)
  }

  if (data.walletSpent > 0) {
    lines.push(`💳 Списано с кошелька: <b>${formatTenge(data.walletSpent)}</b>`)
  }

  const balanceLow = data.walletBalance < lowBalanceThreshold
  if (lines.length === 0 && !balanceLow) return null

  if (balanceLow) {
    lines.push(`⚠️ Баланс кошелька: <b>${formatTenge(data.walletBalance)}</b> — при нуле демпинг и AI-агент останавливаются.`)
  } else {
    lines.push(`Баланс кошелька: ${formatTenge(data.walletBalance)}`)
  }

  return `📊 <b>Ваш магазин за сутки</b>\n\n${lines.join('\n')}`
}

// Scoped through the user's own connections -- kaspi_shop_price_checks has
// no user_id of its own, it hangs off tracked products, which hang off
// connections. Every query is best-effort: a failure in one section must
// not cost the seller the rest of the digest.
export async function loadDigestData(
  supabase: SupabaseClient,
  userId: string,
  since: Date,
): Promise<DigestData> {
  const data: DigestData = {
    pricesUpdated: 0,
    heldAtFloor: 0,
    storefrontOrders: 0,
    storefrontRevenue: 0,
    walletSpent: 0,
    walletBalance: 0,
  }
  const sinceIso = since.toISOString()

  const { data: connections } = await supabase
    .from('kaspi_shop_connections')
    .select('id')
    .eq('user_id', userId)
  const connectionIds = (connections || []).map(c => c.id)
  if (connectionIds.length === 0) return data

  const { data: products } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('id')
    .in('connection_id', connectionIds)
  const productIds = (products || []).map(p => p.id)

  if (productIds.length > 0) {
    const { data: checks } = await supabase
      .from('kaspi_shop_price_checks')
      .select('action')
      .in('tracked_product_id', productIds)
      .gte('checked_at', sinceIso)
    for (const c of checks || []) {
      if (c.action === 'updated') data.pricesUpdated++
      else if (c.action === 'held_at_floor') data.heldAtFloor++
    }
  }

  const { data: orders } = await supabase
    .from('kaspi_shop_orders')
    .select('price')
    .in('connection_id', connectionIds)
    .gte('created_at', sinceIso)
  data.storefrontOrders = (orders || []).length
  data.storefrontRevenue = (orders || []).reduce((sum, o) => sum + (Number(o.price) || 0), 0)

  // Debits are stored as positive amounts under a spend type; topups and
  // adjustments are a different type entirely and must not net against them.
  const { data: ledger } = await supabase
    .from('wallet_ledger')
    .select('amount, type')
    .eq('user_id', userId)
    .in('type', ['kaspi_shop_check', 'ai_agent_reply'])
    .gte('created_at', sinceIso)
  data.walletSpent = (ledger || []).reduce((sum, r) => sum + Math.abs(Number(r.amount) || 0), 0)

  const { data: profile } = await supabase
    .from('profiles')
    .select('kaspi_wallet_balance')
    .eq('id', userId)
    .maybeSingle()
  data.walletBalance = Number(profile?.kaspi_wallet_balance) || 0

  return data
}
