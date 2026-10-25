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

// ---------------------------------------------------------------------------
// «Сколько списать с кошелька» (25.10.2026). Пользователь сам выбирает сумму,
// которую кошелёк покроет; остальное уходит на Kaspi. Эти функции — единый
// источник правды и для сервера (/api/payment/create), и для окна выбора на
// /upgrade: ни там, ни там сумму не «подгоняют» молча в большую сторону.
// splitPlanPayment выше остаётся прежним и задаёт значение по умолчанию.
// ---------------------------------------------------------------------------

export interface WalletChoiceBounds {
  /** Целые тенге на кошельке (дробная часть и отрицательное отбрасываются). */
  balance: number
  /** Цена тарифа, целые тенге. */
  price: number
  /** Наибольшая сумма частичной оплаты: на Kaspi остаётся не меньше MIN_KASPI_REMAINDER_TENGE. */
  maxPartial: number
  /** Кошелёк покрывает цену целиком: можно платить без Kaspi. */
  canPayFull: boolean
  /** Наибольшая допустимая сумма вообще: цена целиком, если кошелёк её покрывает, иначе maxPartial. */
  max: number
}

export function walletChoiceBounds(price: number, walletBalance: number | string | null | undefined): WalletChoiceBounds {
  const total = Math.max(0, Math.round(price))
  const balance = Math.max(0, Math.floor(Number(walletBalance) || 0))
  const maxPartial = Math.max(0, Math.min(balance, total - MIN_KASPI_REMAINDER_TENGE))
  const canPayFull = total > 0 && balance >= total
  return { balance, price: total, maxPartial, canPayFull, max: canPayFull ? total : maxPartial }
}

export type WalletPartResolution =
  | { ok: true; mode: 'kaspi_only'; wallet: 0; kaspi: number }
  | { ok: true; mode: 'partial'; wallet: number; kaspi: number }
  | { ok: true; mode: 'wallet_full'; wallet: number; kaspi: 0 }
  | {
      ok: false
      /**
       * invalid: не целое неотрицательное число;
       * too_much: больше, чем на кошельке или чем цена;
       * remainder_too_small: на Kaspi осталось бы меньше MIN_KASPI_REMAINDER_TENGE.
       */
      reason: 'invalid' | 'too_much' | 'remainder_too_small'
      /** Наибольшая сумма частичной оплаты сейчас. */
      max: number
      canPayFull: boolean
    }

/**
 * Проверяет сумму, которую пользователь хочет списать с кошелька. Только
 * проверяет и отказывает: ничего не округляет и не подгоняет. Слишком большую
 * сумму молча уменьшать нельзя (QR на Kaspi запросил бы больше, чем человек
 * согласился заплатить), слишком маленький остаток на Kaspi тоже.
 */
export function resolveWalletPart(
  price: number,
  walletBalance: number | string | null | undefined,
  requested: unknown,
): WalletPartResolution {
  const b = walletChoiceBounds(price, walletBalance)
  const fail = (reason: 'invalid' | 'too_much' | 'remainder_too_small'): WalletPartResolution =>
    ({ ok: false, reason, max: b.maxPartial, canPayFull: b.canPayFull })
  if (typeof requested !== 'number' || !Number.isSafeInteger(requested) || requested < 0) return fail('invalid')
  if (requested === 0) return { ok: true, mode: 'kaspi_only', wallet: 0, kaspi: b.price }
  if (requested > b.balance || requested > b.price) return fail('too_much')
  if (requested === b.price) return { ok: true, mode: 'wallet_full', wallet: b.price, kaspi: 0 }
  if (requested > b.maxPartial) return fail('remainder_too_small')
  return { ok: true, mode: 'partial', wallet: requested, kaspi: b.price - requested }
}

/**
 * Для окна выбора: приводит введённое число к ближайшей допустимой сумме.
 * Целое, в пределах [0, min(кошелёк, цена)]; если попало в «щель» у цены
 * (на Kaspi осталось бы меньше минимума), то к ближайшему краю щели.
 *
 * `current` (необязательно) нужен ползунку: это сумма до движения. Если новое
 * значение попало в щель, направление движения решает, куда прыгнуть: вниз
 * (стрелка влево) к maxPartial, вверх к цене. Без этого стрелка влево от цены
 * (5990 → 5989) возвращалась бы обратно на цену, и сумму нельзя было бы
 * уменьшить с клавиатуры.
 */
export function snapWalletAmount(
  price: number,
  walletBalance: number | string | null | undefined,
  raw: number,
  current?: number,
): number {
  const b = walletChoiceBounds(price, walletBalance)
  const n = Number.isFinite(raw) ? Math.floor(raw) : 0
  const capped = Math.max(0, Math.min(n, b.balance, b.price))
  if (capped <= b.maxPartial) return capped
  // Щель (maxPartial, price): цена достижима только если кошелёк её покрывает.
  if (!b.canPayFull) return b.maxPartial
  if (typeof current === 'number' && Number.isFinite(current)) {
    if (capped < current) return b.maxPartial
    if (capped > current) return b.price
  }
  return capped - b.maxPartial > b.price - capped ? b.price : b.maxPartial
}

/** Сумма в окне выбора по умолчанию: как раньше, максимум допустимого. */
export function defaultWalletAmount(price: number, walletBalance: number | string | null | undefined): number {
  return walletChoiceBounds(price, walletBalance).max
}

/** Быстрые суммы 25% и 50% от максимума (только допустимые и меньше максимума, без повторов). */
export function walletQuickAmounts(price: number, walletBalance: number | string | null | undefined): number[] {
  const b = walletChoiceBounds(price, walletBalance)
  const out: number[] = []
  for (const share of [0.25, 0.5]) {
    const v = snapWalletAmount(price, walletBalance, Math.round(b.max * share))
    if (v > 0 && v < b.max && !out.includes(v)) out.push(v)
  }
  return out
}

export function planPaymentNote(plan: string, period: BillingPeriod | string | null | undefined): string {
  const name = plan === 'pro' ? 'Про' : plan === 'basic' ? 'Базовый' : plan
  return `Оплата тарифа ${name} (${period === 'annual' ? 'год' : 'месяц'})`
}
