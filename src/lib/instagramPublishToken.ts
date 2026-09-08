import { createClient } from '@supabase/supabase-js'
import { encryptAtRest, decryptAtRest } from '@/lib/kaspiPay/crypto'
import { getKey } from '@/lib/aiAgent/connection'

// Storage and rotation for the token we publish our own Instagram posts with.
//
// Why it cannot stay in INSTAGRAM_ACCESS_TOKEN: refreshing returns a NEW token
// string, and application code cannot write an environment variable. So the
// token has to live somewhere writable or it can never be rotated — and a
// dashboard-generated token is valid for exactly 60 days.
//
// Meta's rule is unforgiving: "Tokens that have not been refreshed in 60 days
// will expire and can no longer be refreshed." Past that line there is no
// recovery in code at all; a human has to generate a new marker in the App
// Dashboard. That is why the cron rotates well ahead of the deadline instead
// of waiting for an expiry.

const GRAPH_API = 'https://graph.instagram.com/v21.0'

// Meta refuses to refresh a token younger than a day.
const MIN_AGE_MS = 24 * 60 * 60 * 1000
// Rotate once a token is this old. Comfortably inside the 60-day cliff, so a
// fortnight of failed cron runs still leaves room to notice and act.
const REFRESH_AFTER_MS = 30 * 24 * 60 * 60 * 1000
// Used only when seeding from the env var, where the real mint date is
// unknown. Replaced by Meta's own expires_in on the first successful refresh.
const ASSUMED_LIFETIME_MS = 60 * 24 * 60 * 60 * 1000

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface PublishTokenRow {
  id: string
  access_token_enc: string
  expires_at: string | null
  refreshed_at: string | null
  created_at: string
}

/**
 * The token to publish with: the stored one when present, otherwise the env
 * var. Returns null when neither exists.
 *
 * The stored row wins because it is the one that gets rotated; the env var is
 * the seed and the fallback.
 */
export async function loadPublishToken(): Promise<string | null> {
  try {
    const { data } = await db()
      .from('instagram_publish_token')
      .select('access_token_enc')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data?.access_token_enc) {
      return decryptAtRest(data.access_token_enc, getKey()).toString('utf8')
    }
  } catch (err: any) {
    // A storage or key problem must not take publishing down while a perfectly
    // good env token is sitting there.
    console.error('instagram publish token: load failed, falling back to env:', err?.message || err)
  }
  return process.env.INSTAGRAM_ACCESS_TOKEN || null
}

async function refreshWithMeta(token: string): Promise<{ token: string; expiresInSec: number }> {
  // No app secret on this call, unlike the code-for-token exchange.
  const res = await fetch(
    `${GRAPH_API}/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`
  )
  const data = await res.json()
  if (!res.ok || !data?.access_token) {
    throw new Error(data?.error?.message || `refresh failed with HTTP ${res.status}`)
  }
  return { token: data.access_token as string, expiresInSec: Number(data.expires_in) || 0 }
}

export type RotateOutcome =
  | { status: 'seeded'; expiresAt: string }
  | { status: 'refreshed'; expiresAt: string }
  | { status: 'too_young'; ageHours: number }
  | { status: 'not_due'; expiresAt: string | null }
  | { status: 'no_token' }
  | { status: 'failed'; error: string }

/**
 * One rotation pass. Safe to run daily and safe to run twice in a day.
 *
 * First run seeds the table from the env var rather than refreshing it: the
 * marker was minted minutes ago and Meta would refuse a token younger than 24
 * hours. Its expiry is provisional until the first real refresh replaces it
 * with Meta's own number.
 */
export async function rotatePublishToken(): Promise<RotateOutcome> {
  const supabase = db()
  const { data: row } = await supabase
    .from('instagram_publish_token')
    .select('id, access_token_enc, expires_at, refreshed_at, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!row) {
    const envToken = process.env.INSTAGRAM_ACCESS_TOKEN
    if (!envToken) return { status: 'no_token' }
    const expiresAt = new Date(Date.now() + ASSUMED_LIFETIME_MS).toISOString()
    const { error } = await supabase.from('instagram_publish_token').insert({
      access_token_enc: encryptAtRest(envToken, getKey()),
      expires_at: expiresAt,
    })
    if (error) return { status: 'failed', error: error.message }
    return { status: 'seeded', expiresAt }
  }

  const stampedAt = new Date(row.refreshed_at || row.created_at).getTime()
  const age = Date.now() - stampedAt
  if (age < MIN_AGE_MS) return { status: 'too_young', ageHours: Math.floor(age / 3_600_000) }
  if (age < REFRESH_AFTER_MS) return { status: 'not_due', expiresAt: row.expires_at }

  let current: string
  try {
    current = decryptAtRest(row.access_token_enc, getKey()).toString('utf8')
  } catch (err: any) {
    return { status: 'failed', error: `could not decrypt the stored token: ${err?.message || err}` }
  }

  try {
    const { token, expiresInSec } = await refreshWithMeta(current)
    const now = new Date().toISOString()
    const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString()
    const { error } = await supabase
      .from('instagram_publish_token')
      .update({
        access_token_enc: encryptAtRest(token, getKey()),
        expires_at: expiresAt,
        refreshed_at: now,
        updated_at: now,
        last_error: null,
      })
      .eq('id', row.id)
    if (error) return { status: 'failed', error: error.message }
    return { status: 'refreshed', expiresAt }
  } catch (err: any) {
    const message = String(err?.message || err)
    // Recorded rather than only logged: a rotation that quietly stops working
    // is invisible until the 60-day cliff, which is the whole failure mode
    // this feature exists to remove.
    await supabase
      .from('instagram_publish_token')
      .update({ last_error: message, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    return { status: 'failed', error: message }
  }
}
