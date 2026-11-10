import { createClient } from '@supabase/supabase-js'
import { computeRepriceCandidate, DempingStrategy, resolveTargetCities, computePerCityReprice, computeMarketPosition, CompetitorOffer, CityOffers } from './pricing'
import { debitKaspiShopWallet, getKaspiShopWalletBalance, KASPI_SHOP_CREDIT_PRICE_TENGE } from './wallet'
import { getKey, markSessionExpired, refreshStoredSession } from './connection'
import { decryptAtRest } from '@/lib/kaspiPay/crypto'
import { isWithinBudget, KASPI_RATE_LIMIT_WINDOW_MS } from './rateLimitBudget'
import { pushOfferState } from './cabinetPricePush'
import { fetchOfferDetails } from './cabinetApi'
import { filterByOwnerAccess, loadOwnerPlanProfiles, ownerHasKaspiShopAccess } from './planGate'
import { checkDueAfterMinutes } from './dempingForm'
import { notifyLowBalanceOwners } from './lowBalanceNotice'

// All of the offer's bare point codes, read from the offer details (deep
// scan for storeId-carrying objects -- no guessed key paths). Falls back to
// the single store_id the tracked product row carries when nothing is
// recognized: pushing with one point risks zeroing the others' наличие
// (confirmed live 2026-08-21), but pushing with NONE is not an option.
async function fetchOfferPointCodes(sessionCookies: string, merchantId: string, sku: string, fallback: string): Promise<string[]> {
  const details = await fetchOfferDetails(sessionCookies, merchantId, sku)
  const codes = new Set<string>()
  function walk(node: any) {
    if (Array.isArray(node)) { for (const item of node) walk(item); return }
    if (!node || typeof node !== 'object') return
    const rawStoreId = node.storeId ?? node.pointId ?? null
    if (typeof rawStoreId === 'string' && rawStoreId.length > 0) {
      codes.add(rawStoreId.startsWith(`${merchantId}_`) ? rawStoreId.slice(merchantId.length + 1) : rawStoreId)
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') walk(value)
    }
  }
  if (details) walk(details)
  if (codes.size === 0 && fallback) codes.add(fallback)
  return Array.from(codes)
}
import { sendTelegramNotification } from '@/lib/telegramNotify'
import { FLOOR_ALERT_INTERVAL_MS, wantsNotification } from '@/lib/notificationPrefs'
import { isMissingSchemaError, loadNotifyProfile } from '@/lib/notificationPrefsServer'
import { escapeHtml } from '@/lib/htmlEscape'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// «Цена упёрлась в минимум» — не чаще раза в сутки на товар (раньше уходило
// на каждом цикле проверки, пока товар стоял на минимуме). Атомарный захват
// по floor_alert_sent_at: из параллельных циклов отправит только один.
// До миграции (колонки нет) — только при переходе «не на минимуме → на
// минимуме» (held_at_floor прошлой проверки), т.е. раз за эпизод.
// Возвращает null — слот не наш (уже слали за сутки / ошибка); иначе — чем
// слот освободить, если отправка не удалась (см. alertFloorPriceOnce).
type FloorAlertClaim = { stampedAt: string | null }

async function claimFloorAlert(trackedProductId: string, wasHeldAtFloor: boolean): Promise<FloorAlertClaim | null> {
  const now = new Date()
  const stampedAt = now.toISOString()
  const since = new Date(now.getTime() - FLOOR_ALERT_INTERVAL_MS).toISOString()
  const { data, error } = await supabase
    .from('kaspi_shop_tracked_products')
    .update({ floor_alert_sent_at: stampedAt })
    .eq('id', trackedProductId)
    .or(`floor_alert_sent_at.is.null,floor_alert_sent_at.lt."${since}"`)
    .select('id')
  if (!error) return (data?.length ?? 0) > 0 ? { stampedAt } : null
  if (isMissingSchemaError(error, 'floor_alert_sent_at')) return wasHeldAtFloor ? null : { stampedAt: null }
  // Не знаем, слали ли уже, — лучше промолчать, чем спамить каждый цикл.
  console.error('kaspi-shop checkCycle: floor alert claim failed for product', trackedProductId, ':', error.message)
  return null
}

// Отправка не удалась — возвращаем слот, чтобы следующий цикл попробовал
// снова, а не молчал сутки. Только если в колонке всё ещё НАША отметка
// (параллельный цикл мог успеть своё). NULL равнозначен «давно не слали»
// для условия захвата выше.
async function releaseFloorAlert(trackedProductId: string, claim: FloorAlertClaim): Promise<void> {
  if (!claim.stampedAt) return // до миграции освобождать нечего
  const { error } = await supabase
    .from('kaspi_shop_tracked_products')
    .update({ floor_alert_sent_at: null })
    .eq('id', trackedProductId)
    .eq('floor_alert_sent_at', claim.stampedAt)
  if (error) console.error('kaspi-shop checkCycle: floor alert release failed for product', trackedProductId, ':', error.message)
}

// Best-effort: never throws.
async function alertFloorPriceOnce(userId: string, trackedProductId: string, wasHeldAtFloor: boolean, text: string): Promise<void> {
  try {
    const profile = await loadNotifyProfile(supabase, userId)
    if (!wantsNotification(profile, 'kaspi_floor_price', 'telegram')) return
    const claim = await claimFloorAlert(trackedProductId, wasHeldAtFloor)
    if (!claim) return
    const sent = await sendTelegramNotification(profile!.telegram_chat_id as string, text)
    if (!sent) await releaseFloorAlert(trackedProductId, claim)
  } catch (err: any) {
    console.error('kaspi-shop checkCycle: floor alert failed for product', trackedProductId, ':', err?.message || err)
  }
}

export type DueTrackedProduct = { id: string; kaspiSku: string; kaspiMasterSku: string; targetCities: string[] }

// Pure predicate, factored out of getDueTrackedProducts below so the
// "Готовы применить" stat on /kaspi-shop (GET /api/kaspi-shop/products,
// scoped to one user) can compute the exact same due/not-due answer instead
// of a second, slightly different reimplementation of the elapsed-minutes
// math that could silently drift from this one over time.
//
// Порог не равен check_frequency_minutes «в лоб»: запуски идут раз в 10 минут, а
// last_checked_at пишется внутри запуска, поэтому «60 минут» по часам созревало бы
// только на втором тике (70). checkDueAfterMinutes округляет частоту до целого числа
// тиков и опускает порог на 9 минут (см. dempingForm.ts), чтобы 60 действительно
// означало раз в час, а подпись на странице совпадала с этой логикой.
export function isCheckDue(lastCheckedAt: string | null, checkFrequencyMinutes: number, now: number = Date.now()): boolean {
  if (!lastCheckedAt) return true
  const elapsedMinutes = (now - new Date(lastCheckedAt).getTime()) / 60000
  return elapsedMinutes >= checkDueAfterMinutes(checkFrequencyMinutes)
}

// Сессия кабинета пригодна для работы бота. Пустой статус у старых строк
// считается active -- как и в connection.ts (`row.session_status || 'active'`).
export function isSessionActive(status: string | null | undefined): boolean {
  return status == null || status === 'active'
}

