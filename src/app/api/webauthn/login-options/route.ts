import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateAuthenticationOptions } from '@simplewebauthn/server'
import { RP_ID } from '@/lib/webauthn'
import { loginOptionsLimiter, webauthnClientKey, tooManyAttempts, cleanupExpiredChallengesIfDue } from '@/lib/webauthnGuards'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// No auth required — this starts a discoverable/usernameless passkey login.
// The browser itself shows the account picker; we learn who's signing in
// only once login-verify receives back a credential id.
//
// Каждый вызов пишет строку в webauthn_challenges, а вызывать может кто угодно
// (аудит 02.11.2026), поэтому: лимит по IP (отказ ДО записи в базу) и уборка
// просроченных челленджей раз в минуту на инстанс, а не на каждый вызов.
export async function POST(req: NextRequest) {
  if (!loginOptionsLimiter.hit(webauthnClientKey(req.headers))) return tooManyAttempts()

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: 'preferred',
  })

  await cleanupExpiredChallengesIfDue(supabase)

  const { data: challengeRow, error } = await supabase
    .from('webauthn_challenges')
    .insert({ challenge: options.challenge, type: 'authentication' })
    .select('id')
    .single()

  if (error || !challengeRow) return NextResponse.json({ error: 'Failed to start login' }, { status: 500 })

  return NextResponse.json({ options, challengeId: challengeRow.id })
}
