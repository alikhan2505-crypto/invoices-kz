import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadStorefrontSettings } from '@/lib/kaspiShop/storefront'
import { createWholesaleVariant } from '@/lib/kaspiShop/wholesaleStorefront'

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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: modelId } = await params
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await loadStorefrontSettings(user.id)
  if (!settings) return NextResponse.json({ error: 'no_connection' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const size = typeof body?.size === 'string' ? body.size.trim() : ''
  const color = typeof body?.color === 'string' ? body.color.trim() : ''
  const stockCount = body?.stockCount === null || body?.stockCount === undefined || body?.stockCount === ''
    ? null
    : Number(body.stockCount)
  if (!size) return NextResponse.json({ error: 'Укажите размер' }, { status: 400 })
  if (!color) return NextResponse.json({ error: 'Укажите цвет' }, { status: 400 })
  if (stockCount !== null && (!Number.isFinite(stockCount) || stockCount < 0)) {
    return NextResponse.json({ error: 'Некорректный остаток' }, { status: 400 })
  }

  try {
    const variant = await createWholesaleVariant(settings.connectionId, modelId, { size, color, stockCount })
    if (!variant) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return NextResponse.json({ variant })
  } catch (e: any) {
    if (e.message === 'duplicate_variant') return NextResponse.json({ error: 'Такое сочетание размер+цвет уже есть' }, { status: 400 })
    throw e
  }
}
