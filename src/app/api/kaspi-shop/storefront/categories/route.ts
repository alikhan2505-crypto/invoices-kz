import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  loadStorefrontSettings,
  loadStorefrontCategories,
  createStorefrontCategory,
  deleteStorefrontCategory,
} from '@/lib/kaspiShop/storefront'

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

// Витрина → Каталог → Разделы: lists this store's storefront categories.
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await loadStorefrontSettings(user.id)
  if (!settings) return NextResponse.json({ error: 'no_connection' }, { status: 404 })

  const categories = await loadStorefrontCategories(settings.connectionId)
  return NextResponse.json({ categories })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await loadStorefrontSettings(user.id)
  if (!settings) return NextResponse.json({ error: 'no_connection' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'Укажите название раздела' }, { status: 400 })

  const category = await createStorefrontCategory(settings.connectionId, name)
  return NextResponse.json({ category })
}

// DELETE-with-body, same convention as catalog/custom/route.ts.
export async function DELETE(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await loadStorefrontSettings(user.id)
  if (!settings) return NextResponse.json({ error: 'no_connection' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'id обязателен' }, { status: 400 })

  const deleted = await deleteStorefrontCategory(settings.connectionId, id)
  if (!deleted) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
