import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { suggestNktCodes } from '@/lib/kaspiShop/nkt'
import { loadConnection } from '@/lib/kaspiShop/connection'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

// GET -- the seller's tracked products with their НКТ status joined in.
// kaspi_shop_nkt_status is embedded via its tracked_product_id -> id
// foreign key (see the migration); a product with no suggestion/status row
// yet just comes back with an empty embed, which the mapping below turns
// into a synthetic 'not_started' row rather than leaving it null, so the
// UI always has a status to render a chip for.
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Scoped to the active connection -- a user_id-wide query mixed both
  // stores' products once multi-store support landed (2026-08-21).
  const connection = await loadConnection(user.id)
  if (!connection) return NextResponse.json({ products: [] })

  const { data, error } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('id, kaspi_sku, product_name, brand, kaspi_category, kaspi_shop_nkt_status(*)')
    .eq('connection_id', connection.id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const products = (data || []).map((p: any) => {
    // PostgREST embeds a to-many array even though tracked_product_id is
    // unique (one-to-one in practice) -- take the first (only) row.
    const nkt = Array.isArray(p.kaspi_shop_nkt_status) ? p.kaspi_shop_nkt_status[0] : p.kaspi_shop_nkt_status
    return {
      id: p.id,
      kaspiSku: p.kaspi_sku,
      productName: p.product_name,
      brand: p.brand,
      kaspiCategory: p.kaspi_category,
      ntinStatus: nkt?.ntin_status || 'not_started',
      suggestedOktruCode: nkt?.suggested_oktru_code || null,
      suggestedOktruName: nkt?.suggested_oktru_name || null,
      suggestedTnvedCode: nkt?.suggested_tnved_code || null,
      suggestionReasoning: nkt?.suggestion_reasoning || null,
      suggestionConfident: nkt?.suggestion_confident ?? null,
      submittedAt: nkt?.submitted_at || null,
    }
  })

  return NextResponse.json({ products })
}

// POST -- two actions, deliberately named to be honest about what each does
// (see src/lib/kaspiShop/nkt.ts's top comment for why there's no real
// "submit" action):
//   'suggest'        -- calls Claude for an ОКТРУ/ТН ВЭД suggestion, stores
//                        it, sets status to 'suggested'. Never goes further.
//   'mark_submitted'  -- a manual self-report: the seller says they already
//                        filed the application themselves on
//                        nationalcatalog.kz using the suggested codes. This
//                        never calls any external system -- it only updates
//                        our own tracking row.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }

  const { action, trackedProductId } = body
  if (!trackedProductId) return NextResponse.json({ error: 'trackedProductId обязателен' }, { status: 400 })

  // Confirms the product belongs to the caller before touching it -- the
  // same ownership check every other kaspi-shop route does via
  // .eq('user_id', user.id), just done as a read-first since this route
  // also needs product_name/brand/kaspi_category for the suggest action.
  const { data: product, error: productError } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('id, product_name, brand, kaspi_category')
    .eq('id', trackedProductId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (productError) return NextResponse.json({ error: productError.message }, { status: 500 })
  if (!product) return NextResponse.json({ error: 'Товар не найден' }, { status: 404 })

  if (action === 'suggest') {
    let suggestion
    try {
      suggestion = await suggestNktCodes({
        productName: product.product_name,
        brand: product.brand,
        kaspiCategory: product.kaspi_category,
      })
    } catch (err: any) {
      return NextResponse.json({ error: `Не удалось получить предложение от ИИ: ${err.message}` }, { status: 502 })
    }

    const { data: saved, error: upsertError } = await supabase
      .from('kaspi_shop_nkt_status')
      .upsert({
        user_id: user.id,
        tracked_product_id: trackedProductId,
        ntin_status: 'suggested',
        suggested_oktru_code: suggestion.oktruCode,
        suggested_oktru_name: suggestion.oktruName,
        suggested_tnved_code: suggestion.tnvedCode,
        suggestion_reasoning: suggestion.reasoning,
        suggestion_confident: suggestion.confident,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tracked_product_id' })
      .select()
      .single()
    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 })

    return NextResponse.json({
      ntinStatus: saved.ntin_status,
      suggestedOktruCode: saved.suggested_oktru_code,
      suggestedOktruName: saved.suggested_oktru_name,
      suggestedTnvedCode: saved.suggested_tnved_code,
      suggestionReasoning: saved.suggestion_reasoning,
      suggestionConfident: saved.suggestion_confident,
    })
  }

  if (action === 'mark_submitted') {
    // Requires an existing suggestion row -- marking "submitted" with no
    // codes attached would leave the UI showing a submitted state with
    // nothing to show for it, and there'd be no suggestion to have filed
    // with in the first place.
    const { data: existing, error: existingError } = await supabase
      .from('kaspi_shop_nkt_status')
      .select('id, suggested_oktru_code, suggested_tnved_code')
      .eq('tracked_product_id', trackedProductId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })
    if (!existing) return NextResponse.json({ error: 'Сначала получите предложение категории' }, { status: 400 })

    const { data: updated, error: updateError } = await supabase
      .from('kaspi_shop_nkt_status')
      .update({ ntin_status: 'submitted', submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single()
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    return NextResponse.json({
      ntinStatus: updated.ntin_status,
      submittedAt: updated.submitted_at,
      suggestedOktruCode: updated.suggested_oktru_code,
      suggestedTnvedCode: updated.suggested_tnved_code,
    })
  }

  return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
}
