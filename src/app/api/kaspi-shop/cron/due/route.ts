import { NextRequest, NextResponse } from 'next/server'
import { getDueTrackedProducts } from '@/lib/kaspiShop/checkCycle'
import { secretEquals } from '@/lib/secretEquals'

// Called by the GitHub Actions workflow before it fetches Kaspi directly
// (Vercel's IPs get a persistent 429 from Kaspi's product pages -- see
// checkCycle.ts). Returns which tracked products are due for a check.
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-kaspi-shop-cron-secret')
  if (!secretEquals(secret, process.env.KASPI_SHOP_CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Сбой выборки -- громкий 500, а не пустой список с 200: скрипт GitHub
  // выходит с кодом 1 и запуск краснеет (аудит Kaspi 06.11.2026, K8).
  try {
    const due = await getDueTrackedProducts()
    return NextResponse.json({ due })
  } catch (err: any) {
    console.error('kaspi-shop cron/due: due list failed:', err?.message || err)
    return NextResponse.json({ error: 'due list failed' }, { status: 500 })
  }
}
