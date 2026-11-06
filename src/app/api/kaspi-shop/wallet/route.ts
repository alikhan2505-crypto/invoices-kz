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

// Deliberately NOT behind kaspiShopPlanGate (unlike the cabinet routes):
// the balance is the shared tenge wallet, and the wallet/* routes only read
// it, list its ledger, or top it up -- none of that is a Pro feature.
export async function GET(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Сбой базы не должен превращаться ни в «не подключён» (страница Демпинг по
  // connected:false показывает обязательное окно подключения живому продавцу),
  // ни в необработанное исключение без тела: отвечаем честным 500 с JSON, а
  // страница показывает ошибку с кнопкой «Повторить» (аудит Kaspi 2026-11-06, K12).
  try {
    const balance = await getKaspiShopWalletBalance(user.id)
    const { data: connection, error: connectionError } = await supabase
      .from('kaspi_shop_connections')
      .select('paused, session_status, company_name, tracked_city_codes, city_lookup_cache')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()
    if (connectionError) throw new Error(connectionError.message)
    return NextResponse.json({
      balance,
      connected: !!connection,
      paused: connection?.paused ?? false,
      sessionStatus: connection?.session_status ?? null,
      companyName: connection?.company_name ?? null,
      trackedCityCodes: connection?.tracked_city_codes ?? [],
      cityLookupCache: connection?.city_lookup_cache ?? {},
    })
  } catch (err: any) {
    console.error('kaspi-shop wallet GET failed:', err?.message)
    return NextResponse.json({ error: 'Не удалось загрузить баланс и подключение. Попробуйте ещё раз.' }, { status: 500 })
  }
}
