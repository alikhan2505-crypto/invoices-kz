import type { SupabaseClient } from '@supabase/supabase-js'
import { CATALOG_MAX_PRODUCTS } from './promptContext'

// Loads the agent owner's Kaspi Shop catalog sample for the prompt's
// «Каталог и цены» block (see buildCatalogBlock in promptContext.ts).
// Standing Kaspi Shop rule: connection lookups need .eq('is_active',
// true). Best-effort -- any error or no connection resolves to [] (the
// block is simply omitted and the agent behaves exactly as before this
// feature), never throws into the reply pipeline. Column names verified
// against the live schema 2026-08-25: product_name / own_current_price /
// enabled (NOT current_price / is_enabled).
export async function loadAgentCatalog(
  supabase: SupabaseClient,
  ownerUserId: string,
): Promise<{ name: string; price: number }[]> {
  try {
    const { data: conn } = await supabase
      .from('kaspi_shop_connections')
      .select('id')
      .eq('user_id', ownerUserId)
      .eq('is_active', true)
      .maybeSingle()
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
