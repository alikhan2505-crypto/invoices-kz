import type { SupabaseClient } from '@supabase/supabase-js'
import { CATALOG_MAX_PRODUCTS } from './promptContext'

// Loads the Kaspi Shop catalog sample for the prompt's «Каталог и цены»
// block (see buildCatalogBlock in promptContext.ts).
//
// Which store: the one the agent is pinned to (ai_agents.kaspi_shop_connection_id),
// falling back to the account's ACTIVE connection when the agent has no pin.
// The fallback is the original behaviour and stays for every agent created
// before stores became selectable -- but it is only a default, because an
// account with several stores would otherwise give all of its agents the same
// catalog, whichever store happened to be selected in the Kaspi Bot section.
//
// The pin is re-checked against ownerUserId on every load, not trusted from the
// agent row: a store can be handed to another account or removed, and an agent
// must never quote prices from a store its owner no longer owns. A pin that no
// longer resolves falls back to the active store rather than failing.
//
// Standing Kaspi Shop rule: connection lookups need .eq('is_active', true).
// Best-effort -- any error or no connection resolves to [] (the block is simply
// omitted and the agent behaves exactly as before this feature), never throws
// into the reply pipeline. Column names verified against the live schema
// 2026-08-25: product_name / own_current_price / enabled (NOT current_price /
// is_enabled).
export async function loadAgentCatalog(
  supabase: SupabaseClient,
  ownerUserId: string,
  pinnedConnectionId?: string | null,
): Promise<{ name: string; price: number }[]> {
  try {
    let conn: { id: string } | null = null
    if (pinnedConnectionId) {
      const { data } = await supabase
        .from('kaspi_shop_connections')
        .select('id')
        .eq('id', pinnedConnectionId)
        .eq('user_id', ownerUserId)
        .maybeSingle()
      conn = data ?? null
    }
    if (!conn) {
      const { data } = await supabase
        .from('kaspi_shop_connections')
        .select('id')
        .eq('user_id', ownerUserId)
        .eq('is_active', true)
        .maybeSingle()
      conn = data ?? null
    }
    if (!conn) return []
    const { data: products } = await supabase
      .from('kaspi_shop_tracked_products')
      .select('product_name, own_current_price, enabled')
      .eq('connection_id', conn.id)
      .order('enabled', { ascending: false })
      .limit(CATALOG_MAX_PRODUCTS)
    return (products || [])
      .map(p => ({ name: String(p.product_name || '').trim(), price: Number(p.own_current_price) || 0 }))
      .filter(p => p.name && p.price > 0)
  } catch {
    return []
  }
}
