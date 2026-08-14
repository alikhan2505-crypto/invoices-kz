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

  const { error } = await supabase
    .from('kaspi_shop_tracked_products')
    .update({ cogs_amount: cogsAmount })
    .eq('id', trackedProductId)
    .eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'Не удалось сохранить себестоимость' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
