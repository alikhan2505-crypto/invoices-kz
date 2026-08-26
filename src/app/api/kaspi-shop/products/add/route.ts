import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection, markSessionExpired } from '@/lib/kaspiShop/connection'
import { addProductToExistingCard } from '@/lib/kaspiShop/addProduct'

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

// Join an existing Kaspi catalog card: the captured validate ->
// link-to-master -> pricefeed sequence. Kaspi lists the offer asynchronously
// (the cabinet promises "до конца часа").
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }

  const masterProductCode = typeof body?.masterProductCode === 'string' ? body.masterProductCode.trim() : ''
  const sku = typeof body?.sku === 'string' ? body.sku.trim() : ''
  const model = typeof body?.model === 'string' ? body.model.trim() : ''
  const entries: any[] = Array.isArray(body?.entries) ? body.entries : []
  if (!masterProductCode || !sku || !model) {
    return NextResponse.json({ error: 'masterProductCode, sku и model обязательны' }, { status: 400 })
  }

  // entries: [{ cityId, price, points: [{ storeCode, stockCount|null }] }]
  const cityPrices: { cityId: string; value: number }[] = []
  const availabilities: { storeCode: string; stockCount: number | null }[] = []
  for (const e of entries) {
    const price = Number(e?.price)
    if (!e?.cityId || !Number.isFinite(price) || price <= 0) continue
    cityPrices.push({ cityId: String(e.cityId), value: price })
    for (const p of Array.isArray(e.points) ? e.points : []) {
      if (!p?.storeCode) continue
      const stock = p.stockCount === null || p.stockCount === undefined || p.stockCount === '' ? null : Number(p.stockCount)
      availabilities.push({ storeCode: String(p.storeCode), stockCount: Number.isFinite(stock as number) ? (stock as number) : null })
    }
  }
  if (cityPrices.length === 0 || availabilities.length === 0) {
    return NextResponse.json({ error: 'Укажите цену хотя бы для одного города с точкой' }, { status: 400 })
  }

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён' }, { status: 400 })
  }

  const result = await addProductToExistingCard({
    sessionCookies: connection.sessionCookies,
    merchantId: connection.merchantId,
    masterProductCode,
    sku,
    model,
    cityPrices,
    availabilities,
  })
  if (!result.success) {
    if (result.reason === 'session_expired') {
      await markSessionExpired(connection.id)
      return NextResponse.json({ error: 'Сессия кабинета Kaspi истекла — переподключите магазин' }, { status: 400 })
    }
    return NextResponse.json({ error: `Kaspi отклонил добавление: ${result.message}` }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
