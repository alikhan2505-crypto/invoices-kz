import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getNicheCheck } from '@/lib/kaspiShop/nicheChecks'

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

  const checkId = req.nextUrl.searchParams.get('checkId')
  if (!checkId) return NextResponse.json({ error: 'checkId обязателен' }, { status: 400 })

  const check = await getNicheCheck(checkId)
  if (!check) return NextResponse.json({ error: 'Проверка не найдена' }, { status: 404 })

  return NextResponse.json(check)
}
