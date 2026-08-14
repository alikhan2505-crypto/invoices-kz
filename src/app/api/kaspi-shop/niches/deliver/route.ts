import { NextRequest, NextResponse } from 'next/server'
import { mapNicheResponse } from '@/lib/kaspiShop/niches'
import { completeNicheCheck, failNicheCheck } from '@/lib/kaspiShop/nicheChecks'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-kaspi-shop-cron-secret')
  if (!secret || secret !== process.env.KASPI_SHOP_CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const checkId = body?.checkId
  const upstreamStatus = Number(body?.upstreamStatus) || 0
  const upstreamBodyText = typeof body?.upstreamBodyText === 'string' ? body.upstreamBodyText : ''
  if (!checkId) return NextResponse.json({ error: 'checkId обязателен' }, { status: 400 })

  if (upstreamStatus < 200 || upstreamStatus >= 300) {
    await failNicheCheck(checkId, `Kaspi upstream HTTP ${upstreamStatus}`)
    return NextResponse.json({ ok: true })
  }

  const parsed = (() => { try { return JSON.parse(upstreamBodyText) } catch { return null } })()
  if (!parsed) {
    await failNicheCheck(checkId, 'Kaspi upstream returned a non-JSON response')
    return NextResponse.json({ ok: true })
  }

  const summary = mapNicheResponse(parsed)
  await completeNicheCheck(checkId, summary)
  return NextResponse.json({ ok: true })
}
