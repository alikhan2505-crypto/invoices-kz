import { createClient } from '@supabase/supabase-js'
import { encryptAtRest, decryptAtRest } from '@/lib/kaspiPay/crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Mirrors KaspiConnectionSecretsError (src/lib/kaspiPay/connection.ts) --
// same reasoning: AES-256-GCM's auth tag makes a bad ciphertext
// unambiguous, and no retry fixes it, so this is terminal for the one
// connection rather than silently treated as "not connected".
export class EsfConnectionSecretsError extends Error {}

export interface EsfConnection {
  userId: string
  login: string
  password: string
  vatCertificateNum: string | null
  vatCertificateSeries: string | null
}

function toConnection(row: any): EsfConnection {
  const key = process.env.ESF_SESSION_ENCRYPTION_KEY
  if (!key) throw new Error('ESF_SESSION_ENCRYPTION_KEY is not configured')
  try {
    return {
      userId: row.user_id,
      login: row.login,
      password: decryptAtRest(row.password_enc, key).toString('utf8'),
      vatCertificateNum: row.vat_certificate_num,
      vatCertificateSeries: row.vat_certificate_series,
    }
  } catch (e: any) {
    throw new EsfConnectionSecretsError(`esf_connections for user ${row.user_id} could not be decrypted: ${e.message}`)
  }
}

export async function loadEsfConnectionByUserId(userId: string): Promise<EsfConnection | null> {
  const { data, error } = await supabase
    .from('esf_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw new Error(`esf_connections lookup by user_id failed: ${error.message}`)
  return data ? toConnection(data) : null
}

export async function saveEsfConnection(
  userId: string,
  login: string,
  password: string,
  vatCertificateNum: string | null,
  vatCertificateSeries: string | null
): Promise<void> {
  const key = process.env.ESF_SESSION_ENCRYPTION_KEY
  if (!key) throw new Error('ESF_SESSION_ENCRYPTION_KEY is not configured')
  const { error } = await supabase.from('esf_connections').upsert({
    user_id: userId,
    login,
    password_enc: encryptAtRest(password, key),
    vat_certificate_num: vatCertificateNum,
    vat_certificate_series: vatCertificateSeries,
    status: 'active',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (error) throw new Error(`esf_connections upsert failed: ${error.message}`)
}
