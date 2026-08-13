import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getMerchantInfo } from '@/lib/kaspiShop/cabinetApi'
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

// Step 3, only reached when connect/otp found more than one merchant on the
// logged-in phone number. sessionToken carries the already-authenticated
// session (no re-login needed) -- just the plain cookie header, base64'd to
// survive the round trip through the browser the same way otpToken does.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }
  const { sessionToken, merchantId } = body
  if (!sessionToken || !merchantId) {
    return NextResponse.json({ error: 'sessionToken и merchantId обязательны' }, { status: 400 })
  }

  let sessionCookies: string
  try {
    sessionCookies = Buffer.from(sessionToken, 'base64').toString('utf8')
  } catch {
    return NextResponse.json({ error: 'sessionToken недействителен' }, { status: 400 })
  }

  const merchant = await getMerchantInfo(sessionCookies, merchantId)
  if (!merchant) {
    return NextResponse.json({ error: 'Не удалось получить данные выбранного магазина' }, { status: 400 })
  }

  const { importedProducts } = await finalizeConnection(user.id, sessionCookies, merchantId, merchant.name)
  return NextResponse.json({ status: 'connected', companyName: merchant.name, importedProducts })
}
