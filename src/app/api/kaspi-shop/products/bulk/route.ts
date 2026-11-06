import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { kaspiShopPlanGate } from '@/lib/kaspiShop/planGate'
import { loadConnection } from '@/lib/kaspiShop/connection'
import { validateBulkSettings, partitionBulkRows } from '@/lib/kaspiShop/productSettings'
import { isUuid } from '@/lib/uuidFormat'

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
  const notPro = await kaspiShopPlanGate(user.id)
  if (notPro) return notPro

  const connection = await loadConnection(user.id)
  if (!connection) return NextResponse.json({ error: 'Kaspi Shop не подключён' }, { status: 400 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }
  const productIds: unknown = body.productIds
  if (!Array.isArray(productIds) || productIds.length === 0) {
    return NextResponse.json({ error: 'productIds обязателен и должен быть непустым списком' }, { status: 400 })
  }
  if (productIds.length > MAX_BULK_ITEMS) {
    return NextResponse.json({ error: `Максимум ${MAX_BULK_ITEMS} товаров за один раз` }, { status: 400 })
  }
  if (!productIds.every(id => isUuid(id))) {
    return NextResponse.json({ error: 'productIds должен быть списком id' }, { status: 400 })
  }

  // Все денежные поля проверяет productSettings.ts -- тем же набором правил, что
  // POST/PATCH (аудит Kaspi 06.11.2026, K7/K18): пол > 0, шаг >= 0, максимум выше
  // пола, стратегия из списка (неизвестная больше не подменяется молча),
  // частота -- целое число минут не меньше минимума формы.
  const checked = validateBulkSettings(body)
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })
  const { floorPrice, maxPrice, undercutStep, dempingStrategy, checkFrequencyMinutes } = checked.value

  // Одна общая цена-пол и один максимум на товары с РАЗНЫМИ ценами (K18):
  // товар за 800 с полом 5000 на следующем цикле был бы поднят до 5000. Читаем
  // строки (только свои: user_id) и не включаем те, где пол выше текущей цены
  // или максимум ниже неё; список пропущенных возвращаем, чтобы форма показала,
  // какие товары и почему остались как были.
  const { data: rows, error: rowsError } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('id, product_name, own_current_price')
    .in('id', productIds)
    .eq('user_id', user.id)
  if (rowsError) return NextResponse.json({ error: rowsError.message }, { status: 500 })
  const { eligible, skipped } = partitionBulkRows(rows || [], floorPrice, maxPrice)
  if (eligible.length === 0) {
    return NextResponse.json({
      error: skipped.length > 0
        ? 'Ни один товар не подошёл: минимальная цена выше текущей цены товара или максимальная ниже неё. Проверьте значения.'
        : 'Товары не найдены',
      skipped,
    }, { status: 400 })
  }

  // .in('id', ...) scoped to .eq('user_id', user.id) -- same ownership
  // pattern as PATCH/DELETE below -- so a caller can't touch another
  // seller's rows by guessing/enumerating ids.
  const { data, error } = await supabase
    .from('kaspi_shop_tracked_products')
    .update({
      floor_price: floorPrice,
      max_price: maxPrice,
      undercut_step: undercutStep,
      demping_strategy: dempingStrategy,
      check_frequency_minutes: checkFrequencyMinutes,
      enabled: true,
    })
    .in('id', eligible.map(r => r.id))
    .eq('user_id', user.id)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, updated: (data || []).length, skipped })
}