// PostgREST отдаёт встроенное подключение объектом или массивом из одного
// элемента, в зависимости от объявления FK.
function joinedConnection(row: any): any {
  const c = row?.kaspi_shop_connections
  return Array.isArray(c) ? c[0] ?? null : c ?? null
}

// Баланс кошелька (profiles.kaspi_wallet_balance) для набора владельцев одним
// запросом на пачку -- тот же источник, что и getKaspiShopWalletBalance в
// applyPriceCheckResult. Сбой чтения -- исключение: лучше красный запуск, чем
// списывать со всех или молча пропустить всех.
const WALLET_BALANCE_CHUNK = 200
async function loadOwnerWalletBalances(userIds: (string | null | undefined)[]): Promise<Map<string, number>> {
  const ids = Array.from(new Set(userIds.filter((id): id is string => !!id)))
  const byId = new Map<string, number>()
  for (let i = 0; i < ids.length; i += WALLET_BALANCE_CHUNK) {
    const chunk = ids.slice(i, i + WALLET_BALANCE_CHUNK)
    const { data, error } = await supabase.from('profiles').select('id, kaspi_wallet_balance').in('id', chunk)
    if (error) throw new Error(`owner wallet balances lookup failed: ${error.message}`)
    for (const row of (data || []) as any[]) byId.set(row.id, Number(row.kaspi_wallet_balance) || 0)
  }
  return byId
}

// Kaspi returns a persistent HTTP 429 to its public product pages from
// Vercel's IP ranges (confirmed live 2026-08-12: identical block across 4
// attempts spanning 3.5 hours, no Retry-After/rate-limit headers -- not a
// transient throttle). A direct probe from a GitHub Actions runner IP got a
// clean 404 for the same nonexistent test SKU, so the actual fetch to
// kaspi.kz now happens from the GitHub Actions workflow itself (see
// .github/workflows/kaspi-shop-price-check.yml and its script). This
// function only reports which products are due; applyPriceCheckResult below
// takes the already-fetched competitor price and does the rest.
//
// Pro gate (founder decision 14.10.2026): a product whose connection owner
// is neither admin nor on an active Pro plan is left out of the due list --
// no Kaspi price change, no wallet charge. Nothing is flipped (enabled /
// paused stay as the seller set them), so renewing Pro resumes the bot by
// itself. Owner profiles are loaded once for the whole due batch. A failed
// profile read throws (the cron route 500s, the GitHub Actions run fails
// loudly) rather than either charging everyone or silently skipping all.
//
// Аудит Kaspi 06.11.2026 (K4/K8/K10/K20/K21/K43/K44): в список попадает только
// то, что бот реально может и вправе проверить за деньги продавца:
//  - сбой самого запроса -- исключение (cron/due отвечает 500, GitHub красный),
//    а не молчаливый пустой список;
//  - сессия кабинета не active -- пропуск (цену всё равно не отправить, а
//    проверка раньше списывалась и крутилась по кругу);
//  - товар снят с продажи в кабинете (available_for_sale = false) -- пропуск,
//    иначе пуш с available:'yes' вернул бы его в продажу;
//  - баланс владельца меньше 5 ₸ -- пропуск: изменение цены ему не оплатить, а
//    раньше такие товары оставались due вечно и бегунок GitHub впустую ходил в
//    Kaspi за каждым. Владельцу раз в сутки уходит колокольчик (lowBalanceNotice).
// Ничего не выключается и не удаляется: пополнил кошелёк / переподключил
// кабинет -- бот поехал дальше сам.
export async function getDueTrackedProducts(): Promise<DueTrackedProduct[]> {
  const { data: due, error: dueError } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('id, user_id, kaspi_sku, kaspi_master_sku, last_checked_at, check_frequency_minutes, enabled, available_for_sale, excluded_city_codes, point_city_codes, kaspi_shop_connections(user_id, paused, session_status, tracked_city_codes)')
    .eq('enabled', true)
  if (dueError) throw new Error(`due tracked products lookup failed: ${dueError.message}`)

  const now = Date.now()
  const dueNow = (due || []).filter((p: any) => {
    const conn = joinedConnection(p)
    // Без подключения цену отправить некуда (apply всё равно вернётся).
    if (!conn || conn.paused) return false
    if (!isSessionActive(conn.session_status)) return false
    if (p.available_for_sale === false) return false
    return isCheckDue(p.last_checked_at, p.check_frequency_minutes, now)
  })
  const ownerOf = (p: any): string | null => joinedConnection(p)?.user_id ?? p.user_id ?? null
  const ownerProfiles = await loadOwnerPlanProfiles(dueNow.map(ownerOf))
  const allowed = filterByOwnerAccess(dueNow, ownerOf, ownerProfiles)
  // Кошелёк списывается с p.user_id (см. applyPriceCheckResult) -- по нему и смотрим.
  const walletOwnerOf = (p: any): string | null => p.user_id ?? ownerOf(p)
  const balances = await loadOwnerWalletBalances(allowed.map(walletOwnerOf))
  // Правило основателя 07.11.2026: проверка бесплатна, 5 ₸ берётся только за
  // изменение цены. Владелец с балансом меньше 5 ₸ оплатить изменение не может,
  // поэтому бот ему цены не меняет, и ходить в Kaspi за его товарами незачем:
  // они в список не попадают. Раз в сутки такому владельцу уходит колокольчик
  // (Telegram по настройке — дневная сводка, она уже зовёт пополнить кошелёк).
  const lowBalanceOwners = new Set<string>()
  const funded = allowed.filter((p: any) => {
    const owner = walletOwnerOf(p)
    if (!owner) return false
    if ((balances.get(owner) ?? 0) >= KASPI_SHOP_CREDIT_PRICE_TENGE) return true
    lowBalanceOwners.add(owner)
    return false
  })
  if (lowBalanceOwners.size > 0) await notifyLowBalanceOwners(supabase, Array.from(lowBalanceOwners))
  return funded
    .map((p: any) => {
      const conn = joinedConnection(p)
      let targetCities = resolveTargetCities(conn?.tracked_city_codes || [], p.excluded_city_codes || [])
      // Auto mode (2026-08-21): with no manually tracked cities, check the
      // product's OWN point cities -- the old hardcoded-Almaty reference
      // missed a real competitor visible only in the point's city
      // (confirmed live: a Шымкент seller invisible to Almaty eyes).
      // Manual selection always wins; products with no known point cities
      // keep the legacy reference-city behavior.
      if (targetCities.length === 0) {
        targetCities = resolveTargetCities(p.point_city_codes || [], p.excluded_city_codes || [])
      }
      return {
        id: p.id,
        kaspiSku: p.kaspi_sku,
        // Root cause of "конкуренты не обновляются" (found 2026-08-21 via a
        // live browser capture of the real product page): Kaspi's public
        // offer-view endpoint (kaspi.kz/yml/offer-view/offers/{id}) takes
        // the MASTER product id ("133206576"), not the seller's combined
        // kaspi_sku ("133206576_392235481" -- master + this seller's own
        // merchantSku). Querying with the combined string returns a 200
        // with an EMPTY offers array -- no error, so the price-check
        // script silently saw "0 competitors" on every run since this
        // field existed. Falls back to kaspi_sku only for pre-2026-08-13
        // rows added through the manual /api/kaspi-shop/products POST
        // route, which never captured a master sku.
        kaspiMasterSku: p.kaspi_master_sku || p.kaspi_sku,
        targetCities,
      }
    })
}

