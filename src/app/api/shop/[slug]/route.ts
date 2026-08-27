import { NextRequest, NextResponse } from 'next/server'
import { resolveStorefrontBySlug, loadStorefrontProducts } from '@/lib/kaspiShop/storefront'

// Public, unauthenticated -- the customer opening a seller's shared link is
// never logged in. An unpublished or never-claimed slug resolves identically
// to 404 (see resolveStorefrontBySlug's own comment).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const storefront = await resolveStorefrontBySlug(slug)
  if (!storefront) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const products = await loadStorefrontProducts(storefront.connectionId)
  return NextResponse.json({ companyName: storefront.companyName, products })
}
