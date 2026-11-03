import { parseDbTimestamp } from '@/lib/plan'

// Что повторяющийся счёт переносит в копию кроме суммы, позиций и реквизитов
// клиента (их копирует крон /api/cron/recurring сам). Раньше копия теряла
// договор, банк, телефон клиента, привязку к клиенту, флаг НДС и срок оплаты
// (пункт 1.10 аудита 02.11.2026).

const DAY_MS = 24 * 60 * 60 * 1000
// Казахстан без перехода на летнее время: сутки считаем по Алматы (UTC+5).
const ALMATY_OFFSET_MS = 5 * 60 * 60 * 1000
const MAX_DUE_DAYS = 365

function almatyDayStart(ms: number): number {
  const d = new Date(ms + ALMATY_OFFSET_MS)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/**
 * Срок оплаты копии: тот же отступ от даты выставления, что был у оригинала
 * (оригинал на 14 дней — копия тоже на 14 дней от сегодняшнего дня). Нет срока,
 * срок раньше даты выставления или дальше года — null, как у счёта без срока.
 */
export function recurringDueDate(dueDate: unknown, createdAt: unknown, now: Date = new Date()): string | null {
  if (typeof dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(dueDate)) return null
  const created = parseDbTimestamp(createdAt)
  if (!created) return null
  const due = Date.parse(`${dueDate.slice(0, 10)}T00:00:00Z`)
  if (isNaN(due)) return null
  const days = Math.round((due - almatyDayStart(created.getTime())) / DAY_MS)
  if (!(days >= 0 && days <= MAX_DUE_DAYS)) return null
  return new Date(almatyDayStart(now.getTime()) + days * DAY_MS).toISOString().slice(0, 10)
}

export function recurringCopyFields(inv: Record<string, unknown>, now: Date = new Date()) {
  return {
    client_id: inv.client_id ?? null,
    client_phone: inv.client_phone ?? null,
    contract_number: inv.contract_number ?? null,
    contract_date: inv.contract_date ?? null,
    bank_id: inv.bank_id ?? null,
    is_vat_payer: inv.is_vat_payer ?? null,
    due_date: recurringDueDate(inv.due_date, inv.created_at, now),
  }
}
