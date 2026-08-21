import { NextResponse } from 'next/server'

// Entry point for the 24h "trending on Kaspi" cache refresh (see
// src/lib/kaspiShop/nicheTrends.ts and the kaspi_shop_niche_trends
// migration). This route does NOT fetch Kaspi itself -- it can't: Kaspi
// blocks its public search endpoint from Vercel's IP range (same 403
// documented on niches.ts and both existing GitHub Actions scripts), so
// the actual per-category fetching has to happen on a GitHub Actions
// runner. This route's only job is to dispatch that workflow, the same
// way POST /api/kaspi-shop/niches/request does for an on-demand
// single-keyword check -- mirroring that relay shape instead of a new
// one, just triggered by a scheduled GET instead of a user's POST, and
// covering every sampled category in one workflow run instead of one
// query.
//
// The workflow itself (.github/workflows/kaspi-shop-niche-trends.yml)
// also carries its own `on: schedule` trigger (same pattern as
// kaspi-shop-price-check.yml) so the 24h cadence doesn't actually depend
// on this route ever being registered as a Vercel Cron Job -- GitHub
// Actions owns the real schedule. This route exists as: (a) the
// documented, conventional entry point in src/app/api/cron/**, matching
// every other scheduled job in this codebase, and (b) a way to trigger a
// refresh on demand (e.g. from Vercel's own Cron Jobs UI, once/day fits
// well within the Hobby plan's daily-cron limit -- see kaspi-poll's own
// comment on that same limit) without touching GitHub directly.
//
// Suggested external schedule if wired into Vercel Cron: once daily,
// e.g. "17 3 * * *" (03:17 UTC) -- arbitrary off-peak minute, same idea
// as the price-check workflow's own schedule choice.

const GITHUB_OWNER = 'alikhan2505-crypto'
const GITHUB_REPO = 'invoices-kz'
const GITHUB_WORKFLOW = 'kaspi-shop-niche-trends.yml'

export const maxDuration = 30

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = process.env.KASPI_SHOP_GITHUB_PAT
  if (!token) {
    console.error('kaspi-niche-trends cron: KASPI_SHOP_GITHUB_PAT is not configured')
    return NextResponse.json({ error: 'not_configured' }, { status: 500 })
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
      body: JSON.stringify({ ref: 'main', inputs: { triggeredBy: 'vercel-cron' } }),
    }
  )

  if (!dispatchRes.ok) {
    const text = await dispatchRes.text().catch(() => '')
    console.error(`kaspi-niche-trends cron: GitHub dispatch failed: HTTP ${dispatchRes.status} ${text.slice(0, 300)}`)
    return NextResponse.json({ error: 'dispatch_failed' }, { status: 502 })
  }

  return NextResponse.json({ ok: true, dispatched: true })
}
