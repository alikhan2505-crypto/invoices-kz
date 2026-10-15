import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getProfileBonusStatus } from '@/lib/profileBonusServer'

const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Состояние трёх бонусных блоков для карточки «Готовность к счёту» на /profile.
export async function GET(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    return NextResponse.json(await getProfileBonusStatus(user.id), { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('profile bonus status failed for', user.id, ':', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
