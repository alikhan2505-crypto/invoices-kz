import { createClient } from '@supabase/supabase-js'
import { loadPlatformConnection } from './connection'
import { checkStatus } from './client'
import { computePlanActivation } from '@/lib/plans/planActivation'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface PlanPaymentRow {
  id: string
  user_id: string
  plan: string
  amount: number
  qr_operation_id: string
  created_at?: string
  billing_period?: string
  /** Часть цены, списанная с кошелька (миграция profile_bonus_wallet_plan.sql). */
  wallet_amount?: number | null
}

// payment_requests has no expires_at column (unlike kaspi_payment_requests/
// kaspi_wallet_topups) -- a Kaspi QR itself expires within minutes, so a
// row still 'pending' a full day after creation is safe to treat as dead
// rather than sweeping it forever on every future daily cron run.
const PLAN_PAYMENT_STALE_MS = 24 * 60 * 60 * 1000

async function tryExpirePlanPayment(
  row: PlanPaymentRow,
  status: 'expired' | 'failed' = 'expired',
  deferWalletRefund = false,
): Promise<boolean> {
  // select('*'), а не select('id'): после миграции в строке есть
  // wallet_amount, и по нему видно, надо ли вернуть удержанную часть с
  // кошелька. До миграции колонки просто нет — и возвращать нечего.
  const { data, error } = await supabase
    .from('payment_requests')
    .update({ status })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('*')
  if (error) {
    console.error('Plan payment: failed to mark', row.id, 'as', status, ':', error.message)
    return false
  }
  const expired = !!(data && data.length > 0)
  // deferWalletRefund: вызывающий сейчас же создаёт новый платёж с
  // кошельком, и start_plan_payment_with_wallet заберёт это удержание себе
  // той же транзакцией (без пары «возврат / новое списание» в журнале). Если
  // новый платёж не создастся, вызывающий вернёт удержание сам
  // (refundDeadPlanWalletHolds).
  if (expired && !deferWalletRefund && Number(data![0]?.wallet_amount || 0) > 0) await refundPlanWalletHold(row.id)
  return expired
}

// Возврат удержанной с кошелька части, когда Kaspi-платёж так и не состоялся
// (истёк, отменён, отклонён админом). Ровно один раз: функция в базе меняет
// wallet_status held→refunded и пополняет кошелёк одной транзакцией и только
// для строки в статусе expired/failed/rejected — оплаченную вернуть нельзя.
// Если вызов не дошёл, ежедневный крон добирает такие строки
// (refund_orphan_plan_wallet_holds).
export async function refundPlanWalletHold(paymentRequestId: string): Promise<void> {
  const { error } = await supabase.rpc('refund_plan_wallet_hold', { p_payment_request_id: paymentRequestId })
  if (error) console.error('Plan payment: wallet hold refund failed for', paymentRequestId, '— the daily sweep will retry:', error.message)
}

/**
 * Вернуть на кошелёк удержания у несостоявшихся (expired/failed/rejected)
 * строк одного пользователя. Ровно один раз — так же, как refund_plan_wallet_hold.
 */
export async function refundDeadPlanWalletHolds(userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('payment_requests')
    .select('id')
    .eq('user_id', userId)
    .eq('wallet_status', 'held')
    .in('status', ['expired', 'failed', 'rejected'])
  if (error) return // до миграции колонки нет — и удержаний нет
  for (const r of data || []) await refundPlanWalletHold(r.id)
}

/**
 * Перед новой покупкой: закрыть свои ещё «висящие» платежи с удержанием
 * (сначала спросив Kaspi — вдруг оплачено) и вернуть удержания на кошелёк.
 * 'paid' — один из них, оказывается, оплачен: тариф уже продлён.
 */
export async function releaseUserPlanWalletHolds(userId: string): Promise<'paid' | 'released'> {
  const { data, error } = await supabase
    .from('payment_requests')
    .select('id, user_id, plan, amount, qr_operation_id, created_at, billing_period, wallet_amount')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .eq('wallet_status', 'held')
  if (error) return 'released'
  let paid = false
  for (const row of (data || []) as PlanPaymentRow[]) {
    try {
      if ((await checkAndSettlePlanPayment(row, { force: true })) === 'paid') paid = true
    } catch (e) {
      console.error('Plan payment: could not settle held row', row.id, 'before a new purchase:', e instanceof Error ? e.message : e)
    }
  }
  await refundDeadPlanWalletHolds(userId)
  return paid ? 'paid' : 'released'
}

