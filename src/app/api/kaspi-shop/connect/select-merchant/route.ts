import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { kaspiShopPlanGate } from '@/lib/kaspiShop/planGate'
import { getMerchantInfo, listMerchants } from '@/lib/kaspiShop/cabinetApi'
import { openConnectToken } from '@/lib/kaspiShop/connectTokens'
import { finalizeConnection } from '@/lib/kaspiShop/finalizeConnection'

// Время на фоновое обновление каталога после ответа (after() в finalizeConnection).
export const maxDuration = 300

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
  const notPro = await kaspiShopPlanGate(user.id)
  if (notPro) return notPro

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

  // Токен зашифрован, привязан к этому человеку и живёт 30 минут (connectTokens.ts).
  const sessionCookies = openConnectToken(user.id, 'session', sessionToken)
  if (!sessionCookies) {
    return NextResponse.json({ error: 'sessionToken недействителен или устарел. Войдите в кабинет Kaspi заново.' }, { status: 400 })
  }

  // Выбранный магазин обязан быть среди магазинов этого входа: подмена merchantId не даёт подключить чужой.
  const reachable = await listMerchants(sessionCookies)
  if (!reachable.some(m => m.uid === merchantId)) {
    return NextResponse.json({ error: 'Этот магазин недоступен для вашего входа в Kaspi' }, { status: 400 })
  }

  const merchant = await getMerchantInfo(sessionCookies, merchantId)
  if (!merchant) {
    return NextResponse.json({ error: 'Не удалось получить данные выбранного магазина' }, { status: 400 })
  }

  const { importedProducts, importComplete } = await finalizeConnection(user.id, sessionCookies, merchantId, merchant.name, { runInBackground: after })
  return NextResponse.json({ status: 'connected', companyName: merchant.name, importedProducts, importComplete: importComplete ?? null })
}
