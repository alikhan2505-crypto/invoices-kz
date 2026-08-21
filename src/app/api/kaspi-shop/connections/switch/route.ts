import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { switchActiveConnection } from '@/lib/kaspiShop/connection'

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

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }
  const { connectionId } = body
  if (!connectionId) return NextResponse.json({ error: 'connectionId обязателен' }, { status: 400 })

  try {
    await switchActiveConnection(user.id, connectionId)
  } catch (err: any) {
    if (err.message === 'connection_not_found') return NextResponse.json({ error: 'Магазин не найден' }, { status: 404 })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
