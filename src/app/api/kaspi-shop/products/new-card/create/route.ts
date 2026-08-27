import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection, markSessionExpired } from '@/lib/kaspiShop/connection'
import {
  getCategoryAttributeSchema,
  generateProductName,
  createNewProductCard,
  type ClassificationGroup,
} from '@/lib/kaspiShop/addProductNewCard'

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

// Final submit for «Создать новую карточку». The schema is re-fetched here
// from `categoryCode` rather than trusted from the client, so a stale or
// tampered client-side schema can't corrupt the classifications payload sent
// to Kaspi -- only the seller's chosen values (`attributes`) come from the
// client.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }

  const categoryCode = typeof body?.categoryCode === 'string' ? body.categoryCode.trim() : ''
  const categoryName = typeof body?.categoryName === 'string' ? body.categoryName.trim() : ''
  const brandCode = typeof body?.brand?.code === 'string' ? body.brand.code.trim() : ''
  const brandName = typeof body?.brand?.name === 'string' ? body.brand.name.trim() : ''
  const sku = typeof body?.sku === 'string' ? body.sku.trim() : ''
  const imageId = typeof body?.imageId === 'string' ? body.imageId.trim() : ''
  const imageUrls = body?.imageUrls
  const attributes: Record<string, string[]> = {}
  if (body?.attributes && typeof body.attributes === 'object') {
    for (const [code, values] of Object.entries(body.attributes)) {
      if (Array.isArray(values)) attributes[code] = values.map(v => String(v))
    }
  }
  if (!categoryCode || !categoryName || !brandCode || !sku || !imageId || !imageUrls?.large || !imageUrls?.medium || !imageUrls?.small) {
    return NextResponse.json({ error: 'categoryCode, brand, sku и фото обязательны' }, { status: 400 })
  }

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён' }, { status: 400 })
  }

  const schemaRes = await getCategoryAttributeSchema(connection.sessionCookies, connection.merchantId, categoryCode)
  if (schemaRes.sessionExpired) {
    await markSessionExpired(connection.id)
    return NextResponse.json({ error: 'Сессия кабинета Kaspi истекла — переподключите магазин' }, { status: 400 })
  }
  const schema: ClassificationGroup[] = schemaRes.classifications
  if (schema.length === 0) {
    return NextResponse.json({ error: 'Не удалось загрузить характеристики категории' }, { status: 502 })
  }

  // Every mandatory field across every group must have at least one value --
  // mirrors the cabinet's own inline "Это поле должно быть заполнено".
  const missing: string[] = []
  for (const group of schema) {
    for (const f of group.features) {
      if (f.mandatory && (attributes[f.attributeCode] ?? []).length === 0) missing.push(f.name)
    }
  }
  if (missing.length > 0) {
    return NextResponse.json({ error: `Заполните обязательные поля: ${missing.join(', ')}` }, { status: 400 })
  }

  const nameFeatures = schema.flatMap(g => g.features).map(f => ({
    attributeCode: f.attributeCode,
    values: attributes[f.attributeCode] ?? [],
  }))
  const generatedName = await generateProductName(
    connection.sessionCookies, connection.merchantId,
    { code: brandCode, name: brandName }, categoryCode, sku, nameFeatures
  )
  const name = generatedName || `${categoryName} ${brandName}`.trim()

  // entries: [{ cityId, price, points: [{ storeCode, stockCount|null }] }] --
  // same optional per-city shape as the join-card flow; omitting it entirely
  // is valid (Kaspi's own wizard leaves the card in «Сняты с продажи»).
  const cityPrices: { cityId: string; value: number }[] = []
  const availabilities: { storeCode: string; stockCount: number | null }[] = []
  for (const e of Array.isArray(body?.entries) ? body.entries : []) {
    const price = Number(e?.price)
    if (!e?.cityId || !Number.isFinite(price) || price <= 0) continue
    cityPrices.push({ cityId: String(e.cityId), value: price })
    for (const p of Array.isArray(e.points) ? e.points : []) {
      if (!p?.storeCode) continue
      const stock = p.stockCount === null || p.stockCount === undefined || p.stockCount === '' ? null : Number(p.stockCount)
      availabilities.push({ storeCode: String(p.storeCode), stockCount: Number.isFinite(stock as number) ? (stock as number) : null })
    }
  }

  const result = await createNewProductCard({
    sessionCookies: connection.sessionCookies,
    merchantId: connection.merchantId,
    categoryCode,
    categoryName,
    brand: { code: brandCode, name: brandName },
    sku,
    name,
    schema,
    selectedValues: attributes,
    imageId,
    imageUrls,
    youtubeLink: typeof body?.youtubeLink === 'string' ? body.youtubeLink.trim() : undefined,
    cityPrices: cityPrices.length > 0 ? cityPrices : undefined,
    availabilities: availabilities.length > 0 ? availabilities : undefined,
  })
  if (!result.success) {
    if (result.reason === 'session_expired') {
      await markSessionExpired(connection.id)
      return NextResponse.json({ error: 'Сессия кабинета Kaspi истекла — переподключите магазин' }, { status: 400 })
    }
    return NextResponse.json({ error: `Kaspi отклонил создание карточки: ${result.message}` }, { status: 502 })
  }
  return NextResponse.json({ ok: true, name })
}
