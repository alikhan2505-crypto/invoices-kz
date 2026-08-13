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

  // A fresh connection needs its own wallet row before any check cycle can
  // debit credits -- created here so every connection always has exactly
  // one wallet, never a missing-row edge case downstream. Thrown, not
  // logged-and-swallowed: the connection row above already committed, so a
  // silently missing wallet here would leave a connection that looks fully
  // set up but can never pay for a check cycle -- surfacing the failure to
  // the caller (who reports a 500 instead of a false "ok") is safer than
  // pretending the connect succeeded.
  const { error: walletError } = await supabase.from('kaspi_shop_wallet').upsert(
    { user_id: params.userId, balance: 0 },
    { onConflict: 'user_id', ignoreDuplicates: true }
  )
  if (walletError) throw new Error(`kaspi_shop_wallet creation failed for user ${params.userId}: ${walletError.message}`)
}
