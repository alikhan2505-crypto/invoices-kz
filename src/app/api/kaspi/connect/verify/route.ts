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

  // Connecting a Cashier is free on every plan — usage is what's monetized (see /api/kaspi/pay, invoicePayment.ts).

  const { processId, otp } = await req.json()
  if (!processId || !otp) return NextResponse.json({ error: 'processId and otp required' }, { status: 400 })

  const attempt = getPendingAttempt(processId)
  if (!attempt || attempt.userId !== user.id) {
    return NextResponse.json({ error: 'expired_or_invalid_process' }, { status: 400 })
  }

  // Kaspi's processId is single-use — once verifyOtp's "finish" step succeeds,
  // the device is paired on Kaspi's side whether or not we manage to persist
  // it, and a retry with the same processId cannot re-run that step. So the
  // pending attempt is deleted right after this call succeeds (not held for
  // a retry), and this call's failures are kept in their own try/catch so
  // they can never be confused with a later persistence failure below.
  let verified: {
    tokenSn: string
    totpSeed: Buffer
    profileId: string
    organizationId: string | null
    organizationIdn: string | null
    organizationKbe: string | null
  }
  try {
    verified = await verifyOtp(processId, otp, attempt.identity, attempt.userToken)
  } catch (e: any) {
    console.error('Kaspi verify-otp error for user', user.id, 'process', processId, ':', e.message)
    return NextResponse.json({ error: 'invalid_otp' }, { status: 400 })
  }
  deletePendingAttempt(processId)

  // From here on, Kaspi has already paired this device — a failure below
  // means an orphaned pairing with no corresponding row, not a bad OTP. Kept
  // in its own try/catch and its own error code so it is never mislabeled
  // as invalid_otp, per this task's "log failures clearly, no silent
  // failure" requirement.
  try {
    const key = process.env.KASPI_SESSION_ENCRYPTION_KEY
    if (!key) throw new Error('KASPI_SESSION_ENCRYPTION_KEY is not configured')

    const apiToken = crypto.randomBytes(32).toString('hex')
    const apiTokenHash = crypto.createHash('sha256').update(apiToken).digest('hex')

    const { error } = await supabase.from('kaspi_connections').upsert({
      user_id: user.id,
      phone_number: attempt.phoneNumber,
      device_id: attempt.identity.deviceId,
      install_id: attempt.identity.installId,
      pin_hash: attempt.identity.pinHash,
      identity_private_key_enc: encryptAtRest(attempt.identity.identityPrivateKeyPem, key),
      identity_public_key_pem: attempt.identity.identityPublicKeyPem,
      totp_seed_enc: encryptAtRest(verified.totpSeed, key),
      token_sn: verified.tokenSn,
      profile_id: verified.profileId,
      organization_id: verified.organizationId,
      organization_idn: verified.organizationIdn,
      organization_kbe: verified.organizationKbe,
      api_token_hash: apiTokenHash,
      status: 'active',
    }, { onConflict: 'user_id' })

    if (error) throw new Error(error.message)

    // Shown exactly once — only the hash is ever stored.
    return NextResponse.json({ apiToken })
  } catch (e: any) {
    console.error('Kaspi connection persistence failed AFTER Kaspi-side pairing succeeded for user', user.id, ':', e.message)
    return NextResponse.json({ error: 'save_failed' }, { status: 500 })
  }
}
