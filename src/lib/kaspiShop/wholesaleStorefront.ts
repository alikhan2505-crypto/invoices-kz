import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Independent catalog: gifts.ru-style wholesale sewn-goods models with a
// size×color variant grid, unrelated to kaspi_shop_tracked_products (Kaspi
// marketplace resale) or kaspi_shop_custom_products (the flat Витрина
// catalog). See docs/superpowers/specs/2026-09-14-wholesale-storefront-design.md.

export interface WholesaleVariant {
  id: string
  size: string
  color: string
  stockCount: number | null
}

export interface WholesaleModel {
  id: string
  name: string
  price: number
  imageUrl: string | null
  categoryId: string | null
  variants: WholesaleVariant[]
}

interface ModelRow { id: string; name: string; price: number | string; image_url: string | null; storefront_category_id: string | null }
interface VariantRow { id: string; model_id: string; size: string; color: string; stock_count: number | null }

// Pure -- no I/O. Nests each model's own variants under it. A model with no
// variant rows yet still comes back with an empty variants array (not
// dropped) so the admin UI can show "нет вариантов" instead of a missing card.
export function buildWholesaleModels(modelRows: ModelRow[], variantRows: VariantRow[]): WholesaleModel[] {
  return modelRows.map(m => ({
    id: m.id,
    name: String(m.name || '').trim(),
    price: Number(m.price) || 0,
    imageUrl: m.image_url,
    categoryId: m.storefront_category_id,
    variants: variantRows
      .filter(v => v.model_id === m.id)
      .map(v => ({ id: v.id, size: v.size, color: v.color, stockCount: v.stock_count })),
  }))
}

export interface ResolvedWholesaleLine { name: string; price: number; qty: number }

// Pure -- no I/O. Turns one cart line (a model + a specific size/color the
// buyer picked) into a priced счёт line, or null if it can't be fulfilled.
// stockCount is deliberately NOT a parameter: whether a size/color combo has
// stock only decides the public UI's "В корзину" vs "Оформить пошив на
// заказ" label -- both add the SAME line to the cart, and both are valid at
// checkout as long as a real variant row exists (see the design doc's
// "заказ на пошив" note). The caller is responsible for having already
// looked up a real variant row before calling this -- a null variant here
// means the buyer's request doesn't match any size/color the seller ever
// defined for this model, which is the only case that gets rejected.
export function resolveWholesaleLine(
  model: { id: string; name: string; price: number } | null,
  variant: { size: string; color: string } | null,
  qty: number
): ResolvedWholesaleLine | null {
  if (!model || !variant || !Number.isFinite(qty) || qty <= 0) return null
  if (model.price <= 0) return null
  return { name: `${model.name}, ${variant.color}, ${variant.size}`, price: model.price, qty }
}

export async function loadWholesaleModels(connectionId: string): Promise<WholesaleModel[]> {
  const { data: modelRows, error: modelsError } = await supabase
    .from('kaspi_shop_storefront_models')
    .select('id, name, price, image_url, storefront_category_id')
    .eq('connection_id', connectionId)
    .order('created_at', { ascending: false })
  if (modelsError) throw new Error(`kaspi_shop_storefront_models lookup failed for connection ${connectionId}: ${modelsError.message}`)
  const modelIds = (modelRows || []).map(m => m.id)
  if (modelIds.length === 0) return []

  const { data: variantRows, error: variantsError } = await supabase
    .from('kaspi_shop_storefront_model_variants')
    .select('id, model_id, size, color, stock_count')
    .in('model_id', modelIds)
  if (variantsError) throw new Error(`kaspi_shop_storefront_model_variants lookup failed for connection ${connectionId}: ${variantsError.message}`)

  return buildWholesaleModels(modelRows || [], variantRows || [])
}

export async function loadWholesaleModel(connectionId: string, modelId: string): Promise<WholesaleModel | null> {
  const { data: modelRow, error: modelError } = await supabase
    .from('kaspi_shop_storefront_models')
    .select('id, name, price, image_url, storefront_category_id')
    .eq('id', modelId)
    .eq('connection_id', connectionId)
    .maybeSingle()
  if (modelError) throw new Error(`kaspi_shop_storefront_models lookup failed for model ${modelId}: ${modelError.message}`)
  if (!modelRow) return null

  const { data: variantRows, error: variantsError } = await supabase
    .from('kaspi_shop_storefront_model_variants')
    .select('id, model_id, size, color, stock_count')
    .eq('model_id', modelId)
  if (variantsError) throw new Error(`kaspi_shop_storefront_model_variants lookup failed for model ${modelId}: ${variantsError.message}`)

  return buildWholesaleModels([modelRow], variantRows || [])[0]
}

export async function createWholesaleModel(
  connectionId: string,
  params: { name: string; price: number; imageUrl: string | null; categoryId: string | null }
): Promise<WholesaleModel> {
  const { data, error } = await supabase
    .from('kaspi_shop_storefront_models')
    .insert({
      connection_id: connectionId,
      name: params.name,
      price: params.price,
      image_url: params.imageUrl,
      storefront_category_id: params.categoryId,
    })
    .select('id, name, price, image_url, storefront_category_id')
    .single()
  if (error) throw new Error(`kaspi_shop_storefront_models insert failed: ${error.message}`)
  return buildWholesaleModels([data], [])[0]
}

