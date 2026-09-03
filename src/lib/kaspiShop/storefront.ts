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
  storefront_category_id: string | null
}

export interface CustomProductRow {
  id: string
  name: string | null
  price: number | string | null
  image_url: string | null
  stock_count: number | null
  storefront_category_id: string | null
}

export interface StorefrontProduct {
  id: string
  name: string
  brand: string
  price: number
  imageUrl: string | null
  categoryId: string | null
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
      categoryId: r.storefront_category_id,
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
      categoryId: r.storefront_category_id,
    }))
    .filter(p => p.name && p.price > 0)
}

export interface StorefrontSettings {
  connectionId: string
  companyName: string
  slug: string | null
  published: boolean
  backgroundColor: string | null
  deliveryInfo: string | null
  chatWidgetEnabled: boolean
}

// A curated swatch list, not a free-form color picker -- keeps the public
// page's palette sane and lets saveStorefrontAppearance validate server-side
// with a simple membership check instead of parsing arbitrary CSS color
// syntax. Null means "no override", i.e. the app's own var(--nav-bg).
export const STOREFRONT_BACKGROUND_PRESETS = ['#ffffff', '#f5f4f0', '#eef2ff', '#fdf2f8', '#ecfdf5', '#111827'] as const

// Scoped to the user's currently ACTIVE store, same as every other Kaspi
// Shop settings surface (loadConnection in kaspiShop/connection.ts) -- the
// seller manages the storefront of whichever store they're switched into.
// The PUBLIC resolution path (resolveStorefrontBySlug) is deliberately NOT
// scoped this way -- see that function's own comment.
export async function loadStorefrontSettings(userId: string): Promise<StorefrontSettings | null> {
  const { data, error } = await supabase
    .from('kaspi_shop_connections')
    .select('id, company_name, storefront_slug, storefront_published, storefront_background_color, storefront_delivery_info, storefront_chat_widget_enabled')
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
    backgroundColor: data.storefront_background_color,
    deliveryInfo: data.storefront_delivery_info,
    chatWidgetEnabled: data.storefront_chat_widget_enabled,
  }
}

// Same "does this user have a usable website chat widget" check the
// ai-agent settings page implicitly relies on (a user can own several
// ai_agents rows, so this fans out across all of them) -- reused here to
// gate the storefront's chat-bot toggle without duplicating that lookup.
export async function loadWebsiteWidgetKey(userId: string): Promise<string | null> {
  const { data: agents, error: agentsError } = await supabase.from('ai_agents').select('id').eq('user_id', userId)
  if (agentsError) throw new Error(`ai_agents lookup failed for user ${userId}: ${agentsError.message}`)
  const agentIds = (agents || []).map(a => a.id)
  if (agentIds.length === 0) return null
  const { data, error } = await supabase
    .from('ai_agent_channel_connections')
    .select('external_account_id')
    .in('agent_id', agentIds)
    .eq('channel', 'website')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`ai_agent_channel_connections website lookup failed: ${error.message}`)
  return data?.external_account_id || null
}

