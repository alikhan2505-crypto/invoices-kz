import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { verifyOtp } from '@/lib/kaspiPay/client'
import { encryptAtRest } from '@/lib/kaspiPay/crypto'
import { getPendingAttempt, deletePendingAttempt } from '@/lib/kaspiPay/pendingConnect'

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

  const { processId, otp } = await req.json()
  if (!processId || !otp) return NextResponse.json({ error: 'processId and otp required' }, { status: 400 })

  const attempt = getPendingAttempt(processId)
  if (!attempt || attempt.userId !== user.id) {
    return NextResponse.json({ error: 'expired_or_invalid_process' }, { status: 400 })
  }

  try {
    const { tokenSn, totpSeed, profileId, organizationId, organizationIdn, organizationKbe } =
      await verifyOtp(processId, otp, attempt.identity, attempt.userToken)
    deletePendingAttempt(processId)

    const apiToken = crypto.randomBytes(32).toString('hex')
    const apiTokenHash = crypto.createHash('sha256').update(apiToken).digest('hex')
    const key = process.env.KASPI_SESSION_ENCRYPTION_KEY!

    const { error } = await supabase.from('kaspi_connections').upsert({
      user_id: user.id,
      phone_number: attempt.phoneNumber,
      device_id: attempt.identity.deviceId,
      install_id: attempt.identity.installId,
      pin_hash: attempt.identity.pinHash,
      identity_private_key_enc: encryptAtRest(attempt.identity.identityPrivateKeyPem, key),
      identity_public_key_pem: attempt.identity.identityPublicKeyPem,
      totp_seed_enc: encryptAtRest(totpSeed, key),
      token_sn: tokenSn,
      profile_id: profileId,
      organization_id: organizationId,
      organization_idn: organizationIdn,
      organization_kbe: organizationKbe,
      api_token_hash: apiTokenHash,
      status: 'active',
    }, { onConflict: 'user_id' })

    if (error) {
      console.error('Kaspi connection upsert error:', error.message)
      return NextResponse.json({ error: 'save_failed' }, { status: 500 })
    }

    // Shown exactly once — only the hash is ever stored.
    return NextResponse.json({ apiToken })
  } catch (e: any) {
    console.error('Kaspi verify-otp error:', e.message)
    return NextResponse.json({ error: 'invalid_otp' }, { status: 400 })
  }
}
