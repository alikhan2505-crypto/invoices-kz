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
  if (!trackedProductId || (cogsAmount !== null && !(cogsAmount >= 0))) {
    return NextResponse.json({ error: 'trackedProductId и корректная cogsAmount обязательны' }, { status: 400 })
  }

  const { data: productRow, error: lookupError } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('kaspi_master_sku')
    .eq('id', trackedProductId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (lookupError) return NextResponse.json({ error: 'Не удалось сохранить себестоимость' }, { status: 500 })
  if (!productRow) return NextResponse.json({ error: 'Товар не найден' }, { status: 404 })

  // Reconnecting can leave more than one row for the same real product
  // (finalizeConnection.ts re-imports the catalog on every reconnect
  // instead of upserting -- confirmed live 2026-08-14, 68 duplicated
  // master SKUs on the connected account). Writing cogs_amount to every
  // row sharing this master SKU, not just the one the seller is currently
  // looking at, keeps the value from silently disappearing if a different
  // duplicate gets picked as canonical on a future load (see
  // src/app/api/kaspi-shop/profit/route.ts's canonical-row selection).
  const updateQuery = supabase
    .from('kaspi_shop_tracked_products')
    .update({ cogs_amount: cogsAmount })
    .eq('user_id', user.id)
  const { error } = productRow.kaspi_master_sku
    ? await updateQuery.eq('kaspi_master_sku', productRow.kaspi_master_sku)
    : await updateQuery.eq('id', trackedProductId)
  if (error) return NextResponse.json({ error: 'Не удалось сохранить себестоимость' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
