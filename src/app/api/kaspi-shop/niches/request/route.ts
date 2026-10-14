import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNicheCheck, failNicheCheck } from '@/lib/kaspiShop/nicheChecks'
import { getKaspiShopWalletBalance, KASPI_SHOP_CREDIT_PRICE_TENGE } from '@/lib/kaspiShop/wallet'
import { kaspiShopPlanGate } from '@/lib/kaspiShop/planGate'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Kaspi Bot access (admin or Pro, widened from admin-only 2026-09-03) is
// required to start a check; the check row records who asked (user_id), and
// the result route only hands it back to that same user.
// 401 only for a missing/invalid token; a logged-in user without Kaspi Bot
// access (admin or canKaspiShop) gets the shared 403 { errorCode:'not_pro' }
// from kaspiShopPlanGate (14.10.2026 -- this used to answer a non-Pro seller
// with a misleading 401 "Unauthorized").
async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

// Static -- this repo never changes owner/name, so these are constants,
// not env vars.
const GITHUB_OWNER = 'alikhan2505-crypto'
const GITHUB_REPO = 'invoices-kz'
const GITHUB_WORKFLOW = 'kaspi-shop-niche-check.yml'

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const notPro = await kaspiShopPlanGate(user.id)
  if (notPro) return notPro

  const body = await req.json().catch(() => null)
  const query = body?.query?.trim()
  if (!query) return NextResponse.json({ error: 'query обязателен' }, { status: 400 })

  // Real per-check cost, same wallet/price the репрайсер's own price checks
  // already debit (2026-09-03, founder: monetize genuinely valuable
  // on-demand actions like this one, mirroring what competitors already
  // charge separately for their own niche-research tools). Charged only on
  // successful delivery (niches/deliver/route.ts) -- refused up front here
  // so a check that will fail for lack of balance never even dispatches.
  if ((await getKaspiShopWalletBalance(user.id)) < KASPI_SHOP_CREDIT_PRICE_TENGE) {
    return NextResponse.json({ error: 'insufficient_balance' }, { status: 402 })
  }

  const checkId = await createNicheCheck(query, user.id)

  const token = process.env.KASPI_SHOP_GITHUB_PAT
  if (!token) {
    await failNicheCheck(checkId, 'KASPI_SHOP_GITHUB_PAT is not configured')
    return NextResponse.json({ error: 'Проверка ниш временно недоступна' }, { status: 500 })
  }

  const dispatchRes = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main', inputs: { checkId, query } }),
    }
  )
  if (!dispatchRes.ok) {
    await failNicheCheck(checkId, `GitHub dispatch failed: HTTP ${dispatchRes.status}`)
    return NextResponse.json({ error: 'Не удалось запустить проверку' }, { status: 500 })
  }

  return NextResponse.json({ checkId }, { status: 202 })
}
