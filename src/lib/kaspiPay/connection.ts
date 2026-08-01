import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { decryptAtRest } from './crypto'
import { KaspiConnection } from './client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// This row's stored secrets no longer decrypt with the configured key — a
// corrupt ciphertext, or a row encrypted under a key that has since been
// rotated. AES-256-GCM's auth tag makes this unambiguous, and no retry can
// ever fix it, so callers treat it as terminal for that ONE connection
// (mirroring the BCC cron's BccConsentError). A missing key env var is a
// different, systemic problem and is raised as a plain Error instead, so it
// can never be mistaken for "every customer's row is corrupt".
export class KaspiConnectionSecretsError extends Error {}

function toConnection(row: any): KaspiConnection {
  const key = process.env.KASPI_SESSION_ENCRYPTION_KEY
  if (!key) throw new Error('KASPI_SESSION_ENCRYPTION_KEY is not configured')
  try {
    return {
      tokenSn: row.token_sn,
      totpSeed: decryptAtRest(row.totp_seed_enc, key),
      profileId: row.profile_id,
      deviceId: row.device_id,
      installId: row.install_id,
      identityPrivateKeyPem: decryptAtRest(row.identity_private_key_enc, key).toString('utf8'),
      identityPublicKeyPem: row.identity_public_key_pem,
    }
  } catch (e: any) {
    throw new KaspiConnectionSecretsError(`kaspi_connections ${row.id} secrets could not be decrypted: ${e.message}`)
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

// invoices.kz's own Kaspi Cashier connection, used to collect money FROM
// users (plan payments, wallet top-ups) -- not a new connection type, just
// whichever kaspi_connections row belongs to the one admin profile. Looked
// up dynamically rather than a hardcoded user id so this keeps working if
// the admin account ever changes.
export async function loadPlatformConnection(): Promise<KaspiConnection | null> {
  const { data: admin, error: adminError } = await supabase
    .from('profiles')
    .select('id')
    .eq('is_admin', true)
    .maybeSingle()
  if (adminError) throw new Error(`admin profile lookup failed: ${adminError.message}`)
  if (!admin) return null
  return loadConnectionByUserId(admin.id)
}

export async function loadConnectionByApiToken(token: string): Promise<{ connection: KaspiConnection, userId: string, defaultWebhookUrl: string | null } | null> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const { data, error } = await supabase
    .from('kaspi_connections')
    .select('*')
    .eq('api_token_hash', tokenHash)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw new Error(`kaspi_connections lookup by api token failed: ${error.message}`)
  return data ? { connection: toConnection(data), userId: data.user_id, defaultWebhookUrl: data.default_webhook_url ?? null } : null
}
