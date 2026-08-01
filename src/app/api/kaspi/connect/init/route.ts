import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { initConnect } from '@/lib/kaspiPay/client'
import { setPendingAttempt } from '@/lib/kaspiPay/pendingConnect'
import { normalizeKzPhone } from '@/lib/kaspiPay/phone'
import { getActivePlan } from '@/lib/plan'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Kaspi Pay is Pro-only, enforced server-side — the page hides the form for
  // non-Pro accounts, but that is UX, not enforcement. Same gate and same
  // 403 {error:'not_pro'} shape as /api/bcc/connect: connecting here starts
  // an ongoing automated capability (a live device pairing against the
  // customer's own Kaspi account, plus cron polling), not a one-off action.
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, plan_expires_at, bonus_expires_at, trial_expires_at')
    .eq('id', user.id)
    .single()
  if (!getActivePlan(profile).canAcquiring) {
    return NextResponse.json({ error: 'not_pro' }, { status: 403 })
  }

  const { phoneNumber } = await req.json()
  if (!phoneNumber) return NextResponse.json({ error: 'phoneNumber required' }, { status: 400 })

  // The page sends its display format ('+7 777 123 45 67'); Kaspi's entrance
  // API expects bare digits ('77771234567'). Normalized here rather than in
  // the page so anything reaching initConnect is already wire-shaped.
  const normalizedPhone = normalizeKzPhone(phoneNumber)
  if (!normalizedPhone) return NextResponse.json({ error: 'invalid_phone' }, { status: 400 })

  try {
    const { processId, identity, userToken } = await initConnect(normalizedPhone)
    // The pairing identity + entrance userToken are needed again on verify
    // (to sign the finish step and continue the same entrance session), so
    // they're cached here rather than round-tripped through the client.
    setPendingAttempt(processId, { identity, userToken, userId: user.id, phoneNumber: normalizedPhone })
    return NextResponse.json({ processId })
  } catch (e: any) {
    // Logs the exact wire-format number so a Kaspi-side rejection (e.g.
    // UserPhoneNumberDoesNotBelongToAnyOperator) can be diagnosed from the
    // logs alone next time, instead of re-deriving normalizeKzPhone's output
    // by hand from a screenshot.
    console.error('Kaspi connect init error for phone', normalizedPhone, ':', e.message)
    return NextResponse.json({ error: 'kaspi_unavailable' }, { status: 502 })
  }
}
