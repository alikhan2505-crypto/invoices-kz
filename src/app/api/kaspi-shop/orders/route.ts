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
  // cards). product.code is the MASTER sku, not the per-variant sku --
  // verified live 2026-09-03: a real order's item.code (167403494) matched
  // kaspi_shop_tracked_products.kaspi_master_sku, not kaspi_sku, for that
  // product (the findings doc's "same sku space as listCatalog" note didn't
  // specify which of listCatalog's two id fields it meant). This fills every
  // size/colour variant sharing that master from one sale's photo -- close
  // enough for variants that are the same garment, imprecise only for the
  // rarer case where colour variants use genuinely different photos.
  // Best-effort: never blocks the order list itself, and only ever fills a
  // product that doesn't already have one.
  try {
    const byMasterSku = new Map<string, string>()
    for (const order of orders) {
      for (const item of order.items) {
        if (item.code && item.imageUrl && !byMasterSku.has(item.code)) byMasterSku.set(item.code, item.imageUrl)
      }
    }
    await Promise.all(Array.from(byMasterSku.entries()).map(([masterSku, imageUrl]) =>
      supabase.from('kaspi_shop_tracked_products')
        .update({ image_url: imageUrl })
        .eq('connection_id', connection.id)
        .eq('kaspi_master_sku', masterSku)
        .is('image_url', null)
    ))
  } catch (err: any) {
    console.error('kaspi-shop orders: image backfill failed (non-fatal)', err.message)
  }

  return NextResponse.json({ orders, total, sessionExpired })
}
