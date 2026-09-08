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
    // Only what the seller is actually selling, ordered so the products a
    // customer can buy right now survive the cap.
    //
    // Two things were wrong before. There was no availability filter at all, so
    // the agent could quote a delisted product. And the ordering was
    // .order('enabled') -- `enabled` is the repricer's auto-pricing toggle, not
    // an availability flag, and it is false on all 194 products on the live
    // account, so it ordered nothing: the 50 that fit the cap were an arbitrary
    // 50 out of 194, re-rolled on every query.
    //
    // available_for_sale is Kaspi's own flag and removes exactly the delisted
    // ones. stock_count is deliberately NOT a filter: only 68 of the 194 carry
    // a positive count, and cutting to those would hide two thirds of a live
    // catalog behind a number that syncs unevenly. It orders instead, so
    // in-stock products come first and the cap bites on the ones that are out.
    const { data: products } = await supabase
      .from('kaspi_shop_tracked_products')
      .select('product_name, own_current_price, image_url')
      .eq('connection_id', conn.id)
      .eq('available_for_sale', true)
      .order('stock_count', { ascending: false, nullsFirst: false })
      .order('product_name', { ascending: true })
      .limit(CATALOG_MAX_PRODUCTS)
    // Second source: products the owner added by hand in Витрина. They exist
    // nowhere in Kaspi's own catalogue, so without this the agent does not know
    // they are for sale at all -- and their photo is the only one a seller can
    // set themselves. On tracked products image_url is filled only for items
    // that have actually sold, because the backfill reads it off order items.
    const { data: custom } = await supabase
      .from('kaspi_shop_custom_products')
      .select('name, price, image_url, stock_count')
      .eq('connection_id', conn.id)

    const tracked = (products || []).map(p => ({
      name: String(p.product_name || '').trim(),
      price: Number(p.own_current_price) || 0,
      imageUrl: (p.image_url as string | null) || null,
    }))

    // Same availability rule Витрина itself applies: an unset count means the
    // owner is not tracking stock for this one, not that it is out.
    const handAdded = (custom || [])
      .filter(c => c.stock_count === null || c.stock_count === undefined || Number(c.stock_count) > 0)
      .map(c => ({
        name: String(c.name || '').trim(),
        price: Number(c.price) || 0,
        imageUrl: (c.image_url as string | null) || null,
      }))

    // A hand-added product is by definition one Kaspi does not track, so the
    // two lists should not overlap -- but a seller can retype a name that also
    // exists in Kaspi, and two entries for one product would make
    // pickProductPhoto call it a tie and send no photo at all. Tracked wins:
    // its price is the one the repricer keeps current.
    const seen = new Set(tracked.map(p => p.name.toLowerCase()))
    return [...tracked, ...handAdded.filter(p => !seen.has(p.name.toLowerCase()))]
      .filter(p => p.name && p.price > 0)
  } catch {
    return []
  }
}
