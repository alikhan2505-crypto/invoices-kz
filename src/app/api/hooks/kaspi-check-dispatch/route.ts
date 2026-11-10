import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hookSecretOk, throttled } from '@/lib/hooksGuard'
import { getDueTrackedProducts } from '@/lib/kaspiShop/checkCycle'
import { claimDispatchSlot, releaseDispatchSlot } from '@/lib/kaspiShop/dispatchGuard'
import { refreshAgingSessions } from '@/lib/kaspiShop/sessionKeepalive'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const maxDuration = 60

const GITHUB_OWNER = 'alikhan2505-crypto'
const GITHUB_REPO = 'invoices-kz'
const GITHUB_WORKFLOW = 'kaspi-shop-price-check.yml'

// Окно слота запуска: два соседних окна считаются занятыми (dispatchGuard), поэтому
// запуски идут не чаще раза в 5 минут и не накладываются друг на друга (прогон до 9 минут,
// а группа concurrency в самом workflow всё равно ставит лишний в очередь).
const DISPATCH_WINDOW_MS = 5 * 60_000

type Outcome = { body: Record<string, unknown>; status: number }

async function dispatchIfDue(): Promise<Outcome> {
  let dueCount: number
  try {
    dueCount = (await getDueTrackedProducts()).length
  } catch (err: any) {
    console.error('kaspi-check-dispatch: due list failed:', err?.message || err)
    return { body: { error: 'due list failed' }, status: 500 }
  }
  if (dueCount === 0) return { body: { ok: true, due: 0, dispatched: false }, status: 200 }

  const token = process.env.KASPI_SHOP_GITHUB_PAT
  if (!token) {
    console.error('kaspi-check-dispatch: KASPI_SHOP_GITHUB_PAT is not set, price check is not started')
    return { body: { error: 'dispatch token missing' }, status: 500 }
  }

  const claim = await claimDispatchSlot(supabase, 'kaspi-check-dispatch', 'all', DISPATCH_WINDOW_MS)
  if (!claim.ok) {
    if (claim.reason === 'running') return { body: { ok: true, due: dueCount, dispatched: false, reason: 'recent' }, status: 200 }
    return { body: { error: 'dispatch slot unavailable' }, status: 503 }
  }

  let status = 0
  try {
    const res = await fetch(
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
    status = res.status
  } catch (err: any) {
    console.error('kaspi-check-dispatch: workflow dispatch threw:', err?.message)
  }
  if (status < 200 || status >= 300) {
    // Слот не тратим: следующий тик попробует снова. Тело ответа GitHub не логируем и не отдаём.
    await releaseDispatchSlot(supabase, claim.slotKey)
    console.error('kaspi-check-dispatch: workflow dispatch failed, HTTP', status)
    return { body: { error: 'dispatch failed', githubStatus: status }, status: 502 }
  }
  return { body: { ok: true, due: dueCount, dispatched: true }, status: 200 }
}

// Запуск проверки цен Kaspi по расписанию базы (08.11.2026). Расписание GitHub Actions
// `*/10 * * * *` на деле срабатывало раз в 3-7 часов (GitHub придерживает cron в
// репозитории): проверка «раз в час» не выполнялась. pg_cron + pg_net (тот же шаблон, что
// ig-reminders) зовёт этот маршрут каждые 10 минут; маршрут смотрит, есть ли что проверять,
// и только тогда запускает тот же workflow через workflow_dispatch (токен
// KASPI_SHOP_GITHUB_PAT уже используется кнопкой «Применить сейчас»). Сам Kaspi опрашивает
// по-прежнему раннер GitHub: с IP Vercel Kaspi отвечает отказом.
//
// Тем же тиком (10.11.2026) продлеваются сессии кабинета, которым пора (см.
// sessionKeepalive.ts): после запуска проверки, чтобы медленный Kaspi не задерживал её.
// Сбой продления на ответ не влияет; в ответе поле keepalive появляется, только если были
// попытки.
//
// Защита: общий секрет pg_cron-вызовов HOOKS_PG_NET_SECRET (как у welcome-instant): задание
// в базе берёт его из Vault (hooks_pg_net_secret) и шлёт в заголовке x-internal-secret.
// Сверх этого запуск только когда есть что проверять, не чаще раза в 5 минут (слот в базе)
// и не чаще раза в минуту на инстанс. Ответ только счётчики.
export async function POST(req: NextRequest) {
  if (!hookSecretOk(req.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (throttled('kaspi-check-dispatch', 60_000)) return NextResponse.json({ ok: true, throttled: true })

  const outcome = await dispatchIfDue()

  let keepalive: { attempted: number; refreshed: number } | null = null
  try {
    keepalive = await refreshAgingSessions()
  } catch (err: any) {
    console.error('kaspi-check-dispatch: session keepalive failed:', err?.message || err)
  }
  const body = keepalive && keepalive.attempted > 0 ? { ...outcome.body, keepalive } : outcome.body
  return NextResponse.json(body, { status: outcome.status })
}
