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
  available_for_sale: boolean | null
  image_url: string | null
  show_on_storefront: boolean
}

export interface CustomProductRow {
  id: string
  name: string | null
  price: number | string | null
  image_url: string | null
  stock_count: number | null
}

export interface StorefrontProduct {
  id: string
  name: string
  brand: string
  price: number
  imageUrl: string | null
}

// Pure -- no I/O. What counts as "available to buy right now" for a Kaspi-
// sourced product: the seller opted it in (show_on_storefront -- founder
// 2026-09-03: the storefront used to show every available_for_sale product
// automatically; now it's a точечный per-product choice, catalog UI marks
// these with a red border), Kaspi still lists it for sale
// (available_for_sale -- kept in sync with Kaspi's own available=true/false
// by finalizeConnection's catalog import and by removed-products/route.ts's
// Снять с продажи/Восстановить actions), and either untracked stock
// (stock_count is null) or a genuinely positive count. Same zero-price guard
// catalogContext.ts already applies for the AI-агент's own catalog block.
export function filterStorefrontProducts(rows: TrackedProductRow[]): StorefrontProduct[] {
  return rows
    .filter(r => r.show_on_storefront && r.available_for_sale !== false && (r.stock_count === null || r.stock_count === undefined || r.stock_count > 0))
    .map(r => ({
      id: r.id,
      name: String(r.product_name || '').trim(),
      brand: String(r.brand || '').trim(),
      price: Number(r.own_current_price) || 0,
      imageUrl: r.image_url || null,
    }))
    .filter(p => p.name && p.price > 0)
}

// Manually-added products (kaspi_shop_custom_products, catalog UI marks
// these with a blue border) -- always shown once created and in stock; no
// separate opt-in flag since adding one at all IS the opt-in. Same shape as
// filterStorefrontProducts so the public page treats both sources identically.
export function filterCustomStorefrontProducts(rows: CustomProductRow[]): StorefrontProduct[] {
  return rows
    .filter(r => r.stock_count === null || r.stock_count === undefined || r.stock_count > 0)
    .map(r => ({
      id: r.id,
      name: String(r.name || '').trim(),
      brand: '',
      price: Number(r.price) || 0,
      imageUrl: r.image_url || null,
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
  const [kaspiRes, customRes] = await Promise.all([
    supabase
      .from('kaspi_shop_tracked_products')
      .select('id, product_name, brand, own_current_price, stock_count, available_for_sale, image_url, show_on_storefront')
      .eq('connection_id', connectionId),
    supabase
      .from('kaspi_shop_custom_products')
      .select('id, name, price, image_url, stock_count')
      .eq('connection_id', connectionId),
  ])
  if (kaspiRes.error) throw new Error(`kaspi_shop_tracked_products lookup failed for connection ${connectionId}: ${kaspiRes.error.message}`)
  if (customRes.error) throw new Error(`kaspi_shop_custom_products lookup failed for connection ${connectionId}: ${customRes.error.message}`)
  return [
    ...filterStorefrontProducts(kaspiRes.data || []),
    ...filterCustomStorefrontProducts(customRes.data || []),
  ]
}

export interface CatalogKaspiProduct {
  id: string
  name: string
  price: number
  imageUrl: string | null
  showOnStorefront: boolean
}

export interface CatalogCustomProduct {
  id: string
  name: string
  price: number
  imageUrl: string | null
  stockCount: number | null
}

// Admin-facing catalog view (Витрина → Каталог) -- unlike loadStorefrontProducts,
// this lists every Kaspi product regardless of showOnStorefront (the seller
// needs to see what's NOT yet on the storefront to opt it in) and carries the
// flag itself so the UI can render the red/blue border distinction.
export async function loadStorefrontCatalog(connectionId: string): Promise<{ kaspiProducts: CatalogKaspiProduct[]; customProducts: CatalogCustomProduct[] }> {
  const [kaspiRes, customRes] = await Promise.all([
    supabase
      .from('kaspi_shop_tracked_products')
      .select('id, product_name, own_current_price, image_url, show_on_storefront')
      .eq('connection_id', connectionId)
      .eq('available_for_sale', true)
      .order('product_name', { ascending: true }),
    supabase
      .from('kaspi_shop_custom_products')
      .select('id, name, price, image_url, stock_count')
      .eq('connection_id', connectionId)
      .order('created_at', { ascending: false }),
  ])
  if (kaspiRes.error) throw new Error(`kaspi_shop_tracked_products catalog lookup failed for connection ${connectionId}: ${kaspiRes.error.message}`)
  if (customRes.error) throw new Error(`kaspi_shop_custom_products catalog lookup failed for connection ${connectionId}: ${customRes.error.message}`)
  return {
    kaspiProducts: (kaspiRes.data || []).map(r => ({
      id: r.id,
      name: String(r.product_name || '').trim(),
      price: Number(r.own_current_price) || 0,
      imageUrl: r.image_url,
      showOnStorefront: r.show_on_storefront,
    })),
    customProducts: (customRes.data || []).map(r => ({
      id: r.id,
      name: String(r.name || '').trim(),
      price: Number(r.price) || 0,
      imageUrl: r.image_url,
      stockCount: r.stock_count,
    })),
  }
}

// Ownership check mirrors saveStorefrontSettings' pattern -- never trust a
// trackedProductId from the client without confirming it belongs to this
// connection.
export async function setKaspiProductStorefrontVisibility(connectionId: string, trackedProductId: string, show: boolean): Promise<boolean> {
  const { data, error } = await supabase
    .from('kaspi_shop_tracked_products')
    .update({ show_on_storefront: show })
    .eq('id', trackedProductId)
    .eq('connection_id', connectionId)
    .select('id')
  if (error) throw new Error(`kaspi_shop_tracked_products visibility update failed: ${error.message}`)
  return !!data && data.length > 0
}

export async function createCustomProduct(
  connectionId: string,
  userId: string,
  params: { name: string; price: number; imageUrl?: string | null; stockCount?: number | null }
): Promise<CatalogCustomProduct> {
  const { data, error } = await supabase
    .from('kaspi_shop_custom_products')
    .insert({
      connection_id: connectionId,
      user_id: userId,
      name: params.name,
      price: params.price,
      image_url: params.imageUrl || null,
      stock_count: params.stockCount ?? null,
    })
    .select('id, name, price, image_url, stock_count')
    .single()
  if (error) throw new Error(`kaspi_shop_custom_products insert failed: ${error.message}`)
  return {
    id: data.id,
    name: data.name,
    price: Number(data.price) || 0,
    imageUrl: data.image_url,
    stockCount: data.stock_count,
  }
}

export async function deleteCustomProduct(connectionId: string, customProductId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('kaspi_shop_custom_products')
    .delete()
    .eq('id', customProductId)
    .eq('connection_id', connectionId)
    .select('id')
  if (error) throw new Error(`kaspi_shop_custom_products delete failed: ${error.message}`)
  return !!data && data.length > 0
}
