// Оплата тарифа с кошелька (profiles.kaspi_wallet_balance) — целиком или
// частью, остальное через Kaspi. Решение основателя 15.10.2026.
//
// Целиком: одна функция в базе (pay_plan_from_wallet) в одной транзакции
// списывает кошелёк, записывает строку payment_requests со статусом 'paid',
// продлевает тариф и пишет журнал кошелька. Новая дата окончания считается
// здесь той же функцией, что и для Kaspi-оплаты (computePlanActivation), а
// база проверяет, что тариф/даты в профиле не изменились с момента чтения —
// иначе отказ и повтор. Отрицательный баланс, двойное списание и продление
// без оплаты исключены одной транзакцией с проверкой баланса.
//
// Частью: при создании Kaspi-платежа часть цены удерживается с кошелька той
// же транзакцией, что создаёт строку payment_requests (wallet_status='held').
// Оплачен Kaspi — удержание помечается 'applied' (settlePlanPayment.ts).
// Истёк/отменён/отклонён — возвращается ровно один раз (refund_plan_wallet_hold).
//
// До применения миграции profile_bonus_wallet_plan.sql функций и колонок нет:
// isWalletPlanPaymentAvailable() отвечает false, и /upgrade не предлагает
// кошелёк вовсе.

import { createClient } from '@supabase/supabase-js'
import { getPlanAmount, type BillingPeriod, type PlanKey } from './pricing'
import { computePlanActivation, splitPlanPayment, planPaymentNote, type PlanPaymentSplit } from './planActivation'
import { notifyPlanPaid, releaseUserPlanWalletHolds } from '@/lib/kaspiPay/settlePlanPayment'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function isWalletPlanPaymentAvailable(): Promise<boolean> {
  const { error } = await supabase.from('payment_requests').select('wallet_amount').limit(1)
  return !error
}

interface WalletProfile {
  plan: string | null
  plan_expires_at: string | null
  bonus_expires_at: string | null
  kaspi_wallet_balance: number | string | null
  deleted_at: string | null
}

async function loadWalletProfile(userId: string): Promise<WalletProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('plan, plan_expires_at, bonus_expires_at, kaspi_wallet_balance, deleted_at')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw new Error(`wallet profile read failed: ${error.message}`)
  return (data as WalletProfile | null) ?? null
}

export interface WalletQuote {
  available: boolean
  /** Баланс вместе с собственными удержаниями под ещё не оплаченный тариф. */
  balance: number
  split: PlanPaymentSplit
}

/**
 * Удержано с кошелька под свои же неоплаченные платежи за тариф: перед
 * новой покупкой эти деньги вернутся (или «переедут» на новый платёж), так
 * что для расчёта они — часть баланса. Без этого после закрытого окна
 * частичной оплаты кошелёк выглядел бы пустым, и /upgrade молча отправил бы
 * на Kaspi полную цену.
 */
async function ownHeldForPlan(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('payment_requests')
    .select('wallet_amount')
    .eq('user_id', userId)
    .eq('wallet_status', 'held')
    .in('status', ['pending', 'expired', 'failed', 'rejected'])
  if (error) return 0
  return (data || []).reduce((sum, r) => sum + (Number(r.wallet_amount) || 0), 0)
}

export async function quoteWalletPlanPayment(userId: string, plan: PlanKey, period: BillingPeriod): Promise<WalletQuote> {
  const price = getPlanAmount(plan, period)
  const kaspiOnly: PlanPaymentSplit = { mode: 'kaspi_only', wallet: 0, kaspi: price }
  const [available, profile] = await Promise.all([isWalletPlanPaymentAvailable(), loadWalletProfile(userId)])
  if (!available || !profile || profile.deleted_at) return { available: false, balance: 0, split: kaspiOnly }
  const balance = (Number(profile.kaspi_wallet_balance) || 0) + (await ownHeldForPlan(userId))
  return { available: true, balance, split: splitPlanPayment(price, balance) }
}

export type WalletPayResult =
  | { ok: true; balance: number; expiresAt: string }
  | { ok: false; error: 'unavailable' | 'insufficient_funds' | 'account_deleted' | 'busy' | 'already_paid' | 'server_error' }

function rpcErrorCode(message: string | undefined): string {
  const m = message || ''
  for (const code of ['insufficient_funds', 'account_deleted', 'profile_changed', 'invalid_amount', 'invalid_plan']) {
    if (m.includes(code)) return code
  }
  if (/Could not find the function|does not exist/i.test(m)) return 'unavailable'
  return 'server_error'
}

