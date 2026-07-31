import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizeBin } from '@/lib/acquiringMatch'
import { signState } from '@/lib/bccState'
import { getBccAppToken, BCC_AUTH_CLIENT_BASE } from '@/lib/bccAuth'

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

  const { data: profile } = await supabase.from('profiles').select('bin_iin').eq('id', user.id).single()
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

  const authUrlRes = await fetch(`${BCC_AUTH_CLIENT_BASE}/generate-auth-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${appToken}`,
    },
    body: JSON.stringify({
      redirect_uri: REDIRECT_URI,
      client_idn: normalizeBin(profile.bin_iin),
    }),
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

  return NextResponse.json({ authUrl: url.toString() })
}
