import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection, markSessionExpired } from '@/lib/kaspiShop/connection'
import { listOrders } from '@/lib/kaspiShop/cabinetApi'

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

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const status = req.nextUrl.searchParams.get('status') || 'NEW'
  const page = Number(req.nextUrl.searchParams.get('page')) || 0
  const cityId = req.nextUrl.searchParams.get('cityId') || ''
  const orderCode = req.nextUrl.searchParams.get('orderCode') || ''

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён — подключите его через Kaspi Магазин' }, { status: 400 })
  }

  const { orders, total, sessionExpired } = await listOrders(connection.sessionCookies, connection.merchantId, status, page, cityId, orderCode)
  if (sessionExpired) await markSessionExpired(connection.id)

  // Opportunistic image backfill for the storefront (/shop/[slug]) --
  // Kaspi's catalog/offer-details endpoints have never carried an image
  // field (confirmed live 2026-09-03: fetchOffersDetails returns 0 items for
  // a real store), but every order's own entries[].product.images does
  // (same shape already rendered as real thumbnails on this page's own
  // cards). product.code lives in the same catalog sku space as
  // listCatalog's own sku (confirmed in the 2026-08-13 findings doc), i.e.
  // kaspi_shop_tracked_products.kaspi_sku. Best-effort: never blocks the
  // order list itself, and only ever fills a product in that doesn't
  // already have one (a real product photo Kaspi served for an actual sale
  // is never worse than what's already stored).
  try {
    const bySku = new Map<string, string>()
    for (const order of orders) {
      for (const item of order.items) {
        if (item.code && item.imageUrl && !bySku.has(item.code)) bySku.set(item.code, item.imageUrl)
      }
    }
    await Promise.all(Array.from(bySku.entries()).map(([sku, imageUrl]) =>
      supabase.from('kaspi_shop_tracked_products')
        .update({ image_url: imageUrl })
        .eq('connection_id', connection.id)
        .eq('kaspi_sku', sku)
        .is('image_url', null)
    ))
  } catch (err: any) {
    console.error('kaspi-shop orders: image backfill failed (non-fatal)', err.message)
  }

  return NextResponse.json({ orders, total, sessionExpired })
}
