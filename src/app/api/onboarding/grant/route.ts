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

// Grants the 7-day signup trial (trial_expires_at), and nothing else. Called
// from /auth/callback when an account is first bootstrapped, and from
// onboarding step 1 (saveStep1) right AFTER the client's own upsert of the
// profile's non-privileged fields -- that upsert must run first so the profile
// row exists before this route updates it.
//
// trial_expires_at is guarded by the protect_profile_privileged_columns
// trigger, so it must be written with the service-role client -- the browser
// client onboarding used to write it directly only worked because the trigger
// didn't protect it yet. See .superpowers/sdd/trigger-hole-investigation.md.
//
// Promo codes are NOT handled here any more. This route used to grant a promo
// its own "signup bonus" in bonus_expires_at -- a second, invisible meaning for
// the same code that /upgrade redeems as a plan, and one whose amount came from
// `promo.bonus_days`, a column promo_codes does not have (so it was always
// exactly 14 days, whatever the code said). A code now means one thing
// everywhere; /auth/callback redeems it through /api/plan/promo like /upgrade.
export async function POST(req: NextRequest) {
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
  const { data: existing, error: readError } = await supabase
    .from('profiles')
    .select('trial_expires_at')
    .eq('id', user.id)
    .maybeSingle()
  if (readError) {
    console.error('onboarding/grant: profile read failed:', readError.message)
    return NextResponse.json({ error: 'Failed to grant trial' }, { status: 500 })
  }
  // Профиля ещё нет (создаётся клиентом перед этим вызовом): отдавать срок, который
  // никуда не записан, нельзя - вызывающий повторит запрос.
  if (!existing) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  let trialExpiresAt: string | null = existing.trial_expires_at ?? null
  if (!trialExpiresAt) {
    const trialExpires = new Date()
    trialExpires.setDate(trialExpires.getDate() + 7)
    const granted = trialExpires.toISOString()
    // PostgREST считает успехом и update, не задевший ни одной строки, и update
    // с ошибкой базы: срок возвращаем только если он действительно записан.
    const { data: updated, error: updateError } = await supabase.from('profiles')
      .update({ trial_expires_at: granted })
      .eq('id', user.id)
      .is('trial_expires_at', null)
      .select('id')
    if (updateError) {
      console.error('onboarding/grant: trial write failed:', updateError.message)
      return NextResponse.json({ error: 'Failed to grant trial' }, { status: 500 })
    }
    if (!updated || updated.length === 0) {
      // Параллельный вызов успел раньше: отдаём то, что записал он.
      const { data: current } = await supabase.from('profiles').select('trial_expires_at').eq('id', user.id).maybeSingle()
      trialExpiresAt = current?.trial_expires_at ?? null
      if (!trialExpiresAt) return NextResponse.json({ error: 'Failed to grant trial' }, { status: 500 })
    } else {
      trialExpiresAt = granted
    }
  }

  return NextResponse.json({ trialExpiresAt })
}
