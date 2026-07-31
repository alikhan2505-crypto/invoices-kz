import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { decryptAtRest } from './crypto'
import { KaspiConnection } from './client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function toConnection(row: any): KaspiConnection {
  const key = process.env.KASPI_SESSION_ENCRYPTION_KEY!
  return {
    tokenSn: row.token_sn,
    totpSeed: decryptAtRest(row.totp_seed_enc, key),
    profileId: row.profile_id,
    deviceId: row.device_id,
    installId: row.install_id,
    identityPrivateKeyPem: decryptAtRest(row.identity_private_key_enc, key).toString('utf8'),
    identityPublicKeyPem: row.identity_public_key_pem,
  }
}

export async function loadConnectionByUserId(userId: string): Promise<KaspiConnection | null> {
  const { data } = await supabase
    .from('kaspi_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  return data ? toConnection(data) : null
}

export async function loadConnectionByApiToken(token: string): Promise<{ connection: KaspiConnection, userId: string } | null> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const { data } = await supabase
    .from('kaspi_connections')
    .select('*')
    .eq('api_token_hash', tokenHash)
    .eq('status', 'active')
    .maybeSingle()
  return data ? { connection: toConnection(data), userId: data.user_id } : null
}
