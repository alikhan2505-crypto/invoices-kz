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

// Redeems a promo code on /upgrade for the caller's OWN profile. Must run
// server-side with the service-role client: `plan` and `plan_expires_at` are
// guarded by the protect_profile_privileged_columns trigger, which silently
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

  const { data: promo } = await supabase
    .from('promo_codes')
    .select('*')
    .eq('code', code.toUpperCase())
    .eq('is_active', true)
    .single()

  if (!promo) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (promo.used_count >= promo.max_uses) {
    return NextResponse.json({ error: 'Exhausted' }, { status: 409 })
  }

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + promo.days)

  await supabase.from('profiles')
    .update({ plan: promo.plan, plan_expires_at: expiresAt.toISOString() })
    .eq('id', user.id)

  // Read-then-update, same shape as api/referral/route.ts's counter bumps.
  // Not a strict atomic guard: two concurrent redemptions of a code sitting
  // exactly one use below max_uses could both pass the check above and both
  // land here, over-redeeming it by one. Promo codes are low-volume/admin-
  // issued, so this narrow race is an accepted tradeoff rather than
  // something worth a DB-side atomic RPC for right now.
  await supabase.from('promo_codes')
    .update({ used_count: promo.used_count + 1 })
    .eq('id', promo.id)

  return NextResponse.json({ plan: promo.plan, days: promo.days })
}
