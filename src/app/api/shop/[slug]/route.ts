import { NextRequest, NextResponse } from 'next/server'
import { resolvePublicStorefront, loadStorefrontProducts, loadStorefrontCategories, loadWebsiteWidgetKey } from '@/lib/kaspiShop/storefront'

// Public, unauthenticated -- the customer opening a seller's shared link is
// never logged in. An unpublished or never-claimed slug resolves identically
// to 404 (see resolvePublicStorefront's own comment). A storefront whose
// owner's Pro has lapsed is also a 404, with error 'unavailable' so the page
// can say «временно недоступен» -- nothing else about the seller is sent.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const resolved = await resolvePublicStorefront(slug)
  if (resolved.status === 'unavailable') return NextResponse.json({ error: 'unavailable' }, { status: 404 })
  if (resolved.status !== 'ok') return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const storefront = resolved.storefront

  const [products, categories, widgetKey] = await Promise.all([
    loadStorefrontProducts(storefront.connectionId),
    loadStorefrontCategories(storefront.connectionId),
    storefront.chatWidgetEnabled ? loadWebsiteWidgetKey(storefront.userId) : Promise.resolve(null),
  ])
  return NextResponse.json({
    companyName: storefront.companyName,
    products,
    categories,
    backgroundColor: storefront.backgroundColor,
    deliveryInfo: storefront.deliveryInfo,
    widgetKey,
    landingEnabled: storefront.landingEnabled,
    landingHistory: storefront.landingHistory,
    landingCapacity: storefront.landingCapacity,
    landingAnnualVolume: storefront.landingAnnualVolume,
  })
}
