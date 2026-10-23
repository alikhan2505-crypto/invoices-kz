import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import { RP_ID, EXPECTED_ORIGINS, CHALLENGE_TTL_MS } from '@/lib/webauthn'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { challengeId, response } = await req.json()
  if (!challengeId || !response?.id) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const { data: challengeRow } = await supabase
    .from('webauthn_challenges')
    .select('challenge, created_at')
    .eq('id', challengeId)
    .eq('type', 'authentication')
    .single()

  if (!challengeRow || Date.now() - new Date(challengeRow.created_at).getTime() > CHALLENGE_TTL_MS) {
    return NextResponse.json({ error: 'Challenge expired, try again' }, { status: 400 })
  }

  const { data: cred } = await supabase
    .from('webauthn_credentials')
    .select('id, user_id, public_key, counter, transports')
    .eq('credential_id', response.id)
    .single()

  if (!cred) return NextResponse.json({ error: 'Unknown passkey' }, { status: 400 })

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: EXPECTED_ORIGINS,
      expectedRPID: RP_ID,
      credential: {
        id: response.id,
        publicKey: new Uint8Array(Buffer.from(cred.public_key, 'base64url')),
        counter: cred.counter,
        transports: (cred.transports as any) || undefined,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }

  await supabase.from('webauthn_challenges').delete().eq('id', challengeId)

  if (!verification.verified) {
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 })
  }

  await supabase
    .from('webauthn_credentials')
    .update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
    .eq('id', cred.id)

  // Почту берём из auth.users, а НЕ из profiles: profiles.email пользователь
  // пишет сам (страница реквизитов), и passkey-вход с чужой почтой в своём
  // профиле выдал бы сессию жертвы (аудит 24.10.2026).
  const { data: authUser, error: authUserError } = await supabase.auth.admin.getUserById(cred.user_id)
  const authEmail = authUser?.user?.email
  if (authUserError || !authEmail) return NextResponse.json({ error: 'Account has no email' }, { status: 500 })

  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: authEmail,
  })

  // Ссылка должна быть выдана именно владельцу ключа: если почта вдруг указывает
  // на другого пользователя, сессию не даём.
  if (linkError || !linkData || linkData.user?.id !== cred.user_id) {
    return NextResponse.json({ error: 'Failed to establish session' }, { status: 500 })
  }

  return NextResponse.json({ tokenHash: linkData.properties.hashed_token })
}
