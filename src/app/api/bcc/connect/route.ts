import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizeBin } from '@/lib/acquiringMatch'
import { signState } from '@/lib/bccState'
import { getBccAppToken, BCC_AUTH_CLIENT_BASE } from '@/lib/bccAuth'
import { getActivePlan } from '@/lib/plan'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const REDIRECT_URI = 'https://www.invoices.kz/api/bcc/callback'

export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('bin_iin, plan, plan_expires_at, bonus_expires_at, trial_expires_at')
    .eq('id', user.id)
    .single()
  // Acquiring (bank statement import) is a Pro-only feature — checked
  // server-side since it's the actual authority (the client-side UI already
  // hides the "Connect BCC" button for non-Pro accounts, but that's just UX,
  // not enforcement). Unlike the manual Excel-import path, connecting here
  // establishes an ongoing automated capability (a live OAuth token, cron
  // processing, shared BCC rate-limit usage), so it's gated at this single
  // entry point rather than being free like marking an invoice paid by hand.
  // Checked BEFORE the BIN check: a non-Pro user with no BIN needs to be told
  // they need Pro, not sent off to fill in a field that won't unblock them.
  if (!getActivePlan(profile).canAcquiring) {
    return NextResponse.json({ error: 'not_pro' }, { status: 403 })
  }

  if (!profile?.bin_iin) {
    return NextResponse.json({ error: 'no_bin' }, { status: 400 })
  }

  let appToken: string
  try {
    appToken = await getBccAppToken()
  } catch (e: any) {
    console.error('BCC app token error:', e.message)
    return NextResponse.json({ error: 'bcc_unavailable' }, { status: 502 })
  }

  let finalUrl: string
  try {
    const authUrlRes = await fetch(`${BCC_AUTH_CLIENT_BASE}/generate-auth-url`, {
      method: 'POST',
      headers: {
        // BCC rejects a JSON body here with "Missing form parameter:
        // redirect_uri, client_idn" — confirmed live in production logs.
        // Same encoding as the app-level token request in bccAuth.ts.
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${appToken}`,
      },
      body: new URLSearchParams({
        redirect_uri: REDIRECT_URI,
        client_idn: normalizeBin(profile.bin_iin),
      }).toString(),
    })
    if (!authUrlRes.ok) {
      console.error('BCC generate-auth-url error:', authUrlRes.status, await authUrlRes.text())
      return NextResponse.json({ error: 'bcc_unavailable' }, { status: 502 })
    }
    const { authUrl } = await authUrlRes.json()

    // BCC's authUrl is a standard Keycloak authorization endpoint
    // (/auth/realms/.../protocol/openid-connect/auth) — appending our own
    // signed `state` here is standard OAuth2 practice, and lets
    // /api/bcc/callback verify the redirect wasn't forged before trusting
    // the user_id it carries.
    const url = new URL(authUrl)
    url.searchParams.set('state', signState(user.id, process.env.BCC_STATE_SECRET!))
    finalUrl = url.toString()
  } catch (e: any) {
    console.error('BCC generate-auth-url error:', e.message)
    return NextResponse.json({ error: 'bcc_unavailable' }, { status: 502 })
  }

  return NextResponse.json({ authUrl: finalUrl })
}
