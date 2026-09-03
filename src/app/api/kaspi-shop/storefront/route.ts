import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadStorefrontSettings, saveStorefrontSettings, hasCashierConnection, loadStorefrontProducts } from '@/lib/kaspiShop/storefront'

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

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await loadStorefrontSettings(user.id)
  if (!settings) return NextResponse.json({ error: 'no_connection' }, { status: 404 })

  const cashierConnected = await hasCashierConnection(user.id)
  // Surfaced so the settings page can explain an empty public storefront --
  // a product only shows there while Kaspi still lists it for sale (see
  // filterStorefrontProducts' own comment), which is not obvious from this
  // page alone (founder repro 2026-09-03: published a store, no products
  // ever appeared, no indication why).
  const visibleProductCount = (await loadStorefrontProducts(settings.connectionId)).length
  return NextResponse.json({ ...settings, cashierConnected, visibleProductCount })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await loadStorefrontSettings(user.id)
  if (!settings) return NextResponse.json({ error: 'no_connection' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const slug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : ''
  const published = !!body?.published
  if (!slug) return NextResponse.json({ error: 'invalid_slug' }, { status: 400 })

  const result = await saveStorefrontSettings(user.id, settings.connectionId, { slug, published })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
