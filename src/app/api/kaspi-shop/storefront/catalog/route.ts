import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadStorefrontSettings, loadStorefrontCatalog, createCustomProduct } from '@/lib/kaspiShop/storefront'

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

// Витрина → Каталог: lists every Kaspi product (available_for_sale, with its
// showOnStorefront flag) plus every manually-added product, for the admin UI
// to render red/blue-bordered cards. Same active-connection scoping as the
// settings route.
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await loadStorefrontSettings(user.id)
  if (!settings) return NextResponse.json({ error: 'no_connection' }, { status: 404 })

  const catalog = await loadStorefrontCatalog(settings.connectionId)
  return NextResponse.json(catalog)
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await loadStorefrontSettings(user.id)
  if (!settings) return NextResponse.json({ error: 'no_connection' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const price = Number(body?.price)
  const imageUrl = typeof body?.imageUrl === 'string' && body.imageUrl.trim() ? body.imageUrl.trim() : null
  const stockCount = body?.stockCount === null || body?.stockCount === undefined || body?.stockCount === ''
    ? null
    : Number(body.stockCount)
  if (!name) return NextResponse.json({ error: 'Укажите название' }, { status: 400 })
  if (!Number.isFinite(price) || price <= 0) return NextResponse.json({ error: 'Укажите цену' }, { status: 400 })
  if (stockCount !== null && (!Number.isFinite(stockCount) || stockCount < 0)) {
    return NextResponse.json({ error: 'Некорректный остаток' }, { status: 400 })
  }

  const product = await createCustomProduct(settings.connectionId, user.id, { name, price, imageUrl, stockCount })
  return NextResponse.json({ product })
}
