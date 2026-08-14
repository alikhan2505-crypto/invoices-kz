import { NextRequest, NextResponse } from 'next/server'
import { applyPriceCheckResult } from '@/lib/kaspiShop/checkCycle'

// Called by the GitHub Actions workflow once per due product, after it has
// fetched (or failed to fetch) that product's raw competitor offers
// directly from kaspi.kz -- see checkCycle.ts for why the fetch itself
// doesn't happen on Vercel, and for why filtering by excluded_merchant_ids
// happens here (server-side, where the product's exclusion list already
// lives) rather than in the GitHub Actions script.
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-kaspi-shop-cron-secret')
  if (!secret || secret !== process.env.KASPI_SHOP_CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body?.trackedProductId) {
    return NextResponse.json({ error: 'trackedProductId required' }, { status: 400 })
  }

  await applyPriceCheckResult(body.trackedProductId, body.competitorOffers ?? null, body.fetchError ?? null)
  return NextResponse.json({ ok: true })
}