export async function saveStorefrontAppearance(
  userId: string,
  connectionId: string,
  params: { backgroundColor: string | null; deliveryInfo: string; chatWidgetEnabled: boolean }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (params.backgroundColor !== null && !(STOREFRONT_BACKGROUND_PRESETS as readonly string[]).includes(params.backgroundColor)) {
    return { ok: false, error: 'invalid_background' }
  }
  if (params.chatWidgetEnabled && !(await loadWebsiteWidgetKey(userId))) {
    return { ok: false, error: 'widget_not_connected' }
  }

  // Ownership check mirrors saveStorefrontSettings' own pattern.
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
    .update({
      storefront_background_color: params.backgroundColor,
      storefront_delivery_info: params.deliveryInfo.trim() || null,
      storefront_chat_widget_enabled: params.chatWidgetEnabled,
    })
    .eq('id', connectionId)
  if (error) throw new Error(`kaspi_shop_connections appearance save failed: ${error.message}`)
  return { ok: true }
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
export async function resolveStorefrontBySlug(slug: string): Promise<{
  connectionId: string
  userId: string
  companyName: string
  backgroundColor: string | null
  deliveryInfo: string | null
  chatWidgetEnabled: boolean
} | null> {
  const { data, error } = await supabase
    .from('kaspi_shop_connections')
    .select('id, user_id, company_name, storefront_background_color, storefront_delivery_info, storefront_chat_widget_enabled')
    .eq('storefront_slug', slug)
    .eq('storefront_published', true)
    .maybeSingle()
  if (error) throw new Error(`storefront resolve by slug failed: ${error.message}`)
  return data ? {
    connectionId: data.id,
    userId: data.user_id,
    companyName: data.company_name,
    backgroundColor: data.storefront_background_color,
    deliveryInfo: data.storefront_delivery_info,
    chatWidgetEnabled: data.storefront_chat_widget_enabled,
  } : null
}

export async function loadStorefrontProducts(connectionId: string): Promise<StorefrontProduct[]> {
  const [kaspiRes, customRes] = await Promise.all([
    supabase
      .from('kaspi_shop_tracked_products')
      .select('id, product_name, brand, own_current_price, stock_count, available_for_sale, image_url, show_on_storefront, storefront_category_id')
      .eq('connection_id', connectionId),
    supabase
      .from('kaspi_shop_custom_products')
      .select('id, name, price, image_url, stock_count, storefront_category_id')
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
  categoryId: string | null
}

export interface CatalogCustomProduct {
  id: string
  name: string
  price: number
  imageUrl: string | null
  stockCount: number | null
  categoryId: string | null
}

// Admin-facing catalog view (Витрина → Каталог) -- unlike loadStorefrontProducts,
// this lists every Kaspi product regardless of showOnStorefront (the seller
// needs to see what's NOT yet on the storefront to opt it in) and carries the
// flag itself so the UI can render the red/blue border distinction.
export async function loadStorefrontCatalog(connectionId: string): Promise<{ kaspiProducts: CatalogKaspiProduct[]; customProducts: CatalogCustomProduct[] }> {
  const [kaspiRes, customRes] = await Promise.all([
    supabase
      .from('kaspi_shop_tracked_products')
      .select('id, product_name, own_current_price, image_url, show_on_storefront, storefront_category_id')
      .eq('connection_id', connectionId)
      .eq('available_for_sale', true)
      .order('product_name', { ascending: true }),
    supabase
      .from('kaspi_shop_custom_products')
      .select('id, name, price, image_url, stock_count, storefront_category_id')
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
      categoryId: r.storefront_category_id,
    })),
    customProducts: (customRes.data || []).map(r => ({
      id: r.id,
      name: String(r.name || '').trim(),
      price: Number(r.price) || 0,
      imageUrl: r.image_url,
      stockCount: r.stock_count,
      categoryId: r.storefront_category_id,
    })),
  }
}

export interface StorefrontCategory {
  id: string
  name: string
  sortOrder: number
}

export async function loadStorefrontCategories(connectionId: string): Promise<StorefrontCategory[]> {
  const { data, error } = await supabase
    .from('kaspi_shop_storefront_categories')
    .select('id, name, sort_order')
    .eq('connection_id', connectionId)
    .order('sort_order', { ascending: true })
  if (error) throw new Error(`kaspi_shop_storefront_categories lookup failed for connection ${connectionId}: ${error.message}`)
  return (data || []).map(r => ({ id: r.id, name: r.name, sortOrder: r.sort_order }))
}

export async function createStorefrontCategory(connectionId: string, name: string): Promise<StorefrontCategory> {
  const { count } = await supabase
    .from('kaspi_shop_storefront_categories')
    .select('id', { count: 'exact', head: true })
    .eq('connection_id', connectionId)
  const { data, error } = await supabase
    .from('kaspi_shop_storefront_categories')
    .insert({ connection_id: connectionId, name, sort_order: count ?? 0 })
    .select('id, name, sort_order')
    .single()
  if (error) throw new Error(`kaspi_shop_storefront_categories insert failed: ${error.message}`)
  return { id: data.id, name: data.name, sortOrder: data.sort_order }
}

export async function deleteStorefrontCategory(connectionId: string, categoryId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('kaspi_shop_storefront_categories')
    .delete()
    .eq('id', categoryId)
    .eq('connection_id', connectionId)
    .select('id')
  if (error) throw new Error(`kaspi_shop_storefront_categories delete failed: ${error.message}`)
  return !!data && data.length > 0
}

// Assigns (or clears, when categoryId is null) one product's storefront
// category -- works for either source table, matching the dual-source
// pattern the rest of this catalog uses.
export async function setProductCategory(
  connectionId: string,
  productId: string,
  source: 'kaspi' | 'custom',
  categoryId: string | null
): Promise<boolean> {
  const table = source === 'kaspi' ? 'kaspi_shop_tracked_products' : 'kaspi_shop_custom_products'
  const { data, error } = await supabase
    .from(table)
    .update({ storefront_category_id: categoryId })
    .eq('id', productId)
    .eq('connection_id', connectionId)
    .select('id')
  if (error) throw new Error(`${table} category update failed: ${error.message}`)
  return !!data && data.length > 0
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
    categoryId: null,
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
