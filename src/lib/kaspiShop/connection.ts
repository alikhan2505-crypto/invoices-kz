import { createClient } from '@supabase/supabase-js'
import { encryptAtRest, decryptAtRest } from '@/lib/kaspiPay/crypto'
import { notifySessionExpired, resetSessionExpiredNotices } from '@/lib/kaspiShop/sessionExpiredNotice'

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

export interface KaspiShopConnectionSummary {
  id: string
  merchantId: string
  companyName: string
  status: string
  isActive: boolean
  sessionStatus: string
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

// Returns the user's currently ACTIVE store (see is_active / the
// multi-connection migration). A user can have more than one connection
// (2026-08-21: real need -- one phone number, 2 real Kaspi merchant
// accounts) but exactly one is active at a time; switching is explicit via
// switchActiveConnection. Every existing caller keeps working unchanged --
// it just now implicitly scopes to whichever store the user last switched
// into, instead of "the" (necessarily singular) connection.
export async function loadConnection(userId: string): Promise<KaspiShopConnection | null> {
  const { data, error } = await supabase
    .from('kaspi_shop_connections')
    .select('id, user_id, api_token_enc, session_cookies, merchant_id, company_name, status, paused')
    .eq('user_id', userId)
    .eq('is_active', true)
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

// Used right after saveConnection during the connect flow, when the newly
// saved store may not be the active one (a 2nd+ store defaults to inactive
// -- see saveConnection) -- loadConnection(userId) alone would return the
// WRONG store in that case. Looks up by the exact (user, merchant) pair
// instead of relying on which one is currently active.
export async function loadConnectionByMerchant(userId: string, merchantId: string): Promise<KaspiShopConnection | null> {
  const { data, error } = await supabase
    .from('kaspi_shop_connections')
    .select('id, user_id, api_token_enc, session_cookies, merchant_id, company_name, status, paused')
    .eq('user_id', userId)
    .eq('merchant_id', merchantId)
    .maybeSingle()
  if (error) throw new Error(`kaspi_shop_connections lookup failed for user ${userId}/merchant ${merchantId}: ${error.message}`)
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

// All of the user's stores, for the switcher dropdown -- no secrets decrypted.
export async function listConnections(userId: string): Promise<KaspiShopConnectionSummary[]> {
  const { data, error } = await supabase
    .from('kaspi_shop_connections')
    .select('id, merchant_id, company_name, status, is_active, session_status')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`kaspi_shop_connections list failed for user ${userId}: ${error.message}`)
  return (data || []).map(row => ({
    id: row.id,
    merchantId: row.merchant_id,
    companyName: row.company_name,
    status: row.status,
    isActive: row.is_active,
    sessionStatus: row.session_status || 'active',
  }))
}

// Makes connectionId the user's active store (and every other one of theirs
// inactive). The partial unique index on (user_id) WHERE is_active means
// step 2 can never leave two rows active at once -- deactivating everything
// first is what makes that safe.
export async function switchActiveConnection(userId: string, connectionId: string): Promise<void> {
  const { data: owned, error: lookupError } = await supabase
    .from('kaspi_shop_connections')
    .select('id')
    .eq('id', connectionId)
    .eq('user_id', userId)
    .maybeSingle()
  if (lookupError) throw new Error(`kaspi_shop_connections ownership check failed: ${lookupError.message}`)
  if (!owned) throw new Error('connection_not_found')

  const { error: deactivateError } = await supabase.from('kaspi_shop_connections').update({ is_active: false }).eq('user_id', userId)
  if (deactivateError) throw new Error(`kaspi_shop_connections deactivate failed: ${deactivateError.message}`)
  const { error: activateError } = await supabase.from('kaspi_shop_connections').update({ is_active: true }).eq('id', connectionId)
  if (activateError) throw new Error(`kaspi_shop_connections activate failed: ${activateError.message}`)
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
  const { data, error } = await supabase
    .from('kaspi_shop_connections')
    .update({ session_status: 'session_expired' })
    .eq('id', connectionId)
    .select('user_id, company_name')
  if (error) throw new Error(`kaspi_shop_connections markSessionExpired failed for ${connectionId}: ${error.message}`)

  // K45: сообщаем продавцу (Telegram по настройке + колокольчик). Раз в сутки на
  // продавца, не больше трёх раз за обрыв -- см. sessionExpiredNotice.ts.
  // Уведомление -- побочное: сбой не должен ломать ответ маршруту, который
  // только что получил 401 от Kaspi.
  const row = Array.isArray(data) ? data[0] : null
  if (row?.user_id) {
    await notifySessionExpired(supabase, row.user_id, [row.company_name || ''])
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

  // is_active is deliberately omitted for everyone except a user's very
  // first-ever store: reconnecting an existing merchant must not touch its
  // current active/inactive state (omitted = untouched on the upsert's
  // UPDATE branch), and connecting a genuine 2nd+ store must not silently
  // yank the user out of the store they're currently working in -- it
  // lands inactive (the is_active column's default) until they deliberately
  // switch via the store switcher.
  const { data: existingRows, error: existingError } = await supabase
    .from('kaspi_shop_connections')
    .select('id')
    .eq('user_id', params.userId)
  if (existingError) throw new Error(`kaspi_shop_connections existing-rows check failed for user ${params.userId}: ${existingError.message}`)
  if (!existingRows || existingRows.length === 0) row.is_active = true

  const { error } = await supabase.from('kaspi_shop_connections').upsert(row, { onConflict: 'user_id,merchant_id' })
  if (error) throw new Error(`kaspi_shop_connections save failed for user ${params.userId}: ${error.message}`)

  // Новая рабочая сессия: следующий обрыв снова вправе уведомить продавца
  // (счётчик «не больше трёх за обрыв», см. sessionExpiredNotice.ts).
  if (params.sessionCookies) await resetSessionExpiredNotices(supabase, params.userId)

  // No wallet row to seed since the 2026-08-18 unified-wallet merge: spend
  // now debits the shared profiles.kaspi_wallet_balance, which always exists
  // (every user has a profiles row) and reads as 0 via COALESCE when untouched.
}

const CHUNK = 100

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK))
  return out
}