export async function refundOrphanPlanWalletHolds(): Promise<number> {
  const { data, error } = await supabase.rpc('refund_orphan_plan_wallet_holds')
  if (error) {
    // До миграции функции нет — это не ошибка, удержаний тоже нет.
    if (error.code !== 'PGRST202' && !/Could not find the function/i.test(error.message)) {
      console.error('Plan payment: orphan wallet hold sweep failed:', error.message)
    }
    return 0
  }
  return Number(data) || 0
}

// Админу в Telegram — как и раньше, без влияния на оплату при сбое.
export async function notifyPlanPaid(
  row: { user_id: string; plan: string; amount: number; billing_period?: string | null; wallet_amount?: number | null },
  expiresAt: Date,
): Promise<void> {
  try {
    const { data: prof } = await supabase.from('profiles').select('company_name').eq('id', row.user_id).single()
    const planLabel = row.plan === 'pro' ? 'Pro' : row.plan === 'basic' ? 'Basic' : row.plan
    const periodLabel = row.billing_period === 'annual' ? ' (год)' : ''
    const walletPart = Number(row.wallet_amount || 0)
    const walletLabel = walletPart <= 0 ? ''
      : walletPart >= row.amount ? '\n👛 целиком с кошелька'
      : `\n👛 с кошелька ${walletPart.toLocaleString('ru-KZ')} ₸, Kaspi ${(row.amount - walletPart).toLocaleString('ru-KZ')} ₸`
    await fetch('https://invoices.kz/api/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET! },
      body: JSON.stringify({
        message: `💳 <b>Оплата!</b>\n👤 ${prof?.company_name || row.user_id}\n📦 ${planLabel} ${row.amount.toLocaleString('ru-KZ')} ₸${periodLabel}${walletLabel}\n📅 до ${expiresAt.toLocaleDateString('ru-KZ')}`,
      }),
    })
  } catch (e: any) {
    console.error('Plan payment Telegram notification failed for', row.user_id, ':', e.message)
  }
}

