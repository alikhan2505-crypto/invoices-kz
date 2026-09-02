import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { KASPI_CATEGORY_COMMISSIONS } from '@/lib/kaspiShop/margin'

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

// Same master-sku-keyed override table and resolution as profit/cogs/route.ts
// (kaspi_shop_product_costs works for ANY sold product, tracked in демпинге
// or not). A separate route rather than folding into cogs/route.ts since the
// two fields save independently from different card controls.
export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const trackedProductId = body?.trackedProductId
  const commissionCategoryLabel = body?.commissionCategoryLabel === null ? null : String(body?.commissionCategoryLabel || '')
  // Validated against the exact same table Margin uses -- an unrecognized
  // label would otherwise silently resolve to a 0% commission in profit.ts
  // (KASPI_CATEGORY_COMMISSIONS.find returns undefined), understating every
  // cost that depends on it.
  if (commissionCategoryLabel !== null && !KASPI_CATEGORY_COMMISSIONS.some(c => c.label === commissionCategoryLabel)) {
    return NextResponse.json({ error: 'Неизвестная категория' }, { status: 400 })
  }

  let kaspiMasterSku: string | null = typeof body?.kaspiMasterSku === 'string' && body.kaspiMasterSku ? body.kaspiMasterSku : null
  if (!kaspiMasterSku && trackedProductId) {
    const { data: productRow, error: lookupError } = await supabase
      .from('kaspi_shop_tracked_products')
      .select('kaspi_master_sku')
      .eq('id', trackedProductId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (lookupError) return NextResponse.json({ error: 'Не удалось сохранить категорию' }, { status: 500 })
    if (!productRow) return NextResponse.json({ error: 'Товар не найден' }, { status: 404 })
    kaspiMasterSku = productRow.kaspi_master_sku
  }
  if (!kaspiMasterSku) {
    return NextResponse.json({ error: 'kaspiMasterSku или trackedProductId обязателен' }, { status: 400 })
  }

  const { data: connRow } = await supabase
    .from('kaspi_shop_connections')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (!connRow) return NextResponse.json({ error: 'Kaspi Магазин не подключён' }, { status: 404 })

  const { error: saveError } = await supabase
    .from('kaspi_shop_product_costs')
    .upsert(
      { connection_id: connRow.id, kaspi_master_sku: kaspiMasterSku, commission_category_label: commissionCategoryLabel, updated_at: new Date().toISOString() },
      { onConflict: 'connection_id,kaspi_master_sku' }
    )
  if (saveError) return NextResponse.json({ error: 'Не удалось сохранить категорию' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
