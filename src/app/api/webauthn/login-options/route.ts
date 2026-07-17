import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateAuthenticationOptions } from '@simplewebauthn/server'
import { RP_ID, CHALLENGE_TTL_MS } from '@/lib/webauthn'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// No auth required — this starts a discoverable/usernameless passkey login.
// The browser itself shows the account picker; we learn who's signing in
// only once login-verify receives back a credential id.
export async function POST() {
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: 'preferred',
  })

  await supabase.from('webauthn_challenges').delete().lt('created_at', new Date(Date.now() - CHALLENGE_TTL_MS).toISOString())

  const { data: challengeRow, error } = await supabase
    .from('webauthn_challenges')
    .insert({ challenge: options.challenge, type: 'authentication' })
    .select('id')
    .single()

  if (error || !challengeRow) return NextResponse.json({ error: 'Failed to start login' }, { status: 500 })

  return NextResponse.json({ options, challengeId: challengeRow.id })
}
