// Pure aggregator for the planner's "Аналитика" tab (Stage 5 of the salon
// booking planner plan). No tz library, same fixed +05:00 convention as
// the rest of this feature (dayKey() in src/app/planner/[slug]/page.tsx,
// resolveKzDateTime() in bookingDrafts.ts) -- Kazakhstan has one fixed
// offset country-wide.
const KZ_OFFSET_MS = 5 * 60 * 60 * 1000

export type BookingForAnalytics = {
  starts_at: string
  status: string
  master_name: string | null
}

export type WeeklyCount = { weekStart: string; total: number; cancelled: number }
// masterName: '' means "no master assigned" -- the client renders that as
// t(lang, 'unassigned'), the same label the schedule tab already uses, so
// this module stays locale-free.
export type MasterCount = { masterName: string; total: number; cancelled: number }

export type AnalyticsSummary = {
  weekly: WeeklyCount[]
  byMaster: MasterCount[]
  totalBookings: number
  cancelledBookings: number
  cancellationRate: number
}

// Monday of the booking's own Almaty-local week, as a YYYY-MM-DD key.
function weekStartKey(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + KZ_OFFSET_MS)
  const day = shifted.getUTCDay() // 0=Sun..6=Sat
  const diffToMonday = (day + 6) % 7
  shifted.setUTCDate(shifted.getUTCDate() - diffToMonday)
  return shifted.toISOString().slice(0, 10)
}

export function buildAnalyticsSummary(bookings: BookingForAnalytics[], weeksBack = 8): AnalyticsSummary {
  const cutoff = Date.now() - weeksBack * 7 * 24 * 60 * 60 * 1000

  const weekMap = new Map<string, WeeklyCount>()
  const masterMap = new Map<string, MasterCount>()
  let totalBookings = 0
  let cancelledBookings = 0

  for (const b of bookings) {
    const t = new Date(b.starts_at).getTime()
    if (Number.isNaN(t) || t < cutoff) continue

    totalBookings++
    const isCancelled = b.status === 'cancelled'
    if (isCancelled) cancelledBookings++

    const wk = weekStartKey(b.starts_at)
    if (!weekMap.has(wk)) weekMap.set(wk, { weekStart: wk, total: 0, cancelled: 0 })
    const w = weekMap.get(wk)!
    w.total++
    if (isCancelled) w.cancelled++

    const masterKey = b.master_name?.trim() || ''
    if (!masterMap.has(masterKey)) masterMap.set(masterKey, { masterName: masterKey, total: 0, cancelled: 0 })
    const m = masterMap.get(masterKey)!
    m.total++
    if (isCancelled) m.cancelled++
  }

  return {
    weekly: Array.from(weekMap.values()).sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
    byMaster: Array.from(masterMap.values()).sort((a, b) => b.total - a.total),
    totalBookings,
    cancelledBookings,
    cancellationRate: totalBookings > 0 ? cancelledBookings / totalBookings : 0,
  }
}
