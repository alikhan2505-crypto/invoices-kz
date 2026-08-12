import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runPriceCheck } from '@/lib/kaspiShop/checkCycle'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Called by a free external scheduler (GitHub Actions, see the workflow
// file) every 5-15 minutes -- Vercel Hobby's cron is capped at once/day,
// far too coarse for competitive repricing. A dedicated secret (not
// IG_AUTOMATION_SECRET) -- one secret per integration.
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-kaspi-shop-cron-secret')
  if (!secret || secret !== process.env.KASPI_SHOP_CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: due } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('id, last_checked_at, check_frequency_minutes')
    .eq('enabled', true)

  const now = Date.now()
  const dueIds = (due || [])
    .filter(p => {
      if (!p.last_checked_at) return true
      const elapsedMinutes = (now - new Date(p.last_checked_at).getTime()) / 60000
      return elapsedMinutes >= p.check_frequency_minutes
    })
    .map(p => p.id)

  // Sequential, not Promise.all -- each check cycle does a real Kaspi page
  // fetch; bounding concurrency avoids hammering Kaspi's servers from a
  // single scheduler tick with a large tracked-product count.
  for (const id of dueIds) {
    await runPriceCheck(id)
  }

  return NextResponse.json({ checked: dueIds.length })
}
