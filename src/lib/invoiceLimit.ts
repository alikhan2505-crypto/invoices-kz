import type { PlanInfo } from './plan'

// Месячный лимит счетов на стороне браузера. Настоящая граница — триггер
// enforce_invoice_limit_trigger в базе (см. supabase/migrations/README.md);
// здесь только быстрая и понятная проверка до запроса, поэтому правила обязаны
// совпадать с базой: те же лимиты (через getActivePlan ↔ invoice_limit_for)
// и то же окно — календарный месяц по времени Алматы.

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

export type InvoiceLimitCheck =
  | { allowed: true }
  | { allowed: false; kind: 'free' | 'trial' | 'basic'; limit: number }

/**
 * Можно ли создать ещё один счёт при `monthCount` уже созданных в этом месяце
 * (отменённые тоже считаются — как и в базе).
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
 * Сколько счетов ещё можно создать в этом месяце: null — лимита нет (Про,
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
