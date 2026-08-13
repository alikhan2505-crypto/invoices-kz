import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getKaspiShopWalletBalance } from '@/lib/kaspiShop/wallet'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const balance = await getKaspiShopWalletBalance(user.id)
  const { data: connection } = await supabase
    .from('kaspi_shop_connections')
    .select('paused, session_status, company_name')
    .eq('user_id', user.id)
    .maybeSingle()
  return NextResponse.json({
    balance,
    connected: !!connection,
    paused: connection?.paused ?? false,
    sessionStatus: connection?.session_status ?? null,
    companyName: connection?.company_name ?? null,
  })
}