// ONE full-state batch upload per product per cycle, carrying every changed
// city price at once -- replaces the old per-city single-item pushes. Root
// cause, confirmed live TWICE on 2026-08-21: the single-item process
// endpoint got this account's offer REMOVED with «Не указано наличие в
// прайс листе» (once after a restore attempt, again immediately after a
// stock save), while the cabinet's own full-offer batch echo both restores
// and updates cleanly. Side benefit: one upload per product instead of
// up-to-~320 per-city uploads per cycle, which stops draining Kaspi's
// 250-changes/30-min budget.
//
// `productIds` is the connection's product id list, hoisted up to
// applyPriceCheckResult and passed in -- loop-invariant for the product
// being processed (final-review finding I4).
async function pushProductPrices(params: {
  connectionId: string
  merchantId: string
  sessionCookies: string
  productIds: string[]
  sku: string
  masterSku: string | null
  model: string
  storeId: string
  cityPrices: Record<string, number>
}): Promise<{ pushed: boolean; sessionExpired: boolean; message?: string }> {
  // Budget signal is last_pushed_at, not updated_at -- updated_at is also
  // set by finalizeConnection's bulk catalog-import insert (NOT NULL
  // DEFAULT now(), 43,840 rows in one shot on the live account), which
  // isn't a real push to Kaspi and must never count against the real
  // 250/30min ceiling. last_pushed_at is nullable and written ONLY on a
  // confirmed successful push, so rows from catalog import never
  // contribute here (final-review finding I1).
  const since = new Date(Date.now() - KASPI_RATE_LIMIT_WINDOW_MS).toISOString()
  const { data: recentPushes } = await supabase
    .from('kaspi_shop_product_city_prices')
    .select('last_pushed_at')
    .in('tracked_product_id', params.productIds)
    .gte('last_pushed_at', since)
  const timestamps = (recentPushes || []).map((r: any) => new Date(r.last_pushed_at).getTime())
  if (!isWithinBudget(timestamps, Date.now())) {
    return { pushed: false, sessionExpired: false, message: 'rate limit budget exhausted for this 30-minute window' }
  }

  // The EXACT captured cabinet batch item (see pushOfferState's comment):
  // minimal fields, merchant-prefixed storeIds for ALL points, NO
  // stockCount ever -- every upload of ours that carried stockCount was
  // followed by Kaspi removing the offer with «Не указано наличие в прайс
  // листе», and listing only one of several points zeroed the others'
  // остаток.
  // Seller-entered остаток per point (kaspi_shop_point_stocks, saved from
  // the «Цена и остатки» modal) rides along so Kaspi's pipeline doesn't
  // wipe it to «Не указан» on every price change -- founder-approved
  // experiment 2026-08-21. Points without a stored value stay stockless.
  const { data: stockRows } = await supabase
    .from('kaspi_shop_point_stocks')
    .select('store_code, stock_count')
    .eq('connection_id', params.connectionId)
    .eq('sku', params.sku)
  const stockByStore: Record<string, number> = {}
  for (const row of stockRows || []) {
    if (Number.isFinite(Number(row.stock_count)) && Number(row.stock_count) > 0) stockByStore[row.store_code] = Number(row.stock_count)
  }

  // Коды точек читаются теми же cookies, что и отправка: после продления сессии (ниже)
  // их надо прочитать заново, иначе с мёртвыми cookies вернулся бы запасной список из одной
  // точки, а отправка одной точки из нескольких обнуляет остальные (проверено 21.08.2026).
  const pushWith = async (cookies: string) => {
    const storeCodes = await fetchOfferPointCodes(cookies, params.merchantId, params.sku, params.storeId)
    return pushOfferState({
      sessionCookies: cookies,
      merchantUid: params.merchantId,
      sku: params.sku,
      masterSku: params.masterSku,
      model: params.model,
      storeCodes,
      cityPrices: Object.entries(params.cityPrices).map(([cityId, value]) => ({ cityId, value })),
      available: 'yes',
      stockByStore,
    })
  }

  let result = await pushWith(params.sessionCookies)
  if (!result.success && result.reason === 'session_expired') {
    // Kaspi отказал сессии (401/403): до уведомления продавцу пробуем получить новую
    // без SMS по сохранённому единому входу (refreshSessionSilently). Получилось -- одна
    // повторная отправка с новой сессией; нет -- всё как раньше (статус, уведомление).
    // Проверка кошелька и пол цены уже пройдены выше, повтор их не меняет.
    try {
      const refreshed = await refreshStoredSession(params.connectionId, 'push')
      // skipped_newer: сессию уже обновил кто-то другой (соседнее продление, вход по SMS):
      // повторяем на его свежей сессии, а не считаем сессию мёртвой.
      const retryCookies = refreshed.outcome === 'refreshed' || refreshed.outcome === 'skipped_newer' ? refreshed.sessionCookies : undefined
      if (retryCookies) result = await pushWith(retryCookies)
    } catch (err: any) {
      console.error('kaspi-shop checkCycle: silent session refresh failed for connection', params.connectionId, ':', err?.message || err)
    }
  }

  if (result.success) return { pushed: true, sessionExpired: false }
  if (result.reason === 'session_expired') {
    // markSessionExpired пишет статус и заодно отправляет продавцу уведомление о
    // мёртвой сессии (Telegram по настройке + колокольчик), а не ждёт суточного
    // обхода cron. Бросает, если статус не записался: это не должно ломать цикл.
    try {
      await markSessionExpired(params.connectionId)
    } catch (err: any) {
      console.error('kaspi-shop checkCycle: markSessionExpired failed for connection', params.connectionId, ':', err?.message || err)
    }
    return { pushed: false, sessionExpired: true, message: result.message }
  }
  return { pushed: false, sessionExpired: false, message: result.message }
}

// A single throttled cycle can generate one issue per remaining city in the
// loop (up to ~320 on the live legacy path, almost all identical "rate
// limit budget exhausted" messages) -- capped so kaspi_shop_price_checks'
// error_message stays a readable signal instead of a wall of repeats.
// Previously this was discarded entirely: own_current_price got updated in
// our DB to a price Kaspi never actually received, with no log line and no
// signal anywhere the seller could see (final-review finding I2; also the
// only visibility into I1's fix actually taking effect).
function summarizePushIssues(issues: string[]): string | null {
  if (issues.length === 0) return null
  const shown = issues.slice(0, 5)
  const suffix = issues.length > shown.length ? ` (+${issues.length - shown.length} more)` : ''
  return (shown.join('; ') + suffix).slice(0, 2000)
}

export type ApplyOffers =
  | { perCityOffers: Record<string, CompetitorOffer[]> }
  | { competitorOffers: CompetitorOffer[] }

// Живая цена НАШЕГО предложения на Kaspi: в публичном списке предложений рядом с
// конкурентами есть и наше (по merchantId). Продавец мог поменять цену руками в кабинете
// Kaspi, а в нашей базе осталась старая: бот сравнивал целевую цену с базой, решал «без
// изменений» и не отправлял цену (тест на магазине основателя 08.11.2026: в Kaspi 750,
// в базе 613, цель 613, цена так и осталась 750). Нет нашего предложения в списке
// (снято с продажи, город не отдан) -- null, и работаем по базе, как раньше.
function liveOwnPrice(offers: CompetitorOffer[] | null | undefined, merchantId: unknown): number | null {
  const mine = String(merchantId ?? '')
  if (!mine) return null
  const prices = (offers || [])
    .filter(o => String(o.merchantId) === mine && Number.isFinite(Number(o.price)) && Number(o.price) > 0)
    .map(o => Number(o.price))
  return prices.length > 0 ? Math.min(...prices) : null
}