export async function updateWholesaleModel(
  connectionId: string,
  modelId: string,
  params: Partial<{ name: string; price: number; imageUrl: string | null; categoryId: string | null }>
): Promise<boolean> {
  const patch: Record<string, unknown> = {}
  if (params.name !== undefined) patch.name = params.name
  if (params.price !== undefined) patch.price = params.price
  if (params.imageUrl !== undefined) patch.image_url = params.imageUrl
  if (params.categoryId !== undefined) patch.storefront_category_id = params.categoryId

  const { data, error } = await supabase
    .from('kaspi_shop_storefront_models')
    .update(patch)
    .eq('id', modelId)
    .eq('connection_id', connectionId)
    .select('id')
  if (error) throw new Error(`kaspi_shop_storefront_models update failed: ${error.message}`)
  return !!data && data.length > 0
}

// Cascades to the model's variants via the FK's `on delete cascade`.
export async function deleteWholesaleModel(connectionId: string, modelId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('kaspi_shop_storefront_models')
    .delete()
    .eq('id', modelId)
    .eq('connection_id', connectionId)
    .select('id')
  if (error) throw new Error(`kaspi_shop_storefront_models delete failed: ${error.message}`)
  return !!data && data.length > 0
}

// The variants table has no connection_id of its own -- ownership always
// routes through the model, so every variant mutation below first confirms
// modelId belongs to connectionId (same pattern setProductCategory in
// storefront.ts uses for its own ownership check) before touching a variant row.
async function modelBelongsToConnection(connectionId: string, modelId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('kaspi_shop_storefront_models')
    .select('id')
    .eq('id', modelId)
    .eq('connection_id', connectionId)
    .maybeSingle()
  if (error) throw new Error(`kaspi_shop_storefront_models ownership check failed: ${error.message}`)
  return !!data
}

export async function createWholesaleVariant(
  connectionId: string,
  modelId: string,
  params: { size: string; color: string; stockCount: number | null }
): Promise<WholesaleVariant | null> {
  if (!(await modelBelongsToConnection(connectionId, modelId))) return null
  const { data, error } = await supabase
    .from('kaspi_shop_storefront_model_variants')
    .insert({ model_id: modelId, size: params.size, color: params.color, stock_count: params.stockCount })
    .select('id, size, color, stock_count')
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('duplicate_variant')
    throw new Error(`kaspi_shop_storefront_model_variants insert failed: ${error.message}`)
  }
  return { id: data.id, size: data.size, color: data.color, stockCount: data.stock_count }
}

export async function updateWholesaleVariant(
  connectionId: string,
  modelId: string,
  variantId: string,
  params: Partial<{ size: string; color: string; stockCount: number | null }>
): Promise<boolean> {
  if (!(await modelBelongsToConnection(connectionId, modelId))) return false
  const patch: Record<string, unknown> = {}
  if (params.size !== undefined) patch.size = params.size
  if (params.color !== undefined) patch.color = params.color
  if (params.stockCount !== undefined) patch.stock_count = params.stockCount

  const { data, error } = await supabase
    .from('kaspi_shop_storefront_model_variants')
    .update(patch)
    .eq('id', variantId)
    .eq('model_id', modelId)
    .select('id')
  if (error) {
    if (error.code === '23505') throw new Error('duplicate_variant')
    throw new Error(`kaspi_shop_storefront_model_variants update failed: ${error.message}`)
  }
  return !!data && data.length > 0
}

export async function deleteWholesaleVariant(connectionId: string, modelId: string, variantId: string): Promise<boolean> {
  if (!(await modelBelongsToConnection(connectionId, modelId))) return false
  const { data, error } = await supabase
    .from('kaspi_shop_storefront_model_variants')
    .delete()
    .eq('id', variantId)
    .eq('model_id', modelId)
    .select('id')
  if (error) throw new Error(`kaspi_shop_storefront_model_variants delete failed: ${error.message}`)
  return !!data && data.length > 0
}

// The public checkout's own lookup: one model + the exact size/color the
// buyer picked, scoped to the SELLER's connection (never trust a modelId
// from an anonymous POST body without this). Returns null if the model
// doesn't exist for this connection, or if this size/color combination was
// never defined -- resolveWholesaleLine turns either into a rejected line.
export async function loadWholesaleModelByVariant(
  connectionId: string,
  modelId: string,
  size: string,
  color: string
): Promise<{ model: { id: string; name: string; price: number }; variant: { size: string; color: string } } | null> {
  const { data: modelRow, error: modelError } = await supabase
    .from('kaspi_shop_storefront_models')
    .select('id, name, price')
    .eq('id', modelId)
    .eq('connection_id', connectionId)
    .maybeSingle()
  if (modelError) throw new Error(`kaspi_shop_storefront_models lookup failed for model ${modelId}: ${modelError.message}`)
  if (!modelRow) return null

  const { data: variantRow, error: variantError } = await supabase
    .from('kaspi_shop_storefront_model_variants')
    .select('size, color')
    .eq('model_id', modelId)
    .eq('size', size)
    .eq('color', color)
    .maybeSingle()
  if (variantError) throw new Error(`kaspi_shop_storefront_model_variants lookup failed for model ${modelId}: ${variantError.message}`)
  if (!variantRow) return null

  return {
    model: { id: modelRow.id, name: String(modelRow.name || '').trim(), price: Number(modelRow.price) || 0 },
    variant: { size: variantRow.size, color: variantRow.color },
  }
}
