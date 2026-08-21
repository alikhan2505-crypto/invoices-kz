import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection, markSessionExpired } from '@/lib/kaspiShop/connection'
import { fetchOfferDetails } from '@/lib/kaspiShop/cabinetApi'
import { savePointStockPrice } from '@/lib/kaspiShop/cabinetPricePush'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

type PointEntry = {
  storeCode: string
  cityId: string | null
  cityName: string | null
  price: number | null
  stockCount: number | null
  available: string | null
}

// The offer-details response's exact schema for per-point data was never
// fully captured -- rather than guessing key paths, walk the whole JSON
// tree and collect every object that carries a storeId, merging in
// whatever cityId/stock/price fields sit beside it. Unrecognized
// structures simply yield an empty list (surfaced honestly in the UI),
// never a fabricated one.
function collectPointEntries(node: any, merchantId: string, out: Map<string, PointEntry>) {
  if (Array.isArray(node)) {
    for (const item of node) collectPointEntries(item, merchantId, out)
    return
  }
  if (!node || typeof node !== 'object') return

  const rawStoreId = node.storeId ?? node.pointId ?? null
  if (typeof rawStoreId === 'string' && rawStoreId.length > 0) {
    const storeCode = rawStoreId.startsWith(`${merchantId}_`) ? rawStoreId.slice(merchantId.length + 1) : rawStoreId
    const existing = out.get(storeCode) || { storeCode, cityId: null, cityName: null, price: null, stockCount: null, available: null }
    const cityId = node.cityId ?? node.city?.id ?? null
    if (cityId !== null && cityId !== undefined) existing.cityId = String(cityId)
    const stock = node.stockCount ?? node.stockLevel ?? null
    if (stock !== null && stock !== undefined && Number.isFinite(Number(stock))) existing.stockCount = Number(stock)
    const price = node.price ?? null
    if (price !== null && price !== undefined && Number.isFinite(Number(price))) existing.price = Number(price)
    if (typeof node.available === 'string') existing.available = node.available
    out.set(storeCode, existing)
  }

  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') collectPointEntries(value, merchantId, out)
  }
}

// GET ?sku=... -- the offer's per-point (склад/город) price+stock state,
// for the «Цена и остатки» modal.
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sku = req.nextUrl.searchParams.get('sku')
  if (!sku) return NextResponse.json({ error: 'sku обязателен' }, { status: 400 })

  const connection = await loadConnection(user.id)
  if (!connection?.sessionCookies) return NextResponse.json({ error: 'Kaspi Магазин не подключён' }, { status: 400 })

  const details = await fetchOfferDetails(connection.sessionCookies, connection.merchantId, sku)
  if (!details) return NextResponse.json({ error: 'Не удалось получить карточку товара из Kaspi' }, { status: 502 })

  const entriesMap = new Map<string, PointEntry>()
  collectPointEntries(details, connection.merchantId, entriesMap)

  const { data: connRow } = await supabase
    .from('kaspi_shop_connections')
    .select('city_lookup_cache')
    .eq('id', connection.id)
    .maybeSingle()
  const cityNames: Record<string, string> = connRow?.city_lookup_cache || {}

  const entries = Array.from(entriesMap.values()).map(e => ({
    ...e,
    cityName: e.cityId ? (cityNames[e.cityId] || null) : null,
  }))

  return NextResponse.json({
    sku,
    masterSku: details.masterSku ?? null,
    model: details.title ?? details.model ?? '',
    // minPrice as the price fallback when a point entry carried no price of
    // its own -- the modal needs SOMETHING editable per point.
    minPrice: Number(details.minPrice) || null,
    entries,
  })
}

// POST -- save price+stock for the edited points, one captured-shape save
// per point (exactly how the cabinet's own modal behaves).
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }
  const { sku, masterSku, model, entries } = body
  if (!sku || !model || !Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: 'sku, model и entries обязательны' }, { status: 400 })
  }

  const connection = await loadConnection(user.id)
  if (!connection?.sessionCookies) return NextResponse.json({ error: 'Kaspi Магазин не подключён' }, { status: 400 })

  const results: { storeCode: string; ok: boolean; message?: string }[] = []
  for (const entry of entries) {
    const storeCode = String(entry.storeCode || '')
    const cityId = String(entry.cityId || '')
    const price = Number(entry.price)
    if (!storeCode || !cityId || !Number.isFinite(price) || price <= 0) {
      results.push({ storeCode, ok: false, message: 'нет города или цены для этой точки' })
      continue
    }
    const stockRaw = entry.stockCount
    const stockCount = stockRaw === null || stockRaw === undefined || stockRaw === '' ? null : Number(stockRaw)
    const result = await savePointStockPrice({
      sessionCookies: connection.sessionCookies,
      merchantUid: connection.merchantId,
      sku,
      masterSku: masterSku ?? null,
      model,
      storeCode,
      cityId,
      price,
      stockCount: stockCount !== null && Number.isFinite(stockCount) ? stockCount : null,
    })
    if (!result.success && result.reason === 'session_expired') {
      await markSessionExpired(connection.id)
      return NextResponse.json({ error: 'Сессия кабинета Kaspi истекла — переподключитесь' }, { status: 400 })
    }
    results.push({ storeCode, ok: result.success, message: result.success ? undefined : result.message })
  }

  const failed = results.filter(r => !r.ok)
  return NextResponse.json({ ok: failed.length === 0, results })
}