/** Оплатить тариф целиком с кошелька. Цена — только из PLAN_PRICES. */
export async function payPlanFullyFromWallet(
  user: { id: string; email?: string | null },
  plan: PlanKey,
  period: BillingPeriod,
): Promise<WalletPayResult> {
  const price = getPlanAmount(plan, period)
  // Свои незавершённые оплаты с удержанием (закрытое окно частичной оплаты)
  // сначала закрываются, а удержание возвращается — иначе этих денег нет на
  // балансе. Если одна из них, оказывается, оплачена — тариф уже продлён,
  // второй раз не списываем.
  if ((await releaseUserPlanWalletHolds(user.id)) === 'paid') return { ok: false, error: 'already_paid' }
  // Два прохода: если профиль поменялся между чтением и списанием (например,
  // в ту же секунду прошла Kaspi-оплата), база откажет 'profile_changed', и
  // дата пересчитывается от свежего состояния.
  for (let attempt = 0; attempt < 2; attempt++) {
    const profile = await loadWalletProfile(user.id)
    if (!profile) return { ok: false, error: 'account_deleted' }
    if (profile.deleted_at) return { ok: false, error: 'account_deleted' }
    const split = splitPlanPayment(price, profile.kaspi_wallet_balance)
    if (split.mode !== 'wallet_full') return { ok: false, error: 'insufficient_funds' }

    const { expiresAt, bonusConsumed } = computePlanActivation(profile, { plan, billing_period: period })
    const { data, error } = await supabase.rpc('pay_plan_from_wallet', {
      p_user_id: user.id,
      p_email: user.email || '',
      p_plan: plan,
      p_period: period,
      p_amount: price,
      p_expected_plan: profile.plan,
      p_expected_plan_expires_at: profile.plan_expires_at,
      p_expected_bonus_expires_at: profile.bonus_expires_at,
      p_new_plan_expires_at: expiresAt.toISOString(),
      p_clear_bonus: bonusConsumed,
      p_note: planPaymentNote(plan, period),
    })
    if (error) {
      const code = rpcErrorCode(error.message)
      if (code === 'profile_changed' && attempt === 0) continue
      if (code === 'profile_changed') return { ok: false, error: 'busy' }
      if (code === 'unavailable' || code === 'insufficient_funds' || code === 'account_deleted') return { ok: false, error: code }
      console.error('Wallet plan payment failed for', user.id, ':', error.message)
      return { ok: false, error: 'server_error' }
    }
    const balance = Number((data as { balance?: number } | null)?.balance ?? 0)
    await notifyPlanPaid({ user_id: user.id, plan, amount: price, billing_period: period, wallet_amount: price }, expiresAt)
    return { ok: true, balance, expiresAt: expiresAt.toISOString() }
  }
  return { ok: false, error: 'busy' }
}

export type WalletHoldResult =
  | { ok: true; paymentRequestId: string; balance: number }
  | { ok: false; error: 'unavailable' | 'insufficient_funds' | 'account_deleted' | 'server_error' }

/**
 * Создаёт строку payment_requests для уже выпущенного Kaspi-платежа на
 * остаток и в той же транзакции удерживает часть с кошелька. Если удержать
 * не вышло (баланс успел уменьшиться) — строки нет, и QR никому не показан.
 */
export async function startPlanPaymentWithWalletHold(params: {
  user: { id: string; email?: string | null }
  plan: PlanKey
  period: BillingPeriod
  walletPart: number
  operationId: string
}): Promise<WalletHoldResult> {
  const total = getPlanAmount(params.plan, params.period)
  const { data, error } = await supabase.rpc('start_plan_payment_with_wallet', {
    p_user_id: params.user.id,
    p_email: params.user.email || '',
    p_plan: params.plan,
    p_period: params.period,
    p_total: total,
    p_wallet: params.walletPart,
    p_order_id: params.operationId,
    p_note: `${planPaymentNote(params.plan, params.period)}: часть с кошелька`,
  })
  if (error) {
    const code = rpcErrorCode(error.message)
    if (code === 'unavailable' || code === 'insufficient_funds' || code === 'account_deleted') return { ok: false, error: code }
    console.error('Wallet hold for plan payment failed for', params.user.id, ':', error.message)
    return { ok: false, error: 'server_error' }
  }
  const row = data as { payment_id?: string; balance?: number } | null
  return { ok: true, paymentRequestId: String(row?.payment_id || ''), balance: Number(row?.balance ?? 0) }
}
