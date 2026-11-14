import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNicheCheck, failNicheCheck } from '@/lib/kaspiShop/nicheChecks'
import { getKaspiShopWalletBalance, KASPI_SHOP_CREDIT_PRICE_TENGE } from '@/lib/kaspiShop/wallet'
import { kaspiShopPlanGate } from '@/lib/kaspiShop/planGate'
import { claimWindowSlot, releaseWindowSlot, windowKey, hourBucket } from '@/lib/windowLimits'

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

// Защита от цикла запросов (аудит Kaspi 06.11.2026, K42): каждый запуск workflow
// ходит в Kaspi с общего IP раннера, а токен GitHub общий для репрайсера, ниш и
// отзывов. Две части: 1) пока предыдущая проверка этого продавца ещё pending (строка
// в kaspi_niche_checks), новую не запускаем; 2) не больше NICHE_HOURLY_LIMIT запусков
// в час на продавца (счётчик windowLimits, как у «Применить сейчас»).
const NICHE_PENDING_WINDOW_MS = 3 * 60_000
const NICHE_HOURLY_LIMIT = 30
const NICHE_PREFIX = 'kaspiniche'
// Короткий замок на продавца на время «проверить pending и создать строку»: без него два
// параллельных запроса оба видят пустой pending и оба запускают проверку. Замок это
// слот windowLimits с лимитом 1; снимается сразу после создания строки (дальше её
// видит pending-проверка), а ключ привязан к минутному окну, чтобы упавший процесс не
// держал замок дольше минуты.
const NICHE_LOCK_PREFIX = 'kaspinichelock'
const NICHE_LOCK_WINDOW_MS = 60_000

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const notPro = await kaspiShopPlanGate(user.id)
  if (notPro) return notPro

  const body = await req.json().catch(() => null)
  // Строка и не длиннее 200 символов (аудит 14.11.2026): не-строка раньше давала 500,
  // а длина была не ограничена и уходила в запуск проверки и в базу.
  const query = typeof body?.query === 'string' ? body.query.trim() : ''
  if (!query) return NextResponse.json({ error: 'query обязателен' }, { status: 400 })
  if (query.length > 200) return NextResponse.json({ error: 'query слишком длинный: не больше 200 символов' }, { status: 400 })

  // Real per-check cost, same wallet/price the репрайсер's own price checks
  // already debit (2026-09-03, founder: monetize genuinely valuable
  // on-demand actions like this one, mirroring what competitors already
  // charge separately for their own niche-research tools). Charged only on
  // successful delivery (niches/deliver/route.ts) -- refused up front here
  // so a check that will fail for lack of balance never even dispatches.
  if ((await getKaspiShopWalletBalance(user.id)) < KASPI_SHOP_CREDIT_PRICE_TENGE) {
    return NextResponse.json({ error: 'insufficient_balance' }, { status: 402 })
  }

  const token = process.env.KASPI_SHOP_GITHUB_PAT
  if (!token) {
    console.error('kaspi-shop niches/request: KASPI_SHOP_GITHUB_PAT is not configured')
    return NextResponse.json({ error: 'Проверка ниш временно недоступна' }, { status: 500 })
  }

  // Замок на «проверить pending и создать строку» (см. NICHE_LOCK_PREFIX): параллельный
  // запрос этого же продавца получает «уже идёт», а не запускает вторую проверку.
  const lockKey = windowKey(NICHE_LOCK_PREFIX, user.id, Math.floor(Date.now() / NICHE_LOCK_WINDOW_MS))
  const lock = await claimWindowSlot(supabase, lockKey, 1)
  if (!lock.ok) {
    if (lock.reason === 'limit') {
      return NextResponse.json(
        { error: 'Предыдущая проверка ещё запускается. Подождите несколько секунд.', alreadyRunning: true },
        { status: 429, headers: { 'Retry-After': '5' } }
      )
    }
    return NextResponse.json({ error: 'Не удалось проверить, идёт ли прошлая проверка. Попробуйте через минуту.' }, { status: 503 })
  }

  let checkId: string
  let slotKey: string
  try {
    // Проверка уже идёт: говорим об этом и отдаём её id, а не запускаем вторую. Старше
    // NICHE_PENDING_WINDOW_MS pending считаем зависшей (раннер не прислал результат).
    const pendingSince = new Date(Date.now() - NICHE_PENDING_WINDOW_MS).toISOString()
    const { data: pendingRows, error: pendingError } = await supabase
      .from('kaspi_niche_checks')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .gte('created_at', pendingSince)
    if (pendingError) {
      console.error('kaspi-shop niches/request: pending lookup failed:', pendingError.message)
      return NextResponse.json({ error: 'Не удалось проверить, идёт ли прошлая проверка. Попробуйте через минуту.' }, { status: 503 })
    }
    if ((pendingRows || []).length > 0) {
      return NextResponse.json(
        { error: 'Предыдущая проверка ещё идёт. Дождитесь результата, обычно это 15–30 секунд.', alreadyRunning: true, checkId: pendingRows![0].id },
        { status: 429, headers: { 'Retry-After': '30' } }
      )
    }

    slotKey = windowKey(NICHE_PREFIX, user.id, hourBucket())
    const claim = await claimWindowSlot(supabase, slotKey, NICHE_HOURLY_LIMIT)
    if (!claim.ok) {
      if (claim.reason === 'limit') {
        return NextResponse.json({ error: 'Слишком много проверок за час. Повторите чуть позже.' }, { status: 429, headers: { 'Retry-After': '600' } })
      }
      return NextResponse.json({ error: 'Не удалось проверить лимит запуска, попробуйте через минуту' }, { status: 503 })
    }

    try {
      checkId = await createNicheCheck(query, user.id)
    } catch (err: any) {
      await releaseWindowSlot(supabase, slotKey)
      console.error('kaspi-shop niches/request: create check failed:', err?.message)
      return NextResponse.json({ error: 'Не удалось запустить проверку' }, { status: 500 })
    }
  } finally {
    await releaseWindowSlot(supabase, lockKey)
  }

  let dispatchRes: Response | null = null
  try {
    dispatchRes = await fetch(
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
  } catch (err: any) {
    console.error('kaspi-shop niches/request: GitHub dispatch threw:', err?.message)
  }
  if (!dispatchRes || !dispatchRes.ok) {
    // Запуска не было: проверка закрывается ошибкой (иначе её pending блокировал бы
    // следующую попытку на несколько минут), слот возвращается.
    await failNicheCheck(checkId, dispatchRes ? `GitHub dispatch failed: HTTP ${dispatchRes.status}` : 'GitHub dispatch failed').catch(() => {})
    await releaseWindowSlot(supabase, slotKey)
    return NextResponse.json({ error: 'Не удалось запустить проверку' }, { status: 500 })
  }

  return NextResponse.json({ checkId }, { status: 202 })
}
