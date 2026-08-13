import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { submitOtp } from '@/lib/kaspiShop/cabinetAuth'
import { listMerchants, getMerchantInfo } from '@/lib/kaspiShop/cabinetApi'
import { finalizeConnection } from '@/lib/kaspiShop/finalizeConnection'

const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

// Step 2: completes the real cabinet login, then discovers which merchant(s)
// this phone number can manage via listMerchants() (confirmed live
// 2026-08-13 -- one login can reach more than one seller account, e.g. a
// family member added as a user on a relative's shop). A single merchant is
// auto-selected and connected immediately, same behavior as before; more
// than one returns a picker for the seller to choose from, completed by
// POST /api/kaspi-shop/connect/select-merchant.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }
  const { otpToken, code } = body
  if (!otpToken || !code) {
    return NextResponse.json({ error: 'otpToken и code обязательны' }, { status: 400 })
  }

  const loginResult = await submitOtp(otpToken, code)
  if (loginResult.status !== 'success') {
    return NextResponse.json({ error: loginResult.status === 'error' ? loginResult.message : 'Не удалось завершить вход' }, { status: 400 })
  }
  const sessionCookies = loginResult.sessionCookies

  const merchants = await listMerchants(sessionCookies)
  if (merchants.length === 0) {
    return NextResponse.json({ error: 'На этом номере не найдено ни одного магазина Kaspi' }, { status: 400 })
  }

  const named = await Promise.all(merchants.map(async m => {
    const info = await getMerchantInfo(sessionCookies, m.uid)
    return { id: m.uid, name: info?.name || m.uid }
  }))

  if (named.length > 1) {
    return NextResponse.json({
      status: 'merchant_required',
      sessionToken: Buffer.from(sessionCookies, 'utf8').toString('base64'),
      merchants: named,
    })
  }

  const { importedProducts } = await finalizeConnection(user.id, sessionCookies, named[0].id, named[0].name)
  return NextResponse.json({ status: 'connected', companyName: named[0].name, importedProducts })
}
