import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { saveConnection } from '@/lib/kaspiShop/connection'

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

// Validates the token against a real, confirmed Kaspi Merchant API endpoint
// (the products/import JSON-schema endpoint) before we ever store it --
// catches a typo'd or already-revoked token immediately instead of only
// discovering it on the next scheduled check cycle.
async function validateKaspiToken(apiToken: string): Promise<boolean> {
  try {
    const res = await fetch('https://kaspi.kz/shop/api/products/import/schema', {
      headers: { 'X-Auth-Token': apiToken, 'Accept': 'application/json' },
    })
    return res.ok
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { apiToken, merchantId, companyName } = await req.json()
  if (!apiToken || !merchantId || !companyName) {
    return NextResponse.json({ error: 'apiToken, merchantId and companyName are required' }, { status: 400 })
  }

  const valid = await validateKaspiToken(apiToken)
  if (!valid) {
    return NextResponse.json({ error: 'Kaspi отклонил токен — проверьте, что он скопирован верно и не истёк' }, { status: 400 })
  }

  await saveConnection({ userId: user.id, apiToken, merchantId, companyName })
  return NextResponse.json({ ok: true })
}
