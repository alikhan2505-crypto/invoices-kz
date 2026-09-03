import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { creditWalletAdjustment, WELCOME_BONUS_TENGE } from '@/lib/kaspiPay/wallet'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// One-time 200₸ wallet credit for the mass-announcement link (?claimBonus=1,
// picked up by TopUtilityBar). welcome_bonus_claimed_at is a
// protect_profile_privileged_columns-guarded column -- an ordinary user
// can't reset it themselves, so the claim-then-mark below is race-safe
// against a double-click: the UPDATE only succeeds (and credits) once.
export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: claimed, error: claimError } = await supabase
    .from('profiles')
    .update({ welcome_bonus_claimed_at: new Date().toISOString() })
    .eq('id', user.id)
    .is('welcome_bonus_claimed_at', null)
    .select('id')
  if (claimError) {
    console.error('claim-welcome-bonus: claim update failed for', user.id, claimError.message)
    return NextResponse.json({ error: 'Не удалось начислить бонус' }, { status: 500 })
  }
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ claimed: false, reason: 'already_claimed' })
  }

  const balance = await creditWalletAdjustment(user.id, WELCOME_BONUS_TENGE, 'Приветственный бонус')
  return NextResponse.json({ claimed: true, amount: WELCOME_BONUS_TENGE, balance })
}
