import { getActivePlan, parseDbTimestamp, type PlanInfo } from './plan'

// Лимит счетов на стороне браузера. Настоящая граница — триггер
// enforce_invoice_limit_trigger в базе (см. supabase/migrations/README.md);
// здесь только быстрая и понятная проверка до запроса, поэтому правила обязаны
// совпадать с базой: те же лимиты (getActivePlan ↔ invoice_limit_window) и то
// же окно подсчёта (invoiceLimitWindow ↔ invoice_limit_window, см.
// supabase/migrations/invoice_limit_fair_windows.sql).

const ALMATY_TZ = 'Asia/Almaty'

function wallClockParts(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(at)
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') }
}

// Смещение часового пояса в момент `at`, в миллисекундах (для Алматы +5 ч).
function tzOffsetMs(at: Date, timeZone: string): number {
  const p = wallClockParts(at, timeZone)
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return wallAsUtc - Math.floor(at.getTime() / 1000) * 1000
}

/**
 * Начало текущего календарного месяца по времени Алматы — ровно то окно, по
 * которому считает триггер в базе
 * (`date_trunc('month', now() AT TIME ZONE 'Asia/Almaty') AT TIME ZONE 'Asia/Almaty'`).
 *
 * Раньше браузер брал полночь 1-го числа по своему локальному времени: у
 * пользователя с часовым поясом не Алматы счётчик «N из 3» расходился с базой
 * в первые часы месяца — браузер пропускал, а база отказывала (или наоборот).
 */
export function almatyMonthStart(now: Date = new Date()): Date {
  const { year, month } = wallClockParts(now, ALMATY_TZ)
  const wallMidnightAsUtc = Date.UTC(year, month - 1, 1)
  return new Date(wallMidnightAsUtc - tzOffsetMs(new Date(wallMidnightAsUtc), ALMATY_TZ))
}

/**
 * Длина пробного периода. /api/onboarding/grant выдаёт его как
 * trial_expires_at = момент выдачи + 7 суток, а начало нигде не хранится —
 * поэтому начало = trial_expires_at − 7 суток. Тот же интервал (168 часов)
 * стоит в invoice_limit_window() в базе; менять только вместе.
 */
export const TRIAL_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

export type InvoiceLimitKind = 'unlimited' | 'free' | 'trial' | 'basic'

export type InvoiceLimitWindow =
  | { kind: 'unlimited'; limit: null; windowStart: null }
  | { kind: 'free' | 'trial' | 'basic'; limit: number; windowStart: Date }

/**
 * Сколько счетов можно создать и с какого момента их считать.
 * Подсчёт: все счета пользователя (отменённые тоже) с created_at >= windowStart.
 *
 * - Про, админ — без лимита.
 * - Базовый и бонусные дни — 30 за календарный месяц по Алматы.
 * - Пробный — 10 за сам пробный период (с его начала, а не с 1-го числа):
 *   раньше пробная неделя на стыке месяцев давала до 20 счетов.
 * - Бесплатный — 3 за календарный месяц по Алматы, но отсчёт не раньше
 *   момента, когда закончился последний пробный/бонусный/платный период:
 *   счета, созданные на большем тарифе, не съедают бесплатные 3. Раньше
 *   человек, сделавший 5 счетов на пробном, до конца месяца не мог создать
 *   ни одного бесплатного.
 *
 * Та же логика — в invoice_limit_window() в базе; менять только вместе.
 */
