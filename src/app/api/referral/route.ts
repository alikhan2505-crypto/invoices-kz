import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const { userId, referralCode } = await req.json()
  if (!userId || !referralCode) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user || user.id !== userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Находим владельца реферального кода
  const { data: referrer } = await supabase
    .from('profiles')
    .select('id')
    .eq('referral_code', referralCode)
    .single()

  if (!referrer) return NextResponse.json({ error: 'Invalid referral code' }, { status: 404 })
  if (referrer.id === userId) return NextResponse.json({ error: 'Cannot refer yourself' }, { status: 400 })

  // Both sides get 7 days. plan намеренно не трогаем: бонусные дни сами дают
  // Базовый через getActivePlan's bonus_expires_at branch (см. src/lib/plan.ts).
  // Раньше здесь писали plan: 'basic' без plan_expires_at, что getActivePlan
  // трактует как платный план БЕЗ срока — Базовый навсегда и бесплатно.
  const REFERRAL_BONUS_DAYS = 7

  // One SQL statement does the claim AND the bonus arithmetic (see the
  // stack_bonus_days_atomically migration). Two reasons it isn't a JS
  // read-then-write any more:
  //
  // 1. It ADDS days to whatever bonus the user already has instead of
  //    overwriting bonus_expires_at with `today + 7`. Both this route and
  //    /api/onboarding/grant wrote that column flat, and /auth/callback calls
  //    referral first — so a user arriving with both a referral code and a
  //    promo code silently lost these 7 days when the promo landed on top.
  // 2. It stays the compare-and-swap it already was: only the request whose
  //    UPDATE matches a still-NULL referred_by claims the code, so two
  //    concurrent calls for the same signup (a duplicated auth-callback mount,
  //    say) can't both credit the referrer below for one signup.
  //
  // A null result means the UPDATE matched nothing — the code was already used.
  const { data: claimedUntil, error: claimError } = await supabase
    .rpc('claim_referral_bonus', { p_user: userId, p_code: referralCode, p_days: REFERRAL_BONUS_DAYS })

  if (claimError) {
    console.error('referral: claim failed', userId, claimError.message)
    return NextResponse.json({ error: 'Failed to apply referral code' }, { status: 500 })
  }
  if (!claimedUntil) {
    return NextResponse.json({ error: 'Already used referral code' }, { status: 400 })
  }

  // +7 дней тому кто пригласил. Also one statement, so `referral_count + 1`
  // and the bonus extension are both computed from the row's own current
  // values under a row lock: two invitees redeeming the same code at the same
  // moment used to be a lost update that credited the referrer once.
  const { data: referrerUntil, error } = await supabase
    .rpc('credit_referrer_bonus', { p_referrer: referrer.id, p_days: REFERRAL_BONUS_DAYS })
  // The claim above is an irreversible compare-and-swap -- a retry after this
  // fails hits `where referred_by is null`, matches nothing, and returns
  // "Already used referral code". So a failure here is invisible to the new
  // user and unrecoverable by a retry; at least get it into the logs so the
  // founder can credit the referrer by hand.
  if (error) console.error('referral: failed to credit referrer', referrer.id, error.message)
  else if (!referrerUntil) console.error('referral: referrer row vanished before credit', referrer.id)

  return NextResponse.json({ success: true })
}