// Kaspi применяет загруженную цену не сразу («обычно в течение часа»). Пока с отправки в
// город прошло меньше этого времени, публичный список может показывать старую цену, и
// живой цене верить нельзя: иначе та же цена уйдёт и будет оплачена повторно.
const LIVE_PRICE_TRUST_AFTER_PUSH_MS = 60 * 60_000
function pushedRecently(lastPushedAt: unknown, now: number = Date.now()): boolean {
  if (!lastPushedAt) return false
  const t = Date.parse(String(lastPushedAt))
  return Number.isFinite(t) && now - t < LIVE_PRICE_TRUST_AFTER_PUSH_MS
}

// Вызов пуша, который не бросает: любое исключение внутри (сеть, разбор
// ответа Kaspi) -- это обычный «не отправлено», а не падение всего цикла.
async function safePush(params: Parameters<typeof pushProductPrices>[0]): Promise<{ pushed: boolean; sessionExpired: boolean; message?: string }> {
  try {
    return await pushProductPrices(params)
  } catch (err: any) {
    return { pushed: false, sessionExpired: false, message: `push threw: ${err?.message || err}` }
  }
}

// kaspi_shop_price_checks.action имеет CHECK (см. миграцию
// kaspi_price_checks_push_failed.sql). Пока миграция не применена, вставка
// 'push_failed' упадёт на нём -- тогда пишем 'error' с тем же текстом, чтобы
// запись и причина не пропали.
async function insertPriceCheckRow(row: Record<string, any>): Promise<void> {
  const { error } = await supabase.from('kaspi_shop_price_checks').insert(row)
  if (!error) return
  const isCheckViolation = error.code === '23514' || /check constraint/i.test(error.message || '')
  if (row.action === 'push_failed' && isCheckViolation) {
    const { error: retryError } = await supabase.from('kaspi_shop_price_checks').insert({ ...row, action: 'error' })
    if (!retryError) return
    console.error('kaspi-shop checkCycle: price check row insert failed for product', row.tracked_product_id, ':', retryError.message)
    return
  }
  console.error('kaspi-shop checkCycle: price check row insert failed for product', row.tracked_product_id, ':', error.message)
}

// Одна и та же причина «бот не может менять цену этого товара» не должна
// писаться в историю каждые 10-20 минут (72 строки в сутки на товар): если
// последняя строка товара уже с таким текстом, новую не добавляем.
async function sameErrorAlreadyLogged(trackedProductId: string, message: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('kaspi_shop_price_checks')
    .select('action, error_message')
    .eq('tracked_product_id', trackedProductId)
    .order('checked_at', { ascending: false })
    .limit(1)
  if (error) return false
  const last = (data || [])[0] as any
  return !!last && last.action === 'error' && last.error_message === message
}

// Товар без строк по городам: цену отправлять некуда, а менять её в нашей базе
// без отправки нельзя. Это не «неудачная отправка», а отдельный пропуск.
const NO_CITY_ROWS_MESSAGE = 'У товара нет данных по городам Kaspi, цена не менялась. Нажмите «Обновить каталог» на странице Демпинга.'
// Строки по городам создать не удалось (сбой записи): это не «нет данных», каталог
// обновлять не нужно, проверка просто повторится.
const CITY_ROWS_CREATE_FAILED_MESSAGE = 'Не удалось подготовить цены по городам, повторим на следующей проверке.'
const ALL_CITIES_EXCLUDED_MESSAGE = 'Все города товара исключены из проверки, цена не менялась. Верните хотя бы один город в настройках товара.'

