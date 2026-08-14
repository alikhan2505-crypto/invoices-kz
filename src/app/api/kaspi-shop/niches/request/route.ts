import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNicheCheck, failNicheCheck } from '@/lib/kaspiShop/nicheChecks'

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

// Static -- this repo never changes owner/name, so these are constants,
// not env vars.
const GITHUB_OWNER = 'alikhan2505-crypto'
const GITHUB_REPO = 'invoices-kz'
const GITHUB_WORKFLOW = 'kaspi-shop-niche-check.yml'

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const query = body?.query?.trim()
  if (!query) return NextResponse.json({ error: 'query обязателен' }, { status: 400 })

  const checkId = await createNicheCheck(query)

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
