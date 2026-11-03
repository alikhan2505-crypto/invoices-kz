import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import { RP_ID, EXPECTED_ORIGINS, CHALLENGE_TTL_MS } from '@/lib/webauthn'
import { loginVerifyLimiter, webauthnClientKey, tooManyAttempts } from '@/lib/webauthnGuards'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  // Лимит по IP до любых обращений к базе (аудит 02.11.2026): маршрут открыт без входа.
  if (!loginVerifyLimiter.hit(webauthnClientKey(req.headers))) return tooManyAttempts()

  // Битый JSON и не-строки -- это 400, а не 500 и не странный фильтр в запросе к базе.
  const body = await req.json().catch(() => null)
  const challengeId: unknown = body?.challengeId
  const response = body?.response
  if (typeof challengeId !== 'string' || !challengeId || typeof response?.id !== 'string' || !response.id) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  // Челлендж одноразовый: забираем его одним DELETE ... RETURNING ещё ДО проверки.
  // Раньше он читался отдельным запросом и удалялся только после успешной
  // проверки: при сбое подпись можно было пробовать на том же челлендже снова,
  // а два параллельных запроса с одним ответом оба проходили чтение.
  const { data: challengeRow } = await supabase
    .from('webauthn_challenges')
    .delete()
    .eq('id', challengeId)
    .eq('type', 'authentication')
    .select('challenge, created_at')
    .maybeSingle()

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
    // Текст ошибки библиотеки (ожидаемые origin/RP ID, детали разбора ответа)
    // анониму не отдаём: подробности только в лог.
    console.error('webauthn login-verify: verification threw:', e?.message)
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 })
  }

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
