// Чистая математика активации тарифа после оплаты — одна на все пути оплаты:
// Kaspi QR / пуш по телефону (settlePlanPayment.ts) и оплату с кошелька
// (walletPlanPayment.ts). Вынесено из settlePlanPayment.ts без изменения
// правил, чтобы оплата с кошелька продлевала тариф ровно так же.

import type { BillingPeriod } from './pricing'
import { parseDbTimestamp } from '@/lib/plan'

export interface PlanProfileState {
  plan?: string | null
  plan_expires_at?: string | null
  bonus_expires_at?: string | null
}

// Даты из profiles — `timestamp without time zone` (строка без зоны, когда-то
// записанная через toISOString(), то есть UTC). parseDbTimestamp дописывает
// зону, иначе new Date() прочитал бы её как местное время.
const parseUtc = parseDbTimestamp

export interface PlanActivation {
  expiresAt: Date
  /** Бонусные дни вошли в expiresAt — bonus_expires_at надо обнулить тем же апдейтом. */
  bonusConsumed: boolean
}

/**
 * Правила (как и раньше в settlePlanPayment.ts):
 *  - тот же тариф, ещё действующий — продлеваем от текущей даты окончания;
 *    иначе (другой тариф, истёкший, никакого) — от «сейчас»;
 *  - +365 дней за год, +30 за месяц;
 *  - оставшиеся бонусные дни добавляются один раз и гасятся.
 */
export function computePlanActivation(
  profile: PlanProfileState | null | undefined,
  payment: { plan: string; billing_period?: string | null },
  now: Date = new Date(),
): PlanActivation {
  const currentExpiry = parseUtc(profile?.plan_expires_at)
  const isSamePlanStillActive = profile?.plan === payment.plan && !!currentExpiry && currentExpiry > now
  const expiresAt = isSamePlanStillActive ? new Date(currentExpiry!) : new Date(now)
  expiresAt.setDate(expiresAt.getDate() + (payment.billing_period === 'annual' ? 365 : 30))

  let bonusConsumed = false
  const bonusEnd = parseUtc(profile?.bonus_expires_at)
  if (bonusEnd && bonusEnd > now) {
    const bonusDays = Math.ceil((bonusEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    expiresAt.setDate(expiresAt.getDate() + bonusDays)
    bonusConsumed = true
  }
  return { expiresAt, bonusConsumed }
}

// Kaspi не принимает совсем мелкие суммы, а платёж в 1 ₸ ради «остатка» —
// странный опыт. Если на Kaspi осталось бы меньше этого, с кошелька
// списывается чуть меньше, чтобы на Kaspi ушло ровно столько.
export const MIN_KASPI_REMAINDER_TENGE = 100

export type PlanPaymentSplit =
  | { mode: 'wallet_full'; wallet: number; kaspi: 0 }
  | { mode: 'partial'; wallet: number; kaspi: number }
  | { mode: 'kaspi_only'; wallet: 0; kaspi: number }

/**
 * Как разделить оплату тарифа между кошельком и Kaspi.
 * Баланс берётся только целыми тенге и только положительный.
 */
export function splitPlanPayment(price: number, walletBalance: number | string | null | undefined): PlanPaymentSplit {
  const total = Math.max(0, Math.round(price))
  const balance = Math.max(0, Math.floor(Number(walletBalance) || 0))
  if (total > 0 && balance >= total) return { mode: 'wallet_full', wallet: total, kaspi: 0 }
  const wallet = Math.min(balance, total - MIN_KASPI_REMAINDER_TENGE)
  if (wallet <= 0) return { mode: 'kaspi_only', wallet: 0, kaspi: total }
  return { mode: 'partial', wallet, kaspi: total - wallet }
}

export function planPaymentNote(plan: string, period: BillingPeriod | string | null | undefined): string {
  const name = plan === 'pro' ? 'Про' : plan === 'basic' ? 'Базовый' : plan
  return `Оплата тарифа ${name} (${period === 'annual' ? 'год' : 'месяц'})`
}
