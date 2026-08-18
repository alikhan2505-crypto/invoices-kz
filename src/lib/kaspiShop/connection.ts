import { createClient } from '@supabase/supabase-js'
import { encryptAtRest, decryptAtRest } from '@/lib/kaspiPay/crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface KaspiShopConnection {
  id: string
  userId: string
  apiToken?: string
  sessionCookies: string | null
  merchantId: string
  companyName: string
  status: string
  paused: boolean
}

// A dedicated key, separate from KASPI_SESSION_ENCRYPTION_KEY (Kaspi Pay
// Cashier's) -- one secret per integration, so rotating or losing one never
// affects the other. Exported so other Kaspi Shop modules (e.g. checkCycle's
// session-cookie decryption) reuse the same key instead of re-deriving it.
export function getKey(): string {
  const key = process.env.KASPI_SHOP_ENCRYPTION_KEY
  if (!key) throw new Error('KASPI_SHOP_ENCRYPTION_KEY is not configured')
  return key
}

export async function loadConnection(userId: string): Promise<KaspiShopConnection | null> {
  const { data, error } = await supabase
    .from('kaspi_shop_connections')
    .select('id, user_id, api_token_enc, session_cookies, merchant_id, company_name, status, paused')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`kaspi_shop_connections lookup failed for user ${userId}: ${error.message}`)
  if (!data) return null
  return {
    id: data.id,
    userId: data.user_id,
    apiToken: data.api_token_enc ? decryptAtRest(data.api_token_enc, getKey()).toString('utf8') : undefined,
    sessionCookies: data.session_cookies ? decryptAtRest(data.session_cookies, getKey()).toString('utf8') : null,
    merchantId: data.merchant_id,
    companyName: data.company_name,
    status: data.status,
    paused: data.paused,
  }
}

// Used internally by the pricelist route (Task 7), which is hit by Kaspi's
// own crawler with no session -- looks up by connection id, not user id.
export async function loadConnectionById(connectionId: string): Promise<KaspiShopConnection | null> {
  const { data, error } = await supabase
    .from('kaspi_shop_connections')
    .select('id, user_id, api_token_enc, session_cookies, merchant_id, company_name, status, paused')
    .eq('id', connectionId)
    .maybeSingle()
  if (error) throw new Error(`kaspi_shop_connections lookup failed for connection ${connectionId}: ${error.message}`)
  if (!data) return null
  return {
    id: data.id,
    userId: data.user_id,
    apiToken: data.api_token_enc ? decryptAtRest(data.api_token_enc, getKey()).toString('utf8') : undefined,
    sessionCookies: data.session_cookies ? decryptAtRest(data.session_cookies, getKey()).toString('utf8') : null,
    merchantId: data.merchant_id,
    companyName: data.company_name,
    status: data.status,
    paused: data.paused,
  }
}

// Single write path for marking a connection's real Kaspi cabinet session
// invalid -- previously only checkCycle.ts's repricer price-push wrote this
// column inline, so a connection that's paused (price-push never attempted)
// could sit with a stale session_status:'active' indefinitely even though
// every live read (orders, finance, pending-products) was already getting
// a real 401 from Kaspi. Callers that detect a 401 from any Kaspi endpoint
// should call this so /api/kaspi-shop/wallet's sessionStatus (read by the
// Демпинг page's reconnect banner) reflects reality promptly.
export async function markSessionExpired(connectionId: string): Promise<void> {
  const { error } = await supabase.from('kaspi_shop_connections').update({ session_status: 'session_expired' }).eq('id', connectionId)
  if (error) throw new Error(`kaspi_shop_connections markSessionExpired failed for ${connectionId}: ${error.message}`)
}

export async function saveConnection(params: {
  userId: string
  apiToken?: string
  sessionCookies?: string
  merchantId: string
  companyName: string
}): Promise<void> {
  const row: Record<string, any> = {
    user_id: params.userId,
    merchant_id: params.merchantId,
    company_name: params.companyName,
    status: 'active',
  }
  if (params.apiToken) row.api_token_enc = encryptAtRest(params.apiToken, getKey())
  if (params.sessionCookies) {
    row.session_cookies = encryptAtRest(params.sessionCookies, getKey())
    row.session_status = 'active'
  }

  const { error } = await supabase.from('kaspi_shop_connections').upsert(row, { onConflict: 'user_id' })
  if (error) throw new Error(`kaspi_shop_connections save failed for user ${params.userId}: ${error.message}`)

  // No wallet row to seed since the 2026-08-18 unified-wallet merge: spend
  // now debits the shared profiles.kaspi_wallet_balance, which always exists
  // (every user has a profiles row) and reads as 0 via COALESCE when untouched.
}
