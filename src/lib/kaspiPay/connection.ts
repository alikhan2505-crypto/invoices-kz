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
  const { data, error } = await supabase
    .from('kaspi_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  // A query error must not be folded into "no connection" — Tasks 7/8 trust
  // this module's output without re-deriving it, and a masked DB error here
  // would surface as a wrong 404 (public pay API) or a silently-skipped user
  // (polling cron) instead of a visible failure.
  if (error) throw new Error(`kaspi_connections lookup by user_id failed: ${error.message}`)
  return data ? toConnection(data) : null
}

export async function loadConnectionByApiToken(token: string): Promise<{ connection: KaspiConnection, userId: string } | null> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const { data, error } = await supabase
    .from('kaspi_connections')
    .select('*')
    .eq('api_token_hash', tokenHash)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw new Error(`kaspi_connections lookup by api token failed: ${error.message}`)
  return data ? { connection: toConnection(data), userId: data.user_id } : null
}
