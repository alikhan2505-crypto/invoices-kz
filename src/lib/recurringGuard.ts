import type { PlanInfo } from '@/lib/plan'

// Начало текущего периода повторяющихся счетов: первое число месяца, 00:00 UTC.
// Крон идёт раз в месяц (vercel.json), так что период = месяц.
export function currentPeriodStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

// Нужно ли пропустить владельца повторяющегося счёта (профиль приходит join'ом
// из invoices). Пропускаем: нет профиля, аккаунт удалён (deleted_at) и план
// без повторяющихся счетов (canRecurring только у Про; админ — через
// getActivePlan, он уже учитывает is_admin).
export function shouldSkipRecurringOwner(
  profile: { deleted_at?: string | null } | null | undefined,
  plan: Pick<PlanInfo, 'canRecurring'>,
): boolean {
  if (!profile) return true
  if (profile.deleted_at) return true
  return !plan.canRecurring
}
