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

// Redeems a promo code for the caller's OWN profile -- from /upgrade, and from
// /auth/callback for a code carried in through /promo/[code] at signup. Must
// run server-side with the service-role client: `plan` and `plan_expires_at`
// are guarded by the protect_profile_privileged_columns trigger, which silently
// reverts any write to them from a non-admin, non-service-role client (i.e.
// the browser client the old client-side applyPromo() used) -- so this
// redemption was previously a no-op for ordinary users even though
// promo_codes.used_count still incremented. See
// .superpowers/sdd/trigger-hole-investigation.md.
export async function POST(req: NextRequest) {
  const { code } = await req.json().catch(() => ({ code: undefined }))
  if (!code || typeof code !== 'string' || !code.trim()) {
    return NextResponse.json({ error: 'Missing code' }, { status: 400 })
  }

  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Refuse-if-active guard: a promo sets `plan`/`plan_expires_at` outright
  // (not additively), so redeeming one while an unrelated paid plan is
  // still active would silently overwrite/downgrade it -- e.g. a Pro
  // subscriber with 300 days left typing a Basic-30-day code would become
  // Basic for 30 days. Checked here rather than inside the RPC because it is
  // a policy about this caller's own plan, not about the code.
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, plan_expires_at')
    .eq('id', user.id)
    .single()

  // A non-free plan with NO expiry counts as active too. getActivePlan reads
  // that combination as a paid plan that never ends (src/lib/plan.ts:32-45), so
  // requiring plan_expires_at here would let a time-boxed promo silently
  // overwrite a permanent grant. No profile is in that state today -- checked --
  // but the two files must agree on what "has a plan" means.
  const planActive = !!profile?.plan && profile.plan !== 'free' &&
    (!profile.plan_expires_at || new Date(profile.plan_expires_at) > new Date())
  if (planActive) {
    return NextResponse.json({ error: 'plan_active' }, { status: 409 })
  }

  // One transaction does the whole redemption: the max_uses gate, the
  // once-per-account claim, the used_count increment and the grant itself.
  //
  // "Once per account" means one promo grant EVER, not one per code: the unique
  // key on promo_redemptions is (user_id). With several codes live at the same
  // time, a per-code key would let one account run FREE30 (30d), then СТАРТ
  // (14d) once that lapsed, then INVOICES7 (7d) -- 51 free days through the
  // ordinary form. It is a real claim, not a check-then-act, so it also settles
  // two different codes submitted from two tabs at the same instant: the
  // plan_active guard above reads outside the transaction and both would pass
  // it, then race on profiles.plan with the later commit silently winning.
  //
  // The RPC also takes `for update` on the code row, closing the over-
  // redemption race the previous read-then-update version documented as an
  // accepted tradeoff.
  //
  // This is the ONLY place a promo code is redeemed. The signup path
  // (/auth/callback, for a code carried in via /promo/[code]) calls this same
  // route, so a code grants the same plan for the same number of days no
  // matter where it is entered -- it used to silently mean "14 bonus days" at
  // signup and "the configured plan for the configured days" here.
  const { data: result, error } = await supabase.rpc('redeem_promo_code', {
    p_user: user.id,
    p_code: code.toUpperCase(),
  })

  if (error) {
    console.error('promo: redeem failed', user.id, error.message)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }

  const status = (result as any)?.status
  if (status === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // A code with no plan or no positive day count would mint a plan with no
  // expiry -- which getActivePlan reads as paid forever. The RPC refuses it;
  // surface it as "not found" to the user and loudly to the logs, since the
  // fix is the founder editing the code, not anything the user can do.
  if (status === 'misconfigured') {
    console.error('promo: code is misconfigured (no plan or days <= 0)', code.toUpperCase())
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (status === 'exhausted') return NextResponse.json({ error: 'Exhausted' }, { status: 409 })
  if (status === 'already_redeemed') return NextResponse.json({ error: 'already_redeemed' }, { status: 409 })
  if (status !== 'ok') {
    console.error('promo: unexpected redeem status', status, user.id)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }

  return NextResponse.json({ plan: (result as any).plan, days: (result as any).days })
}
