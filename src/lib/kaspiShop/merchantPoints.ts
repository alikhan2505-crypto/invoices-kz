import { createClient } from '@supabase/supabase-js'
import { getMerchantPoints, type MerchantPoint } from './cabinetApi'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Cached on kaspi_shop_connections.merchant_points_cache, refreshed only
// when empty -- same lazy-refresh convention already established for
// city_lookup_cache (settings/cities/route.ts). A merchant's own pickup
// points change rarely; scanning the full catalog (500+ products) on every
// request would be wasteful.
export async function getCachedMerchantPoints(connectionId: string, sessionCookies: string, merchantId: string): Promise<MerchantPoint[]> {
  const { data } = await supabase
    .from('kaspi_shop_connections')
    .select('merchant_points_cache')
    .eq('id', connectionId)
    .maybeSingle()
  const cached = data?.merchant_points_cache as MerchantPoint[] | null
  if (cached && cached.length > 0) return cached

  const points = await getMerchantPoints(sessionCookies, merchantId)
  if (points.length > 0) {
    await supabase.from('kaspi_shop_connections').update({ merchant_points_cache: points }).eq('id', connectionId)
  }
  return points
}
