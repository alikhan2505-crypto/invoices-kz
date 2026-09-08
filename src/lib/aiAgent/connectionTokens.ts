import { createClient } from '@supabase/supabase-js'
import { encryptAtRest, decryptAtRest } from '@/lib/kaspiPay/crypto'
import { refreshWithMeta } from '@/lib/instagramPublishToken'
import { getKey } from './connection'

// Keeps customers' Instagram connections alive.
//
// Business Login hands back a long-lived token valid for 60 days. Nothing
// renewed it and, until the migration that added token_expires_at, nothing
// even recorded when it would die — so a customer's agent would simply stop
// answering two months after they connected it, and the first sign would be a
// customer whose message went unanswered. Meta gives no grace: a long-lived
// token not refreshed inside 60 days expires and can no longer be refreshed,
// only re-authorised by the customer.
//
// Only Instagram is rotated here. A Telegram BotFather token has no lifetime,
// WhatsApp uses a different credential model, and the website widget and
// external API run on keys we issue ourselves.

// Meta refuses to refresh a token younger than a day.
const MIN_AGE_MS = 24 * 60 * 60 * 1000
// Renew once a connection is within this of its deadline. Three weeks of slack
// against a 60-day cliff, so a stretch of failed runs is still recoverable.
const RENEW_WITHIN_MS = 21 * 24 * 60 * 60 * 1000

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface ConnectionRotationSummary {
  checked: number
  refreshed: number
  skipped: number
  failed: { id: string; account: string | null; error: string }[]
}

export async function rotateConnectionTokens(): Promise<ConnectionRotationSummary> {
  const supabase = db()
  const summary: ConnectionRotationSummary = { checked: 0, refreshed: 0, skipped: 0, failed: [] }

  const deadline = new Date(Date.now() + RENEW_WITHIN_MS).toISOString()
  const { data: rows, error } = await supabase
    .from('ai_agent_channel_connections')
    .select('id, external_account_name, access_token_enc, token_expires_at, token_refreshed_at, connected_at')
    .eq('channel', 'instagram')
    .eq('status', 'active')
    // A null expiry means we never learned the deadline; treat it as due so a
    // row from before the column existed still gets renewed rather than
    // sitting untouched until it dies.
    .or(`token_expires_at.is.null,token_expires_at.lte.${deadline}`)

  if (error) {
    summary.failed.push({ id: '-', account: null, error: `lookup failed: ${error.message}` })
    return summary
  }

  for (const row of rows || []) {
    summary.checked++

    const stampedAt = new Date(row.token_refreshed_at || row.connected_at || 0).getTime()
    if (Date.now() - stampedAt < MIN_AGE_MS) {
      // Just connected or just refreshed — Meta would refuse, and there is no
      // urgency with ~60 days on the clock.
      summary.skipped++
      continue
    }

    try {
      const current = decryptAtRest(row.access_token_enc, getKey()).toString('utf8')
      const { token, expiresInSec } = await refreshWithMeta(current)
      const now = new Date().toISOString()
      const { error: updateError } = await supabase
        .from('ai_agent_channel_connections')
        .update({
          access_token_enc: encryptAtRest(token, getKey()),
          token_expires_at: new Date(Date.now() + expiresInSec * 1000).toISOString(),
          token_refreshed_at: now,
        })
        .eq('id', row.id)
      if (updateError) throw new Error(updateError.message)
      summary.refreshed++
    } catch (err: any) {
      // One customer's dead token must not stop the others from being renewed.
      summary.failed.push({
        id: row.id,
        account: row.external_account_name,
        error: String(err?.message || err),
      })
    }
  }

  return summary
}
