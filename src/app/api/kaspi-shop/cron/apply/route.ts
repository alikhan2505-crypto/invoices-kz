import { NextRequest, NextResponse } from 'next/server'
import { applyPriceCheckResult } from '@/lib/kaspiShop/checkCycle'

// Called by the GitHub Actions workflow once per due product, after it has
// fetched (or failed to fetch) that product's competitor price directly
// from kaspi.kz -- see checkCycle.ts for why the fetch itself doesn't
// happen on Vercel.
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-kaspi-shop-cron-secret')
  if (!secret || secret !== process.env.KASPI_SHOP_CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body?.trackedProductId) {
    return NextResponse.json({ error: 'trackedProductId required' }, { status: 400 })
  }

  await applyPriceCheckResult(body.trackedProductId, body.competitorPrice ?? null, body.fetchError ?? null)
  return NextResponse.json({ ok: true })
}
