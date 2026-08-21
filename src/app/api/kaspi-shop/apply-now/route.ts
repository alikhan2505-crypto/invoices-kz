import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection } from '@/lib/kaspiShop/connection'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
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

// Same repo constants as /api/kaspi-shop/niches/request -- static because
// this repo never changes owner/name, not an env var.
const GITHUB_OWNER = 'alikhan2505-crypto'
const GITHUB_REPO = 'invoices-kz'
const GITHUB_WORKFLOW = 'kaspi-shop-price-check.yml'

// "Применить сейчас" on /kaspi-shop. IMPORTANT: this route does NOT fetch
// competitor prices itself, and never will from Vercel -- Kaspi returns a
// persistent HTTP 429/403 to the offer-fetch endpoint from Vercel's IP
// ranges (confirmed live 2026-08-12/2026-08-14, see the long comment above
// getDueTrackedProducts in src/lib/kaspiShop/checkCycle.ts and the header
// comment in .github/scripts/kaspi-shop-price-check.mjs). The real fetch
// only works from a GitHub Actions runner with a full browser-like header
// set. So instead of re-implementing a fetch here that's architecturally
// guaranteed to fail, this route does the two things that ARE safe to do
// from Vercel:
//   1. Resets last_checked_at on the target product(s) to null, which makes
//      isCheckDue() report them as due right away instead of waiting out
//      their configured check_frequency_minutes.
//   2. Dispatches the SAME "Kaspi Shop price check" workflow the 10-minute
//      schedule already runs, via workflow_dispatch -- exact same pattern
//      as /api/kaspi-shop/niches/request/route.ts (KASPI_SHOP_GITHUB_PAT is
//      already configured for that route; reused here rather than adding a
//      second secret for the same purpose).
// The workflow then runs getDueTrackedProducts -> real Kaspi fetch ->
// applyPriceCheckResult for these products (and any other due products
// platform-wide, which is correct: it's the same idempotent per-product
// due check either way, one credit debit per product per cycle regardless
// of what triggered the run). Because the actual work happens
// asynchronously in GitHub Actions, this route itself finishes in well
// under a second -- no maxDuration override needed, matching
// niches/request/route.ts (which also doesn't set one).
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const connection = await loadConnection(user.id)
  if (!connection) return NextResponse.json({ error: 'Kaspi Shop не подключён' }, { status: 400 })
  if (connection.paused) return NextResponse.json({ error: 'Демпинг на паузе -- включите его, чтобы применять цены' }, { status: 400 })

  const body = await req.json().catch(() => ({} as any))
  const productId: string | undefined = body?.productId

  // Page-level button (no productId) targets ALL of the ACTIVE store's
  // enabled tracked products, matching Northline's page-level "apply now"
  // scope rather than a single row. Scoped by connection_id, not user_id --
  // with multi-store support a user-wide query would also reset the OTHER
  // store's products. A per-row trigger can still pass productId.
  let query = supabase
    .from('kaspi_shop_tracked_products')
    .select('id')
    .eq('connection_id', connection.id)
    .eq('enabled', true)
  if (productId) query = query.eq('id', productId)
  const { data: targets, error: selectError } = await query
  if (selectError) return NextResponse.json({ error: selectError.message }, { status: 500 })
  if (!targets || targets.length === 0) {
    return NextResponse.json({ error: 'Нет активных товаров для проверки' }, { status: 400 })
  }

  const ids = targets.map((t: any) => t.id)
  const { error: resetError } = await supabase
    .from('kaspi_shop_tracked_products')
    .update({ last_checked_at: null })
    .in('id', ids)
  if (resetError) return NextResponse.json({ error: resetError.message }, { status: 500 })

  const token = process.env.KASPI_SHOP_GITHUB_PAT
  if (!token) {
    return NextResponse.json({ error: 'Проверка сейчас недоступна: KASPI_SHOP_GITHUB_PAT не настроен' }, { status: 500 })
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
      body: JSON.stringify({ ref: 'main' }),
    }
  )
  if (!dispatchRes.ok) {
    return NextResponse.json({ error: 'Не удалось запустить проверку' }, { status: 502 })
  }

  return NextResponse.json({ ok: true, queued: ids.length }, { status: 202 })
}
