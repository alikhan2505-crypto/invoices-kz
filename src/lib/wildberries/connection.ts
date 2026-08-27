import { createClient } from '@supabase/supabase-js'
import { encryptAtRest, decryptAtRest } from '@/lib/kaspiPay/crypto'
import { decodeWbToken } from './token'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// A dedicated key, separate from every other integration's own encryption
// key (KASPI_SHOP_ENCRYPTION_KEY, AI_AGENT_ENCRYPTION_KEY, ...) -- one key
// per integration, so rotating or losing one never affects another.
export function getKey(): string {
  const key = process.env.WB_ENCRYPTION_KEY
  if (!key) throw new Error('WB_ENCRYPTION_KEY is not configured')
  return key
}

export interface WbConnection {
  id: string
  userId: string
  token: string
  tokenExpiresAt: string
  status: string
}

// Best-effort liveness check against WB's own ping endpoint -- NOT verified
// against a real token in this build (no live seller account exists yet,
// see the plan's Global Constraints). Only the documented failure mode
// (401 for a missing/invalid token) is something this session's research
// actually confirmed live; anything else (200, or any other status) is
// treated as "looks connected" rather than asserting a specific success
// shape we haven't seen.
export async function pingWbToken(token: string): Promise<boolean> {
  try {
    const res = await fetch('https://common-api.wildberries.ru/ping', {
      headers: { Authorization: `Bearer ${token}` },
    })
    return res.status !== 401
  } catch {
    return false
  }
}

export async function saveConnection(userId: string, token: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const decoded = decodeWbToken(token)
  if (!decoded) return { ok: false, error: 'invalid_token_format' }

  const isLive = await pingWbToken(token)
  if (!isLive) return { ok: false, error: 'token_rejected' }

  const { error } = await supabase.from('wb_connections').upsert({
    user_id: userId,
    token_enc: encryptAtRest(token, getKey()),
    token_expires_at: decoded.expiresAt,
    decoded_claims: decoded.claims,
    status: 'active',
  }, { onConflict: 'user_id' })
  if (error) return { ok: false, error: 'save_failed' }

  return { ok: true }
}

export async function loadConnection(userId: string): Promise<WbConnection | null> {
  const { data } = await supabase
    .from('wb_connections')
    .select('id, user_id, token_enc, token_expires_at, status')
    .eq('user_id', userId)
    .maybeSingle()
  if (!data) return null
  return {
    id: data.id,
    userId: data.user_id,
    token: decryptAtRest(data.token_enc, getKey()).toString('utf8'),
    tokenExpiresAt: data.token_expires_at,
    status: data.status,
  }
}

export async function deleteConnection(userId: string): Promise<void> {
  await supabase.from('wb_connections').delete().eq('user_id', userId)
}
