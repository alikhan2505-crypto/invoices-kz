import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadStorefrontSettings } from '@/lib/kaspiShop/storefront'
import { updateWholesaleVariant, deleteWholesaleVariant } from '@/lib/kaspiShop/wholesaleStorefront'

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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; variantId: string }> }) {
  const { id: modelId, variantId } = await params
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await loadStorefrontSettings(user.id)
  if (!settings) return NextResponse.json({ error: 'no_connection' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const patch: Parameters<typeof updateWholesaleVariant>[3] = {}
  if (typeof body?.size === 'string') {
    const size = body.size.trim()
    if (!size) return NextResponse.json({ error: 'Укажите размер' }, { status: 400 })
    patch.size = size
  }
  if (typeof body?.color === 'string') {
    const color = body.color.trim()
    if (!color) return NextResponse.json({ error: 'Укажите цвет' }, { status: 400 })
    patch.color = color
  }
  if (body?.stockCount !== undefined) {
    const stockCount = body.stockCount === null || body.stockCount === '' ? null : Number(body.stockCount)
    if (stockCount !== null && (!Number.isFinite(stockCount) || stockCount < 0)) {
      return NextResponse.json({ error: 'Некорректный остаток' }, { status: 400 })
    }
    patch.stockCount = stockCount
  }

  try {
    const updated = await updateWholesaleVariant(settings.connectionId, modelId, variantId, patch)
    if (!updated) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e.message === 'duplicate_variant') return NextResponse.json({ error: 'Такое сочетание размер+цвет уже есть' }, { status: 400 })
    throw e
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; variantId: string }> }) {
  const { id: modelId, variantId } = await params
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await loadStorefrontSettings(user.id)
  if (!settings) return NextResponse.json({ error: 'no_connection' }, { status: 404 })

  const deleted = await deleteWholesaleVariant(settings.connectionId, modelId, variantId)
  if (!deleted) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
