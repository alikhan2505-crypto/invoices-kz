import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { startPhoneLogin } from '@/lib/kaspiShop/cabinetAuth'

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

// Step 1 of the real cabinet login (phone + SMS, confirmed live 2026-08-13
// -- see docs/superpowers/specs/2026-08-12-kaspi-cabinet-api-findings.md).
// Nothing is saved yet -- POST /api/kaspi-shop/connect/otp completes the
// login and does the actual save + auto-import.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }
  const { phone, merchantId } = body
  if (!phone || !merchantId) {
    return NextResponse.json({ error: 'phone и merchantId обязательны' }, { status: 400 })
  }

  const result = await startPhoneLogin(phone)
  if (result.status !== 'otp_required') {
    return NextResponse.json({ error: result.status === 'error' ? result.message : 'Неожиданный ответ Kaspi' }, { status: 400 })
  }
  return NextResponse.json({ status: 'otp_required', otpToken: result.otpToken })
}
