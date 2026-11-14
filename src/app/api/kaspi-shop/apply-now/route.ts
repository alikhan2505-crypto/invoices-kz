import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { kaspiShopPlanGate } from '@/lib/kaspiShop/planGate'
import { loadConnection } from '@/lib/kaspiShop/connection'
import { getKaspiShopWalletBalance, KASPI_SHOP_CREDIT_PRICE_TENGE } from '@/lib/kaspiShop/wallet'
import { isSessionActive } from '@/lib/kaspiShop/checkCycle'
import { claimWindowSlot, hourBucket, releaseWindowSlot, windowKey } from '@/lib/windowLimits'
import { isUuid } from '@/lib/uuidFormat'

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

// Не чаще одного запуска «Применить сейчас» за окно на продавца (аудит Kaspi
// 06.11.2026, K14): каждый запуск гоняет весь список товаров к Kaspi, и раньше
// API можно было дёргать подряд. С 07.11.2026 проверка бесплатна (5 ₸ берётся
// только за изменение цены ботом), но лимит остаётся: он бережёт Kaspi и очередь
// GitHub, а не деньги продавца. Счётчик -- общий windowLimits
// (строки tool_kontragent_checks со своим ключом, без новых колонок). Окна
// фиксированные, выровненные по эпохе: на границе окна два нажатия подряд
// пройдут, дальше -- не чаще раза в окно.
const APPLY_NOW_COOLDOWN_MS = 10 * 60_000
const APPLY_NOW_PREFIX = 'kaspiapply'
const APPLY_NOW_USER_PREFIX = 'kaspiapplyh'
const APPLY_NOW_PER_USER_HOUR = 12

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
//   1. Dispatches the SAME "Kaspi Shop price check" workflow the 10-minute
//      schedule already runs, via workflow_dispatch -- exact same pattern
//      as /api/kaspi-shop/niches/request/route.ts (KASPI_SHOP_GITHUB_PAT is
//      already configured for that route; reused here rather than adding a
//      second secret for the same purpose).
//   2. Only AFTER a successful dispatch resets last_checked_at on the target
//      product(s) to null, which makes isCheckDue() report them as due right
//      away instead of waiting out their configured check_frequency_minutes.
//      (Раньше сброс шёл первым: при ненастроенном PAT или отказе GitHub
//      цены в базе уже были сброшены, а проверка так и не запускалась.)
// The workflow then runs getDueTrackedProducts -> real Kaspi fetch ->
// applyPriceCheckResult for these products (and any other due products
// platform-wide, which is correct: it's the same idempotent per-product
// due check either way; a wallet debit happens only for a price change that
// reached Kaspi, one per product per cycle, regardless of what triggered the
// run). Because the actual work happens
// asynchronously in GitHub Actions, this route itself finishes in well
// under a second -- no maxDuration override needed, matching
// niches/request/route.ts (which also doesn't set one).
//
// Ответ: { ok, count, queued } -- сколько товаров реально встанет в проверку;
// страница показывает это продавцу. Стоимости в ответе нет: проверка бесплатна.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const notPro = await kaspiShopPlanGate(user.id)
  if (notPro) return notPro

  const connection = await loadConnection(user.id)
  if (!connection) return NextResponse.json({ error: 'Kaspi Shop не подключён' }, { status: 400 })
  if (connection.paused) return NextResponse.json({ error: 'Демпинг на паузе -- включите его, чтобы применять цены' }, { status: 400 })

  const body = await req.json().catch(() => ({} as any))
  const productId: string | undefined = body?.productId
  if (productId !== undefined && !isUuid(productId)) {
    return NextResponse.json({ error: 'productId должен быть id товара' }, { status: 400 })
  }

  // Мёртвая сессия: бот такие подключения не проверяет -- запускать нечего,
  // честно говорим об этом.
  const { data: sessionRow, error: sessionError } = await supabase
    .from('kaspi_shop_connections')
    .select('session_status')
    .eq('id', connection.id)
    .maybeSingle()
  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 })
  if (!isSessionActive(sessionRow?.session_status)) {
    return NextResponse.json({ error: 'Сессия Kaspi истекла -- переподключите магазин, цены не обновляются' }, { status: 400 })
  }

  // Page-level button (no productId) targets ALL of the ACTIVE store's
  // enabled tracked products, matching Northline's page-level "apply now"
  // scope rather than a single row. Scoped by connection_id, not user_id --
  // with multi-store support a user-wide query would also reset the OTHER
  // store's products. A per-row trigger can still pass productId.
  // Снятые с продажи (available_for_sale = false) бот не проверяет, их не считаем.
  let query = supabase
    .from('kaspi_shop_tracked_products')
    .select('id, available_for_sale')
    .eq('connection_id', connection.id)
    .eq('enabled', true)
  if (productId) query = query.eq('id', productId)
  const { data: found, error: selectError } = await query
  if (selectError) return NextResponse.json({ error: selectError.message }, { status: 500 })
  const targets = (found || []).filter((t: any) => t.available_for_sale !== false)
  if (targets.length === 0) {
    return NextResponse.json({ error: 'Нет активных товаров для проверки' }, { status: 400 })
  }
  const ids = targets.map((t: any) => t.id)

  let balance: number
  try {
    balance = await getKaspiShopWalletBalance(user.id)
  } catch (err: any) {
    console.error('kaspi-shop apply-now: wallet balance read failed for user', user.id, ':', err?.message)
    return NextResponse.json({ error: 'Не удалось проверить баланс, попробуйте ещё раз' }, { status: 500 })
  }
  // Проверка бесплатна, но владельца с балансом меньше цены изменения бот из списка
  // исключает (изменение цены ему не оплатить): запускать было бы нечего.
  if (balance < KASPI_SHOP_CREDIT_PRICE_TENGE) {
    return NextResponse.json({ error: `Баланс меньше ${KASPI_SHOP_CREDIT_PRICE_TENGE} ₸: бот не сможет менять цены, проверка не запущена. Пополните баланс.` }, { status: 400 })
  }

  const token = process.env.KASPI_SHOP_GITHUB_PAT
  if (!token) {
    return NextResponse.json({ error: 'Проверка сейчас недоступна: KASPI_SHOP_GITHUB_PAT не настроен' }, { status: 500 })
  }

  // Занимаем слот ДО запуска (параллельные нажатия не проскакивают) и
  // возвращаем, если запуск не состоялся.
  const now = Date.now()
  const bucket = Math.floor(now / APPLY_NOW_COOLDOWN_MS)
  const slotKey = windowKey(APPLY_NOW_PREFIX, `${user.id}|${productId ?? 'all'}`, bucket)
  const claim = await claimWindowSlot(supabase, slotKey, 1)
  if (!claim.ok) {
    if (claim.reason === 'limit') {
      const retryAfterSeconds = Math.max(1, Math.ceil(((bucket + 1) * APPLY_NOW_COOLDOWN_MS - now) / 1000))
      return NextResponse.json(
        { error: `Проверку можно запускать не чаще раза в ${APPLY_NOW_COOLDOWN_MS / 60_000} минут. Повторите через ${Math.ceil(retryAfterSeconds / 60)} мин.`, retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
      )
    }
    // Счётчик не читается: без лимита запуски можно дёргать подряд, поэтому
    // при неисправном счётчике не запускаем.
    return NextResponse.json({ error: 'Не удалось проверить лимит запуска, попробуйте через минуту' }, { status: 503 })
  }

  // Общий потолок на продавца в час (аудит 14.11.2026): окно выше считается на товар,
  // и по числу включённых товаров продавец мог бы запускать workflow GitHub по раз в
  // 10 минут на каждый. Здесь слот часа; не вышло — слот товара возвращаем.
  const userHourKey = windowKey(APPLY_NOW_USER_PREFIX, user.id, hourBucket(now))
  const userClaim = await claimWindowSlot(supabase, userHourKey, APPLY_NOW_PER_USER_HOUR)
  if (!userClaim.ok) {
    await releaseWindowSlot(supabase, slotKey)
    if (userClaim.reason === 'limit') {
      const retryAfterSeconds = Math.max(60, Math.ceil(((hourBucket(now) + 1) * 3_600_000 - now) / 1000))
      return NextResponse.json(
        { error: 'Слишком много запусков за час. Бот и так проверяет цены сам, повторите позже.', retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
      )
    }
    return NextResponse.json({ error: 'Не удалось проверить лимит запуска, попробуйте через минуту' }, { status: 503 })
  }

  // Сначала запуск проверки...
  let dispatchOk = false
  try {
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
    dispatchOk = dispatchRes.ok
  } catch (err: any) {
    console.error('kaspi-shop apply-now: workflow dispatch threw:', err?.message)
  }
  if (!dispatchOk) {
    await releaseWindowSlot(supabase, slotKey)
    await releaseWindowSlot(supabase, userHourKey)
    return NextResponse.json({ error: 'Не удалось запустить проверку' }, { status: 502 })
  }

  // ...и только потом сброс last_checked_at: проверка уже запущена, товары
  // становятся due «прямо сейчас».
  const { error: resetError } = await supabase
    .from('kaspi_shop_tracked_products')
    .update({ last_checked_at: null })
    .in('id', ids)
  if (resetError) {
    await releaseWindowSlot(supabase, slotKey)
    await releaseWindowSlot(supabase, userHourKey)
    return NextResponse.json({ error: resetError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, count: ids.length, queued: ids.length }, { status: 202 })
}
