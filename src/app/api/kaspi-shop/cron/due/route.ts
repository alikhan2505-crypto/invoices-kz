import { NextRequest, NextResponse } from 'next/server'
import { getDueTrackedProducts } from '@/lib/kaspiShop/checkCycle'

// Called by the GitHub Actions workflow before it fetches Kaspi directly
// (Vercel's IPs get a persistent 429 from Kaspi's product pages -- see
// checkCycle.ts). Returns which tracked products are due for a check.
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-kaspi-shop-cron-secret')
  if (!secret || secret !== process.env.KASPI_SHOP_CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const due = await getDueTrackedProducts()
  return NextResponse.json({ due })
}
