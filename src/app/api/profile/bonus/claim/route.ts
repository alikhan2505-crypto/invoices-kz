import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isProfileBonusBlock } from '@/lib/profileBonus'
import { claimProfileBonus } from '@/lib/profileBonusServer'

const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// 100 ₸ в кошелёк за проверенный блок профиля. Вся проверка — на сервере по
// данным из базы (src/lib/profileBonusServer.ts); из тела берётся только
// название блока.
export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const block = body?.block
  if (!isProfileBonusBlock(block)) return NextResponse.json({ error: 'invalid_block' }, { status: 400 })

  try {
    const outcome = await claimProfileBonus(user.id, block)
    return NextResponse.json(outcome.body, { status: outcome.status })
  } catch (e) {
    console.error('profile bonus claim failed for', user.id, block, ':', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
