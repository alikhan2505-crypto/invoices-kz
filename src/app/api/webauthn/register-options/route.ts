import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateRegistrationOptions } from '@simplewebauthn/server'
import { RP_ID, RP_NAME, CHALLENGE_TTL_MS } from '@/lib/webauthn'

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

  const { data: profile } = await supabase.from('profiles').select('email').eq('id', user.id).single()
  const { data: existing } = await supabase
    .from('webauthn_credentials')
    .select('credential_id, transports')
    .eq('user_id', user.id)

  const email = profile?.email || user.email || user.id

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: email,
    userID: new TextEncoder().encode(user.id),
    userDisplayName: email,
    attestationType: 'none',
    excludeCredentials: (existing || []).map(c => ({
      id: c.credential_id,
      transports: (c.transports as any) || undefined,
    })),
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'preferred',
      authenticatorAttachment: 'platform',
    },
  })

  await supabase.from('webauthn_challenges').delete().lt('created_at', new Date(Date.now() - CHALLENGE_TTL_MS).toISOString())

  const { data: challengeRow, error } = await supabase
    .from('webauthn_challenges')
    .insert({ user_id: user.id, challenge: options.challenge, type: 'registration' })
    .select('id')
    .single()

  if (error || !challengeRow) return NextResponse.json({ error: 'Failed to start registration' }, { status: 500 })

  return NextResponse.json({ options, challengeId: challengeRow.id })
}
