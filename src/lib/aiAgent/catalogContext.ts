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
// Shared by loadAgentCatalog and loadAgentDeliveryInfo below -- both need
// exactly the same "which store" answer (the pin, re-checked against
// ownerUserId, falling back to the active store), and duplicating this
// ownership-sensitive lookup in two places would be the kind of thing that
// drifts the moment one of them gets a fix the other doesn't.
async function resolveAgentConnectionId(
  supabase: SupabaseClient,
  ownerUserId: string,
  pinnedConnectionId?: string | null,
): Promise<string | null> {
  if (pinnedConnectionId) {
    const { data } = await supabase
      .from('kaspi_shop_connections')
      .select('id')
      .eq('id', pinnedConnectionId)
      .eq('user_id', ownerUserId)
      .maybeSingle()
    if (data) return data.id
  }
  const { data } = await supabase
    .from('kaspi_shop_connections')
    .select('id')
    .eq('user_id', ownerUserId)
    .eq('is_active', true)
    .maybeSingle()
  return data?.id ?? null
}

export async function loadAgentCatalog(
  supabase: SupabaseClient,
  ownerUserId: string,
  pinnedConnectionId?: string | null,
): Promise<{ name: string; price: number }[]> {
  try {
    const connId = await resolveAgentConnectionId(supabase, ownerUserId, pinnedConnectionId)
    if (!connId) return []
    const conn = { id: connId }
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

// The seller's own delivery text (Kaspi Bot -> Витрина -> Оформление,
// storefront_delivery_info -- already shown on the public storefront page,
// never previously fed into the AI agent's own prompt). Null when the
// seller never set one, so the invoice-tool instruction (promptContext.ts's
// buildDeliveryBlock) falls back to a generic Kazakhstan-wide price guide
// instead of inventing a number with nothing behind it. Same
// best-effort/never-throw contract as loadAgentCatalog -- a lookup failure
// here must never break the reply pipeline.
export async function loadAgentDeliveryInfo(
  supabase: SupabaseClient,
  ownerUserId: string,
  pinnedConnectionId?: string | null,
): Promise<string | null> {
  try {
    const connId = await resolveAgentConnectionId(supabase, ownerUserId, pinnedConnectionId)
    if (!connId) return null
    const { data } = await supabase
      .from('kaspi_shop_connections')
      .select('storefront_delivery_info')
      .eq('id', connId)
      .maybeSingle()
    const info = data?.storefront_delivery_info
    return typeof info === 'string' && info.trim() ? info.trim() : null
  } catch {
    return null
  }
}

// Links to send when a customer asks to see "the whole catalog" instead of
// apologizing that there isn't one. kaspiShopUrl is always present once the
// store is connected (merchant_id is assigned by Kaspi itself); URL format
// confirmed live against a real seller page 2026-09-16:
// kaspi.kz/shop/info/merchant/{merchant_id}/address-tab/ resolves to that
// seller's own Kaspi Shop page. storefrontUrl is only returned when the
// seller has actually published their Витрина -- an unpublished slug would
// send the customer to a page that looks broken.
export async function loadAgentShopLinks(
  supabase: SupabaseClient,
  ownerUserId: string,
  pinnedConnectionId?: string | null,
): Promise<{ kaspiShopUrl: string | null; storefrontUrl: string | null }> {
  try {
    const connId = await resolveAgentConnectionId(supabase, ownerUserId, pinnedConnectionId)
    if (!connId) return { kaspiShopUrl: null, storefrontUrl: null }
    const { data } = await supabase
      .from('kaspi_shop_connections')
      .select('merchant_id, storefront_slug, storefront_published')
      .eq('id', connId)
      .maybeSingle()
    const merchantId = data?.merchant_id ? String(data.merchant_id).trim() : ''
    const kaspiShopUrl = merchantId
      ? `https://kaspi.kz/shop/info/merchant/${encodeURIComponent(merchantId)}/address-tab/`
      : null
    const slug = data?.storefront_slug ? String(data.storefront_slug).trim() : ''
    const storefrontUrl = slug && data?.storefront_published
      ? `https://invoices.kz/shop/${encodeURIComponent(slug)}`
      : null
    return { kaspiShopUrl, storefrontUrl }
  } catch {
    return { kaspiShopUrl: null, storefrontUrl: null }
  }
}
