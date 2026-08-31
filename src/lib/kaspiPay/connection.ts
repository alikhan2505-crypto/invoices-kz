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
// whichever kaspi_connections row belongs to an admin profile. Looked up
// dynamically rather than a hardcoded user id so this keeps working if the
// admin account ever changes. `is_admin` is shared with feature-gating
// (multiple accounts can be flagged admin to test admin-only sections), so
// this can no longer assume exactly one admin profile exists -- it checks
// every admin profile for the one that actually holds the active platform
// connection instead of failing outright on 2+ admin rows.
export async function loadPlatformConnection(): Promise<KaspiConnection | null> {
  const { data: admins, error: adminError } = await supabase
    .from('profiles')
    .select('id')
    .eq('is_admin', true)
  if (adminError) throw new Error(`admin profile lookup failed: ${adminError.message}`)
  for (const admin of admins ?? []) {
    const connection = await loadConnectionByUserId(admin.id)
    if (connection) return connection
  }
  return null
}

// A dedicated lookup rather than folding this onto loadConnectionByUserId's
// return shape: that function's KaspiConnection return type is consumed by
// every Kaspi API call site (and unit tests that construct KaspiConnection
// objects directly) — adding a field there for one caller (settlePayment.ts,
// signing outbound webhooks) would touch all of them for no reason. This
// row can lack webhook_secret_enc for a connection made before this secret
// existed; callers must have their own fallback for null.
export async function loadWebhookSecretByUserId(userId: string): Promise<string | null> {
  const key = process.env.KASPI_SESSION_ENCRYPTION_KEY
  if (!key) throw new Error('KASPI_SESSION_ENCRYPTION_KEY is not configured')
  const { data, error } = await supabase
    .from('kaspi_connections')
    .select('webhook_secret_enc')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw new Error(`kaspi_connections webhook-secret lookup failed: ${error.message}`)
  if (!data?.webhook_secret_enc) return null
  return decryptAtRest(data.webhook_secret_enc, key).toString('utf8')
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
