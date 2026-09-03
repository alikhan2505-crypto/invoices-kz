import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadStorefrontSettings, setKaspiProductStorefrontVisibility } from '@/lib/kaspiShop/storefront'

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

// Toggles one Kaspi product's opt-in visibility on the public storefront
// (Витрина → Каталог's red-bordered cards).
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await loadStorefrontSettings(user.id)
  if (!settings) return NextResponse.json({ error: 'no_connection' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const trackedProductId = typeof body?.trackedProductId === 'string' ? body.trackedProductId : ''
  const show = !!body?.show
  if (!trackedProductId) return NextResponse.json({ error: 'trackedProductId обязателен' }, { status: 400 })

  const updated = await setKaspiProductStorefrontVisibility(settings.connectionId, trackedProductId, show)
  if (!updated) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
