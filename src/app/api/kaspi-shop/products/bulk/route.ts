import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection } from '@/lib/kaspiShop/connection'

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

// Northline's cap on a single bulk-add batch -- matched here for parity
// (see the founder's competitor research this feature is based on).
const MAX_BULK_ITEMS = 100

const VALID_STRATEGIES = new Set(['undercut_leader', 'match_leader', 'stay_above_leader', 'be_second'])

// "Добавить несколько" backend. IMPORTANT DEVIATION from a literal
// catalog-search-and-insert flow: src/lib/kaspiShop/finalizeConnection.ts
// already auto-imports the seller's ENTIRE Kaspi catalog as disabled
// kaspi_shop_tracked_products rows at connect time and on every reconnect
// (a real account has imported up to 43,840 rows this way -- see the
// comment on pushCityPrice in checkCycle.ts). So by the time a seller opens
// this page, virtually every product they could "add" already has a row
// here, just sitting disabled with default settings. A literal
// insert-from-live-catalog-search flow would therefore either (a) hit
// listCatalog live on every search keystroke -- an authenticated,
// paginated Kaspi API call against a catalog that can be tens of thousands
// of items, purely to power a search box, when a fresh local mirror already
// exists -- or (b) risk silently duplicate-inserting rows for
// already-imported products, the exact bug class finalizeConnection had to
// be fixed for once already (confirmed live 2026-08-15: 204 rows for 70
// real products before that fix).
//
// So "bulk add" here is bulk CONFIGURE + ENABLE of the seller's own
// already-imported rows (search happens client-side over the products
// array the page already has in memory from GET /api/kaspi-shop/products --
// no new search endpoint needed): apply one shared floor/max/step/strategy/
// frequency to N selected existing rows and flip enabled=true on all of
// them in one request. This is the real-world equivalent of what the
// competitor's "bulk add" does for a seller here, without reintroducing a
// duplicate-row risk or hammering Kaspi's cabinet API for a search UI.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const connection = await loadConnection(user.id)
  if (!connection) return NextResponse.json({ error: 'Kaspi Shop не подключён' }, { status: 400 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }

  const productIds: unknown = body.productIds
  if (!Array.isArray(productIds) || productIds.length === 0) {
    return NextResponse.json({ error: 'productIds обязателен и должен быть непустым списком' }, { status: 400 })
  }
  if (productIds.length > MAX_BULK_ITEMS) {
    return NextResponse.json({ error: `Максимум ${MAX_BULK_ITEMS} товаров за один раз` }, { status: 400 })
  }
  if (!productIds.every(id => typeof id === 'string' && id.length > 0)) {
    return NextResponse.json({ error: 'productIds должен быть списком id' }, { status: 400 })
  }

  // Mirrors the floorPrice validation in POST /api/kaspi-shop/products
  // (Number(...) first, then validate the RESULT, so a non-numeric input
  // like "abc" can't slip past a NaN comparison) and the max_price >
  // floor_price cross-check in PATCH /api/kaspi-shop/products -- not
  // factored into a shared helper since PATCH's version deliberately only
  // fires when both fields are present in that same partial-update request,
  // a condition that doesn't apply here (every field below is always
  // present together, since this is one shared config for the whole batch).
  const floorPriceNum = Number(body.floorPrice)
  if (!Number.isFinite(floorPriceNum) || floorPriceNum <= 0) {
    return NextResponse.json({ error: 'floorPrice должен быть числом больше нуля' }, { status: 400 })
  }
  let maxPriceNum: number | null = null
  if (body.maxPrice !== undefined && body.maxPrice !== null && body.maxPrice !== '') {
    maxPriceNum = Number(body.maxPrice)
    if (!Number.isFinite(maxPriceNum)) {
      return NextResponse.json({ error: 'maxPrice должен быть числом' }, { status: 400 })
    }
    if (maxPriceNum <= floorPriceNum) {
      return NextResponse.json({ error: 'max_price должен быть больше floor_price' }, { status: 400 })
    }
  }
  const undercutStepNum = Number(body.undercutStep)
  if (!Number.isFinite(undercutStepNum) || undercutStepNum < 0) {
    return NextResponse.json({ error: 'undercutStep должен быть числом не меньше нуля' }, { status: 400 })
  }
  const dempingStrategy = typeof body.dempingStrategy === 'string' && VALID_STRATEGIES.has(body.dempingStrategy)
    ? body.dempingStrategy
    : 'undercut_leader'
  const checkFrequencyMinutesNum = body.checkFrequencyMinutes != null ? Number(body.checkFrequencyMinutes) : 15
  if (!Number.isFinite(checkFrequencyMinutesNum) || checkFrequencyMinutesNum <= 0) {
    return NextResponse.json({ error: 'checkFrequencyMinutes должен быть числом больше нуля' }, { status: 400 })
  }

  // .in('id', ...) scoped to .eq('user_id', user.id) -- same ownership
  // pattern as PATCH/DELETE below -- so a caller can't touch another
  // seller's rows by guessing/enumerating ids.
  const { data, error } = await supabase
    .from('kaspi_shop_tracked_products')
    .update({
      floor_price: floorPriceNum,
      max_price: maxPriceNum,
      undercut_step: undercutStepNum,
      demping_strategy: dempingStrategy,
      check_frequency_minutes: checkFrequencyMinutesNum,
      enabled: true,
    })
    .in('id', productIds)
    .eq('user_id', user.id)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, updated: (data || []).length })
}
