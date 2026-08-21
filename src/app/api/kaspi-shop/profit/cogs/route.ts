import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const trackedProductId = body?.trackedProductId
  const cogsAmount = body?.cogsAmount === null ? null : Number(body?.cogsAmount)
  if (cogsAmount !== null && !(cogsAmount >= 0)) {
    return NextResponse.json({ error: 'Корректная cogsAmount обязательна' }, { status: 400 })
  }

  // Primary key for себестоимость is kaspi_master_sku (works for ANY sold
  // product, tracked in демпинг or not -- founder 2026-08-21: «не везде
  // могу поменять себестоимость»). Legacy callers passing only
  // trackedProductId get their master sku resolved.
  let kaspiMasterSku: string | null = typeof body?.kaspiMasterSku === 'string' && body.kaspiMasterSku ? body.kaspiMasterSku : null
  if (!kaspiMasterSku && trackedProductId) {
    const { data: productRow, error: lookupError } = await supabase
      .from('kaspi_shop_tracked_products')
      .select('kaspi_master_sku')
      .eq('id', trackedProductId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (lookupError) return NextResponse.json({ error: 'Не удалось сохранить себестоимость' }, { status: 500 })
    if (!productRow) return NextResponse.json({ error: 'Товар не найден' }, { status: 404 })
    kaspiMasterSku = productRow.kaspi_master_sku
  }
  if (!kaspiMasterSku && !trackedProductId) {
    return NextResponse.json({ error: 'kaspiMasterSku или trackedProductId обязателен' }, { status: 400 })
  }

  const { data: connRow } = await supabase
    .from('kaspi_shop_connections')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (kaspiMasterSku && connRow) {
    const { error: costError } = await supabase
      .from('kaspi_shop_product_costs')
      .upsert(
        { connection_id: connRow.id, kaspi_master_sku: kaspiMasterSku, cogs_amount: cogsAmount, updated_at: new Date().toISOString() },
        { onConflict: 'connection_id,kaspi_master_sku' }
      )
    if (costError) return NextResponse.json({ error: 'Не удалось сохранить себестоимость' }, { status: 500 })
  }

  // Keep the tracked rows in sync too (they remain the fallback source and
  // feed the margin/AI-pricing features). Reconnect-era duplicates share a
  // master sku, so all of them get the value (see 2026-08-14 finding).
  if (kaspiMasterSku) {
    await supabase
      .from('kaspi_shop_tracked_products')
      .update({ cogs_amount: cogsAmount })
      .eq('user_id', user.id)
      .eq('kaspi_master_sku', kaspiMasterSku)
  } else if (trackedProductId) {
    await supabase
      .from('kaspi_shop_tracked_products')
      .update({ cogs_amount: cogsAmount })
      .eq('user_id', user.id)
      .eq('id', trackedProductId)
  }

  return NextResponse.json({ ok: true })
}