export function invoiceLimitWindow(profile: any, now: Date = new Date()): InvoiceLimitWindow {
  const plan = getActivePlan(profile, now)
  if (plan.invoiceLimit === null) return { kind: 'unlimited', limit: null, windowStart: null }

  const monthStart = almatyMonthStart(now)
  if (plan.plan !== 'free' && !plan.isTrial) {
    return { kind: 'basic', limit: plan.invoiceLimit, windowStart: monthStart }
  }

  // Последний уже закончившийся период на большем тарифе (платный — какое бы
  // значение ни стояло в plan, бонус, пробный). Ещё идущие не учитываются.
  let lastEnded = -Infinity
  for (const column of ['plan_expires_at', 'bonus_expires_at', 'trial_expires_at'] as const) {
    const end = parseDbTimestamp(profile?.[column])
    if (end && end.getTime() <= now.getTime()) lastEnded = Math.max(lastEnded, end.getTime())
  }

  if (plan.isTrial) {
    const trialEnd = parseDbTimestamp(profile?.trial_expires_at)!
    const trialStart = trialEnd.getTime() - TRIAL_DAYS * DAY_MS
    return { kind: 'trial', limit: plan.invoiceLimit, windowStart: new Date(Math.max(trialStart, lastEnded)) }
  }
  return { kind: 'free', limit: plan.invoiceLimit, windowStart: new Date(Math.max(monthStart.getTime(), lastEnded)) }
}

/** Сколько счетов из списка попадает в окно лимита (для страниц, у которых список уже загружен). */
export function countInvoicesInWindow(invoices: { created_at?: unknown }[], w: InvoiceLimitWindow): number {
  if (!w.windowStart) return 0
  const since = w.windowStart.getTime()
  return invoices.filter(inv => {
    const at = parseDbTimestamp(inv.created_at)
    return !!at && at.getTime() >= since
  }).length
}

export type InvoiceLimitCheck =
  | { allowed: true }
  | { allowed: false; kind: 'free' | 'trial' | 'basic'; limit: number }

/**
 * Можно ли создать ещё один счёт при `monthCount` уже созданных в окне
 * invoiceLimitWindow() (отменённые тоже считаются — как и в базе).
 *
 * Бесплатный тариф — НЕ причина отказа сам по себе: Free обещает 3 счёта в
 * месяц, и отправлять на /upgrade можно только когда они израсходованы.
 * Админам getActivePlan() уже выдаёт invoiceLimit = null.
 */
export function checkInvoiceLimit(plan: PlanInfo, monthCount: number): InvoiceLimitCheck {
  if (plan.invoiceLimit === null || monthCount < plan.invoiceLimit) return { allowed: true }
  const kind = plan.plan === 'free' ? 'free' : plan.isTrial ? 'trial' : 'basic'
  return { allowed: false, kind, limit: plan.invoiceLimit }
}

/**
 * Сколько счетов ещё можно создать в окне лимита: null — лимита нет (Про,
 * админ). Никогда не уходит ниже нуля: счётчик может быть больше лимита
 * (отменённые счета считаются; тариф истёк посреди месяца с 10 счетами).
 */
export function invoicesLeft(plan: PlanInfo, monthCount: number): number | null {
  if (plan.invoiceLimit === null) return null
  return Math.max(0, plan.invoiceLimit - Math.max(0, monthCount))
}

/**
 * Русская форма слова по числу: 1 счёт / 2 счёта / 5 счетов
 * (21 счёт, 22 счёта, 11–14 счетов, 111 счетов).
 */
export function ruPlural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.trunc(n))
  const m10 = abs % 10
  const m100 = abs % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

/** Ошибка вставки, которую бросает триггер enforce_invoice_limit(). */
export function isInvoiceLimitError(message: string | null | undefined): boolean {
  return !!message && message.includes('invoice_limit_reached')
}

/**
 * Лимит M из текста ошибки триггера `invoice_limit_reached: N of M this month`.
 * Сообщение пользователю берёт число отсюда, а не из getActivePlan(): когда
 * сработал именно триггер, браузер мог считать тариф иначе (часы устройства
 * отстают, и для него Про ещё не истёк → invoiceLimit = null → «максимум 0
 * счетов»). Цифра базы — та, что реально остановила вставку.
 */
export function invoiceLimitFromError(message: string | null | undefined): number | null {
  const m = message?.match(/invoice_limit_reached:\s*\d+\s+of\s+(\d+)/)
  return m ? Number(m[1]) : null
}