export type PurgeKaspiResult =
  | { ok: true; connections: number; rowsRemoved: boolean }
  | { ok: false; error: string }

// K47: полное удаление Kaspi-данных пользователя при удалении аккаунта. Сессия
// кабинета (session_cookies) и токен (api_token_enc) -- живой доступ к чужому
// кабинету продавца, страница /data-deletion обещает их удаление.
//
// Порядок:
//  1. СНАЧАЛА затираем секреты у всех соединений пользователя (cookies и токен в
//     null, session_expired, error, пауза): что бы ни случилось дальше, живого
//     доступа не остаётся. Не удалось -- ok:false, вызывающий НЕ удаляет аккаунт.
//  2. Затем то же, что делает DELETE в settings/route.ts, но для всех магазинов:
//     цены по городам -> отслеживаемые товары -> соединения (по зависимостям, без
//     расчёта на ON DELETE CASCADE). Сбой здесь не блокирует удаление аккаунта
//     (секретов уже нет): rowsRemoved:false, вызывающий пишет громкий лог.
// Финансовый журнал (wallet_ledger) не трогаем: он привязан к пользователю, а не
// к соединению, и в этой функции его нет.
export async function purgeKaspiConnectionsForUser(userId: string): Promise<PurgeKaspiResult> {
  const { data: conns, error: listError } = await supabase
    .from('kaspi_shop_connections')
    .select('id')
    .eq('user_id', userId)
  if (listError) return { ok: false, error: `kaspi_shop_connections lookup failed: ${listError.message}` }
  const connectionIds = (conns || []).map((c: { id: string }) => c.id)
  if (connectionIds.length === 0) return { ok: true, connections: 0, rowsRemoved: true }

  const { error: wipeError } = await supabase
    .from('kaspi_shop_connections')
    .update({ session_cookies: null, api_token_enc: null, session_status: 'session_expired', status: 'error', paused: true })
    .eq('user_id', userId)
  if (wipeError) return { ok: false, error: `kaspi_shop_connections secrets wipe failed: ${wipeError.message}` }

  try {
    for (const idChunk of chunks(connectionIds)) {
      const { data: products, error: productsError } = await supabase
        .from('kaspi_shop_tracked_products')
        .select('id')
        .in('connection_id', idChunk)
      if (productsError) throw new Error(`tracked products lookup failed: ${productsError.message}`)
      const productIds = (products || []).map((p: { id: string }) => p.id)
      for (const productChunk of chunks(productIds)) {
        const { error } = await supabase.from('kaspi_shop_product_city_prices').delete().in('tracked_product_id', productChunk)
        if (error) throw new Error(`city prices delete failed: ${error.message}`)
      }
      if (productIds.length > 0) {
        const { error } = await supabase.from('kaspi_shop_tracked_products').delete().in('connection_id', idChunk)
        if (error) throw new Error(`tracked products delete failed: ${error.message}`)
      }
    }
    const { error: deleteError } = await supabase.from('kaspi_shop_connections').delete().eq('user_id', userId)
    if (deleteError) throw new Error(`connections delete failed: ${deleteError.message}`)
  } catch (err: any) {
    console.error('CRITICAL: kaspi purge for user', userId, 'wiped secrets but could not delete rows:', err?.message || err)
    return { ok: true, connections: connectionIds.length, rowsRemoved: false }
  }
  return { ok: true, connections: connectionIds.length, rowsRemoved: true }
}