// Parallel to checkAndSettleKaspiPayment, but for invoices.kz's OWN
// subscription payments: settles against the admin's platform connection
// instead of the paying customer's, and activates a plan instead of marking
// an invoice paid. Ported from the old /api/payment/webhook's bonus-days
// carry-over logic rather than dropping it.
export async function checkAndSettlePlanPayment(
  row: PlanPaymentRow,
  // force: settle the row NOW if Kaspi says it isn't paid, instead of leaving
  // it 'pending' until the daily 04:00 cron. Mirrors the same option on
  // checkAndSettleWalletTopup, and exists for the same reason: a caller that
  // is about to replace this QR needs the old row closed immediately, or the
  // next create call sees it as live and refuses. The real Kaspi status is
  // still checked first, so a payment landing in this exact instant is
  // credited rather than discarded.
  // deferWalletRefund: see tryExpirePlanPayment.
  opts: { force?: boolean; deferWalletRefund?: boolean } = {},
): Promise<'paid' | 'not_paid' | 'expired' | 'scanning' | 'failed'> {
  const connection = await loadPlatformConnection()
  if (!connection) return 'not_paid'

  const result = await checkStatus(connection, row.qr_operation_id)
  // 'scanning' and 'failed' are surfaced for the same reasons as in
  // checkAndSettleWalletTopup. 'scanning' (Kaspi's 'Wait') means the customer
  // is on the confirmation screen right now, so callers must not replace the
  // QR under them. 'failed' is a scanned-then-cancelled/rejected attempt: the
  // QR is just as dead as an expired one, but it used to fall through to
  // 'not_paid' and leave the page showing a code Kaspi would refuse.
  // Existing `=== 'paid'` / `=== 'expired'` callers are unaffected.
  if (result.status === 'scanning') return 'scanning'
  if (result.status === 'failed') {
    if (await tryExpirePlanPayment(row, 'failed', !!opts.deferWalletRefund)) return 'failed'
    return 'not_paid'
  }
  if (result.status !== 'paid') {
    const expiredOnKaspi = result.status === 'expired'
    const isStale = !!row.created_at && (Date.now() - new Date(row.created_at).getTime()) > PLAN_PAYMENT_STALE_MS
    if ((opts.force || expiredOnKaspi || isStale) && (await tryExpirePlanPayment(row, 'expired', !!opts.deferWalletRefund))) return 'expired'
    return 'not_paid'
  }

  const { data: claimed, error: claimError } = await supabase
    .from('payment_requests')
    .update({ status: 'paid', activated_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('*')
  if (claimError) throw new Error(`failed to claim paid plan payment: ${claimError.message}`)
  if (!claimed || claimed.length === 0) return 'paid' // already settled by another caller

  // Часть цены была удержана с кошелька при создании платежа — теперь она
  // окончательно потрачена. Только пометка: деньги уже списаны, а вернуть
  // удержание у оплаченной строки база не даст в любом случае.
  const walletAmount = Number(claimed[0]?.wallet_amount || 0)
  if (walletAmount > 0) {
    const { error: applyError } = await supabase
      .from('payment_requests')
      .update({ wallet_status: 'applied' })
      .eq('id', row.id)
      .eq('wallet_status', 'held')
    if (applyError) console.error('Plan payment: could not mark wallet hold applied for', row.id, ':', applyError.message)
  }

  // Продление — общая чистая функция (src/lib/plans/planActivation.ts), та
  // же, что у оплаты с кошелька: тот же тариф ещё действует — от его даты
  // окончания, иначе от «сейчас»; +365/+30; оставшиеся бонусные дни
  // добавляются один раз и bonus_expires_at гасится тем же апдейтом.
  //
  // Запись — compare-and-set по plan_expires_at: если между чтением и
  // записью прошла оплата с кошелька (pay_plan_from_wallet), безусловная
  // запись затёрла бы уже оплаченные кошельком дни. Изменилось — перечитываем
  // и считаем заново.
  let expiresAt = new Date()
  let activated = false
  for (let attempt = 0; attempt < 3 && !activated; attempt++) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('plan, plan_expires_at, bonus_expires_at')
      .eq('id', row.user_id)
      .single()
    // Fail closed to "now": if the read fails, profile stays undefined below,
    // so isSamePlanStillActive is false and expiresAt starts fresh from today
    // rather than risking a stale/garbage stacking base. Logged loudly since a
    // silent fallback here would quietly shrink a paying renewer's stacked days.
    if (profileError) console.error('CRITICAL: plan payment', row.id, 'for user', row.user_id, ': profile read failed, falling back to base=now:', profileError.message)

    const activation = computePlanActivation(profile, row)
    expiresAt = activation.expiresAt

    // The payment_requests row is already claimed 'paid' at this point -- if
    // this update fails, the customer paid, the row says 'paid', but the plan
    // never activates and nothing would ever retry (the cron only sweeps
    // 'pending' rows). Logged loudly for manual reconciliation rather than
    // silently discarding the failure.
    let update = supabase
      .from('profiles')
      .update({
        plan: row.plan,
        plan_expires_at: expiresAt.toISOString(),
        ...(activation.bonusConsumed ? { bonus_expires_at: null } : {}),
      })
      .eq('id', row.user_id)
    // Без прочитанного профиля сравнивать не с чем — пишем как раньше.
    if (profile && attempt < 2) {
      update = profile.plan_expires_at == null ? update.is('plan_expires_at', null) : update.eq('plan_expires_at', profile.plan_expires_at)
    }
    const { data: updated, error: planError } = await update.select('id')
    if (planError) {
      console.error('CRITICAL: plan payment', row.id, 'for user', row.user_id, 'confirmed paid but plan activation failed:', planError.message)
      break
    }
    activated = !!updated && updated.length > 0
  }
  if (!activated) console.error('CRITICAL: plan payment', row.id, 'for user', row.user_id, 'confirmed paid but the profile kept changing — plan not extended, reconcile manually')

  await notifyPlanPaid({ ...row, wallet_amount: walletAmount }, expiresAt)

  return 'paid'
}
