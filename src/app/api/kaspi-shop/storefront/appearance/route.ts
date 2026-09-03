import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadStorefrontSettings, saveStorefrontAppearance } from '@/lib/kaspiShop/storefront'

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

// Separate from the slug/publish POST on /api/kaspi-shop/storefront -- these
// are independent concerns (a seller can restyle the page without touching
// its publish state, and vice versa), same one-route-per-concern convention
// the catalog/categories endpoints already use.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await loadStorefrontSettings(user.id)
  if (!settings) return NextResponse.json({ error: 'no_connection' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const backgroundColor = typeof body?.backgroundColor === 'string' && body.backgroundColor ? body.backgroundColor : null
  const deliveryInfo = typeof body?.deliveryInfo === 'string' ? body.deliveryInfo : ''
  const chatWidgetEnabled = !!body?.chatWidgetEnabled

  const result = await saveStorefrontAppearance(user.id, settings.connectionId, { backgroundColor, deliveryInfo, chatWidgetEnabled })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
