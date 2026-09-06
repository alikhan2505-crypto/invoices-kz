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

// Called once from onboarding step 1 (saveStep1), right AFTER the client's
// own upsert of the profile's non-privileged fields (company_name, bin_iin,
// email, account_type) has completed -- that upsert must run first so the
// profile row exists before this route updates it.
//
// Grants the 7-day signup trial (trial_expires_at) and, if a promo code was
// carried into onboarding via ?promo=, that promo's signup bonus
// (bonus_expires_at). Both columns are guarded by the
// protect_profile_privileged_columns trigger, so they must be written with
// the service-role client -- the browser client onboarding used to write
// them directly only worked because the trigger didn't protect these two
// columns yet. See .superpowers/sdd/trigger-hole-investigation.md.
export async function POST(req: NextRequest) {
  const { promoCode } = await req.json().catch(() => ({ promoCode: undefined }))

  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // --- Trial grant: 7 days from today, once only. Onboarding's original
  // client-side write had no repeat-call guard at all (it just re-upserted
  // trial_expires_at every time saveStep1 ran); since this route now owns
  // the write, we add the guard here rather than let a retried/duplicated
  // call push the trial further out each time.
  const { data: existing } = await supabase
    .from('profiles')
    .select('trial_expires_at')
    .eq('id', user.id)
    .single()

  let trialExpiresAt: string | null = existing?.trial_expires_at ?? null
  if (!trialExpiresAt) {
    const trialExpires = new Date()
    trialExpires.setDate(trialExpires.getDate() + 7)
    trialExpiresAt = trialExpires.toISOString()
    await supabase.from('profiles')
      .update({ trial_expires_at: trialExpiresAt })
      .eq('id', user.id)
  }

  // --- Promo bonus (optional). Mirrors onboarding's original logic exactly,
  // including what it DOESN'T do: no max_uses/used_count check or increment
  // here -- that gating only exists for /upgrade's plan-grant promos
  // (api/plan/promo/route.ts). A failed/missing lookup is a silent no-op,
  // same as the try/catch-swallowed original.
  let bonusExpiresAt: string | null = null
  if (promoCode && typeof promoCode === 'string' && promoCode.trim()) {
    try {
      const { data: promo } = await supabase
        .from('promo_codes')
        .select('*')
        .eq('code', promoCode.toUpperCase())
        .eq('is_active', true)
        .single()
      if (promo) {
        // Once per user, claimed atomically -- the compare-and-swap on
        // promo_granted_at lives inside claim_promo_bonus now (see the
        // stack_bonus_days_atomically migration). Before that guard existed at
        // all, this route being callable at any time -- not only during
        // onboarding -- let anyone holding any active promo code re-POST it
        // every 14 days forever for a free «Базовый» (security audit
        // 2026-09-04).
        //
        // The days now ADD to whatever bonus the user already has. This used to
        // write `today + bonus_days` flat, which erased the 7 referral days
        // /api/referral had just granted -- /auth/callback runs referral first,
        // so a signup that arrived with both codes kept only the promo.
        const { data: claimedUntil, error: claimError } = await supabase
          .rpc('claim_promo_bonus', { p_user: user.id, p_days: promo.bonus_days || 14 })
        if (claimError) console.error('grant: promo claim failed', user.id, claimError.message)
        else if (claimedUntil) bonusExpiresAt = claimedUntil
      }
    } catch {
      // Swallowed, same as onboarding's original behavior.
    }
  }

  return NextResponse.json({ trialExpiresAt, bonusExpiresAt })
}
