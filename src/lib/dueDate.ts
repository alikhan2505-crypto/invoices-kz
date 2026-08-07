// Pure YYYY-MM-DD arithmetic, UTC-based throughout so results don't drift
// with the server's local timezone (the cron runs in UTC; invoices.due_date
// is a plain `date` column with no timezone of its own).

export function addDaysToDateString(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

// defaultDueDaysRaw comes from profiles.default_due_days, stored as text.
// Anything that isn't a valid positive number falls back to 3 — matches
// the field's own placeholder/default value on /profile/settings.
export function computeDefaultDueDate(
  invoiceDateStr: string,
  defaultDueDaysRaw: string | null | undefined
): string {
  const n = Number(defaultDueDaysRaw)
  const days = Number.isFinite(n) && n > 0 ? n : 3
  return addDaysToDateString(invoiceDateStr, days)
}
