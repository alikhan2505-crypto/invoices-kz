import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getWalletBalance } from '@/lib/kaspiPay/wallet'

const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Lightweight balance-only route -- /api/kaspi/dashboard already exposes
// walletBalance but does much more (operations, sync status), too heavy to
// call from a widget that loads on every page. Mirrors the equally
// lightweight GET /api/kaspi-shop/wallet and GET /api/ai-agent/wallet.
export async function GET(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const balance = await getWalletBalance(user.id)
  return NextResponse.json({ balance })
}
