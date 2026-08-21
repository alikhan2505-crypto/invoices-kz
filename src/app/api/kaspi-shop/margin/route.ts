import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { DEFAULT_TARGET_MARGIN_PERCENT } from '@/lib/kaspiShop/margin'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Same auth gate as the rest of Kaspi Shop's API routes (products, profit,
// etc.): any authenticated user, no is_admin check at the route level -- the
// is_admin gate lives client-side in the page (see products/route.ts,
// profit/cogs/route.ts for the identical pattern). Not scoped to a Kaspi
// Shop connection either, unlike products/POST -- this tool is useful even
// before a seller has connected a cabinet (it's a pre-listing sourcing
// decision, not something that needs live Kaspi data).
async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

// Returns both the saved evaluations AND the seller's target-margin
// threshold in one call -- the page needs both to render, and
// profiles.kaspi_margin_target_percent has a NOT NULL DEFAULT 20 so this
// never needs a null-fallback beyond defensive belt-and-braces.
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [evalRes, profileRes] = await Promise.all([
    supabase
      .from('kaspi_shop_margin_evaluations')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('kaspi_margin_target_percent')
      .eq('id', user.id)
      .maybeSingle(),
  ])
  if (evalRes.error) return NextResponse.json({ error: evalRes.error.message }, { status: 500 })

  return NextResponse.json({
    evaluations: evalRes.data || [],
    targetMarginPercent: profileRes.data?.kaspi_margin_target_percent ?? DEFAULT_TARGET_MARGIN_PERCENT,
  })
}

// Saves one evaluated product. The margin/profit/verdict fields are computed
// client-side by src/lib/kaspiShop/margin.ts and sent as a snapshot, not
// recomputed here -- this is a save-what-you-saw record of a past decision,
// not a live-tracked value that should silently drift if the seller later
// tweaks their default cargo rate or target margin.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }

  const {
    productName, kaspiPrice, sourcingPrice, weightGrams, packagingCost,
    cargoRatePerKg, categoryLabel, commissionRatePercent, deliveryFee,
    sourceUrl, cityCode, marginPercent, profitAmount, verdict,
  } = body

  if (!productName || typeof productName !== 'string') {
    return NextResponse.json({ error: 'productName обязателен' }, { status: 400 })
  }
  const numericFields = { kaspiPrice, sourcingPrice, weightGrams, packagingCost, cargoRatePerKg, commissionRatePercent, deliveryFee, marginPercent, profitAmount }
  for (const [key, value] of Object.entries(numericFields)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return NextResponse.json({ error: `${key} должен быть числом` }, { status: 400 })
    }
  }
  if (verdict !== 'take' && verdict !== 'skip') {
    return NextResponse.json({ error: 'verdict должен быть take или skip' }, { status: 400 })
  }

  const { data, error } = await supabase.from('kaspi_shop_margin_evaluations').insert({
    user_id: user.id,
    product_name: productName,
    kaspi_price: kaspiPrice,
    sourcing_price: sourcingPrice,
    weight_grams: weightGrams,
    packaging_cost: packagingCost,
    cargo_rate_per_kg: cargoRatePerKg,
    category_label: categoryLabel ?? null,
    commission_rate_percent: commissionRatePercent,
    delivery_fee: deliveryFee,
    source_url: sourceUrl ?? null,
    city_code: cityCode ?? null,
    margin_percent: marginPercent,
    profit_amount: profitAmount,
    verdict,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ evaluation: data })
}

// Updates the seller's target-margin threshold (profiles.kaspi_margin_target_percent).
// A separate PATCH rather than a new route file -- same "one small settings
// value" pattern as profit/commission/route.ts's PATCH, just living next to
// the GET/POST/DELETE for this same feature instead of a sibling file.
export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const targetMarginPercent = Number(body?.targetMarginPercent)
  if (!Number.isFinite(targetMarginPercent) || targetMarginPercent < 0 || targetMarginPercent > 100) {
    return NextResponse.json({ error: 'targetMarginPercent должен быть числом от 0 до 100' }, { status: 400 })
  }

  const { error } = await supabase
    .from('profiles')
    .update({ kaspi_margin_target_percent: targetMarginPercent })
    .eq('id', user.id)
  if (error) return NextResponse.json({ error: 'Не удалось сохранить цель по марже' }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }
  const { id } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('kaspi_shop_margin_evaluations').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
