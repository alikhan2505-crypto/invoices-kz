import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface TrackedProductRow {
  id: string
  product_name: string | null
  brand: string | null
  own_current_price: number | string | null
  stock_count: number | null
  enabled: boolean | null
}

export interface StorefrontProduct {
  id: string
  name: string
  brand: string
  price: number
}

// Pure -- no I/O. What counts as "available to buy right now": repricer-
// enabled (the only signal we have for "seller wants this active" -- see the
// design doc's deliberate v1 trade-off of reusing this flag) and either
// untracked stock (stock_count is null -- not every product has stock
// synced) or a genuinely positive count. Same zero-price guard
// catalogContext.ts already applies for the AI-агент's own catalog block.
export function filterStorefrontProducts(rows: TrackedProductRow[]): StorefrontProduct[] {
  return rows
    .filter(r => r.enabled && (r.stock_count === null || r.stock_count === undefined || r.stock_count > 0))
    .map(r => ({
      id: r.id,
      name: String(r.product_name || '').trim(),
      brand: String(r.brand || '').trim(),
      price: Number(r.own_current_price) || 0,
    }))
    .filter(p => p.name && p.price > 0)
}

export interface StorefrontSettings {
  connectionId: string
  companyName: string
  slug: string | null
  published: boolean
}

// Scoped to the user's currently ACTIVE store, same as every other Kaspi
// Shop settings surface (loadConnection in kaspiShop/connection.ts) -- the
// seller manages the storefront of whichever store they're switched into.
// The PUBLIC resolution path (resolveStorefrontBySlug) is deliberately NOT
// scoped this way -- see that function's own comment.
export async function loadStorefrontSettings(userId: string): Promise<StorefrontSettings | null> {
  const { data, error } = await supabase
    .from('kaspi_shop_connections')
    .select('id, company_name, storefront_slug, storefront_published')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw new Error(`kaspi_shop_connections storefront lookup failed: ${error.message}`)
  if (!data) return null
  return {
    connectionId: data.id,
    companyName: data.company_name,
    slug: data.storefront_slug,
    published: data.storefront_published,
  }
}

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug)
}

// Plain existence check, deliberately NOT loadConnectionByUserId (kaspiPay/
// connection.ts) -- that function decrypts the connection's private signing
// key and TOTP seed just to answer a yes/no question, which this has no
// business triggering.
export async function hasCashierConnection(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('kaspi_connections')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw new Error(`kaspi_connections existence check failed: ${error.message}`)
  return !!data
}

export async function saveStorefrontSettings(
  userId: string,
  connectionId: string,
  params: { slug: string; published: boolean }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isValidSlug(params.slug)) return { ok: false, error: 'invalid_slug' }
  if (params.published && !(await hasCashierConnection(userId))) return { ok: false, error: 'cashier_not_connected' }

  // Ownership check mirrors switchActiveConnection's pattern (kaspiShop/
  // connection.ts) -- never trust a connectionId from the client without
  // confirming it belongs to this user.
  const { data: owned, error: ownedError } = await supabase
    .from('kaspi_shop_connections')
    .select('id')
    .eq('id', connectionId)
    .eq('user_id', userId)
    .maybeSingle()
  if (ownedError) throw new Error(`kaspi_shop_connections ownership check failed: ${ownedError.message}`)
  if (!owned) return { ok: false, error: 'not_found' }

  const { error } = await supabase
    .from('kaspi_shop_connections')
    .update({ storefront_slug: params.slug, storefront_published: params.published })
    .eq('id', connectionId)
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'slug_taken' }
    throw new Error(`kaspi_shop_connections storefront save failed: ${error.message}`)
  }
  return { ok: true }
}

// The PUBLIC resolution path -- deliberately independent of is_active, per
// the design doc: a seller switching which store is "active" in the
// multi-store switcher (for repricer/orders/etc.) must never change what an
// already-shared storefront link shows. Unpublished and never-claimed slugs
// resolve identically (both null) -- a stale/guessed slug reveals nothing.
export async function resolveStorefrontBySlug(slug: string): Promise<{ connectionId: string; userId: string; companyName: string } | null> {
  const { data, error } = await supabase
    .from('kaspi_shop_connections')
    .select('id, user_id, company_name')
    .eq('storefront_slug', slug)
    .eq('storefront_published', true)
    .maybeSingle()
  if (error) throw new Error(`storefront resolve by slug failed: ${error.message}`)
  return data ? { connectionId: data.id, userId: data.user_id, companyName: data.company_name } : null
}

export async function loadStorefrontProducts(connectionId: string): Promise<StorefrontProduct[]> {
  const { data, error } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('id, product_name, brand, own_current_price, stock_count, enabled')
    .eq('connection_id', connectionId)
  if (error) throw new Error(`kaspi_shop_tracked_products lookup failed for connection ${connectionId}: ${error.message}`)
  return filterStorefrontProducts(data || [])
}
