import { NextRequest, NextResponse } from 'next/server'
import { mapNicheResponse } from '@/lib/kaspiShop/niches'
import { completeNicheCheck, failNicheCheck } from '@/lib/kaspiShop/nicheChecks'
import { debitKaspiShopWallet } from '@/lib/kaspiShop/wallet'

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
    console.error(`kaspi-shop niches deliver: upstream HTTP ${upstreamStatus}, body: ${upstreamBodyText.slice(0, 500)}`)
    await failNicheCheck(checkId, `Не удалось получить данные с Kaspi (HTTP ${upstreamStatus})`)
    return NextResponse.json({ ok: true })
  }

  const parsed = (() => { try { return JSON.parse(upstreamBodyText) } catch { return null } })()
  if (!parsed) {
    console.error(`kaspi-shop niches deliver: non-JSON response, body: ${upstreamBodyText.slice(0, 500)}`)
    await failNicheCheck(checkId, 'Kaspi вернул неожиданный ответ')
    return NextResponse.json({ ok: true })
  }

  const summary = mapNicheResponse(parsed)
  if (summary.total === 0 && summary.products.length === 0) {
    console.error(`kaspi-shop niches deliver: parsed OK but summary is empty, raw body: ${upstreamBodyText.slice(0, 500)}`)
  }
  const { userId, query } = await completeNicheCheck(checkId, summary)
  // Charged on any real delivered result, empty or not (matches
  // checkCycle.ts's own per-check debit, which charges for a real attempt
  // regardless of whether it found a cheaper competitor) -- only a genuine
  // upstream/parse failure above skips the charge entirely.
  if (userId) {
    try {
      await debitKaspiShopWallet(userId, 1, `Проверка идеи: ${query}`)
    } catch (err: any) {
      console.error(`kaspi-shop niches deliver: wallet debit failed for user ${userId}:`, err.message)
    }
  }
  return NextResponse.json({ ok: true })
}
