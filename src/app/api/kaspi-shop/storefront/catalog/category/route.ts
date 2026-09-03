import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadStorefrontSettings, setProductCategory } from '@/lib/kaspiShop/storefront'

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

// Assigns (or clears, when categoryId is null) one catalog product's
// storefront section -- works for either a Kaspi-sourced or a manually-added
// product, distinguished by body.source.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await loadStorefrontSettings(user.id)
  if (!settings) return NextResponse.json({ error: 'no_connection' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const productId = typeof body?.productId === 'string' ? body.productId : ''
  const source = body?.source === 'custom' ? 'custom' : body?.source === 'kaspi' ? 'kaspi' : null
  const categoryId = typeof body?.categoryId === 'string' && body.categoryId ? body.categoryId : null
  if (!productId || !source) return NextResponse.json({ error: 'productId и source обязательны' }, { status: 400 })

  const updated = await setProductCategory(settings.connectionId, productId, source, categoryId)
  if (!updated) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