// One tracked product, one already-fetched set of competitor offers (or a
// fetch error, reported by the caller since the fetch itself no longer
// happens here). Never throws -- a single product's failure must not abort
// the rest of the caller's batch. Always logs a kaspi_shop_price_checks row
// once it got past the guards below -- an error row is real information the
// seller should see in their history, not a silently dropped cycle.
//
// Деньги (правило основателя 07.11.2026, поверх аудита Kaspi 06.11.2026,
// K4/K5/K19/K20/K43/K44): ПРОВЕРКА БЕСПЛАТНА. 5 ₸ (1 кредит) списывается только
// когда бот реально изменил цену и новая цена ДОШЛА до Kaspi (пуш прошёл), и
// ровно один раз за товар за цикл, сколько бы городов ни изменилось в одной
// отправке. Бесплатно: проверка без изменений (no_change), цена упёрлась в
// минимум без отправки (held_at_floor), ошибка Kaspi или данных, неудачная
// отправка (push_failed), мёртвая сессия, товар снят с продажи. Владелец с
// балансом меньше 5 ₸ изменить цену не оплатит, поэтому функция выходит, ничего
// не записав: товар остаётся как был, а в getDueTrackedProducts такие товары
// уже не попадают. Если цена УЖЕ ушла в Kaspi, а списание не прошло (гонка
// двух товаров на последнюю пятёрку), изменение остаётся, сбой пишется в лог.
//
// Цена (K9/K19): own_current_price товара и action 'updated' пишутся только
// ПОСЛЕ успешной отправки в Kaspi. Отправка не удалась (бюджет, HTTP, сессия) --
// старая цена остаётся, действие 'push_failed', причина в error_message, а
// следующий цикл посчитает то же решение заново и повторит отправку.
//
// Two payload shapes: `perCityOffers` (the store has configured
// tracked_city_codes -- each city gets its own competitor offers and its
// own computeRepriceCandidate call) and the legacy `competitorOffers` flat
// array (the store hasn't configured per-city tracking yet -- exact
// pre-existing behavior, untouched, so nothing changes for a store that
// hasn't opted in). See docs/superpowers/specs/2026-08-14-kaspi-shop-city-pricing-design.md.
export async function applyPriceCheckResult(
  trackedProductId: string,
  offers: ApplyOffers | null,
  fetchError: string | null
): Promise<void> {
  const { data: product } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('*, kaspi_shop_connections(id, user_id, paused, merchant_id, session_cookies, session_status)')
    .eq('id', trackedProductId)
    .single()
  if (!product || !product.enabled) return
  // Снят с продажи в кабинете: правило включено, но пуш с available:'yes'
  // вернул бы товар в продажу, а проверка стоила бы денег (K21).
  if (product.available_for_sale === false) return
  const connection = joinedConnection(product)
  if (!connection || connection.paused) return

  const userId = product.user_id

  // Defence in depth for the Pro gate in getDueTrackedProducts: a product
  // put on the due list a moment before its owner's Pro lapsed must still
  // not be repriced or charged. Checked against the connection owner (the
  // seller the wallet belongs to), falling back to the product row's own
  // user_id. A failed read skips this cycle -- this function never throws.
  try {
    if (!(await ownerHasKaspiShopAccess(connection.user_id ?? userId))) return
  } catch (err: any) {
    console.error('kaspi-shop checkCycle: owner plan check failed for product', trackedProductId, ':', err.message)
    return
  }

  // Мёртвая сессия кабинета (или нет cookies): цену не отправить, значит и
  // проверка бессмысленна и платной быть не может (K4/K20/K43). Выходим до
  // любых записей и списаний; подключение вернётся в работу при переподключении.
  if (!isSessionActive(connection.session_status) || !connection.session_cookies) return

  // Founder's explicit ask: extend the same negative-balance protection
  // Kaspi Cashier's invoice-payment path already had to every unified-
  // wallet spend, including this one -- a price check previously always
  // ran (and always attempted its 1-credit debit, best-effort, letting the
  // balance drift arbitrarily negative) regardless of whether the user
  // could actually afford it. Checked before any of the repricing work or
  // Kaspi cabinet writes below, so a depleted wallet also means no product
  // gets touched -- its price simply stays as last set until topped up.
  try {
    if ((await getKaspiShopWalletBalance(userId)) < KASPI_SHOP_CREDIT_PRICE_TENGE) return
  } catch (err: any) {
    console.error('kaspi-shop checkCycle: wallet balance read failed for product', trackedProductId, ':', err.message)
    return
  }

  // let: при расхождении с живой ценой Kaspi (см. liveOwnPrice) «цена до» берётся с Kaspi.
  let ownPriceBefore = Number(product.own_current_price)

  // Проверка не состоялась: Kaspi не ответил, ответ пуст или у товара битая
  // настройка (пол не положительное число -- такой товар ничего не должен
  // менять). Фиксируем строку «error», сдвигаем last_checked_at (иначе товар
  // остаётся due и бегунок долбит Kaspi каждые 10 минут) и НЕ списываем.
  const floorNumber = Number(product.floor_price)
  const perCityEmpty = !!offers && 'perCityOffers' in offers && Object.keys(offers.perCityOffers || {}).length === 0
  const skipReason: string | null =
    fetchError
    || (!offers ? 'нет данных от Kaspi в ответе проверки' : null)
    || (perCityEmpty ? 'в ответе проверки нет ни одного города' : null)
    || (!Number.isFinite(floorNumber) || floorNumber <= 0 ? 'у товара не задана минимальная цена, цена не менялась' : null)
  if (skipReason) {
    // held_at_floor deliberately left untouched here -- a fetch error tells
    // us nothing new about whether the floor is still binding, so clearing
    // it would hide a real still-held product behind a transient upstream
    // failure, and setting it would assert something this cycle never
    // observed.
    await supabase
      .from('kaspi_shop_tracked_products')
      .update({ last_checked_at: new Date().toISOString() })
      .eq('id', trackedProductId)
    await insertPriceCheckRow({
      tracked_product_id: trackedProductId,
      competitor_price: null,
      own_price_before: ownPriceBefore,
      own_price_after: ownPriceBefore,
      action: 'error',
      credit_cost: 0,
      error_message: skipReason,
    })
    return
  }

  let action: 'updated' | 'held_at_floor' | 'no_change' | 'error' | 'push_failed' = 'no_change'
  let ownPriceAfter = ownPriceBefore
  let competitorPrice: number | null = null
  // Collects a message for every push that didn't happen (rate-limited,
  // session issue, upstream error) across whichever branch below runs, so
  // it can be surfaced in the kaspi_shop_price_checks row at the end --
  // previously these were silently discarded (final-review finding I2).
  const pushIssues: string[] = []
  // Цена, которую хотели поставить, но не смогли отправить (для текста строки).
  let unappliedPrice: number | null = null
  // Не пуш-ошибка, а пропуск: у товара нет городов, куда отправлять цену.
  let noCitiesSkip: string | null = null
  // Хотя бы одна отправка цены в Kaspi в этом цикле прошла: единственное условие
  // списания (одно на товар за цикл, не по числу городов).
  let priceChangePushed = false

  // maxPrice/noCompetitorStreak are read once here and reused by both the
  // top-level computeRepriceCandidate call AND the legacy branch's inner
  // per-city loop -- the loop's own newStreak results are never persisted
  // (the legacy path only tracks one streak per product, per the design),
  // so all its calls deliberately reuse this same "before this cycle"
  // value rather than each other's outputs.
  const maxPrice = product.max_price !== null && product.max_price !== undefined ? Number(product.max_price) : undefined
  const noCompetitorStreak = Number(product.no_competitor_streak) || 0

  let sessionCookies: string
  try {
    sessionCookies = decryptAtRest(connection.session_cookies, getKey()).toString('utf8')
  } catch (err: any) {
    // Cookies не расшифровать -- равносильно мёртвой сессии: ни отправки, ни
    // списания (функция не бросает).
    console.error('kaspi-shop checkCycle: session cookies decrypt failed for product', trackedProductId, ':', err.message)
    return
  }

  if (offers && 'perCityOffers' in offers) {
    // Own merchant is ALWAYS excluded from the competitor list, not just
    // the seller's manual excluded_merchant_ids -- the public offer-view
    // endpoint's response includes our own offer alongside real
    // competitors. Before 2026-08-21 this branch never saw real offers at
    // all (wrong sku bug, see getDueTrackedProducts), so this gap was
    // latent; fixing the sku without this would have made the repricer spot
    // its own price as a "competitor" and undercut itself every cycle.
    const excludedMerchants: string[] = [...(product.excluded_merchant_ids || []), connection.merchant_id]
    const { data: cityRows } = await supabase
      .from('kaspi_shop_product_city_prices')
      .select('city_code, own_current_price, no_competitor_streak, last_pushed_at')
      .eq('tracked_product_id', trackedProductId)
    const currentCityPrices: Record<string, number> = {}
    const currentCityStreaks: Record<string, number> = {}
    const pushedRecentlyByCity: Record<string, boolean> = {}
    for (const c of cityRows || []) {
      currentCityPrices[c.city_code] = Number(c.own_current_price)
      currentCityStreaks[c.city_code] = Number(c.no_competitor_streak) || 0
      pushedRecentlyByCity[c.city_code] = pushedRecently(c.last_pushed_at)
    }

    const cityOffersList: CityOffers[] = Object.entries(offers.perCityOffers).map(([cityCode, cityOffers]) => ({ cityCode, offers: cityOffers }))

    // Живая цена с Kaspi важнее записи в базе: строку города, которая разошлась с ней,
    // исправляем сразу (база только кэш), решение принимаем от живой цены. Исключение:
    // цену в этот город мы отправили совсем недавно, Kaspi мог ещё не применить импорт и
    // показывать старую (иначе повторная отправка и повторное списание), там верим базе.
    const syncedAt = new Date().toISOString()
    let liveSeen = false
    for (const { cityCode, offers: cityOffers } of cityOffersList) {
      const live = liveOwnPrice(cityOffers, connection.merchant_id)
      if (live === null) continue
      const known = currentCityPrices[cityCode]
      if (known === undefined) {
        // Строки города нет, а наше предложение в нём уже стоит: заводим строку по живой
        // цене. Если цель совпала с ней, отправлять нечего (не платить за то, чего не было).
        const { error: createError } = await supabase
          .from('kaspi_shop_product_city_prices')
          .insert({ tracked_product_id: trackedProductId, city_code: cityCode, own_current_price: live, no_competitor_streak: 0 })
        if (createError) {
          console.error('kaspi-shop checkCycle: city row create from live price failed for product', trackedProductId, 'city', cityCode, ':', createError.message)
        } else {
          currentCityPrices[cityCode] = live
          currentCityStreaks[cityCode] = 0
          liveSeen = true
        }
        continue
      }
      if (pushedRecentlyByCity[cityCode]) continue
      liveSeen = true
      if (known === live) continue
      currentCityPrices[cityCode] = live
      const { error: syncError } = await supabase
        .from('kaspi_shop_product_city_prices')
        .update({ own_current_price: live, updated_at: syncedAt })
        .eq('tracked_product_id', trackedProductId)
        .eq('city_code', cityCode)
      if (syncError) console.error('kaspi-shop checkCycle: stale city row sync failed for product', trackedProductId, 'city', cityCode, ':', syncError.message)
    }
    if (liveSeen) {
      // «Цена до» для журнала и списания считаем от живых данных каждый цикл, а не только в
      // тот, где нашли расхождение: иначе после неудачной отправки следующий цикл писал бы в
      // историю устаревшую цену товара.
      const known = cityOffersList.map(c => currentCityPrices[c.cityCode]).filter((p): p is number => Number.isFinite(p))
      if (known.length > 0) ownPriceBefore = Math.min(...known)
    }
    const results = computePerCityReprice({
      cityOffers: cityOffersList,
      excludedMerchantIds: excludedMerchants,
      undercutStep: Number(product.undercut_step),
      floorPrice: floorNumber,
      maxPrice,
      strategy: (product.demping_strategy as DempingStrategy) || 'undercut_leader',
      currentCityPrices,
      currentCityStreaks,
    })

    const desiredPrice = Math.min(...results.map(r => r.price))
    const anyHeldAtFloor = results.some(r => r.heldAtFloor)
    const allCompetitorPrices = cityOffersList.flatMap(c => c.offers.filter(o => !excludedMerchants.includes(o.merchantId)).map(o => o.price))
    competitorPrice = allCompetitorPrices.length > 0 ? Math.min(...allCompetitorPrices) : null

    // Decide per city, not from the aggregate `action` -- the
    // aggregate can read "no_change" even when one city genuinely
    // moved, if a different city happens to still hold the overall
    // minimum. All changed cities ride ONE batch upload together.
    const changedCityPrices: Record<string, number> = {}
    for (const result of results) {
      if (currentCityPrices[result.cityCode] !== undefined && result.price === currentCityPrices[result.cityCode]) {
        continue
      }
      changedCityPrices[result.cityCode] = result.price
    }

    // Отправка ДО записи цены в нашу базу (K19): цена товара и 'updated'
    // фиксируются только если Kaspi её принял.
    let pushFailed = false
    if (Object.keys(changedCityPrices).length > 0) {
      const { data: connProducts } = await supabase
        .from('kaspi_shop_tracked_products')
        .select('id')
        .eq('connection_id', connection.id)
      const productIds = (connProducts || []).map((p: any) => p.id)
      const pushResult = await safePush({
        connectionId: connection.id,
        merchantId: connection.merchant_id,
        sessionCookies,
        productIds,
        sku: product.kaspi_sku,
        masterSku: product.kaspi_master_sku || null,
        model: product.product_name,
        storeId: product.store_id,
        cityPrices: changedCityPrices,
      })
      if (pushResult.pushed) {
        priceChangePushed = true
        const pushedAt = new Date().toISOString()
        for (const [cityCode, price] of Object.entries(changedCityPrices)) {
          if (currentCityPrices[cityCode] === undefined) {
            // У города нет строки (товар заведён вручную, вставка при импорте не удалась, город выбран
            // продавцом): без строки цена не запоминалась бы, и каждый цикл мы отправляли бы её заново
            // и брали бы 5 ₸ за изменение, которого нет (ревью 07.11).
            const { error: createError } = await supabase
              .from('kaspi_shop_product_city_prices')
              .insert({ tracked_product_id: trackedProductId, city_code: cityCode, own_current_price: price, last_competitor_price: competitorPrice, updated_at: pushedAt, last_pushed_at: pushedAt })
            if (createError) console.error('kaspi-shop checkCycle: city row create after push failed for product', trackedProductId, 'city', cityCode, ':', createError.message)
            continue
          }
          await supabase
            .from('kaspi_shop_product_city_prices')
            .update({ own_current_price: price, last_competitor_price: competitorPrice, updated_at: pushedAt, last_pushed_at: pushedAt })
            .eq('tracked_product_id', trackedProductId)
            .eq('city_code', cityCode)
        }
      } else {
        pushFailed = true
        console.error('kaspi-shop checkCycle: batch price push skipped for product', trackedProductId, '--', pushResult.message)
        pushIssues.push(pushResult.message || 'batch push failed')
      }
    }

    // Цена города, которая реально стоит на Kaspi после этого цикла: при
    // неудачной отправке у изменившихся городов -- прежняя.
    const effectiveCityPrice = (cityCode: string, decided: number): number =>
      pushFailed && changedCityPrices[cityCode] !== undefined ? (currentCityPrices[cityCode] ?? decided) : decided

    ownPriceAfter = pushFailed ? ownPriceBefore : desiredPrice
    if (pushFailed) {
      action = 'push_failed'
      unappliedPrice = desiredPrice
    } else {
      // Итоговая цена товара (минимум по городам) могла не сдвинуться, хотя в одном
      // из городов цена ушла в Kaspi: это изменение, а не «без изменений».
      action = anyHeldAtFloor ? 'held_at_floor' : (ownPriceAfter === ownPriceBefore && !priceChangePushed ? 'no_change' : 'updated')
    }

    // "Leader" city -- whichever city's result actually set the displayed
    // price (falls back to the first city if none matches). Its raw offers
    // back both the card's "N продавцов кроме вас" count (previously stuck
    // reading the top-level market_offer_count column, which this branch
    // never wrote -- confirmed live 2026-08-21: the card showed "0
    // продавцов" even after a real competitor was found) and a name+price
    // snapshot for the card's hover tooltip.
    const leaderCityCode = results.find(r => effectiveCityPrice(r.cityCode, r.price) === ownPriceAfter)?.cityCode ?? results[0].cityCode
    const leaderOffers = cityOffersList.find(c => c.cityCode === leaderCityCode)?.offers || []
    const { position: leaderPosition, totalOffers: leaderTotalOffers } = computeMarketPosition(leaderOffers, connection.merchant_id, ownPriceAfter)
    const competitorSnapshot = leaderOffers
      .filter(o => !excludedMerchants.includes(o.merchantId))
      .sort((a, b) => a.price - b.price)
      .slice(0, 10)
      .map(o => ({ merchantName: o.merchantName || null, price: o.price, merchantId: o.merchantId }))

    await supabase
      .from('kaspi_shop_tracked_products')
      .update({
        // Наблюдения (конкуренты, позиция, пол) пишем всегда, а саму цену
        // товара -- только если она принята Kaspi.
        ...(pushFailed ? {} : { own_current_price: ownPriceAfter }),
        last_checked_at: new Date().toISOString(),
        last_competitor_price: competitorPrice,
        // Пол «держится» только если цена реально дошла до Kaspi: при неудачной
        // отправке поле не трогаем (прежнее значение остаётся).
        ...(pushFailed ? {} : { held_at_floor: anyHeldAtFloor }),
        market_position: leaderPosition,
        market_offer_count: leaderTotalOffers,
        competitor_snapshot: competitorSnapshot,
      })
      .eq('id', trackedProductId)

    // Streak persistence runs unconditionally, independent of the push
    // outcome -- the competitor observation happens in the GitHub Actions
    // relay, which has nothing to do with whether the cabinet accepted a
    // price. Also carries this cycle's market position (price-rank among
    // ALL sellers in this city, computed from the raw per-city offers --
    // not the excludedMerchants-filtered competitorPrices used for the
    // repricing math above, since position should reflect real market
    // reality, not this seller's own "ignore this competitor" preference).
    // No longer skips on an unchanged streak -- position can move even when
    // the streak doesn't (e.g. a competitor's price shifts without
    // disappearing), so every city gets written every cycle now.
    for (const result of results) {
      const rawOffers = cityOffersList.find(c => c.cityCode === result.cityCode)?.offers || []
      const { position, totalOffers } = computeMarketPosition(rawOffers, connection.merchant_id, effectiveCityPrice(result.cityCode, result.price))
      await supabase
        .from('kaspi_shop_product_city_prices')
        .update({ no_competitor_streak: result.newStreak, market_position: position, market_offer_count: totalOffers })
        .eq('tracked_product_id', trackedProductId)
        .eq('city_code', result.cityCode)
    }

    if (anyHeldAtFloor && !pushFailed) {
      await alertFloorPriceOnce(userId, trackedProductId, product.held_at_floor === true,
        `🔴 Kaspi Магазин: цена товара «${escapeHtml(product.product_name)}» упёрлась в ваш минимум (${product.floor_price} ₸) в одном или нескольких городах — конкурент дешевле, но снижать дальше нельзя. Проверьте вручную, если хотите скорректировать минимум.`)
    }
  } else {
    const competitorOffers = offers && 'competitorOffers' in offers ? offers.competitorOffers : null
    // Цена, которая сейчас на Kaspi (см. liveOwnPrice): от неё считаем «изменилась ли цена».
    let liveOwn = liveOwnPrice(competitorOffers, connection.merchant_id)
    if (liveOwn !== null) {
      // Цену отправляли совсем недавно: верим базе (см. LIVE_PRICE_TRUST_AFTER_PUSH_MS).
      const { data: pushRows } = await supabase
        .from('kaspi_shop_product_city_prices')
        .select('last_pushed_at')
        .eq('tracked_product_id', trackedProductId)
      if ((pushRows || []).some((r: any) => pushedRecently(r.last_pushed_at))) liveOwn = null
    }
    if (liveOwn !== null) ownPriceBefore = liveOwn
    // Same self-exclusion as the perCityOffers branch above -- see comment
    // there.
    const excludedMerchants: string[] = [...(product.excluded_merchant_ids || []), connection.merchant_id]
    const competitorPrices = (competitorOffers || [])
      .filter(o => !excludedMerchants.includes(o.merchantId))
      .map(o => o.price)
    competitorPrice = competitorPrices.length > 0 ? Math.min(...competitorPrices) : null
    const { price, heldAtFloor, newStreak } = computeRepriceCandidate({
      competitorPrices,
      undercutStep: Number(product.undercut_step),
      floorPrice: floorNumber,
      maxPrice,
      strategy: (product.demping_strategy as DempingStrategy) || 'undercut_leader',
      ownCurrentPrice: ownPriceBefore,
      noCompetitorStreak,
    })

    // Отправка нужна при ЛЮБОМ изменении цены, не только при action
    // 'updated': раньше цена, упёршаяся в пол (held_at_floor), менялась у нас
    // в базе, но в Kaspi не уходила. Цену товара пишем только после успеха --
    // при неудаче следующий цикл снова увидит расхождение и повторит.
    //
    // Кроме того, отправка нужна, когда хотя бы одна строка города расходится с
    // тем, что бот посчитал для этого города: так товары, рассинхронизированные
    // старой ошибкой (цена товара записана, а в Kaspi не ушла), лечатся на
    // следующей же проверке, а не ждут движения конкурента. Проверка при этом
    // по-прежнему одна и списывается один раз.
    const priceChanged = price !== ownPriceBefore
    let pushFailed = false
    let pushedSomething = false
    {
      const { data: cityRows } = await supabase
        .from('kaspi_shop_product_city_prices')
        .select('city_code, own_current_price')
        .eq('tracked_product_id', trackedProductId)
      let cityRowList: Array<{ city_code: string; own_current_price: unknown }> = (cityRows || []) as any[]
      // Строки созданы в этом цикле: цена в них -- наше предположение, а не
      // подтверждённая Kaspi, поэтому отправка обязательна.
      let rowsCreated = false
      let rowsCreateFailed = false
      if (cityRowList.length === 0) {
        // У товара, заведённого вручную или импортированного без цен по городам,
        // строк нет. Если известны города его точек (из карточки Kaspi), создаём
        // строки по ним с текущей ценой товара; иначе молча пропускаем.
        const pointCodes = Array.from(new Set(((product.point_city_codes || []) as unknown[]).filter((c): c is string => typeof c === 'string' && c.length > 0)))
        if (pointCodes.length > 0) {
          const newRows = pointCodes.map(code => ({ tracked_product_id: trackedProductId, city_code: code, own_current_price: ownPriceBefore }))
          const { error: createError } = await supabase.from('kaspi_shop_product_city_prices').insert(newRows)
          if (createError) {
            console.error('kaspi-shop checkCycle: city rows create failed for product', trackedProductId, ':', createError.message)
            rowsCreateFailed = true
          } else {
            cityRowList = newRows
            rowsCreated = true
          }
        }
      }
      // Цель уже стоит на Kaspi (продавец поставил её руками), а строки городов помнят
      // старую цену: исправляем строки и не отправляем то, что уже есть (иначе 5 ₸ за
      // изменение, которого не было).
      if (!rowsCreated && liveOwn !== null && liveOwn === price && cityRowList.some(r => Number(r.own_current_price) !== liveOwn)) {
        const syncedAt = new Date().toISOString()
        const { error: syncError } = await supabase
          .from('kaspi_shop_product_city_prices')
          .update({ own_current_price: liveOwn, updated_at: syncedAt })
          .eq('tracked_product_id', trackedProductId)
          .in('city_code', cityRowList.map(r => r.city_code))
        if (syncError) console.error('kaspi-shop checkCycle: stale city rows sync failed for product', trackedProductId, ':', syncError.message)
        cityRowList = cityRowList.map(r => ({ ...r, own_current_price: liveOwn }))
      }
      const excludedCities: string[] = product.excluded_city_codes || []
      const citiesToPush = cityRowList.filter(c => !excludedCities.includes(c.city_code))

      if (citiesToPush.length === 0) {
        noCitiesSkip = cityRowList.length === 0
          ? (rowsCreateFailed ? CITY_ROWS_CREATE_FAILED_MESSAGE : NO_CITY_ROWS_MESSAGE)
          : ALL_CITIES_EXCLUDED_MESSAGE
      } else {
        const legacyCityPrices: Record<string, number> = {}
        let desynced = false
        for (const city of citiesToPush) {
          const cityCandidate = computeRepriceCandidate({
            competitorPrices,
            undercutStep: Number(product.undercut_step),
            floorPrice: floorNumber,
            maxPrice,
            strategy: (product.demping_strategy as DempingStrategy) || 'undercut_leader',
            // Живая цена (если известна) одна для всех городов: цель и «цена до» считаются от неё.
            ownCurrentPrice: liveOwn ?? Number(city.own_current_price ?? ownPriceBefore),
            noCompetitorStreak,
          })
          legacyCityPrices[city.city_code] = cityCandidate.price
          if (Number(city.own_current_price) !== cityCandidate.price) desynced = true
        }

        // Строки только что созданы: Kaspi-сторона неизвестна и отправка обязательна, КРОМЕ случая, когда
        // живая цена с Kaspi уже равна цели (платить за изменение, которого нет, нельзя).
        const kaspiAlreadyHasTarget = liveOwn !== null && liveOwn === price
        if (priceChanged || desynced || (rowsCreated && !kaspiAlreadyHasTarget)) {
          const { data: connProducts } = await supabase
            .from('kaspi_shop_tracked_products')
            .select('id')
            .eq('connection_id', connection.id)
          const productIds = (connProducts || []).map((p: any) => p.id)

          const result = await safePush({
            connectionId: connection.id,
            merchantId: connection.merchant_id,
            sessionCookies,
            productIds,
            sku: product.kaspi_sku,
            masterSku: product.kaspi_master_sku || null,
            model: product.product_name,
            storeId: product.store_id,
            cityPrices: legacyCityPrices,
          })

          if (result.pushed) {
            pushedSomething = true
            priceChangePushed = true
            const pushedAt = new Date().toISOString()
            for (const [cityCode, cityPrice] of Object.entries(legacyCityPrices)) {
              await supabase
                .from('kaspi_shop_product_city_prices')
                .update({ own_current_price: cityPrice, last_competitor_price: competitorPrice, updated_at: pushedAt, last_pushed_at: pushedAt })
                .eq('tracked_product_id', trackedProductId)
                .eq('city_code', cityCode)
            }
          } else {
            pushFailed = true
            console.error('kaspi-shop checkCycle: batch price push skipped for product', trackedProductId, '--', result.message)
            pushIssues.push(result.message || 'batch push failed')
            // Строки, созданные в этом цикле, хранят наше предположение (цена товара), а
            // не подтверждённую Kaspi цену. Оставить их значит, что следующий цикл увидит
            // «всё синхронно», не отправит цену и спишет проверку за неподтверждённую цену.
            // Удаляем их: следующий цикл создаст строки и отправит заново.
            if (rowsCreated) {
              const { error: undoError } = await supabase
                .from('kaspi_shop_product_city_prices')
                .delete()
                .eq('tracked_product_id', trackedProductId)
                .in('city_code', cityRowList.map(c => c.city_code))
              if (undoError) console.error('kaspi-shop checkCycle: created city rows cleanup failed for product', trackedProductId, ':', undoError.message)
            }
          }
        }
      }
    }

    // Отправлять некуда: цену не меняем (ни у нас, ни в Kaspi) и не списываем.
    const skippedNoCities = noCitiesSkip !== null
    ownPriceAfter = pushFailed || skippedNoCities ? ownPriceBefore : price
    if (skippedNoCities) {
      action = 'error'
    } else if (pushFailed) {
      action = 'push_failed'
      unappliedPrice = price
    } else {
      action = heldAtFloor ? 'held_at_floor' : ((priceChanged || pushedSomething) ? 'updated' : 'no_change')
    }

    // Raw competitorOffers (not the excludedMerchants-filtered
    // competitorPrices used for the repricing math above) -- position
    // reflects real market reality, not this seller's own "ignore this
    // competitor" preference.
    const { position, totalOffers } = computeMarketPosition(competitorOffers || [], connection.merchant_id, ownPriceAfter)
    const competitorSnapshot = (competitorOffers || [])
      .filter(o => !excludedMerchants.includes(o.merchantId))
      .sort((a, b) => a.price - b.price)
      .slice(0, 10)
      .map(o => ({ merchantName: o.merchantName || null, price: o.price, merchantId: o.merchantId }))

    await supabase
      .from('kaspi_shop_tracked_products')
      .update({
        ...(pushFailed || skippedNoCities ? {} : { own_current_price: ownPriceAfter }),
        last_checked_at: new Date().toISOString(),
        last_competitor_price: competitorPrice,
        no_competitor_streak: newStreak,
        market_position: position,
        market_offer_count: totalOffers,
        // Пол «держится» только если цена реально дошла до Kaspi (или менять
        // было нечего): при неудачной отправке или пропуске поле не трогаем.
        ...(pushFailed || skippedNoCities ? {} : { held_at_floor: heldAtFloor }),
        competitor_snapshot: competitorSnapshot,
      })
      .eq('id', trackedProductId)

    if (heldAtFloor && !pushFailed && !skippedNoCities) {
      await alertFloorPriceOnce(userId, trackedProductId, product.held_at_floor === true,
        `🔴 Kaspi Магазин: цена товара «${escapeHtml(product.product_name)}» упёрлась в ваш минимум (${product.floor_price} ₸) — конкурент дешевле, но снижать дальше нельзя. Проверьте вручную, если хотите скорректировать минимум.`)
    }
  }

  // Surface any push issues collected above. «не применено» keeps the price
  // we wanted next to the reason, so the history answers "why does Kaspi
  // still show the old price".
  const issuesSummary = summarizePushIssues(pushIssues)
  const errorMessage = action === 'push_failed'
    ? `Цена ${unappliedPrice} ₸ не отправлена в Kaspi${issuesSummary ? `: ${issuesSummary}` : ''}`.slice(0, 2000)
    : (noCitiesSkip ?? issuesSummary)

  // Списание: только за изменение цены, которое дошло до Kaspi (priceChangePushed),
  // один раз за товар за цикл. Проверка без изменений, held_at_floor без отправки,
  // ошибки, неудачная отправка и товар без городов -- бесплатно.
  let creditCost = 0
  if (priceChangePushed) {
    const productLabel = String(product.product_name ?? '').slice(0, 120)
    try {
      await debitKaspiShopWallet(userId, 1, `Изменение цены: ${productLabel} ${ownPriceBefore} → ${ownPriceAfter} ₸`)
      creditCost = 1
    } catch (err: any) {
      // Цена уже на Kaspi, откатить её нельзя: изменение остаётся, списание не
      // состоялось (credit_cost 0). Обычно это гонка двух товаров одного владельца
      // на последние 5 ₸ в одном запуске.
      console.error('kaspi-shop checkCycle: price change reached Kaspi but wallet debit failed for user', userId, 'product', trackedProductId, ':', err.message)
    }
  }

  // Пропуск «нет городов» повторяется каждый цикл, пока продавец не обновит
  // каталог: одна и та же строка попадает в историю один раз.
  if (noCitiesSkip && await sameErrorAlreadyLogged(trackedProductId, noCitiesSkip)) return

  await insertPriceCheckRow({
    tracked_product_id: trackedProductId,
    competitor_price: competitorPrice,
    own_price_before: ownPriceBefore,
    own_price_after: ownPriceAfter,
    action,
    credit_cost: creditCost,
    error_message: errorMessage,
  })
}
