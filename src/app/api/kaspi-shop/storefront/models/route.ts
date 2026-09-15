import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadStorefrontSettings } from '@/lib/kaspiShop/storefront'
import { loadWholesaleModels, createWholesaleModel } from '@/lib/kaspiShop/wholesaleStorefront'

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

// Витрина → Модели: lists every wholesale model (with its variants) for the
// admin table. Separate from GET /api/kaspi-shop/storefront/catalog (Kaspi +
// custom products) -- this is an entirely independent catalog.
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await loadStorefrontSettings(user.id)
  if (!settings) return NextResponse.json({ error: 'no_connection' }, { status: 404 })

  const models = await loadWholesaleModels(settings.connectionId)
  return NextResponse.json({ models })
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
  const categoryId = typeof body?.categoryId === 'string' && body.categoryId ? body.categoryId : null
  if (!name) return NextResponse.json({ error: 'Укажите название' }, { status: 400 })
  if (!Number.isFinite(price) || price <= 0) return NextResponse.json({ error: 'Укажите цену' }, { status: 400 })

  const model = await createWholesaleModel(settings.connectionId, { name, price, imageUrl, categoryId })
  return NextResponse.json({ model })
}
