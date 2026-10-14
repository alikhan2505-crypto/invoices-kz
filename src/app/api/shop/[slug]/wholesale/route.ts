import { NextRequest, NextResponse } from 'next/server'
import { resolvePublicStorefront, loadStorefrontCategories } from '@/lib/kaspiShop/storefront'
import { loadWholesaleModels } from '@/lib/kaspiShop/wholesaleStorefront'

// Public, unauthenticated -- same resolution rules as GET /api/shop/[slug]
// (resolvePublicStorefront's own comment: an unpublished or never-claimed
// slug resolves identically to 404; a lapsed-Pro owner is a 404 with error
// 'unavailable'). Separate endpoint from the existing Kaspi/custom-product
// one: this is the independent wholesale model catalog.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const resolved = await resolvePublicStorefront(slug)
  if (resolved.status === 'unavailable') return NextResponse.json({ error: 'unavailable' }, { status: 404 })
  if (resolved.status !== 'ok') return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const storefront = resolved.storefront

  const [models, categories] = await Promise.all([
    loadWholesaleModels(storefront.connectionId),
    loadStorefrontCategories(storefront.connectionId),
  ])

  return NextResponse.json({
    companyName: storefront.companyName,
    landingEnabled: storefront.landingEnabled,
    landingHistory: storefront.landingHistory,
    landingCapacity: storefront.landingCapacity,
    landingAnnualVolume: storefront.landingAnnualVolume,
    models,
    categories,
  })
}
